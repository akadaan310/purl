import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryService } from '../../service/launch/memory.js';

// Adapter contract used by the original first-pass tests.
class Store {
  rows = new Map();
  async read(scope,key) { return structuredClone(this.rows.get(`${scope}/${key}`) ?? null); }
  async list(scope,{prefix='',limit=200}={}) { return [...this.rows].filter(([k,v])=>k.startsWith(`${scope}/${prefix}`)&&v.value!==null).slice(0,limit).map(([,v])=>structuredClone(v)); }
  async scan({prefix='',statuses,limit=200}={}) { return [...this.rows].filter(([,r])=>r.value!==null&&r.key.startsWith(prefix)&&(!statuses||statuses.includes(r.value.status))).slice(0,limit).map(([key,r])=>({...structuredClone(r),scope:key.slice(0,-r.key.length-1)})); }
  async erase(scope) { for(const key of this.rows.keys()) if(key.startsWith(`${scope}/`)) this.rows.delete(key); }
  async commit(scope,changes) {
    for(const c of changes) assert.equal((await this.read(scope,c.key))?.version??0,c.expectedVersion,'CAS');
    const records=changes.map(c=>({key:c.key,version:c.expectedVersion+1,value:structuredClone(c.value)}));
    records.forEach(r=>this.rows.set(`${scope}/${r.key}`,r));return {revision:records[0].version,records,duplicate:false};
  }
}
const alice={id:'a',kind:'human',verified:true,scopes:['memory:read','memory:write','memory:share','memory:publish']};
const bob={...alice,id:'b'};
const setup=()=>new MemoryService({store:new Store(),baseUrl:'https://purl.test',clock:()=>new Date('2026-10-18T00:00:00Z')});
const call=(s,m,p,b={},a=alice)=>s.handle(m,p,b,a);
const fact=async(s,text='Private phone 123')=>(await call(s,'POST','/api/memory/create',{text,kind:'user_assertion'})).body.fact;

