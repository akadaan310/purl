import { randomBytes } from 'node:crypto';

const KEY = 'memory/state';
// Each capability has its own namespace: unrelated tenants never share a quota.
const capabilityScope = passportId => `memory:capability:${passportId}`;
const CAP_KEY = 'passport';
const PUB_PREFIX = 'memory/publication/';
const id = () => randomBytes(24).toString('base64url');
function fail(status, code, message) { throw Object.assign(new Error(message), {status, code}); }
function safe(value, depth=0) {
  if(depth>20) fail(400,'INPUT_DEPTH','Input nesting exceeds 20');
  if(value===null || ['string','boolean'].includes(typeof value)) return;
  if(typeof value==='number' && Number.isFinite(value)) return;
  if(Array.isArray(value)) { if(value.length>500) fail(400,'INPUT_LIMIT','Input array too large'); value.forEach(v=>safe(v,depth+1)); return; }
  if(typeof value!=='object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail(400,'INPUT_TYPE','Expected plain JSON');
  for(const [k,v] of Object.entries(value)) { if(['__proto__','prototype','constructor','owner','owner_id','scope','tenant'].includes(k)) fail(400,'INPUT_KEY','Reserved input key'); safe(v,depth+1); }
}
function text(v,name,max=4000) { if(typeof v!=='string'||!v.trim()||v.length>max) fail(400,'INPUT_TYPE',`${name} must be nonempty text up to ${max} characters`);return v.trim(); }
function exact(body,keys) { for(const k of Object.keys(body)) if(!keys.includes(k)) fail(400,'INPUT_KEY',`Unexpected field: ${k}`); }
function authorized(actor,scope) {
 if(!actor?.id || typeof actor.id!=='string') fail(401,'AUTH_REQUIRED','An authenticated principal is required');
 if(!Array.isArray(actor.scopes) || (!actor.scopes.includes(scope)&&!actor.scopes.includes('*'))) fail(403,'SCOPE_REQUIRED',`Required scope: ${scope}`);
 if(actor.expiresAt && Date.parse(actor.expiresAt)<=Date.now()) fail(401,'AUTH_EXPIRED','Principal authorization expired');
 return actor.id;
}
function revision(value,body) { if(!Number.isSafeInteger(body.expected_version)||body.expected_version!==value.version) fail(409,'VERSION_CONFLICT','Expected current object version'); }
const empty=()=>({facts:[],relations:[],passports:[],publications:[]});
const copy=v=>structuredClone(v);

export class MemoryService {
 constructor({store,baseUrl='',clock=()=>new Date()}) { if(!store) throw new Error('MemoryService requires store');this.store=store;this.baseUrl=baseUrl.replace(/\/$/,'');this.clock=clock; }
 now() { return new Date(this.clock()).toISOString(); }
 async load(owner) { const row=await this.store.read(owner,KEY);return {state:copy(row?.value??empty()),version:row?.version??0}; }
 async save(owner,state,version,extraChanges=[]) { if(Buffer.byteLength(JSON.stringify(state))>250000) fail(429,'MEMORY_QUOTA','Memory storage quota reached; export or delete items');return this.store.commit(owner,[{key:KEY,expectedVersion:version,value:state},...extraChanges]); }
 async snapshot(actor) { const owner=authorized(actor,'memory:read'),{state,version}=await this.load(owner);return {facts:state.facts,relations:state.relations,passports:state.passports,publications:state.publications,version,identity:{kind:actor.kind,verified:actor.kind==='guest'?false:!!actor.verified},privacy:'private by default',limits:{facts:200,relations:400,passports:100,publications:100},retention:'Facts remain until you delete them. Deletion removes current facts and correction history. Revocation stops future link reads; previously exported copies cannot be withdrawn.',external_provider_consent:'A passport grants selected live reads only. Sending facts to an external provider requires separate explicit consent.'}; }
 async readPassport(passportId,{scopes=['memory:read']}={}) {
  const pointer=(await this.store.read(capabilityScope(passportId),CAP_KEY))?.value;if(!pointer) fail(404,'PASSPORT_NOT_FOUND','Passport not found');
  const {state}=await this.load(pointer.owner),passport=state.passports.find(p=>p.id===passportId);
  if(!passport||passport.revoked_at) fail(410,'PASSPORT_REVOKED','Passport access was revoked');
  if(Date.parse(passport.expires_at)<=Date.parse(this.now())) fail(410,'PASSPORT_EXPIRED','Passport expired');
  if(scopes.some(s=>!passport.allowed_scopes.includes(s))) fail(403,'PASSPORT_SCOPE','Passport does not grant requested read scope');
  const facts=state.facts.filter(f=>passport.fact_ids.includes(f.id));
  return {passport:{id:passport.id,purpose:passport.purpose,expires_at:passport.expires_at,allowed_scopes:passport.allowed_scopes},facts,relations:scopes.includes('memory:relations:read')?state.relations.filter(r=>facts.some(f=>f.id===r.from)&&facts.some(f=>f.id===r.to)):[],copy_warning:'Revocation stops future reads. Copies already exported cannot be withdrawn.'};
 }
 async cognition() {
  const pointers=await this.store.scan({prefix:PUB_PREFIX,statuses:['active'],limit:200});const partitions=[];
  for(const row of pointers) {
   if(!row.value) continue;
   const {state}=await this.load(row.scope),p=state.publications.find(x=>x.id===row.value.id);
   if(!p||p.revoked_at) continue;
   const facts=state.facts.filter(f=>p.fact_ids.includes(f.id));
   // Public snapshots omit private correction history and nonselected relation endpoints.
   const publicFacts=facts.map(({history,...f})=>f);
   partitions.push({id:p.id,purpose:p.purpose,published_at:p.created_at,facts:publicFacts,relations:state.relations.filter(r=>facts.some(f=>f.id===r.from)&&facts.some(f=>f.id===r.to))});
  }
  return {partitions,namespace:'explicit-opt-in-public',private_pool:false,limit:200};
 }
 async handle(method,path,body={},actor=null,context={}) {
  const known=path==='/api/memory'||path.startsWith('/api/memory/')||path.startsWith('/api/passports/')||path==='/api/cognition';
  if(!known) return null;
  const passportRead=path.match(/^\/api\/passports\/([A-Za-z0-9_-]+)$/);
  if(method==='GET'&&passportRead) return {status:200,body:await this.readPassport(passportRead[1]),headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}};
  if(method==='GET'&&path==='/api/cognition') return {status:200,body:await this.cognition(),headers:{'Cache-Control':'no-store'}};
  if(method==='GET'&&(path==='/api/memory'||path==='/api/memory/export')) return {status:200,body:{...await this.snapshot(actor),...(path.endsWith('/export')?{format:'purl-memory-export/1',exported_at:this.now()}: {})},headers:{'Cache-Control':'no-store'}};
  if(method!=='POST') return null;
  safe(body); if(!body||Array.isArray(body)||typeof body!=='object') fail(400,'INPUT_TYPE','Expected object');
  if(Buffer.byteLength(JSON.stringify(body))>50000) fail(413,'INPUT_LIMIT','Request too large');
  const share=path.includes('passport'),publish=path.includes('publish')||path.includes('publication');
  const owner=authorized(actor,share?'memory:share':publish?'memory:publish':'memory:write');
  const {state,version}=await this.load(owner),now=this.now();let result,created=false,extraChanges=[];
  if(path==='/api/memory/create') {
   exact(body,['text','kind','provenance','occurred_at','tags']);
   if(state.facts.length>=200) fail(429,'FACT_QUOTA','At most 200 facts are allowed');
   const kind=body.kind??'user_assertion';if(!['sourced_fact','user_assertion','inference'].includes(kind)) fail(400,'FACT_KIND','Unknown fact kind');
   const provenance=body.provenance??null;
   if(kind!=='user_assertion'&&(!provenance||typeof provenance!=='object'||!provenance.source)) fail(400,'PROVENANCE_REQUIRED','Sourced facts and inferences require provenance.source');
   if(provenance) {exact(provenance,['source','url','author']);text(provenance.source,'provenance.source',1000);if(provenance.url) {let u;try {u=new URL(provenance.url);}catch {fail(400,'PROVENANCE_URL','Expected an http(s) source URL');}if(!['https:','http:'].includes(u.protocol)) fail(400,'PROVENANCE_URL','Expected an http(s) source URL');}}
   if(body.tags&&(!Array.isArray(body.tags)||body.tags.length>20||body.tags.some(t=>typeof t!=='string'||t.length>80))) fail(400,'TAGS','At most 20 text tags are allowed');
   if(body.occurred_at&&!Number.isFinite(Date.parse(body.occurred_at))) fail(400,'TIME','Invalid occurred_at');
   const f={id:id(),text:text(body.text,'text'),kind,provenance,tags:body.tags??[],created_at:now,updated_at:now,occurred_at:body.occurred_at?new Date(body.occurred_at).toISOString():now,version:1,history:[]};state.facts.push(f);result={fact:f};created=true;
  } else if(path.match(/^\/api\/memory\/[^/]+\/(update|delete)$/)) {
   const [,factId,action]=path.match(/^\/api\/memory\/([^/]+)\/(update|delete)$/);exact(body,action==='delete'?['expected_version']:['expected_version','text','reason']);
   const f=state.facts.find(f=>f.id===factId);if(!f) fail(404,'FACT_NOT_FOUND','Fact not found');revision(f,body);
   if(action==='delete') {state.facts=state.facts.filter(x=>x.id!==factId);state.relations=state.relations.filter(r=>r.from!==factId&&r.to!==factId);result={deleted:true,id:factId};}
   else {if(f.history.length>=20) fail(429,'HISTORY_QUOTA','At most 20 retained corrections per fact; export and replace this fact');f.history.push({text:f.text,version:f.version,corrected_at:now,reason:body.reason?text(body.reason,'reason',500):null});f.text=text(body.text,'text');f.updated_at=now;f.version++;result={fact:f};}
  } else if(path==='/api/memory/relations/create') {
   exact(body,['from','to','type']);if(state.relations.length>=400) fail(429,'RELATION_QUOTA','At most 400 relations');
   if(body.from===body.to) fail(400,'RELATION_ENDPOINTS','Relation endpoints must differ');
   if(!state.facts.some(f=>f.id===body.from)||!state.facts.some(f=>f.id===body.to)) fail(404,'FACT_NOT_FOUND','Both endpoints must be current facts in your memory');
   const type=text(body.type,'type',80);if(state.relations.some(r=>r.from===body.from&&r.to===body.to&&r.type===type)) fail(409,'RELATION_EXISTS','Relation already exists');
   const r={id:id(),from:body.from,to:body.to,type,created_at:now,version:1};state.relations.push(r);result={relation:r};created=true;
  } else if(path.match(/^\/api\/memory\/relations\/[^/]+\/delete$/)) {
   exact(body,['expected_version']);const rid=path.split('/')[4],r=state.relations.find(r=>r.id===rid);if(!r) fail(404,'RELATION_NOT_FOUND','Relation not found');revision(r,body);state.relations=state.relations.filter(r=>r.id!==rid);result={deleted:true,id:rid};
  } else if(path==='/api/memory/passports/create'||path==='/api/memory/publish') {
   const isPassport=path.includes('passport');exact(body,isPassport?['fact_ids','purpose','expires_at','allowed_scopes','consent']:['fact_ids','purpose','consent']);
   if(body.consent!==true) fail(400,'CONSENT_REQUIRED','Explicit consent:true is required to create a live share or public publication');
   if(!Array.isArray(body.fact_ids)||!body.fact_ids.length||body.fact_ids.length>200||new Set(body.fact_ids).size!==body.fact_ids.length) fail(400,'FACT_SELECTION','Select 1–200 distinct facts');
   if(body.fact_ids.some(fid=>!state.facts.some(f=>f.id===fid))) fail(404,'FACT_NOT_FOUND','Selected fact not found in your memory');
   const list=isPassport?state.passports:state.publications;if(list.length>=100) fail(429,'SHARE_QUOTA','At most 100 shares of each kind');
   const p={id:id(),fact_ids:body.fact_ids,purpose:text(body.purpose,'purpose',500),created_at:now,revoked_at:null,version:1};
   if(isPassport) {
    const expiry=Date.parse(body.expires_at),duration=expiry-Date.parse(now);if(!Number.isFinite(expiry)||duration<=0||duration>90*86400000) fail(400,'PASSPORT_EXPIRY','Expiry must be in the next 90 days');
    if(!Array.isArray(body.allowed_scopes)||!body.allowed_scopes.includes('memory:read')||body.allowed_scopes.some(s=>!['memory:read','memory:relations:read'].includes(s))) fail(400,'PASSPORT_SCOPE','Only explicit memory read scopes are allowed');
    p.expires_at=new Date(expiry).toISOString();p.allowed_scopes=[...new Set(body.allowed_scopes)];
   }
   list.push(p);
   if(isPassport) {
    // Reserve the lookup first. A failed reservation never changes owner state.
    // Until owner state commits, live reads find no passport and deny access.
    const scope=capabilityScope(p.id);
    await this.store.commit(scope,[{key:CAP_KEY,expectedVersion:0,value:{owner}}]);
    try { await this.save(owner,state,version); }
    catch(error) { try { await this.store.erase(scope); } catch {} throw error; }
   } else {
    // The active public index is in the SAME owner transaction as its authority.
    await this.save(owner,state,version,[{key:`${PUB_PREFIX}${p.id}`,expectedVersion:0,value:{id:p.id,status:'active'}}]);
   }
   return {status:201,body:isPassport?{passport:{...p,url:`${this.baseUrl}/api/passports/${p.id}`},version:version+1}:{publication:p,version:version+1}};
  } else if(path.match(/^\/api\/passports\/[^/]+\/revoke$/)||path.match(/^\/api\/memory\/publications\/[^/]+\/revoke$/)) {
   exact(body,[]);const isPassport=path.startsWith('/api/passports/'),pid=isPassport?path.split('/')[3]:path.split('/')[4],list=isPassport?state.passports:state.publications;
   const p=list.find(p=>p.id===pid);if(!p) fail(404,'SHARE_NOT_FOUND','Share not found');p.revoked_at??=now;p.version++;result={revoked:true,id:pid};
   if(!isPassport) { const key=`${PUB_PREFIX}${pid}`,index=await this.store.read(owner,key);if(index?.value) extraChanges=[{key,expectedVersion:index.version,value:null}]; }
  } else return null;
  await this.save(owner,state,version,extraChanges);return {status:created?201:200,body:{...result,version:version+1}};
 }
}
