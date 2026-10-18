import { randomUUID } from 'node:crypto';
import { authorize, canonical, digest, modelError, MAX_MODEL_OUTPUT_JSON_BYTES } from './models.js';

const roles=['researcher','challenger','verifier','engineer','synthesizer'];
const conflict=e=>e.status===409;
const iso=now=>new Date(now).toISOString();
function event(value,type,data,now){const previous=value.events.at(-1)?.hash || null;const item={index:value.events.length,type,at:iso(now),previous,data};value.events.push({...item,hash:digest(item)});}
function integrity(value){const copy={...value};delete copy.integrity;return digest(copy);}
const MAX_JOB_BYTES=240*1024;
function storageCapacity(value){
 const bytes=Buffer.byteLength(canonical(value),'utf8')+(value.participants.length+1)*(MAX_MODEL_OUTPUT_JSON_BYTES+4096)+20000;
 if(bytes>MAX_JOB_BYTES)throw modelError(413,'CONSTELLATION_SIZE_LIMIT','Initial state leaves insufficient durable space for every participant, baseline, and checkpoint');
 return Math.ceil(bytes/1024)*1024;
}
function sealed(value){
 // Reserve actual tenant bytes before execution, then replace padding with evidence.
 // The store rejects NUL/invalid Unicode and counts JSON escaping; use serialized bytes.
 const copy={...value};delete copy.storagePadding;delete copy.integrity;
 const out=JSON.parse(canonical(copy));out.integrity='0'.repeat(64);
 if(out.started){
  out.storagePadding='';const used=Buffer.byteLength(canonical(out),'utf8');
  if(!out.storageCapacityBytes||used>out.storageCapacityBytes||out.storageCapacityBytes>MAX_JOB_BYTES)throw modelError(413,'CONSTELLATION_SIZE_LIMIT','Durable evidence exceeds its pre-reserved capacity');
  out.storagePadding=' '.repeat(out.storageCapacityBytes-used);
 }
 out.integrity=integrity(out);return out;
}
function verify(value){if(value.integrity!==integrity(value))throw modelError(409,'REPLAY_INTEGRITY','Constellation content does not match its checkpoint digest');let previous=null;for(let i=0;i<value.events.length;i++){const {hash,...item}=value.events[i];if(item.index!==i||item.previous!==previous||hash!==digest(item))throw modelError(409,'REPLAY_INTEGRITY','Constellation event chain does not verify');previous=hash;}return true;}
function view(v){const out=structuredClone(v);delete out.credentialId;delete out.lease;delete out.storagePadding;return out;}
export class ConstellationService {
 constructor({store,gateway,cgit,clock=()=>Date.now(),authenticateActor}={}){this.store=store;this.gateway=gateway;this.cgit=cgit;this.clock=clock;this.authenticateActor=authenticateActor;}
 now(){const v=this.clock();return v instanceof Date?v.getTime():typeof v==='string'?Date.parse(v):v;}
 async row(actor,id){const row=await this.store.read(actor.id,`constellation-job/${id}`);if(!row?.value)throw modelError(404,'CONSTELLATION_NOT_FOUND','Constellation not found');return row;}
 async save(scope,row,value){const result=await this.store.commit(scope,[{key:row.key,expectedVersion:row.version,value:sealed(value)}]);return result.records.find(r=>r.key===row.key);}
 async current(scope,key,token){const row=await this.store.read(scope,key);if(!row?.value||row.value.lease?.token!==token||row.value.lease.expiresAt<=this.now())throw modelError(409,'LEASE_LOST','Worker lease expired or was replaced');verify(row.value);return row;}
 async live(scope,value){if(!this.authenticateActor||!value.credentialId)throw modelError(503,'LIVE_AUTH_UNAVAILABLE','Live credential validation is required for background inference');const actor=await this.authenticateActor(value.credentialId);if(!actor||actor.id!==scope)throw modelError(403,'CREDENTIAL_REVOKED','Job credential expired or was revoked');authorize(actor,'constellations:write',this.now());authorize(actor,'chat:write',this.now());return actor;}
 async create(body,actor,context){
  authorize(actor,'constellations:write',this.now());if(typeof body.question!=='string'||!body.question.trim()||body.question.length>4000)throw modelError(400,'INVALID_QUESTION','Question must contain 1–4000 characters');
  if(body.owner!==undefined||body.scope!==undefined)throw modelError(400,'INVALID_REQUEST','Caller-selected ownership is not accepted');
  const participants=body.participants || roles.slice(0,3).map(role=>({role,model:body.model}));
  if(!Array.isArray(participants)||participants.length<3||participants.length>5||participants.some(p=>!p||!roles.includes(p.role)||typeof (p.model||body.model)!=='string')||new Set(participants.map(p=>p.role)).size!==participants.length)throw modelError(400,'INVALID_PARTICIPANTS','Choose three to five distinct supported participant roles');
  const selectedContext=body.selectedContext||[];if(selectedContext.length&&body.consent!==true)throw modelError(403,'CONSENT_REQUIRED','Selected context requires explicit consent');
  if(body.steward&&body.steward.consent!==true)throw modelError(403,'CONSENT_REQUIRED','CGIT stewardship requires separate explicit consent');
  if(body.steward&&(!this.cgit||typeof body.steward.repoId!=='string'))throw modelError(400,'STEWARD_UNAVAILABLE','A configured CGIT service and repository are required');
  const id=body.idempotencyKey||context.idempotencyKey?digest(body.idempotencyKey||context.idempotencyKey).slice(0,32):randomUUID();const key=`constellation-job/${id}`;
  const initial=participants.map((p,i)=>({index:i,role:p.role,model:p.model||body.model,request:{model:p.model||body.model,keyId:body.keyId,messages:[{role:'user',content:body.question}],role:p.role,max_tokens:body.max_tokens??512,selectedContext:structuredClone(selectedContext),consent:body.consent===true,idempotencyKey:`constellation:${id}:participant:${i}`}}));
  // Validate all bounded contexts before persistence; creating a job never calls inference.
  for(const p of initial)this.gateway.validate(p.request);
  if(Buffer.byteLength(canonical(initial),'utf8')>110000)throw modelError(413,'CONSTELLATION_SIZE_LIMIT','Serialized independent contexts exceed the durable storage limit');
  const payloadHash=digest({question:body.question,participants:initial,steward:body.steward||null});const existing=await this.store.read(actor.id,key);if(existing?.value){if(existing.value.payloadHash!==payloadHash)throw modelError(409,'IDEMPOTENCY_CONFLICT','Constellation key is already used');return {status:200,body:{constellation:view(existing.value)}};}

  const value={id,question:body.question,participants:initial,status:'draft',started:false,paused:false,credentialId:actor.credentialId||null,payloadHash,createdAt:iso(this.now()),updatedAt:iso(this.now()),contributions:[],events:[],disagreements:{status:'unassessed',notice:'Independent contributions are preserved verbatim. Agreement or disagreement requires explicit human assessment; no synthetic consensus is inferred.'},baseline:{status:'NOT_RUN',taskSuccess:'NOT_ASSESSED',reason:'Requires explicit equal-budget consent and available inference'},steward:body.steward?{consent:true,repoId:body.steward.repoId,branch:body.steward.branch||'main',expectedHead:body.steward.expectedHead??null,status:'pending'}:null};
  event(value,'created',{question:value.question,participants:initial.map(p=>({role:p.role,model:p.model,requestHash:digest(p.request)}))},this.now());
  value.storageCapacityBytes=storageCapacity(value);
  return this.admit(actor,key,value);
 }
 async admit(actor,key,value){
  for(let attempt=0;attempt<128;attempt++){
   const existing=await this.store.read(actor.id,key);
   if(existing?.value){if(existing.value.payloadHash!==value.payloadHash)throw modelError(409,'IDEMPOTENCY_CONFLICT','Constellation key is already used');return {status:200,body:{constellation:view(existing.value)}};}
   const row=await this.store.read(actor.id,'constellation-quota');
   const total=row?.value?.total??(await this.store.list(actor.id,{prefix:'constellation-job/',limit:200})).length;
   if(total>=100)throw modelError(429,'CONSTELLATION_LIMIT','Constellation storage limit reached');
   try{await this.store.commit(actor.id,[{key,expectedVersion:existing?.version||0,value:sealed(value)},{key:'constellation-quota',expectedVersion:row?.version||0,value:{total:total+1}}]);return {status:201,body:{constellation:view(value)}};}catch(e){if(!conflict(e))throw e;}
  }
  throw modelError(409,'CONSTELLATION_QUOTA_BUSY','Concurrent constellation admissions; retry later');
 }
 async workOnce({workerId,leaseMs=120000}={}){
  if(typeof workerId!=='string'||workerId.length<1||workerId.length>100||!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw modelError(400,'INVALID_WORKER','Bounded worker ID and lease required');
  const candidates=await this.store.scan({prefix:'constellation-job/',statuses:['queued','running'],limit:200});
  for(const candidate of candidates){
   const v=candidate.value;if(!v.started||v.paused||v.lease&&v.lease.expiresAt>this.now())continue;
   verify(v);const token=randomUUID();let row;try{row=await this.save(candidate.scope,candidate,{...v,status:'running',lease:{workerId,token,expiresAt:this.now()+leaseMs},updatedAt:iso(this.now())});}catch(e){if(conflict(e))continue;throw e;}
   const scope=candidate.scope,key=candidate.key;let attemptedParticipant=null;
   try{
    let actor=await this.live(scope,row.value);
    for(const participant of row.value.participants){
     row=await this.current(scope,key,token);if(row.value.contributions.some(c=>c.index===participant.index))continue;
     actor=await this.live(scope,row.value);
     attemptedParticipant={index:participant.index,role:participant.role,model:participant.model};
     const result=await this.gateway.complete(actor,participant.request);
     row=await this.current(scope,key,token);const contribution={index:participant.index,role:participant.role,model:result.model,provider:result.provider,text:result.text,claims:{status:'unparsed',source:'verbatim participant text'},evidence:{status:'unverified',source:'verbatim participant text'},usage:result.usage,cost:result.cost,receipt:result.receipt,contextHash:digest(participant.request.messages),identity:'independent provider API context; not a verified person',completedAt:iso(this.now())};
     const next={...row.value,contributions:[...row.value.contributions,contribution],updatedAt:iso(this.now()),lease:{...row.value.lease,expiresAt:this.now()+leaseMs}};event(next,'contribution',{index:contribution.index,role:contribution.role,contentHash:digest(contribution)},this.now());row=await this.save(scope,row,next);
    }
    row=await this.current(scope,key,token);
    if(row.value.steward?.status==='pending'){
     actor=await this.live(scope,row.value);const artifact={schema:'purl.constellation.evidence.v1',id:row.value.id,question:row.value.question,contributions:row.value.contributions,disagreements:row.value.disagreements,eventHead:row.value.events.at(-1).hash};
     // Record intent before external artifact mutation; ambiguous steward outcomes are never retried automatically.
     const intent={...row.value,steward:{...row.value.steward,status:'committing',artifactHash:digest(artifact)}};event(intent,'steward_intent',{artifactHash:digest(artifact)},this.now());row=await this.save(scope,row,intent);
     let committed;try{committed=await this.cgit.commitArtifact(actor,{repoId:row.value.steward.repoId,branch:row.value.steward.branch,expectedHead:row.value.steward.expectedHead,message:`Constellation ${row.value.id} independent evidence`,artifacts:[{path:`constellations/${row.value.id}.json`,type:'trace',content:artifact,consent:true,provenance:{kind:'constellation',id:row.value.id}}]});}catch{throw modelError(502,'STEWARD_AMBIGUOUS','CGIT steward commit did not complete with a receipt; inspect repository before retry');}
     row=await this.current(scope,key,token);const next={...row.value,steward:{...row.value.steward,status:'committed',commit:{hash:committed.commit.hash||committed.commit.id}}};event(next,'steward_committed',{commit:next.steward.commit},this.now());row=await this.save(scope,row,next);
    }
    if(row.value.steward?.status==='committing')throw modelError(409,'STEWARD_AMBIGUOUS','A prior steward commit has no persisted receipt; inspect repository');
    row=await this.current(scope,key,token);const next={...row.value,status:'succeeded',lease:null,error:null,updatedAt:iso(this.now())};event(next,'completed',{contributionCount:next.contributions.length},this.now());row=await this.save(scope,row,next);return {id:row.value.id,status:'succeeded'};
   }catch(e){
    if(e.code==='LEASE_LOST')return {id:v.id,status:'lease_lost'};
    try{row=await this.current(scope,key,token);const next={...row.value,status:'failed',lease:null,updatedAt:iso(this.now()),error:{code:typeof e.code==='string'?e.code:'WORKER_FAILED',message:'Execution stopped; saved contributions remain available. Provider calls are recovered by their original idempotency keys.',nonReplayable:['PROVIDER_AMBIGUOUS','CALL_IN_PROGRESS','STEWARD_AMBIGUOUS','PROVIDER_OUTPUT_REJECTED'].includes(e.code),...(e.code==='PROVIDER_OUTPUT_REJECTED'?{participant:attemptedParticipant,receipt:e.receipt,cost:e.cost,usage:e.usage,outputError:e.outputError}:{})}};event(next,'failed',{code:next.error.code,participant:attemptedParticipant,receiptId:e.receipt?.id||null},this.now());await this.save(scope,row,next);}catch(failure){if(failure.code!=='LEASE_LOST'&&!conflict(failure))throw failure;}
    return {id:v.id,status:'failed',code:e.code||'WORKER_FAILED'};
   }
  }
  return null;
 }
 async baseline(row,body,actor){
  const value=row.value;verify(value);
  if(value.baseline.status==='MEASURED')return {status:200,body:{baseline:value.baseline}};
  if(body.consent!==true)return {status:200,body:{baseline:{status:'NOT_RUN',taskSuccess:'NOT_ASSESSED',reason:'Explicit baseline budget consent is required'}}};
  if(value.status!=='succeeded')throw modelError(409,'CONSTELLATION_INCOMPLETE','Finish the Constellation before measuring a baseline');
  const budget=value.contributions.reduce((n,c)=>n+c.cost.estimatedMaximumMicroUSD,0);if(!Number.isSafeInteger(body.budgetMicroUSD)||body.budgetMicroUSD!==budget)throw modelError(400,'BASELINE_BUDGET','Baseline must authorize the same total estimated maximum USD-micro budget as the Constellation');
  const request={...value.participants[0].request,role:undefined,idempotencyKey:`constellation:${value.id}:baseline`,max_tokens:Math.min(2048,value.participants.reduce((n,p)=>n+p.request.max_tokens,0))};
  const estimate=this.gateway.validate(request);if(estimate.reservation>budget)throw modelError(429,'BASELINE_BUDGET','Single-model estimate exceeds equal-budget allocation');
  let result;try{result=await this.gateway.complete(actor,request);}catch(e){if(['MODEL_UNAVAILABLE','KEY_UNAVAILABLE','LIVE_AUTH_UNAVAILABLE'].includes(e.code))return {status:200,body:{baseline:{status:'NOT_RUN',taskSuccess:'NOT_ASSESSED',reason:e.code}}};throw e;}
  const baseline={status:'MEASURED',allocatedBudgetMicroUSD:budget,comparison:'equal spending ceiling; actual costs may differ',result,taskSuccess:'NOT_ASSESSED',rubricRequired:true};const next={...value,baseline};event(next,'baseline',{allocatedBudgetMicroUSD:budget,receipt:result.receipt},this.now());await this.save(actor.id,row,next);return {status:200,body:{baseline}};
 }
 async handle(method,path,body={},actor,context={}){
  if(!path.startsWith('/api/constellations'))return null;
  if((path==='/api/constellations'||path==='/api/constellations/create')&&method==='POST')return this.create(body,actor,context);
  if(path==='/api/constellations'&&method==='GET'){authorize(actor,'constellations:read',this.now());return {status:200,body:{constellations:(await this.store.list(actor.id,{prefix:'constellation-job/',limit:100})).filter(r=>r.value).map(r=>view(r.value))}};}
  const match=path.match(/^\/api\/constellations\/([a-zA-Z0-9-]+)(?:\/(start|checkpoint|resume|replay|baseline))?$/);if(!match)return null;
  authorize(actor,method==='GET'?'constellations:read':'constellations:write',this.now());const row=await this.row(actor,match[1]),action=match[2];
  if(method==='GET'&&!action)return {status:200,body:{constellation:view(row.value)}};
  if(method==='GET'&&action==='replay'){verify(row.value);return {status:200,body:{verified:true,events:row.value.events,contributions:row.value.contributions,disagreements:row.value.disagreements,integrity:row.value.integrity,note:'Replay reads persisted evidence; it does not reexecute provider calls.'}};}
  if(method==='POST'&&action==='baseline')return this.baseline(row,body,actor);
  if(method==='POST'&&['start','checkpoint','resume'].includes(action)){
   verify(row.value);if(row.value.status==='succeeded')return {status:200,body:{constellation:view(row.value)}};
   if(row.value.events.length>=32)throw modelError(429,'CHECKPOINT_LIMIT','Constellation checkpoint limit reached');
   if(row.value.lease?.expiresAt>this.now())throw modelError(409,'JOB_RUNNING','Wait for the current worker lease before changing job state');
   const next={...row.value,status:action==='checkpoint'?'paused':'queued',started:action!=='checkpoint'||row.value.started,paused:action==='checkpoint',lease:null,credentialId:actor.credentialId||null,updatedAt:iso(this.now())};event(next,action,{contributions:next.contributions.length},this.now());await this.save(actor.id,row,next);return {status:200,body:{constellation:view(next)}};
  }
  return null;
 }
}
