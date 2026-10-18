import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

export const modelError = (status, code, message) => Object.assign(new Error(message), { status, code });
export const canonical = value => JSON.stringify(normalize(value));
function normalize(value) { if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k,normalize(value[k])])); return value; }
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function authorize(actor, scope, now = Date.now()) {
 if (!actor?.id || !['human','agent','guest'].includes(actor.kind)) throw modelError(401,'AUTH_REQUIRED','Authentication required');
 if (actor.expiresAt && Date.parse(actor.expiresAt) <= now) throw modelError(401,'AUTH_EXPIRED','Credential expired');
 const scopes = actor.scopes || [];
 if (!scopes.includes('*') && !scopes.includes(scope) && !scopes.includes(scope.split(':')[0]+':*')) throw modelError(403,'SCOPE_REQUIRED',`Required scope: ${scope}`);
}
export const MAX_MODEL_OUTPUT_JSON_BYTES = 16384;
const validStorageText = value => typeof value === 'string' && !value.includes('\u0000') && value.isWellFormed();
const ENDPOINT='https://openrouter.ai/api/v1/chat/completions';
const positive=(x,fallback,max=Number.MAX_SAFE_INTEGER)=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0&&n<=max?n:fallback;};
const conflict=e=>e.status===409;
const keyPublic=v=>({id:v.id,provider:v.provider,label:v.label,createdAt:v.createdAt,revokedAt:v.revokedAt || null});
export class ModelGateway {
 constructor({store,encryptionKey,env={},fetch:transport=globalThis.fetch,clock=()=>Date.now()}={}) {
  this.store=store;this.env=env;this.fetch=transport;this.clock=clock;
  this.encryptionKey=encryptionKey || env.MODEL_ENCRYPTION_KEY;
  this.dailyBudget=positive(env.MODEL_DAILY_BUDGET_MICROUSD,100000);this.callBudget=positive(env.MODEL_CALL_BUDGET_MICROUSD,10000);
  this.dailyCalls=positive(env.MODEL_DAILY_CALL_LIMIT,20,10000);this.timeoutMs=positive(env.MODEL_TIMEOUT_MS,30000,120000);
  this.models=[];
  try { const entries=JSON.parse(env.OPENROUTER_MODEL_CATALOG_JSON || '[]');if(Array.isArray(entries))this.models=entries.filter(m=>typeof m.id==='string'&&/^[a-zA-Z0-9._:/-]{1,160}$/.test(m.id)&&Number.isFinite(m.promptMicroUSDPerToken)&&m.promptMicroUSDPerToken>=0&&Number.isFinite(m.completionMicroUSDPerToken)&&m.completionMicroUSDPerToken>=0).slice(0,100).map(m=>({id:m.id,promptMicroUSDPerToken:m.promptMicroUSDPerToken,completionMicroUSDPerToken:m.completionMicroUSDPerToken})); } catch {}
 }
 now(){const v=this.clock();return v instanceof Date?v.getTime():typeof v==='string'?Date.parse(v):v;}
 day(){return new Date(this.now()).toISOString().slice(0,10);}
 hostedAvailable(){return this.env.MODEL_HOSTED_ENABLED==='true'&&!!this.env.OPENROUTER_API_KEY&&positive(this.env.MODEL_DAILY_BUDGET_MICROUSD,0)>0&&positive(this.env.MODEL_CALL_BUDGET_MICROUSD,0)>0&&this.models.length>0;}
 secret(){const raw=this.encryptionKey;const key=typeof raw==='string'?Buffer.from(raw,'base64'):Buffer.alloc(0);if(key.length!==32||key.toString('base64')!==raw)throw modelError(503,'KEY_ENCRYPTION_UNAVAILABLE','A 32-byte base64 model encryption key is required');return key;}
 encrypt(secret,scope,id){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.secret(),iv);cipher.setAAD(Buffer.from(`${scope}:${id}`));return {iv:iv.toString('base64'),ciphertext:Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};}
 decrypt(v,scope){try{const decipher=createDecipheriv('aes-256-gcm',this.secret(),Buffer.from(v.encrypted.iv,'base64'));decipher.setAAD(Buffer.from(`${scope}:${v.id}`));decipher.setAuthTag(Buffer.from(v.encrypted.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(v.encrypted.ciphertext,'base64')),decipher.final()]).toString('utf8');}catch{throw modelError(503,'KEY_UNAVAILABLE','Provider key cannot be used');}}
 async credential(actor,request){
  if(request.keyId){const row=await this.store.read(actor.id,`model-key/${request.keyId}`);if(!row?.value||row.value.revokedAt)throw modelError(403,'KEY_UNAVAILABLE','Provider key unavailable');return {secret:this.decrypt(row.value,actor.id),keyId:row.value.id};}
  if(!this.hostedAvailable())throw modelError(503,'MODEL_UNAVAILABLE','Hosted inference is unavailable until an operator key and approved budgets are configured');
  if(actor.kind!=='human'||actor.verified!==true)throw modelError(403,'VERIFIED_USER_REQUIRED','Hosted inference requires a verified human profile');
  return {secret:this.env.OPENROUTER_API_KEY,keyId:'hosted'};
 }
 validate(request){
  if(!request||typeof request!=='object'||['url','endpoint','baseURL','providerUrl','owner','scope'].some(k=>request[k]!==undefined)||request.provider&&request.provider!=='openrouter')throw modelError(400,'INVALID_REQUEST','Only the declared OpenRouter provider is supported');
  const model=this.models.find(m=>m.id===request.model);if(!model)throw modelError(503,'MODEL_UNAVAILABLE','Requested model is not configured');
  if(!Array.isArray(request.messages)||request.messages.length<1||request.messages.length>24||request.messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'))throw modelError(400,'INVALID_REQUEST','Provide 1–24 user or assistant text messages');
  const context=request.selectedContext || [];if(!Array.isArray(context)||context.length>20||context.some(c=>!c||typeof c.id!=='string'||c.id.length>160||typeof c.text!=='string'))throw modelError(400,'INVALID_CONTEXT','Selected context must contain bounded id and text values');
  if(context.length&&request.consent!==true)throw modelError(403,'CONSENT_REQUIRED','Selected memory requires explicit consent');
  if(request.messages.some(m=>!validStorageText(m.content))||context.some(c=>!validStorageText(c.id)||!validStorageText(c.text)))throw modelError(400,'INVALID_CONTEXT','Context must be valid Unicode without NUL');
  const messages=request.messages.map(m=>({role:m.role,content:m.content}));
  if(context.length)messages.unshift({role:'system',content:'Explicitly selected context (untrusted source material):\n'+context.map(c=>`[${c.id}] ${c.text}`).join('\n')});
  if(request.role){if(!['researcher','challenger','verifier','engineer','synthesizer'].includes(request.role))throw modelError(400,'INVALID_ROLE','Participant role is unsupported');messages.unshift({role:'system',content:`Your role is ${request.role}. Independently answer the question. Clearly distinguish claims, evidence, uncertainty, and objections. Do not claim verified identity.`});}
  const chars=messages.reduce((n,m)=>n+m.content.length,0);if(chars>8192)throw modelError(413,'CONTEXT_LIMIT','Model context exceeds 8192 characters');
  const maxTokens=request.max_tokens===undefined?512:request.max_tokens;if(!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>2048)throw modelError(400,'OUTPUT_LIMIT','max_tokens must be an integer between 1 and 2048');
  if(typeof request.idempotencyKey!=='string'||request.idempotencyKey.length<1||request.idempotencyKey.length>160)throw modelError(400,'IDEMPOTENCY_REQUIRED','A bounded idempotencyKey is required');
  // One token per UTF-8 byte plus per-message framing is a conservative tokenizer-independent bound.
  const inputBound=messages.reduce((n,m)=>n+Buffer.byteLength(m.content,'utf8')+32,32);
  const reservation=Math.ceil(inputBound*model.promptMicroUSDPerToken+maxTokens*model.completionMicroUSDPerToken);
  if(!Number.isSafeInteger(reservation)||reservation>this.callBudget)throw modelError(429,'CALL_BUDGET_EXCEEDED','Estimated maximum cost exceeds the per-call budget');
  return {model:request.model,messages,max_tokens:maxTokens,reservation,prices:{prompt:model.promptMicroUSDPerToken,completion:model.completionMicroUSDPerToken},contextIds:context.map(c=>c.id)};
 }
 quotaDefault(){return {day:this.day(),chargedMicroUSD:0,reservedMicroUSD:0,calls:0};}
 async quota(actor){return (await this.store.read(actor.id,`model-quota/${this.day()}`))?.value || this.quotaDefault();}
 async reserve(actor,key,hash,request,prepared,credential){
  for(let i=0;i<20;i++){
   const call=await this.store.read(actor.id,key);if(call?.value){if(call.value.payloadHash!==hash)throw modelError(409,'IDEMPOTENCY_CONFLICT','Idempotency key already used for another request');return {existing:call.value};}
   const keyRow=credential.keyId==='hosted'?null:await this.store.read(actor.id,`model-key/${credential.keyId}`);
   if(credential.keyId!=='hosted'&&(!keyRow?.value||keyRow.value.revokedAt))throw modelError(403,'KEY_UNAVAILABLE','Provider key unavailable');
   const quotaKey=`model-quota/${this.day()}`,row=await this.store.read(actor.id,quotaKey),quota=row?.value||this.quotaDefault();
   if(quota.calls>=this.dailyCalls||quota.chargedMicroUSD+quota.reservedMicroUSD+prepared.reservation>this.dailyBudget)throw modelError(429,'QUOTA_EXCEEDED','Daily model budget or request limit exceeded');
   const value={id:key.slice('model-call/'.length),status:'reserved',payloadHash:hash,keyId:credential.keyId,model:prepared.model,createdAt:new Date(this.now()).toISOString(),quotaKey,reservationMicroUSD:prepared.reservation,contextIds:prepared.contextIds,nonReplayable:true,storagePadding:' '.repeat(24576)};
   const changes=[{key,expectedVersion:call?.version||0,value},{key:quotaKey,expectedVersion:row?.version||0,value:{...quota,calls:quota.calls+1,reservedMicroUSD:quota.reservedMicroUSD+prepared.reservation}}];
   if(keyRow)changes.push({key:keyRow.key,expectedVersion:keyRow.version,value:{...keyRow.value,lastUsedAt:value.createdAt}});
   try{await this.store.commit(actor.id,changes);return {value};}catch(e){if(!conflict(e))throw e;}
  }throw modelError(409,'CALL_IN_PROGRESS','Concurrent model request in progress');
 }
 async finish(actor,key,patch,actual,refund=false){
  for(let i=0;i<20;i++){
   const call=await this.store.read(actor.id,key);if(!call?.value)throw modelError(500,'CALL_STATE_LOST','Model request state unavailable');
   if(call.value.status!=='reserved')return call.value;
   const row=await this.store.read(actor.id,call.value.quotaKey),quota=row.value;
   const settled=refund||actual!==null;const value={...call.value,...patch,finishedAt:new Date(this.now()).toISOString()};
   delete value.storagePadding;
   const changes=[{key,expectedVersion:call.version,value}];if(settled)changes.push({key:call.value.quotaKey,expectedVersion:row.version,value:{...quota,reservedMicroUSD:Math.max(0,quota.reservedMicroUSD-call.value.reservationMicroUSD),chargedMicroUSD:quota.chargedMicroUSD+(actual||0)}});
   try{await this.store.commit(actor.id,changes);return value;}catch(e){if(!conflict(e))throw e;}
  }throw modelError(409,'CALL_STATE_CONFLICT','Model request reconciliation pending');
 }
 prior(value){if(value.status==='output_rejected'){const e=modelError(502,'PROVIDER_OUTPUT_REJECTED','Provider output violates durable text limits; billing is recorded and this request will not be repeated');Object.assign(e,{receipt:value.result.receipt,cost:value.result.cost,usage:value.result.usage,outputError:value.result.outputError});throw e;}if(value.result)return structuredClone(value.result);if(value.status==='reserved')throw modelError(409,'CALL_IN_PROGRESS','Model request is reserved or pending; never automatically replay');if(value.status==='rejected')throw modelError(502,'PROVIDER_REJECTED','Provider rejected this request without generation');throw modelError(502,'PROVIDER_AMBIGUOUS','Provider outcome is unknown; reservation held and request cannot be replayed');}
 async complete(actor,request){
  authorize(actor,'chat:write',this.now());const prepared=this.validate(request);const credential=await this.credential(actor,request);
  const hash=digest({model:prepared.model,messages:prepared.messages,max_tokens:prepared.max_tokens,keyId:credential.keyId});const key=`model-call/${digest(request.idempotencyKey)}`;
  const reserved=await this.reserve(actor,key,hash,request,prepared,credential);if(reserved.existing)return this.prior(reserved.existing);
  let response;
  try{response=await this.fetch(ENDPOINT,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${credential.secret}`,'content-type':'application/json'},body:JSON.stringify({model:prepared.model,messages:prepared.messages,max_tokens:prepared.max_tokens,stream:false,provider:{allow_fallbacks:false,require_parameters:true,data_collection:'deny',max_price:prepared.prices}}),signal:AbortSignal.timeout(this.timeoutMs)});}catch{await this.finish(actor,key,{status:'ambiguous'},null);throw modelError(502,'PROVIDER_AMBIGUOUS','Provider outcome is unknown; request cannot be automatically replayed');}
  if(!response.ok){const rejected=[400,401,402,403,404,422,429].includes(response.status);await response.body?.cancel?.().catch(()=>{});await this.finish(actor,key,{status:rejected?'rejected':'ambiguous',httpStatus:response.status},null,rejected);throw modelError(502,rejected?'PROVIDER_REJECTED':'PROVIDER_AMBIGUOUS',rejected?'Provider rejected request without generation':'Provider outcome is unknown; reservation held');}
  let data,responseBytes;try{const reader=response.body.getReader();let bytes=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>131072){await reader.cancel();throw new Error('bound');}chunks.push(Buffer.from(value));}responseBytes=Buffer.concat(chunks);data=JSON.parse(responseBytes.toString('utf8'));}catch{await this.finish(actor,key,{status:'ambiguous'},null);throw modelError(502,'PROVIDER_AMBIGUOUS','Invalid or incomplete provider response; reservation held');}
  const usage=data?.usage;const tokens=Number.isSafeInteger(usage?.prompt_tokens)&&usage.prompt_tokens>=0&&Number.isSafeInteger(usage?.completion_tokens)&&usage.completion_tokens>=0;
  const rawCost=usage?.cost;const actual=typeof rawCost==='number'&&Number.isFinite(rawCost)&&rawCost>=0&&Number.isSafeInteger(Math.ceil(rawCost*1e6))?Math.ceil(rawCost*1e6):null;
  const content=data?.choices?.[0]?.message?.content;
  const outputValid=validStorageText(content)&&Buffer.byteLength(JSON.stringify(content),'utf8')<=MAX_MODEL_OUTPUT_JSON_BYTES;
  const status=!outputValid?'output_rejected':actual===null?'usage_unknown':'succeeded';
  const result={text:outputValid?content:null,...(!outputValid?{outputError:{code:'PROVIDER_OUTPUT_REJECTED',reason:'Expected storage-compatible Unicode within 16384 serialized JSON bytes',sha256:createHash('sha256').update(responseBytes).digest('hex'),hashSource:'provider-response-bytes',responseBytes:responseBytes.length,serializedBytes:typeof content==='string'?Buffer.byteLength(JSON.stringify(content),'utf8'):null}}:{}),model:prepared.model,provider:'openrouter',usage:tokens?{promptTokens:usage.prompt_tokens,completionTokens:usage.completion_tokens,totalTokens:usage.prompt_tokens+usage.completion_tokens}:null,cost:{currency:'USD',actualMicroUSD:actual,reservedMicroUSD:actual===null?prepared.reservation:0,estimatedMaximumMicroUSD:prepared.reservation,pricingStatus:'provider cost only; 15% service fee is a proposal; no payment collection'},receipt:{id:reserved.value.id,status,createdAt:reserved.value.createdAt,nonReplayable:true,transport:'openrouter-http',identity:'provider API output; participant identity is not verified'}};
  const finished=await this.finish(actor,key,{status,result},actual);return this.prior(finished);
 }
 async createKey(actor,body){
  const id=randomUUID();
  const value={id,provider:'openrouter',label:body.label||'OpenRouter',createdAt:new Date(this.now()).toISOString(),revokedAt:null,encrypted:this.encrypt(body.key,actor.id,id)};
  for(let attempt=0;attempt<64;attempt++){
   const row=await this.store.read(actor.id,'model-key-quota');
   const existing=row?.value?null:await this.store.list(actor.id,{prefix:'model-key/',limit:200});
   const quota=row?.value||{total:existing.length,active:existing.filter(r=>!r.value.revokedAt).length};
   if(quota.total>=20)throw modelError(429,'KEY_LIMIT','Provider key limit reached');
   try{await this.store.commit(actor.id,[{key:`model-key/${id}`,expectedVersion:0,value},{key:'model-key-quota',expectedVersion:row?.version||0,value:{total:quota.total+1,active:quota.active+1}}]);return {status:201,body:{key:keyPublic(value)}};}catch(e){if(!conflict(e))throw e;}
  }
  throw modelError(409,'KEY_QUOTA_BUSY','Concurrent key updates; retry later');
 }
 async revokeKey(actor,id){
  const key=`model-key/${id}`;
  for(let attempt=0;attempt<64;attempt++){
   const row=await this.store.read(actor.id,key);if(!row?.value)throw modelError(404,'KEY_NOT_FOUND','Provider key not found');
   if(row.value.revokedAt)return {status:200,body:{key:keyPublic(row.value)}};
   const quotaRow=await this.store.read(actor.id,'model-key-quota');
   const existing=quotaRow?.value?null:await this.store.list(actor.id,{prefix:'model-key/',limit:200});
   const quota=quotaRow?.value||{total:existing.length,active:existing.filter(r=>!r.value.revokedAt).length};
   const value={...row.value,revokedAt:new Date(this.now()).toISOString()};delete value.encrypted;
   try{await this.store.commit(actor.id,[{key,expectedVersion:row.version,value},{key:'model-key-quota',expectedVersion:quotaRow?.version||0,value:{...quota,active:Math.max(0,quota.active-1)}}]);return {status:200,body:{key:keyPublic(value)}};}catch(e){if(!conflict(e))throw e;}
  }
  throw modelError(409,'KEY_QUOTA_BUSY','Concurrent key updates; retry later');
 }
 async handle(method,path,body={},actor,context={}){
  if(!path.startsWith('/api/models')&&!path.startsWith('/api/chat'))return null;
  if(method==='GET'&&path==='/api/models'){
   let privateAccess=false;try{authorize(actor,'models:read',this.now());privateAccess=true;}catch{}
   const quota=privateAccess?await this.quota(actor):null,keys=privateAccess?await this.store.list(actor.id,{prefix:'model-key/',limit:200}):[];
   return {status:200,body:{provider:'openrouter',available:this.models.length>0&&(this.hostedAvailable()||keys.some(r=>r.value&&!r.value.revokedAt)),hostedAvailable:this.hostedAvailable(),models:this.models,quota:quota?{...quota,dailyBudgetMicroUSD:this.dailyBudget,perCallBudgetMicroUSD:this.callBudget,dailyCallLimit:this.dailyCalls}:null,limits:{contextCharacters:8192,outputTokens:2048,outputSerializedBytes:MAX_MODEL_OUTPUT_JSON_BYTES},pricing:{collectionEnabled:false,markupProposalPercent:15,notice:'Provider fees apply to your provider account. A 15% service markup is a proposal only; no invoices or payments are collected.'}}};
  }
  if(path==='/api/models/keys'&&method==='GET'){authorize(actor,'models:read',this.now());return {status:200,body:{keys:(await this.store.list(actor.id,{prefix:'model-key/',limit:200})).filter(r=>r.value).map(r=>keyPublic(r.value))}};}
  if(path==='/api/models/keys'&&method==='POST'){
   authorize(actor,'models:write',this.now());if(body.provider!=='openrouter'||typeof body.key!=='string'||body.key.length<8||body.key.length>512||/[\r\n]/.test(body.key)||typeof (body.label||'')!=='string'||(body.label||'').length>80)throw modelError(400,'INVALID_KEY','Provide a bounded OpenRouter key and label');
   return this.createKey(actor,body);
  }
  const revoke=path.match(/^\/api\/models\/keys\/([\w-]+)\/revoke$/);if(revoke&&method==='POST'){authorize(actor,'models:write',this.now());return this.revokeKey(actor,revoke[1]);}
  if(path==='/api/chat'&&method==='POST'){
   const request={...body,idempotencyKey:context.idempotencyKey||body.idempotencyKey};const result=await this.complete(actor,request);const id=digest(request.idempotencyKey);const key=`model-thread/${id}`;const row=await this.store.read(actor.id,key);
   if(!row?.value){try{await this.store.commit(actor.id,[{key,expectedVersion:row?.version||0,value:{id,messages:request.messages.map(m=>({role:m.role,content:m.content})).concat({role:'assistant',content:result.text}),selectedContextIds:(request.selectedContext||[]).map(c=>c.id),receipt:result.receipt,createdAt:new Date(this.now()).toISOString()}}]);}catch(e){if(!conflict(e))throw e;}}
   return {status:200,body:{...result,threadId:id}};
  }
  if(path==='/api/chat/threads'&&method==='GET'){authorize(actor,'models:read',this.now());return {status:200,body:{threads:(await this.store.list(actor.id,{prefix:'model-thread/',limit:100})).filter(r=>r.value).map(r=>r.value)}};}
  const thread=path.match(/^\/api\/chat\/threads\/([a-f0-9]{64})$/);if(thread&&method==='GET'){authorize(actor,'models:read',this.now());const row=await this.store.read(actor.id,`model-thread/${thread[1]}`);if(!row?.value)throw modelError(404,'THREAD_NOT_FOUND','Thread not found');return {status:200,body:{thread:row.value}};}
  return null;
 }
}
