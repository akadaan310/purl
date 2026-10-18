import { randomBytes } from 'node:crypto';
import { compile, execute } from '../compiler.js';
import { hashOf, clone, validate, registerSchema } from '../domain/support.js';

const INDEX='launch-resource-index', SYSTEM='launch-mission-operator', MAX_VERSIONS=200;
const indexScope=id=>`${INDEX}:${id}`;
const proposalScope=id=>`launch-resource-proposals:${id}`;
const proposalKey=(id,proposal)=>`resource-proposal/${id}/${proposal}`;
const decisionKey=(id,proposal)=>`resource-proposal-decision/${id}/${proposal}`;
const uid=kind=>`${kind}_${randomBytes(12).toString('hex')}`;
const pad=n=>String(n).padStart(6,'0');
const issue=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
const response=(body,status=200)=>({status,body});
const snapshot=resource=>{const {event_head,...rest}=resource;return clone(rest);};
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const same=(a,b)=>hashOf(a)===hashOf(b);
const PERMANENT_COMPLETION_ERRORS=new Set(['history_limit','row_limit','tenant_quota','metadata_quota','invalid_input']);
// Match the launch store's JSONB decimal sizing without constructing expanded numeric strings.
function storageBytes(value){
 if(value===null||typeof value!=='object'){
  const encoded=JSON.stringify(value);if(typeof value!=='number'||!encoded.includes('e'))return Buffer.byteLength(encoded);
  const [mantissa,power]=encoded.split('e'),negative=mantissa.startsWith('-'),unsigned=negative?mantissa.slice(1):mantissa,digits=unsigned.replace('.','').length,point=(unsigned.includes('.')?unsigned.indexOf('.'):unsigned.length)+Number(power);
  return (negative?1:0)+(point<=0?2-point+digits:point>=digits?point:digits+1);
 }
 if(Array.isArray(value))return 2+Math.max(0,value.length-1)+value.reduce((sum,v)=>sum+storageBytes(v),0);
 const keys=Object.keys(value);return 2+Math.max(0,keys.length-1)+keys.reduce((sum,key)=>sum+Buffer.byteLength(JSON.stringify(key))+1+storageBytes(value[key]),0);
}
const requireRowSize=value=>{if(storageBytes(value)>256*1024)issue(413,'row_limit','Persisted execution or resource row exceeds 256 KiB');};

// Reject values that JSON.stringify would silently alter before hashing or cloning.
function jsonValue(value,maxBytes=512*1024,limitCode='body_limit'){
 const active=new Set();let nodes=0;
 const visit=(v,depth)=>{
  if(++nodes>100000||depth>64)issue(400,'invalid_json','JSON nesting or node bound exceeded');
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='number'){if(!Number.isFinite(v))issue(400,'invalid_json','JSON numbers must be finite');return;}
  if(typeof v==='string'){if(!v.isWellFormed()||v.includes('\0'))issue(400,'invalid_json','JSON strings must be well-formed Unicode without NUL');return;}
  if(!v||typeof v!=='object'||active.has(v)||!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))issue(400,'invalid_json','Only finite plain JSON data is supported');
  active.add(v);const keys=Reflect.ownKeys(v);
  for(const key of keys){if(Array.isArray(v)&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(v,key);
   if(typeof key!=='string'||!key.isWellFormed()||key.includes('\0')||['__proto__','constructor','prototype'].includes(key)||!d?.enumerable||!Object.hasOwn(d,'value'))issue(400,'invalid_json','Unsafe JSON properties are forbidden');
   visit(d.value,depth+1);
  }
  if(Array.isArray(v)&&(Object.keys(v).length!==v.length||Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).some(present=>!present)))issue(400,'invalid_json','JSON arrays must be dense');
  active.delete(v);
 };
 visit(value,0);const size=bytes(value);if(size>maxBytes)issue(413,limitCode,`Value exceeds its ${maxBytes}-byte bound`);return value;
}
const activePrincipal=(actor,now)=>Boolean(typeof actor?.id==='string'&&actor.id&&Number.isFinite(Date.parse(actor.expiresAt))&&Date.parse(actor.expiresAt)>now);
function sourcePatch(body,resource){
 const patch={};if(Object.hasOwn(body,'source')){
  if(typeof body.source!=='string'&&(!body.source||typeof body.source!=='object'||Array.isArray(body.source)))issue(400,'invalid_source','Provide native PURL source');
  jsonValue(body.source,65536,'source_limit');const checked=compile(body.source);if(!checked.ok)issue(422,'compile_failed','Source does not compile');
  if(checked.plan.effects.length||checked.plan.requires.length)issue(403,'effects_unavailable','This runtime admits only bounded pure PURL plans');
  patch.source=clone(body.source);if(resource){patch.source_revision=resource.source_revision+1;patch.active_build=null;}
 }
 if(Object.hasOwn(body,'state')){jsonValue(body.state,65536,'state_limit');patch.state=clone(body.state);}
 if(!Object.keys(patch).length)issue(400,'source_required','Provide source or state');return patch;
}