test('private memory is tenant isolated, requires scopes, rejects ownership and prototype injection',async()=>{
 const s=setup();await fact(s);
 assert.equal((await call(s,'GET','/api/memory',{},bob)).body.facts.length,0);
 assert.equal((await call(s,'GET','/api/cognition',{},null)).body.partitions.length,0);
 await assert.rejects(call(s,'POST','/api/memory/create',{text:'x',owner:'b'}),e=>e.status===400);
 await assert.rejects(call(s,'POST','/api/memory/create',JSON.parse('{"text":"x","__proto__":{}}')),e=>e.status===400);
 await assert.rejects(call(s,'GET','/api/memory',{}, {...alice,scopes:[]}),e=>e.status===403);
 await assert.rejects(call(s,'GET','/api/memory',{},null),e=>e.status===401);
});
test('live passport reveals only selected facts and follows edits, deletion and owner revocation',async()=>{
 const s=setup(), f=await fact(s), hidden=await fact(s,'Hidden');
 const p=(await call(s,'POST','/api/memory/passports/create',{fact_ids:[f.id],consent:true,purpose:'continuity',expires_at:'2026-10-19T00:00:00Z',allowed_scopes:['memory:read']})).body.passport;
 assert.match(p.id,/^[A-Za-z0-9_-]{32,}$/);
 let r=await call(s,'GET',`/api/passports/${p.id}`,{},null);assert.deepEqual(r.body.facts.map(f=>f.id),[f.id]);
 await assert.rejects(call(s,'POST',`/api/passports/${p.id}/revoke`,{},bob),e=>e.status===404);
 await call(s,'POST',`/api/memory/${f.id}/update`,{text:'Corrected',expected_version:1});
 r=await call(s,'GET',`/api/passports/${p.id}`,{},null);assert.equal(r.body.facts[0].text,'Corrected');assert.equal(r.body.facts[0].history.length,1);
 await call(s,'POST',`/api/memory/${f.id}/delete`,{expected_version:2});
 assert.equal((await call(s,'GET',`/api/passports/${p.id}`,{},null)).body.facts.length,0);
 await call(s,'POST',`/api/passports/${p.id}/revoke`);
 await assert.rejects(call(s,'GET',`/api/passports/${p.id}`,{},null),e=>e.status===410);
 assert.equal((await call(s,'GET','/api/memory/export')).body.facts[0].id,hidden.id);
});
test('relations stay in tenant and public cognition is explicitly selected and revocable live data',async()=>{
 const s=setup(),a=await fact(s,'A'),b=await fact(s,'B'),other=await fact(s,'Other');
 const r=(await call(s,'POST','/api/memory/relations/create',{from:a.id,to:b.id,type:'supports'})).body.relation;
 await assert.rejects(call(s,'POST','/api/memory/relations/create',{from:a.id,to:'no',type:'supports'}),e=>e.status===404);
 const p=(await call(s,'POST','/api/memory/publish',{fact_ids:[a.id,b.id],consent:true,purpose:'research'})).body.publication;
 let graph=(await call(s,'GET','/api/cognition',{},null)).body;assert.equal(graph.partitions.length,1);assert.equal(graph.partitions[0].relations[0].id,r.id);assert(!JSON.stringify(graph).includes(other.id));
 await call(s,'POST',`/api/memory/${a.id}/update`,{text:'A correction',expected_version:1});
 assert.equal((await call(s,'GET','/api/cognition',{},null)).body.partitions[0].facts[0].text,'A correction');
 await call(s,'POST',`/api/memory/publications/${p.id}/revoke`);
 assert.equal((await call(s,'GET','/api/cognition',{},null)).body.partitions.length,0);
});
test('quotas, fact revisions, expiration, provenance and guest truthfulness are enforced',async()=>{
 const s=setup();await assert.rejects(call(s,'POST','/api/memory/create',{text:'sourced',kind:'sourced_fact'}),e=>e.status===400);
 const f=await fact(s);await assert.rejects(call(s,'POST',`/api/memory/${f.id}/update`,{text:'bad',expected_version:0}),e=>e.status===409);
 await assert.rejects(call(s,'POST','/api/memory/passports/create',{fact_ids:[f.id],consent:true,purpose:'x',expires_at:'2026-10-17T00:00:00Z',allowed_scopes:['memory:write']}),e=>e.status===400);
 for(let i=1;i<200;i++) await fact(s,String(i));
 await assert.rejects(fact(s,'201'),e=>e.status===429);
 const guest=await call(s,'GET','/api/memory',{}, {...bob,kind:'guest',verified:false});assert.equal(guest.body.identity.verified,false);
});
export {Store};
test('actual shared store preserves privacy across service restart and enforces guest and capability boundaries',async()=>{
 const {MemoryLaunchStore}=await import('../../service/launch/store.js');const store=new MemoryLaunchStore();
 const s=new MemoryService({store,clock:()=>new Date('2026-10-18T00:00:00Z')}),f=await fact(s,'Secret v1');
 await call(s,'POST',`/api/memory/${f.id}/update`,{text:'Public corrected',expected_version:1});
 const publication=(await call(s,'POST','/api/memory/publish',{fact_ids:[f.id],consent:true,purpose:'Public correction'})).body.publication;
 const restarted=new MemoryService({store,clock:()=>new Date('2026-10-20T00:00:00Z')});
 assert(!JSON.stringify((await call(restarted,'GET','/api/cognition',{},null)).body).includes('Secret v1'));
 const passport=(await call(s,'POST','/api/memory/passports/create',{fact_ids:[f.id],consent:true,purpose:'Read',expires_at:'2026-10-19T00:00:00Z',allowed_scopes:['memory:read']})).body.passport;
 await assert.rejects(call(restarted,'GET',`/api/passports/${passport.id}`,{},null),e=>e.status===410&&e.code==='PASSPORT_EXPIRED');
 await assert.rejects(call(s,'POST',`/api/memory/${f.id}/delete`,{expected_version:2},bob),e=>e.status===404);
 await assert.rejects(call(s,'POST','/api/memory/passports/create',{fact_ids:[f.id],consent:true,purpose:'read',expires_at:'2026-10-19T00:00:00Z',allowed_scopes:['memory:write']}),e=>e.status===400);
 await assert.rejects(call(s,'POST','/api/memory/publish',{fact_ids:[f.id],consent:true,purpose:'Public'},{...alice,kind:'guest',verified:false,scopes:['memory:read','memory:write']}),e=>e.status===403);
 await call(s,'POST',`/api/memory/${f.id}/delete`,{expected_version:2});
 assert.equal((await call(s,'GET','/api/cognition',{},null)).body.partitions[0].facts.length,0);
 assert(!JSON.stringify(await call(s,'GET','/api/memory/export')).includes('Secret v1'));
 assert.equal((await call(restarted,'GET','/api/memory',{},bob)).body.facts.length,0);
 assert(publication.id);
});
test('real-store global legacy pointer saturation cannot block fresh tenants and revocation removes active public index',async()=>{
 const {MemoryLaunchStore}=await import('../../service/launch/store.js'),store=new MemoryLaunchStore();
 for(const scope of ['memory:capabilities','memory:publications']) for(let i=0;i<4096;i+=32) await store.commit(scope,Array.from({length:32},(_,j)=>({key:`legacy-${i+j}`,expectedVersion:0,value:{owner:'legacy-owner'}})));
 const s=new MemoryService({store,clock:()=>new Date('2026-10-18T00:00:00Z')});
 for(const actor of [alice,bob]) {
  const f=(await call(s,'POST','/api/memory/create',{text:`Selected ${actor.id}`},actor)).body.fact;
  const passport=(await call(s,'POST','/api/memory/passports/create',{fact_ids:[f.id],consent:true,purpose:'Fresh tenant',expires_at:'2026-10-19T00:00:00Z',allowed_scopes:['memory:read']},actor)).body.passport;
  assert.equal((await call(s,'GET',`/api/passports/${passport.id}`,{},null)).body.facts[0].id,f.id);
  const publication=(await call(s,'POST','/api/memory/publish',{fact_ids:[f.id],consent:true,purpose:'Fresh public'},actor)).body.publication;
  assert((await store.scan({prefix:'memory/publication/',statuses:['active'],limit:200})).some(r=>r.value.id===publication.id));
  await call(s,'POST',`/api/memory/publications/${publication.id}/revoke`,{},actor);
  assert(!(await store.scan({prefix:'memory/publication/',statuses:['active'],limit:200})).some(r=>r.value.id===publication.id));
 }
 assert.equal((await call(s,'GET','/api/cognition',{},null)).body.partitions.length,0);
});
test('real-store failed capability reservation cannot consume owner passport allowance',async()=>{
 const {MemoryLaunchStore}=await import('../../service/launch/store.js');
 class UnavailablePointers extends MemoryLaunchStore { async commit(scope,changes,options){if(scope.startsWith('memory:capabilit'))throw Object.assign(new Error('Pointer persistence unavailable'),{status:503});return super.commit(scope,changes,options);} }
 const store=new UnavailablePointers(),s=new MemoryService({store,clock:()=>new Date('2026-10-18T00:00:00Z')}),f=await fact(s);
 await assert.rejects(call(s,'POST','/api/memory/passports/create',{fact_ids:[f.id],consent:true,purpose:'Cannot reserve',expires_at:'2026-10-19T00:00:00Z',allowed_scopes:['memory:read']}),e=>e.status===503);
 assert.equal((await s.snapshot(alice)).passports.length,0);
});
test('erasing owner and delegated principal scopes denies all future live passport and public reads',async()=>{
 const {MemoryLaunchStore}=await import('../../service/launch/store.js'),store=new MemoryLaunchStore(),s=new MemoryService({store,clock:()=>new Date('2026-10-18T00:00:00Z')});
 for(const actor of [alice,{...alice,id:'delegated-ai',kind:'agent',verified:false}]){
  const f=(await call(s,'POST','/api/memory/create',{text:`Deleted secret ${actor.id}`},actor)).body.fact;
  const p=(await call(s,'POST','/api/memory/passports/create',{fact_ids:[f.id],consent:true,purpose:'Read',expires_at:'2026-10-19T00:00:00Z',allowed_scopes:['memory:read']},actor)).body.passport;
  await call(s,'POST','/api/memory/publish',{fact_ids:[f.id],consent:true,purpose:'Public'},actor);
  await store.erase(actor.id);
  await assert.rejects(call(s,'GET',`/api/passports/${p.id}`,{},null),e=>[404,410].includes(e.status));
  assert(!JSON.stringify((await call(s,'GET','/api/cognition',{},null)).body).includes(f.text));
 }
});
test('sharing and publication require explicit consent for humans and authorized unverified guests',async()=>{
 const {MemoryLaunchStore}=await import('../../service/launch/store.js'),store=new MemoryLaunchStore(),s=new MemoryService({store,clock:()=>new Date('2026-10-18T00:00:00Z')});
 for(const actor of [alice,{...bob,kind:'guest',verified:false}]) {
  const f=(await call(s,'POST','/api/memory/create',{text:'Explicit selection'},actor)).body.fact;
  const passport={fact_ids:[f.id],purpose:'Selected external context',expires_at:'2026-10-19T00:00:00Z',allowed_scopes:['memory:read']};
  for(const consent of [undefined,false]) {
   await assert.rejects(call(s,'POST','/api/memory/passports/create',{...passport,...(consent===undefined?{}:{consent})},actor),e=>e.status===400&&e.code==='CONSENT_REQUIRED');
   await assert.rejects(call(s,'POST','/api/memory/publish',{fact_ids:[f.id],purpose:'Selected public context',...(consent===undefined?{}:{consent})},actor),e=>e.status===400&&e.code==='CONSENT_REQUIRED');
  }
  assert.equal((await s.snapshot(actor)).passports.length,0);assert.equal((await s.snapshot(actor)).publications.length,0);
  assert.equal((await call(s,'POST','/api/memory/passports/create',{...passport,consent:true},actor)).status,201);
  assert.equal((await call(s,'POST','/api/memory/publish',{fact_ids:[f.id],purpose:'Public',consent:true},actor)).status,201);
  assert.equal((await s.snapshot(actor)).identity.verified,actor.kind==='guest'?false:true);
 }
});
test('real-store failed owner or publication commits leave no active lookup or consumed share allowance',async()=>{
 const {MemoryLaunchStore}=await import('../../service/launch/store.js');
 class FailingOwner extends MemoryLaunchStore {
  blocked=false;
  async commit(scope,changes,options) {
   if(this.blocked&&scope===alice.id)throw Object.assign(new Error('Owner commit unavailable'),{status:503});
   return super.commit(scope,changes,options);
  }
 }
 const store=new FailingOwner(),s=new MemoryService({store,clock:()=>new Date('2026-10-18T00:00:00Z')}),f=await fact(s);
 store.blocked=true;
 await assert.rejects(call(s,'POST','/api/memory/passports/create',{consent:true,fact_ids:[f.id],purpose:'Read',expires_at:'2026-10-19T00:00:00Z',allowed_scopes:['memory:read']}),e=>e.status===503);
 assert.equal((await store.scan({prefix:'passport',limit:200})).length,0);
 assert.equal((await s.snapshot(alice)).passports.length,0);
 await assert.rejects(call(s,'POST','/api/memory/publish',{consent:true,fact_ids:[f.id],purpose:'Public'}),e=>e.status===503);
 assert.equal((await store.scan({prefix:'memory/publication/',statuses:['active'],limit:200})).length,0);
 assert.equal((await s.snapshot(alice)).publications.length,0);
});