/** Native PURL resources use per-owner CAS rows, never the legacy global document. */
export class ResourceService {
 constructor({store,baseUrl='',authenticateActor=null,clock=Date.now,executor=execute}={}){
  if(!store)throw new TypeError('store is required');
  Object.assign(this,{store,baseUrl:baseUrl.replace(/\/$/,''),authenticateActor,clock,executor});
 }
 now(){return new Date(this.clock()).toISOString();}
 url(path){return `${this.baseUrl}${path}`;}
 requireActor(actor,{write=true}={}){if(!activePrincipal(actor,this.clock()))issue(401,'authentication_required','An active principal is required');if(!Array.isArray(actor.scopes)||!(actor.scopes.includes('resources:write')||!write&&actor.scopes.includes('resources:read')))issue(403,'forbidden',`This credential has no resources:${write?'write':'read'} scope`);}
 async locate(id,actor,{write=false}={}){
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))issue(404,'not_found','Resource not found');
  const index=(await this.store.read(indexScope(id),`resource/${id}`))??await this.store.read(INDEX,`resource/${id}`);
  if(!index?.value)issue(404,'not_found','Resource not found');
  const record=await this.store.read(index.value.owner,`resource/${id}`),resource=record?.value;
  if(!resource||(resource.visibility!=='public'&&resource.owner!==actor?.id))issue(404,'not_found','Resource not found');
  if(resource.visibility!=='public')this.requireActor(actor,{write:false});
  if(write){this.requireActor(actor);if(resource.owner!==actor.id)issue(403,'forbidden','Only this resource owner may change it');}
  return {record,resource,scope:resource.owner};
 }
 manifest(resource,actor){
  const canWrite=activePrincipal(actor,this.clock())&&Array.isArray(actor.scopes)&&actor.scopes.includes('resources:write'),owned=resource.owner===actor?.id&&canWrite;
  const root=`/api/resources/${resource.id}`,rights=owned?['read','fork','source','compile','build','run','publish','checkpoint','propose','commit']:canWrite?['read','fork']:['read'];
  const operations=['source','compile','build','run','publish','checkpoint','fork','propose','commit'].map(name=>{
   const properties={expected_version:{type:'integer',minimum:1}};
   if(name==='run')Object.assign(properties,{input:resource.input_schema,seed:{type:'integer'}});
   if(name==='source'||name==='propose')Object.assign(properties,{source:{type:['string','object'],description:'Closed pure native PURL source, at most 64 KiB'},state:{description:'Finite persistable JSON, at most 64 KiB'}});
   if(name==='propose')Object.assign(properties,{base_version:{type:'integer',minimum:1},summary:{type:'string',maxLength:4000}});
   if(name==='checkpoint')Object.assign(properties,{summary:{type:'string',minLength:1,maxLength:6000,description:'Nonempty author assertion; evidence is not independently verified'},next:{type:'array',description:'Suggested continuation steps; defaults to []'},evidence:{type:'array',description:'Author-supplied evidence references; defaults to []'}});
   if(name==='publish')properties.visibility={type:'string',enum:['public','private'],default:'public'};
   if(name==='fork')Object.assign(properties,{title:{type:'string',minLength:1,maxLength:180,description:'Defaults to the original title with a continuation suffix'},visibility:{type:'string',enum:['private','public'],default:'private'}});
   if(name==='commit')Object.assign(properties,{proposal_id:{type:'string',pattern:'^proposal_[a-f0-9]{24}$'},decision:{type:'string',enum:['accept','reject']}});
   const input_schema={type:'object',properties,required:name==='commit'?['expected_version','proposal_id']:name==='checkpoint'?['expected_version','summary']:['expected_version']};
   if(name==='source'||name==='propose')input_schema.anyOf=[{required:['source']},{required:['state']}];
   return {name,method:'POST',href:this.url(`${root}/${name}`),available:name==='fork'||name==='propose'?Boolean(canWrite):Boolean(owned),requires:['active-principal','resources:write',...(name==='fork'||name==='propose'?[]:['resource-owner'])],effects:['persisted-state',...(name==='run'?['durable-job']:[])],input_schema};
  });
  return {protocol:'PURL/launch-1',program:{id:resource.id,title:resource.title,kind:resource.kind,version:resource.version,language:'purl',url:this.url(`/p/${resource.id}`),input_schema:resource.input_schema,output_schema:resource.output_schema},source:resource.source,operations,authority:{principal_id:actor?.id??null,owner:Boolean(owned),rights},links:{self:this.url(`/p/${resource.id}`),source:this.url(`${root}/source`),resource:this.url(root),manifest:this.url(`${root}/manifest`),continuity:this.url(`${root}/continuity`),history:this.url(`${root}/history`),executions:this.url(`${root}/executions`),artifacts:this.url(`${root}/artifacts`),builds:this.url(`${root}/builds`),releases:this.url(`${root}/releases`),proposals:this.url(`${root}/proposals`),replay:this.url(`${root}/replay`),compiler:this.url('/api/compiler'),sdk:this.url('/sdk/launch.js')},continuation:{checkpoint:resource.checkpoint??null,expected_version:resource.version,steps:['GET continuity: it contains every mission document, state, evidence, progress and next steps','Read source, tests and current authority','Authenticate only through a disclosed supported flow when authorized','Fork a public resource under your own principal to continue; owner mutation requires authority','Compile, build declared tests, run, inspect execution and artifact, checkpoint evidence and publish'],disclaimer:'Public reading is not mutation authority. Checkpoint claims and hashes do not certify requirement truth.'},limits:{history_versions:MAX_VERSIONS,artifact_bytes:65536,source_bytes:65536,state_bytes:65536,proposals_per_resource:200,proposals_per_actor:20,authored_code:'disabled'}};
 }
 async prior(scope,path,body,key){
  if(!key)return null;
  if(typeof key!=='string'||!key.trim()||key.length>128)issue(400,'invalid_idempotency_key','Idempotency-Key must contain 1–128 characters');
  const receiptKey=`resource-command/${hashOf([path,key]).slice(7)}`,fingerprint=hashOf(body),previous=await this.store.read(scope,receiptKey);
  if(previous?.value){
   if(previous.value.fingerprint!==fingerprint)issue(409,'idempotency_conflict','Idempotency-Key was used with another payload');
   if(previous.value.replay?.kind==='proposal-decision'){
    const replay=previous.value.replay,version=await this.store.read(scope,`resource-version/${replay.resource_id}/${pad(replay.version)}`),event=await this.store.read(scope,`resource-event/${replay.resource_id}/${pad(replay.version)}`);
    if(!version?.value||version.value.owner!==scope||!event?.value)issue(503,'receipt_unavailable','Immutable command replay dependencies are unavailable');
    const resource={...version.value,event_head:event.value.hash},proposal=await this.readProposal(resource,replay.proposal_id),decision=await this.store.read(scope,decisionKey(resource.id,proposal.id));
    if(!decision?.value)issue(503,'receipt_unavailable','Immutable owner decision is unavailable');return {result:response({resource,proposal,decision:decision.value},replay.status)};
   }
   return {result:previous.value.result};
  }
  return {key:receiptKey,fingerprint};
 }
 async transition(scope,record,patch,operation,actor,extra=[],receipt=null,payload={},responseExtra={},status=200){
  const previous=record?.value,version=(previous?.version??0)+1;
  if(version>MAX_VERSIONS)issue(429,'history_limit','Export or fork this resource before continuing beyond 200 versions');
  const resource={...clone(previous??{}),...clone(patch),version,updated_at:this.now()};
  const event={resource_id:resource.id,version,operation,actor:actor.id,at:resource.updated_at,previous_hash:previous?.event_head??null,state_hash:hashOf(snapshot(resource)),payload};event.hash=hashOf(event);resource.event_head=event.hash;
  const changes=[{key:`resource/${resource.id}`,expectedVersion:record?.version??0,value:resource},{key:`resource-event/${resource.id}/${pad(version)}`,expectedVersion:0,value:event},{key:`resource-version/${resource.id}/${pad(version)}`,expectedVersion:0,value:snapshot(resource)},...extra];
  const result=response({resource:clone(resource),...clone(responseExtra)},status);
  if(receipt?.key)changes.push({key:receipt.key,expectedVersion:0,value:{fingerprint:receipt.fingerprint,...(receipt.replay?{replay:{...receipt.replay,resource_id:resource.id,version,status}}:{result})}});
  for(const change of changes)requireRowSize(change.value);
  await this.store.commit(scope,changes);
  return {resource,result,event};
 }
 async create(body,actor,{id,receipt,lineage}={}){
  if(id?.startsWith('resource_')===false&&actor.id!==SYSTEM)issue(403,'forbidden','Resource IDs are assigned by the service');
  if((body.language??'purl')!=='purl')issue(503,'sandbox_unavailable','Authored code is unavailable until independent isolation validation');
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>180)issue(400,'invalid_title','Provide a title of 1–180 characters');
  if(typeof body.source!=='string'&&(!body.source||typeof body.source!=='object'||Array.isArray(body.source)))issue(400,'invalid_source','Provide native PURL source');
  sourcePatch({source:body.source,state:body.state??{}});
  const tests=body.tests??[];if(!Array.isArray(tests)||tests.length>20||tests.some(x=>!x||!Object.hasOwn(x,'input')||!Object.hasOwn(x,'expected')))issue(400,'invalid_tests','Provide at most 20 input/expected tests');
  const inputSchema=registerSchema(body.input_schema??{}),outputSchema=registerSchema(body.output_schema??{});jsonValue(tests,65536,'tests_limit');
  const visibility=body.visibility??'private';if(!['public','private'].includes(visibility))issue(400,'invalid_visibility','Visibility is private or public');
  id??=uid('resource');
  const index=await this.store.read(indexScope(id),`resource/${id}`);
  if(index?.value&&index.value.owner!==actor.id)issue(409,'resource_conflict','Resource address is occupied');
  if(!index?.value)await this.store.commit(indexScope(id),[{key:`resource/${id}`,expectedVersion:index?.version??0,value:{owner:actor.id}}]);
  const at=this.now(),resource={id,owner:actor.id,title:body.title.trim(),kind:body.kind==='mission'?'mission':'program',language:'purl',source:clone(body.source),source_revision:1,state:clone(body.state??{}),visibility,tests:clone(tests),input_schema:inputSchema,output_schema:outputSchema,active_build:null,checkpoint:null,lineage:lineage??null,created_at:at};
  const out=await this.transition(actor.id,null,resource,'create',actor,[],receipt,{lineage:resource.lineage},{},201);return out.result;
 }
 async seedMission(seed){
  const existing=await this.store.read(SYSTEM,`resource/${seed.id}`);if(existing?.value)return existing.value;
  try{const r=await this.create({...seed,kind:'mission',visibility:'public'},{id:SYSTEM,kind:'service',verified:false,scopes:['resources:write']},{id:seed.id});return r.body.resource;}
  catch(error){
   if(error.code!=='version_conflict')throw error;
   // Another API replica may be between address reservation and its atomic
   // owner-state commit. Only adopt the complete persisted seed, never rewrite it.
   for(let attempt=0;attempt<10;attempt++){const current=await this.store.read(SYSTEM,`resource/${seed.id}`);if(current?.value)return current.value;await new Promise(resolve=>setTimeout(resolve,Math.min(500,20*(attempt+1))));}
   throw error;
  }
 }
 async children(resource,kind){
  const events=await this.store.list(resource.owner,{prefix:`resource-event/${resource.id}/`,limit:MAX_VERSIONS}),ids=new Set(),problems=[];
  const field={executions:'execution_id',builds:'build_id',releases:'release_id'}[kind];
  if(kind==='artifacts'){
   const jobs=await this.children(resource,'executions');problems.push(...jobs.problems);
   for(const job of jobs.items)if(job.artifact_id)ids.add(job.artifact_id);else if(job.status==='succeeded')problems.push({execution_id:job.id,problem:'succeeded execution has no artifact reference'});
  }else for(const event of events)if(typeof event.value.payload?.[field]==='string')ids.add(event.value.payload[field]);
  const prefix={executions:'resource-job',artifacts:'resource-artifact',builds:'resource-build',releases:'resource-release'}[kind],items=[];
  for(const id of ids){const row=await this.store.read(resource.owner,`${prefix}/${id}`);if(!row?.value||row.value.resource_id!==resource.id)problems.push({child_id:id,kind,problem:'resource history references a missing or foreign child'});else items.push(row.value);}
  if(events.length!==resource.version)problems.push({problem:'resource history selection is incomplete'});
  return {items,problems,complete:problems.length===0};
 }
 async readProposal(resource,id){
  if(typeof id!=='string'||!/^proposal_[a-f0-9]{24}$/.test(id))issue(404,'not_found','Proposal not found');
  const row=await this.store.read(proposalScope(resource.id),proposalKey(resource.id,id)),proposal=row?.value;
  if(!proposal||proposal.resource_id!==resource.id||proposal.owner!==resource.owner)issue(404,'not_found','Proposal not found');
  const {content_id,...unsigned}=proposal;if(hashOf(unsigned)!==content_id)issue(409,'proposal_integrity','Immutable proposal digest differs');
  return proposal;
 }
 async proposalView(resource,proposal,actor){
  if(actor.id!==resource.owner&&actor.id!==proposal.actor)issue(404,'not_found','Proposal not found');
  const row=await this.store.read(resource.owner,decisionKey(resource.id,proposal.id));return {proposal,decision:row?.value??null};
 }
 async propose(resource,body,actor,path,key){
  const scope=proposalScope(resource.id),receipt=await this.prior(scope,`${path}:actor:${actor.id}`,body,key);if(receipt?.result)return receipt.result;
  if(!Number.isSafeInteger(body.expected_version)||body.expected_version!==resource.version)issue(409,'version_conflict','Inspect the current expected_version before proposing');
  if(Object.hasOwn(body,'base_version')&&body.base_version!==resource.version)issue(409,'proposal_stale','Proposal base_version must match the current resource version');
  const patch=sourcePatch(body);if(body.summary!==undefined&&(typeof body.summary!=='string'||body.summary.length>4000))issue(400,'invalid_summary','Proposal summary is limited to 4000 characters');
  const meta=await this.store.read(scope,'proposal-meta'),counts=meta?.value?.counts??[],count=counts.find(x=>x.actor===actor.id)?.count??0;
  if((meta?.value?.total??0)>=200||count>=20)issue(429,'proposal_limit','Proposal limit is 200 per resource and 20 per proposer');
  const proposal={id:uid('proposal'),resource_id:resource.id,owner:resource.owner,actor:actor.id,base_version:resource.version,summary:body.summary??'',...patch,status:'pending',immutable:true,created_at:this.now()};proposal.content_id=hashOf(proposal);
  const result=response({proposal},201),nextCounts=counts.filter(x=>x.actor!==actor.id).concat({actor:actor.id,count:count+1});
  const changes=[{key:proposalKey(resource.id,proposal.id),expectedVersion:0,value:proposal},{key:'proposal-meta',expectedVersion:meta?.version??0,value:{total:(meta?.value?.total??0)+1,counts:nextCounts}}];
  if(receipt?.key)changes.push({key:receipt.key,expectedVersion:0,value:{fingerprint:receipt.fingerprint,result}});
  try{await this.store.commit(scope,changes);}catch(e){if(e.code==='version_conflict'&&key){const prior=await this.prior(scope,`${path}:actor:${actor.id}`,body,key);if(prior?.result)return prior.result;}throw e;}return result;
 }
 async handle(method,path,body={},actor=null,context={}){
  if(method==='POST'&&(path==='/api/resources'||path.startsWith('/api/resources/'))){if(!body||typeof body!=='object'||Array.isArray(body))issue(400,'invalid_json','Request body must be a JSON object');jsonValue(body);}

  if(path==='/api/resources'){
   if(method==='GET'){if(!actor)return response({items:[]});this.requireActor(actor,{write:false});const rows=await this.store.list(actor.id,{prefix:'resource/'});return response({items:rows.map(r=>r.value)});}
   if(method==='POST'){this.requireActor(actor);const receipt=await this.prior(actor.id,path,body,context.idempotencyKey);if(receipt?.result)return receipt.result;return this.create(body,actor,{receipt});}
   return null;
  }
  const match=/^\/api\/resources\/([A-Za-z0-9_-]+)(?:\/([a-z-]+)(?:\/([A-Za-z0-9_-]+))?)?$/.exec(path);if(!match)return null;
  const [,id,action,child]=match,{record,resource,scope}=await this.locate(id,actor);
  if(method==='GET'){
   if(!action)return response({resource});
   if(action==='manifest')return response(this.manifest(resource,actor));
   if(action==='source')return response({source:resource.source,language:'purl',tests:resource.tests,state:resource.state,source_revision:resource.source_revision});
   if(action==='continuity')return response({protocol:'PURL/launch-1',resource_id:id,version:resource.version,source:resource.source,state:resource.state,checkpoint:resource.checkpoint,lineage:resource.lineage,tests:resource.tests,authority:this.manifest(resource,actor).authority,next_operations:this.manifest(resource,actor).operations,links:this.manifest(resource,actor).links});
   if(action==='history')return response({events:(await this.store.list(scope,{prefix:`resource-event/${id}/`})).map(r=>r.value)});
   if(action==='replay')return response(await this.replay(resource));
   if(action==='proposals'){
    this.requireActor(actor,{write:false});
    if(child)return response(await this.proposalView(resource,await this.readProposal(resource,child),actor));
    const rows=await this.store.list(proposalScope(id),{prefix:`resource-proposal/${id}/`,limit:200}),items=[];
    for(const row of rows)if(actor.id===resource.owner||row.value.actor===actor.id){const proposal=await this.readProposal(resource,row.value.id);items.push(await this.proposalView(resource,proposal,actor));}
    return response({items});
   }
   if(['executions','artifacts','builds','releases'].includes(action)){
    const prefix={executions:'resource-job',artifacts:'resource-artifact',builds:'resource-build',releases:'resource-release'}[action];
    if(!child)return response(await this.children(resource,action));
    const r=await this.store.read(scope,`${prefix}/${child}`);if(!r?.value||r.value.resource_id!==id)issue(404,'not_found','Resource child not found');return response({[{executions:'execution',artifacts:'artifact',builds:'build',releases:'release'}[action]]:r.value});
   }
   issue(404,'not_found','Resource operation not found');
  }
  if(method!=='POST')return null;
  this.requireActor(actor);
  if(action==='propose')return this.propose(resource,body,actor,path,context.idempotencyKey);
  if(action==='commit')await this.locate(id,actor,{write:true});
  const receipt=await this.prior(actor.id,path,body,context.idempotencyKey);if(receipt?.result)return receipt.result;
  if(!Number.isSafeInteger(body.expected_version)||body.expected_version!==resource.version)issue(409,'version_conflict','Inspect the current expected_version before changing this resource');
  if(action==='fork')return this.create({title:body.title??`${resource.title} · continuation`,source:resource.source,tests:resource.tests,state:resource.state,kind:resource.kind,visibility:body.visibility??'private',input_schema:resource.input_schema,output_schema:resource.output_schema},actor,{receipt,lineage:{resource_id:id,url:this.url(`/p/${id}`),version:resource.version,source_content_id:hashOf(resource.source)}});
  await this.locate(id,actor,{write:true});
  if(action==='commit'){
   const proposal=await this.readProposal(resource,body.proposal_id),decisionValue=body.decision??'accept';
   if(!['accept','reject'].includes(decisionValue))issue(400,'invalid_decision','Decision must be accept or reject');
   if(proposal.base_version!==resource.version)issue(409,'proposal_stale','Proposal base_version no longer matches this resource');
   const decisionRow=await this.store.read(scope,decisionKey(id,proposal.id));if(decisionRow?.value)issue(409,'proposal_decided','Proposal already has an immutable owner decision');
   const patch=decisionValue==='accept'?sourcePatch(proposal,resource):{};
   const decision={id:uid('decision'),resource_id:id,proposal_id:proposal.id,proposal_content_id:proposal.content_id,owner:actor.id,proposer:proposal.actor,base_version:proposal.base_version,version:resource.version+1,decision:decisionValue,status:decisionValue==='accept'?'accepted':'rejected',immutable:true,created_at:this.now()};decision.content_id=hashOf(decision);
   const decisionReceipt=receipt?.key?{...receipt,replay:{kind:'proposal-decision',proposal_id:proposal.id}}:receipt;
   try{return (await this.transition(scope,record,patch,'commit',actor,[{key:decisionKey(id,proposal.id),expectedVersion:decisionRow?.version??0,value:decision}],decisionReceipt,{proposal_id:proposal.id,decision:decisionValue},{proposal,decision})).result;}
   catch(e){if(e.code==='version_conflict'&&context.idempotencyKey){const previous=await this.prior(scope,path,body,context.idempotencyKey);if(previous?.result)return previous.result;}throw e;}
  }
  if(action==='source')return (await this.transition(scope,record,sourcePatch(body,resource),'source',actor,[],receipt)).result;
  if(action==='compile'||action==='build'){
   const checked=compile(resource.source);if(!checked.ok)return response({compilation:checked},422);
   if(checked.plan.effects.length||checked.plan.requires.length)issue(403,'effects_unavailable','This runtime admits only bounded pure PURL plans');
   if(action==='compile')return (await this.transition(scope,record,{compilation:checked},'compile',actor,[],receipt)).result;
   if(checked.plan.cost*Math.max(1,resource.tests.length)>50000)issue(422,'test_budget','Declared tests exceed the synchronous build budget');
   const tests=resource.tests.map((t,index)=>{try{validate(resource.input_schema,t.input,'input');const out=execute(checked.plan,t.input,{seed:0});validate(resource.output_schema,out.value,'output');return {index,passed:same(out.value,t.expected),actual:out.value,expected:t.expected};}catch(e){return {index,passed:false,error:{code:e.code??'execution_failed',message:String(e.message).slice(0,160)}};}});
   const build={id:uid('build'),resource_id:id,source_revision:resource.source_revision,source_content_id:hashOf(resource.source),plan:checked.plan,tests,status:tests.every(t=>t.passed)?'passed':'failed',immutable:true,environment:{node:process.versions.node,architecture:process.arch,runtime:'purl-bounded-interpreter'},created_at:this.now()};build.content_id=hashOf(build);
   const out=await this.transition(scope,record,{active_build:build.status==='passed'?build.id:null},'build',actor,[{key:`resource-build/${build.id}`,expectedVersion:0,value:build}],receipt,{build_id:build.id},{build});
   return out.result;
  }
  if(action==='run'){
   const built=resource.active_build&&await this.store.read(scope,`resource-build/${resource.active_build}`);if(!built?.value||built.value.status!=='passed'||built.value.source_revision!==resource.source_revision)issue(409,'build_required','Build and pass declared tests before running');
   const rawInput=Object.hasOwn(body,'input')?body.input:resource.state;jsonValue(rawInput,65536,'input_limit');
   const input=clone(rawInput),seed=body.seed??0;if(!Number.isSafeInteger(seed))issue(400,'seed','Seed must be a safe integer');if(bytes(input)>65536)issue(413,'input_limit','Input exceeds 64 KiB');validate(resource.input_schema,input,'input');
   const job={id:uid('execution'),resource_id:id,owner:scope,build_id:built.value.id,build_content_id:built.value.content_id,status:'queued',input,seed,requested_actor:{id:actor.id,credentialId:actor.credentialId??null,product:actor.product??null},created_at:this.now(),attempts:0,lease:null,value:null,logs:[{at:this.now(),message:'Execution durably queued'}]};
   const out=await this.transition(scope,record,{},'run',actor,[{key:`resource-job/${job.id}`,expectedVersion:0,value:job}],receipt,{execution_id:job.id},{execution:job},202);return out.result;
  }
  if(action==='publish'){
   const built=resource.active_build&&await this.store.read(scope,`resource-build/${resource.active_build}`);if(!built?.value||built.value.status!=='passed')issue(409,'build_required','A passing immutable build is required');
   const visibility=body.visibility??'public';if(!['public','private'].includes(visibility))issue(400,'invalid_visibility','Visibility is public or private');
   const release={id:uid('release'),resource_id:id,version:resource.version+1,build_id:built.value.id,build_content_id:built.value.content_id,source_content_id:hashOf(resource.source),snapshot:snapshot(resource),immutable:true,created_at:this.now()};release.content_id=hashOf(release);
   const out=await this.transition(scope,record,{visibility,last_release:release.id},'publish',actor,[{key:`resource-release/${release.id}`,expectedVersion:0,value:release}],receipt,{release_id:release.id},{release});return out.result;
  }
  if(action==='checkpoint'){
   if(typeof body.summary!=='string'||!body.summary.trim()||body.summary.length>6000)issue(400,'summary_required','Checkpoint summary must contain 1–6000 characters');
   if(body.next!==undefined&&!Array.isArray(body.next)||body.evidence!==undefined&&!Array.isArray(body.evidence))issue(400,'invalid_checkpoint','Checkpoint next and evidence must be arrays');
   const checkpoint={id:uid('checkpoint'),resource_id:id,version:resource.version+1,summary:body.summary,next:clone(body.next??[]),evidence:clone(body.evidence??[]),state_hash:hashOf(resource.state),created_at:this.now(),actor:actor.id,evidence_verified:false,provenance:'Author assertions; content integrity is checked independently'};
   if(bytes(checkpoint)>32768)issue(413,'checkpoint_limit','Checkpoint exceeds 32 KiB');const out=await this.transition(scope,record,{checkpoint},'checkpoint',actor,[],receipt,{checkpoint_id:checkpoint.id},{checkpoint});return out.result;
  }
  issue(404,'not_found','Resource mutation not found');
 }
 // Before a lease exists, fence the compact terminal replacement by the observed row version.
 async terminalPendingFailure(scope,row,error,cancelled=false){
  const job=row.value;if(!job||job.owner!==scope)return null;
  const terminal={id:job.id,resource_id:job.resource_id,owner:job.owner,build_id:job.build_id,status:cancelled?'cancelled':'failed',attempts:job.attempts,lease:null,input:null,input_omitted:true,value:null,error:{code:cancelled?'authority_expired':error.code},created_at:job.created_at,completed_at:this.now(),terminal_without_resource_event:true};
  requireRowSize(terminal);try{await this.store.commit(scope,[{key:row.key,expectedVersion:row.version,value:terminal}]);return terminal;}catch(e){if(e.code==='version_conflict')return null;throw e;}
 }
 async terminalFailure(scope,key,lease,job,error){
  const row=await this.store.read(scope,key);if(!row?.value||row.value.lease?.token!==lease.token||Date.parse(row.value.lease.expires_at)<=this.clock())return null;
  const failed={id:job.id,resource_id:job.resource_id,owner:job.owner,build_id:job.build_id,status:'failed',attempts:job.attempts,lease:null,input:null,input_content_id:hashOf(job.input),input_omitted:true,value:null,error:{code:error.code,message:'Execution could not be durably published within resource limits'},created_at:job.created_at,completed_at:this.now(),terminal_without_resource_event:true};
  requireRowSize(failed);try{await this.store.commit(scope,[{key,expectedVersion:row.version,value:failed}]);return failed;}catch(e){if(e.code==='version_conflict')return null;throw e;}
 }
 async executionActor(job,scope){
  let actor=null;try{actor=typeof this.authenticateActor==='function'?await this.authenticateActor(job.requested_actor?.credentialId,{product:job.requested_actor?.product}):null;}catch{}
  return activePrincipal(actor,this.clock())&&actor.id===scope&&actor.id===job.owner&&actor.id===job.requested_actor?.id&&Array.isArray(actor.scopes)&&actor.scopes.includes('resources:write')?actor:null;
 }
 async workOnce({workerId,leaseMs=30000}={}){
  if(!workerId||!Number.isSafeInteger(leaseMs)||leaseMs<1)throw new TypeError('workerId and positive leaseMs required');
  const candidates=await this.store.scan({prefix:'resource-job/',statuses:['queued','running'],limit:200});
  for(const candidate of candidates){
   let row=await this.store.read(candidate.scope,candidate.key);if(!row?.value)continue;let job=row.value;
   const leaseExpiry=Date.parse(job.lease?.expires_at);
   if(job.status!=='queued'&&!(job.status==='running'&&(!Number.isFinite(leaseExpiry)||leaseExpiry<=this.clock())))continue;
   const authorized=await this.executionActor(job,candidate.scope);
   const current=await this.store.read(candidate.scope,`resource/${job.resource_id}`);
   if(!current?.value)continue;
   if(!authorized||current.value.owner!==job.owner){
    job={...job,status:'cancelled',lease:null,error:{code:'authority_expired',message:'The requesting credential is expired, revoked or unavailable'},completed_at:this.now()};try{await this.store.commit(candidate.scope,[{key:row.key,expectedVersion:row.version,value:job}]);return job;}catch(e){if(e.code==='version_conflict')continue;if(PERMANENT_COMPLETION_ERRORS.has(e.code))return this.terminalPendingFailure(candidate.scope,row,e,true);throw e;}
   }
   const lease={worker_id:workerId,token:uid('lease'),expires_at:new Date(this.clock()+leaseMs).toISOString()};job={...job,status:'running',attempts:job.attempts+1,started_at:this.now(),lease,logs:[...job.logs,{at:this.now(),message:`Worker claimed attempt ${job.attempts+1}`}]};
   try{await this.store.commit(candidate.scope,[{key:row.key,expectedVersion:row.version,value:job}]);}catch(e){if(e.code==='version_conflict')continue;if(PERMANENT_COMPLETION_ERRORS.has(e.code))return this.terminalPendingFailure(candidate.scope,row,e);throw e;}
   let completion,artifact=null;try{
    const b=await this.store.read(candidate.scope,`resource-build/${job.build_id}`);if(!b?.value||b.value.content_id!==job.build_content_id)issue(409,'build_integrity','Immutable build missing or changed');
    const unsigned=clone(b.value);delete unsigned.content_id;if(hashOf(unsigned)!==b.value.content_id)issue(409,'build_integrity','Immutable build content does not match its digest');
    const out=await this.executor(b.value.plan,job.input,{seed:job.seed});jsonValue(out.value,65536,'output_limit');jsonValue(out,220*1024,'artifact_limit');validate(current.value.output_schema,out.value,'output');
    artifact={id:uid('artifact'),resource_id:job.resource_id,execution_id:job.id,build_id:job.build_id,value:out.value,trace:out.trace,created_at:this.now(),immutable:true};artifact.content_id=hashOf(artifact);requireRowSize(artifact);
    const receipt={schema:'purl.launch-execution-receipt/1',execution_id:job.id,build_id:job.build_id,build_content_id:job.build_content_id,input_id:hashOf(job.input),value_id:out.value_id,artifact_content_id:artifact.content_id,environment_id:out.trace.environment_id,completed_at:this.now()};receipt.content_id=hashOf(receipt);
    completion={...job,status:'succeeded',lease:null,value:out.value,value_id:out.value_id,artifact_id:artifact.id,receipt,runtime_environment:{node:process.versions.node,architecture:process.arch,trace_environment_id:out.trace.environment_id},completed_at:receipt.completed_at,logs:[...job.logs,{at:receipt.completed_at,message:'Immutable result and receipt committed'}]};
   }catch(e){artifact=null;completion={...job,status:'failed',lease:null,error:{code:e.code??'execution_failed',message:String(e.message).slice(0,180)},completed_at:this.now()};}
   for(let attempt=0;attempt<8;attempt++){
    const latest=await this.store.read(candidate.scope,row.key);if(!latest?.value||latest.value.lease?.token!==lease.token||Date.parse(latest.value.lease.expires_at)<=this.clock())return null;
    const resource=await this.store.read(candidate.scope,`resource/${job.resource_id}`);if(!resource?.value)return null;
    // Authority is live at publication as well as at claim; expired/revoked work publishes no artifact.
    const liveActor=await this.executionActor(job,candidate.scope);
    if(!liveActor||resource.value.owner!==job.owner){artifact=null;completion={...job,status:'cancelled',lease:null,value:null,error:{code:'authority_expired',message:'The requesting credential expired or was revoked before publication'},completed_at:this.now()};}
    const extra=[{key:row.key,expectedVersion:latest.version,value:completion},...(artifact?[{key:`resource-artifact/${artifact.id}`,expectedVersion:0,value:artifact}]:[])];
    try{await this.transition(candidate.scope,resource,{},'execution',authorized,extra,null,{execution_id:job.id,status:completion.status});return completion;}catch(e){if(PERMANENT_COMPLETION_ERRORS.has(e.code))return this.terminalFailure(candidate.scope,row.key,lease,job,e);if(e.code!=='version_conflict')throw e;}
   }
   return null;
  }
  return null;
 }
 async replay(resource){
  const events=(await this.store.list(resource.owner,{prefix:`resource-event/${resource.id}/`})).map(x=>x.value),problems=[];let head=null;
  for(let i=0;i<events.length;i++){
   const event=events[i],{hash,...unsigned}=event;if(hashOf(unsigned)!==hash||event.previous_hash!==head||event.version!==i+1)problems.push({version:event.version,problem:'event chain integrity'});
   const version=await this.store.read(resource.owner,`resource-version/${resource.id}/${pad(event.version)}`);if(!version?.value||hashOf(version.value)!==event.state_hash)problems.push({version:event.version,problem:'immutable version integrity'});head=hash;
  }
  if(events.length!==resource.version||head!==resource.event_head||events.at(-1)?.state_hash!==hashOf(snapshot(resource)))problems.push({problem:'current state does not match complete history'});
  const children=await this.children(resource,'executions');problems.push(...children.problems);const jobs=children.items.filter(j=>j.status==='succeeded'),executions=[];
  for(const j of jobs){const b=await this.store.read(resource.owner,`resource-build/${j.build_id}`),a=await this.store.read(resource.owner,`resource-artifact/${j.artifact_id}`);let valid=false,replayable=false,reason=null;
   try{const unsigned=clone(a.value);delete unsigned.content_id;const buildUnsigned=clone(b.value);delete buildUnsigned.content_id;const receiptUnsigned=clone(j.receipt);delete receiptUnsigned.content_id;valid=hashOf(unsigned)===a.value.content_id&&hashOf(buildUnsigned)===b.value.content_id&&hashOf(receiptUnsigned)===j.receipt.content_id&&j.receipt.artifact_content_id===a.value.content_id&&j.receipt.input_id===hashOf(j.input)&&same(j.value,a.value.value);
    const rerun=execute(b.value.plan,j.input,{seed:j.seed});replayable=valid&&rerun.value_id===j.value_id&&rerun.trace.environment_id===j.receipt.environment_id&&same(rerun.trace,a.value.trace);if(!replayable)reason='Value, trace or environment mismatch';
   }catch{reason='Missing, corrupt or unavailable execution dependencies';}
   executions.push({execution_id:j.id,valid,replayable,reason});if(!valid)problems.push({execution_id:j.id,problem:'execution integrity'});
  }
  return {resource_id:resource.id,version:resource.version,valid:problems.length===0,history_valid:problems.filter(p=>!p.execution_id).length===0,events:events.length,head,problems,executions,executions_complete:children.complete,execution_status_counts:{total:children.items.length,succeeded:jobs.length,failed:children.items.filter(j=>j.status==='failed').length,cancelled:children.items.filter(j=>j.status==='cancelled').length,pending:children.items.filter(j=>['queued','running'].includes(j.status)).length},assurance:'Hashes establish internal consistency, not external authenticity or requirement truth'};
 }
}
