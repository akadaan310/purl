import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryLaunchStore } from '../../service/launch/store.js';
import { ResourceService } from '../../service/launch/resources.js';

const actor={id:'owner-a',kind:'guest',verified:false,product:'purls',products:['purls'],scopes:['resources:read','resources:write'],credentialId:'credential-a',expiresAt:'2099-01-01T00:00:00Z'};
const other={...actor,id:'owner-b',credentialId:'credential-b'};
const arithmetic={title:'A reusable calculation',source:'input number | math.add 2 | math.multiply 3',visibility:'private',tests:[{input:4,expected:18},{input:0,expected:6},{input:-2,expected:0}]};
const code=c=>e=>e.code===c;
const request=(service,method,path,body={},who=actor,key)=>service.handle(method,path,body,who,{idempotencyKey:key});
async function setup(options={}) {const store=new MemoryLaunchStore();return {store,service:new ResourceService({store,baseUrl:'http://127.0.0.1:8180',authenticateActor:async id=>id===actor.credentialId?actor:id===other.credentialId?other:null,...options})};}
async function created(service,body=arithmetic,who=actor){return (await request(service,'POST','/api/resources',body,who)).body.resource;}
async function built(service,r){await request(service,'POST',`/api/resources/${r.id}/compile`,{expected_version:r.version});r=(await request(service,'GET',`/api/resources/${r.id}`)).body.resource;return request(service,'POST',`/api/resources/${r.id}/build`,{expected_version:r.version});}

test('native resource lifecycle compiles actual PURL, tests, queues, persists artifacts, publishes and replays',async()=>{
 const {store,service}=await setup();let r=await created(service);const build=await built(service,r);assert.equal(build.body.build.tests.length,3);assert.equal(build.body.build.tests.every(x=>x.passed),true);r=build.body.resource;
 const queued=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4,seed:7});assert.equal(queued.status,202);assert.equal(queued.body.execution.status,'queued');
 assert.equal((await request(service,'GET',`/api/resources/${r.id}/executions/${queued.body.execution.id}`)).body.execution.status,'queued');
 assert.equal((await service.workOnce({workerId:'worker-a'})).status,'succeeded');
 const execution=(await request(service,'GET',`/api/resources/${r.id}/executions/${queued.body.execution.id}`)).body.execution;assert.equal(execution.value,18);assert.equal(execution.attempts,1);assert.equal(execution.runtime_environment.node,process.versions.node);
 const artifact=(await request(service,'GET',`/api/resources/${r.id}/artifacts/${execution.artifact_id}`)).body.artifact;assert.equal(artifact.value,18);assert.equal(artifact.content_id,execution.receipt.artifact_content_id);
 r=(await request(service,'GET',`/api/resources/${r.id}`)).body.resource;
 const publication=await request(service,'POST',`/api/resources/${r.id}/publish`,{expected_version:r.version,visibility:'public'});assert.equal(publication.body.release.immutable,true);r=publication.body.resource;
 const checkpoint=await request(service,'POST',`/api/resources/${r.id}/checkpoint`,{expected_version:r.version,summary:'Computed 18 with three passing build tests',next:['Inspect evidence, then fork under new authority'],evidence:[{execution_id:execution.id}]});assert.equal(checkpoint.body.checkpoint.evidence_verified,false);
 const replay=(await request(service,'GET',`/api/resources/${r.id}/replay`,{},null)).body;assert.equal(replay.valid,true);assert.equal(replay.executions[0].replayable,true);
 assert.ok((await store.list(actor.id,{prefix:`resource-version/${r.id}/`})).length>=6);
});

test('private IDs and child artifacts do not cross tenants; public reading never grants mutation',async()=>{
 const {service}=await setup();let r=await created(service);await assert.rejects(request(service,'GET',`/api/resources/${r.id}`,{},other),code('not_found'));await assert.rejects(request(service,'GET',`/api/resources/${r.id}`,{},null),code('not_found'));
 r=(await built(service,r)).body.resource;const p=await request(service,'POST',`/api/resources/${r.id}/publish`,{expected_version:r.version,visibility:'public'});r=p.body.resource;
 const manifest=(await request(service,'GET',`/api/resources/${r.id}/manifest`,{},other)).body;assert.deepEqual(manifest.authority.rights,['read','fork']);assert.equal(manifest.operations.find(x=>x.name==='source').available,false);
 await assert.rejects(request(service,'POST',`/api/resources/${r.id}/source`,{expected_version:r.version,source:'input number | math.add 99'},other),code('forbidden'));
 const fork=(await request(service,'POST',`/api/resources/${r.id}/fork`,{expected_version:r.version,title:'Independent continuation'},other)).body.resource;assert.equal(fork.owner,other.id);assert.equal(fork.lineage.resource_id,r.id);assert.equal(fork.source,r.source);assert.equal(fork.visibility,'private');
});

test('resource commands reject stale versions and bind retries before producing new jobs',async()=>{
 const {store,service}=await setup();let r=await created(service);r=(await built(service,r)).body.resource;const path=`/api/resources/${r.id}/run`,body={expected_version:r.version,input:4};
 const first=await request(service,'POST',path,body,actor,'one-command');const again=await request(service,'POST',path,body,actor,'one-command');assert.equal(first.body.execution.id,again.body.execution.id);assert.equal((await store.list(actor.id,{prefix:'resource-job/'})).length,1);
 await assert.rejects(request(service,'POST',path,{...body,input:5},actor,'one-command'),code('idempotency_conflict'));
 await assert.rejects(request(service,'POST',path,body),code('version_conflict'));
});

test('revoked credentials cancel queued work and a fresh service instance recovers persisted jobs',async()=>{
 const {store,service}=await setup();let r=await created(service);r=(await built(service,r)).body.resource;const q=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});
 const restarted=new ResourceService({store,baseUrl:service.baseUrl,authenticateActor:async()=>null});assert.equal((await restarted.workOnce({workerId:'replacement'})).status,'cancelled');
 assert.equal((await request(service,'GET',`/api/resources/${r.id}/executions/${q.body.execution.id}`)).body.execution.status,'cancelled');
 r=(await request(service,'GET',`/api/resources/${r.id}`)).body.resource;const q2=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});
 const recovered=new ResourceService({store,baseUrl:service.baseUrl,authenticateActor:async()=>actor});await recovered.workOnce({workerId:'new-process'});assert.equal((await request(service,'GET',`/api/resources/${r.id}/executions/${q2.body.execution.id}`)).body.execution.value,18);
});

test('GET discovery, continuity, history and replay are pure; tampered snapshots fail verification',async()=>{
 const {store,service}=await setup();const r=await created(service);const before=JSON.stringify(store.state);
 for(const suffix of ['', '/manifest','/continuity','/history','/source','/replay'])assert.equal((await request(service,'GET',`/api/resources/${r.id}${suffix}`)).status,200);assert.equal(JSON.stringify(store.state),before);
 const v=await store.read(actor.id,`resource-version/${r.id}/000001`);v.value.title='tampered';await store.commit(actor.id,[{key:v.key,expectedVersion:v.version,value:v.value}]);assert.equal((await request(service,'GET',`/api/resources/${r.id}/replay`)).body.valid,false);
});

test('native mission contains documents and dependency evidence, executes and survives fresh-principal fork',async()=>{
 const {service}=await setup();const state={documents:[{name:'00_START.md',markdown:'Build PURLs and CGIT with shared identity'}],graph:{nodes:[{id:'reconstruct',status:'PASS',dependencies:[],evidence:['baseline']},{id:'identity',status:'BLOCKED',dependencies:['reconstruct'],evidence:[]} ]},next:['Enable supported provider']};
 await service.seedMission({id:'consumer-launch-mission',title:'PURLs × CGIT launch mission',source:'input json | mission.inspect',state,tests:[]});
 const original=(await request(service,'GET','/api/resources/consumer-launch-mission',{},null)).body.resource;assert.equal(original.state.documents[0].name,'00_START.md');
 const fork=(await request(service,'POST','/api/resources/consumer-launch-mission/fork',{expected_version:original.version,title:'URL-only continuation',visibility:'public'})).body.resource;let r=(await built(service,fork)).body.resource;
 const q=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version});await service.workOnce({workerId:'mission-worker'});const result=(await request(service,'GET',`/api/resources/${r.id}/executions/${q.body.execution.id}`)).body.execution.value;
 assert.equal(result.total_nodes,2);assert.equal(result.dependency_edges,1);assert.equal(result.verified,false);assert.equal((await request(service,'GET','/api/resources/consumer-launch-mission',{},null)).body.resource.version,original.version);
});

test('missing worker authority and authored code fail closed',async()=>{
 const {store,service}=await setup();await assert.rejects(created(service,{...arithmetic,language:'javascript',source:'process.exit()'}),code('sandbox_unavailable'));
 let r=await created(service);r=(await built(service,r)).body.resource;await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});
 const worker=new ResourceService({store,baseUrl:service.baseUrl});assert.equal((await worker.workOnce({workerId:'no-validator'})).status,'cancelled');
 await assert.rejects(request(service,'POST','/api/resources',arithmetic,{...actor,scopes:[]}),code('forbidden'));
});

test('parallel product startup seeds one immutable mission without losing either service',async()=>{
 const {store,service}=await setup(),second=new ResourceService({store,baseUrl:'http://127.0.0.1:8181'}),seed={id:'consumer-launch-mission',title:'One mission',source:'input json | mission.inspect',state:{graph:{nodes:[]}}};
 const results=await Promise.all([service.seedMission(seed),second.seedMission(seed)]);assert.equal(results[0].id,results[1].id);assert.equal(results[0].version,1);assert.equal((await store.list('launch-mission-operator',{prefix:'resource-event/'})).length,1);
});

test('job intent and its idempotency receipt commit atomically across an interruption boundary',async()=>{
 const {store,service}=await setup();let r=await created(service);r=(await built(service,r)).body.resource;
 const commit=store.commit.bind(store);store.commit=async(scope,changes,options)=>{if(changes.some(x=>x.key.startsWith('resource-command/'))&&!changes.some(x=>x.key.startsWith('resource-job/')))throw Error('Simulated crash between job and receipt');return commit(scope,changes,options);};
 const path=`/api/resources/${r.id}/run`,body={expected_version:r.version,input:4},a=await request(service,'POST',path,body,actor,'atomic-job'),b=await request(service,'POST',path,body,actor,'atomic-job');assert.equal(a.status,202);assert.equal(b.status,202);assert.equal(a.body.execution.id,b.body.execution.id);assert.equal((await store.list(actor.id,{prefix:'resource-job/'})).length,1);
});

test('create and build retries retain original statuses and immutable build IDs',async()=>{
 const {service}=await setup();const a=await request(service,'POST','/api/resources',arithmetic,actor,'same-create'),b=await request(service,'POST','/api/resources',arithmetic,actor,'same-create');assert.equal(a.status,201);assert.equal(b.status,201);assert.equal(a.body.resource.id,b.body.resource.id);
 const path=`/api/resources/${a.body.resource.id}/build`,body={expected_version:a.body.resource.version},first=await request(service,'POST',path,body,actor,'same-build'),again=await request(service,'POST',path,body,actor,'same-build');assert.equal(first.body.build.id,again.body.build.id);
});

test('public-resource proposals remain immutable and private to proposer and owner until owner explicitly commits',async()=>{
 const {service}=await setup();const r=await created(service,{...arithmetic,visibility:'public'});
 const payload={expected_version:r.version,base_version:r.version,summary:'A suggested calculation',source:'input number | math.add 5',state:7};
 const proposed=await request(service,'POST',`/api/resources/${r.id}/propose`,payload,other,'suggest-once');const proposal=proposed.body.proposal;assert.equal(proposed.status,201);assert.equal(proposal.actor,other.id);assert.equal(proposal.owner,actor.id);
 assert.equal((await request(service,'GET',`/api/resources/${r.id}`)).body.resource.version,r.version);
 assert.equal((await request(service,'GET',`/api/resources/${r.id}/proposals`)).body.items.length,1);
 assert.equal((await request(service,'GET',`/api/resources/${r.id}/proposals`,{},other)).body.items.length,1);
 const stranger={...actor,id:'unrelated-principal'};await assert.rejects(request(service,'GET',`/api/resources/${r.id}/proposals/${proposal.id}`,{},stranger),code('not_found'));
 await assert.rejects(request(service,'GET',`/api/resources/${r.id}/proposals/${proposal.id}`,{},null),code('authentication_required'));
 await assert.rejects(request(service,'POST',`/api/resources/${r.id}/commit`,{expected_version:r.version,proposal_id:proposal.id},other),code('forbidden'));
 const accepted=await request(service,'POST',`/api/resources/${r.id}/commit`,{expected_version:r.version,proposal_id:proposal.id,decision:'accept'},actor,'accept-once');assert.equal(accepted.body.resource.source,payload.source);assert.equal(accepted.body.resource.state,7);assert.equal(accepted.body.resource.source_revision,2);assert.equal(accepted.body.resource.active_build,null);assert.equal(accepted.body.decision.status,'accepted');
 const read=(await request(service,'GET',`/api/resources/${r.id}/proposals/${proposal.id}`,{},other)).body;assert.deepEqual(read.proposal,proposal);assert.equal(read.decision.status,'accepted');
});

test('owner rejects proposals without applying content and stale/base-version/cross-resource suggestions cannot commit',async()=>{
 const {service}=await setup();let r=await created(service,{...arithmetic,visibility:'public'});
 await assert.rejects(request(service,'POST',`/api/resources/${r.id}/propose`,{expected_version:r.version,base_version:0,state:9},other),code('proposal_stale'));
 const a=(await request(service,'POST',`/api/resources/${r.id}/propose`,{expected_version:r.version,state:9},other)).body.proposal;
 const b=(await request(service,'POST',`/api/resources/${r.id}/propose`,{expected_version:r.version,state:11},other)).body.proposal;
 const rejected=await request(service,'POST',`/api/resources/${r.id}/commit`,{expected_version:r.version,proposal_id:a.id,decision:'reject'});assert.equal(rejected.body.decision.status,'rejected');assert.deepEqual(rejected.body.resource.state,{});r=rejected.body.resource;
 await assert.rejects(request(service,'POST',`/api/resources/${r.id}/commit`,{expected_version:r.version,proposal_id:b.id}),code('proposal_stale'));
 const another=await created(service,{...arithmetic,visibility:'public'});await assert.rejects(request(service,'POST',`/api/resources/${another.id}/commit`,{expected_version:another.version,proposal_id:b.id}),code('not_found'));
});

test('proposal and owner decision retry atomically after lost responses and do not repeat transitions',async()=>{
 const {store,service}=await setup();const r=await created(service,{...arithmetic,visibility:'public'}),proposePath=`/api/resources/${r.id}/propose`,body={expected_version:r.version,state:{approved:true}};
 const original=store.commit.bind(store);let interrupted=true;
 store.commit=async(scope,changes,options)=>{const result=await original(scope,changes,options);if(interrupted&&changes.some(x=>x.key.startsWith('resource-proposal/'))){interrupted=false;throw Object.assign(Error('lost response'),{code:'interrupted',status:503});}return result;};
 await assert.rejects(request(service,'POST',proposePath,body,other,'durable-proposal'),code('interrupted'));
 const a=await request(service,'POST',proposePath,body,other,'durable-proposal'),b=await request(service,'POST',proposePath,body,other,'durable-proposal');assert.equal(a.body.proposal.id,b.body.proposal.id);assert.equal((await request(service,'GET',`/api/resources/${r.id}/proposals`)).body.items.length,1);
 await assert.rejects(request(service,'POST',proposePath,{...body,state:{}},other,'durable-proposal'),code('idempotency_conflict'));
 interrupted=true;store.commit=async(scope,changes,options)=>{const result=await original(scope,changes,options);if(interrupted&&changes.some(x=>x.key.startsWith('resource-proposal-decision/'))){interrupted=false;throw Object.assign(Error('lost owner response'),{code:'interrupted',status:503});}return result;};
 const commitPath=`/api/resources/${r.id}/commit`,commitBody={expected_version:r.version,proposal_id:a.body.proposal.id};await assert.rejects(request(service,'POST',commitPath,commitBody,actor,'durable-decision'),code('interrupted'));
 const accepted=await request(service,'POST',commitPath,commitBody,actor,'durable-decision'),again=await request(service,'POST',commitPath,commitBody,actor,'durable-decision');assert.deepEqual(accepted,again);assert.equal(accepted.body.resource.version,r.version+1);assert.equal((await store.list(actor.id,{prefix:`resource-event/${r.id}/`})).length,2);
});

test('invalid expiry, unsafe JSON, oversized state/source/input and non-pure proposals fail before persistence',async()=>{
 const {store,service}=await setup();for(const expiresAt of [undefined,'not-a-date','2001-01-01T00:00:00Z'])await assert.rejects(created(service,arithmetic,{...actor,expiresAt}),code('authentication_required'));
 const before=JSON.stringify(store.state);await assert.rejects(created(service,{...arithmetic,state:'x'.repeat(65537)}),code('state_limit'));assert.equal(JSON.stringify(store.state),before);
 const r=await created(service,{...arithmetic,visibility:'public'}),path=`/api/resources/${r.id}/propose`;
 for(const payload of [{state:NaN},{state:{x:undefined}},{state:new Date()},{state:JSON.parse('{"__proto__":{"polluted":true}}')},{source:{language:'purl/1',steps:[],extra:undefined}}])await assert.rejects(request(service,'POST',path,{expected_version:r.version,...payload},other),code('invalid_json'));
 await assert.rejects(request(service,'POST',path,{expected_version:r.version,state:'x'.repeat(65537)},other),code('state_limit'));
 await assert.rejects(request(service,'POST',path,{expected_version:r.version,source:'x'.repeat(65537)},other),code('source_limit'));
 await assert.rejects(request(service,'POST',path,{expected_version:r.version,source:'input number | unknown.operation'},other),code('compile_failed'));
 await assert.rejects(request(service,'POST',path,{expected_version:r.version},other),code('source_required'));
 let buildable=(await built(service,r)).body.resource;await assert.rejects(request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:buildable.version,input:{x:undefined}}),code('invalid_json'));
 assert.equal((await request(service,'GET',`/api/resources/${r.id}/proposals`)).body.items.length,0);
});

test('two workers fence an expired lease so the interrupted worker cannot publish a second artifact',async()=>{
 const {execute}=await import('../../service/compiler.js');let now=Date.parse('2026-10-18T00:00:00Z'),release,claimed;const paused=new Promise(r=>release=r),barrier=new Promise(r=>claimed=r);
 const {store,service}=await setup({clock:()=>now,executor:async(...args)=>{claimed();await paused;return execute(...args);}});let r=await created(service);r=(await built(service,r)).body.resource;const queued=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});
 const oldWorker=service.workOnce({workerId:'old-worker',leaseMs:30});await barrier;
 const replacement=new ResourceService({store,clock:()=>now,authenticateActor:async()=>actor});assert.equal(await replacement.workOnce({workerId:'too-early',leaseMs:30}),null);
 now+=31;const done=await replacement.workOnce({workerId:'replacement',leaseMs:30});assert.equal(done.status,'succeeded');assert.equal(done.attempts,2);release();assert.equal(await oldWorker,null);
 const persisted=(await request(service,'GET',`/api/resources/${r.id}/executions/${queued.body.execution.id}`)).body.execution;assert.equal(persisted.value,18);assert.equal((await store.list(actor.id,{prefix:'resource-artifact/'})).length,1);assert.equal((await store.list(actor.id,{prefix:`resource-event/${r.id}/`})).filter(x=>x.value.operation==='execution').length,1);
});

test('a fresh worker retries pure interrupted execution only after lease expiry without partial results',async()=>{
 let now=Date.parse('2026-10-18T00:00:00Z');const {store,service}=await setup({clock:()=>now});let r=await created(service);r=(await built(service,r)).body.resource;const q=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});
 const original=store.commit.bind(store);let interrupted=true;store.commit=async(scope,changes,options)=>{if(interrupted&&changes.some(x=>x.key.startsWith('resource-artifact/'))){interrupted=false;throw Object.assign(Error('worker terminated before result transaction'),{code:'interrupted',status:503});}return original(scope,changes,options);};
 await assert.rejects(service.workOnce({workerId:'interrupted',leaseMs:20}),code('interrupted'));assert.equal((await store.list(actor.id,{prefix:'resource-artifact/'})).length,0);assert.equal((await request(service,'GET',`/api/resources/${r.id}/executions/${q.body.execution.id}`)).body.execution.status,'running');
 const fresh=new ResourceService({store,clock:()=>now,authenticateActor:async()=>actor});assert.equal(await fresh.workOnce({workerId:'not-expired'}),null);now+=21;assert.equal((await fresh.workOnce({workerId:'resumed'})).status,'succeeded');assert.equal((await store.list(actor.id,{prefix:'resource-artifact/'})).length,1);
});

test('owner revoked during execution is rechecked before result publication; malformed worker expiry cancels',async()=>{
 const {execute}=await import('../../service/compiler.js');let revoked=false;const {store,service}=await setup({authenticateActor:async()=>revoked?null:actor,executor:async(...args)=>{const result=execute(...args);revoked=true;return result;}});let r=await created(service);r=(await built(service,r)).body.resource;await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});
 const done=await service.workOnce({workerId:'revocation-check'});assert.equal(done.status,'cancelled');assert.equal(done.error.code,'authority_expired');assert.equal((await store.list(actor.id,{prefix:'resource-artifact/'})).length,0);
 r=(await request(service,'GET',`/api/resources/${r.id}`)).body.resource;await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});const malformed=new ResourceService({store,authenticateActor:async()=>({...actor,expiresAt:'invalid'})});assert.equal((await malformed.workOnce({workerId:'invalid-expiry'})).status,'cancelled');
});

test('concurrent duplicate proposals and owner decisions retain exactly one immutable record',async()=>{
 const {store,service}=await setup();const r=await created(service,{...arithmetic,visibility:'public'}),path=`/api/resources/${r.id}/propose`,body={expected_version:r.version,state:12};
 const [a,b]=await Promise.all([request(service,'POST',path,body,other,'parallel-proposal'),request(service,'POST',path,body,other,'parallel-proposal')]);assert.equal(a.body.proposal.id,b.body.proposal.id);
 const commitPath=`/api/resources/${r.id}/commit`,commitBody={expected_version:r.version,proposal_id:a.body.proposal.id};const [x,y]=await Promise.all([request(service,'POST',commitPath,commitBody,actor,'parallel-decision'),request(service,'POST',commitPath,commitBody,actor,'parallel-decision')]);assert.deepEqual(x,y);assert.equal((await store.list(actor.id,{prefix:`resource-proposal-decision/${r.id}/`})).length,1);
});

test('simultaneous near-64KiB source and state proposals commit and retry without an oversized receipt row',async()=>{
 const {service}=await setup();const r=await created(service,{title:'Large bounded proposal',source:'input json',visibility:'public'}),source='input json'+' '.repeat(65500),state='x'.repeat(65500);
 const proposed=await request(service,'POST',`/api/resources/${r.id}/propose`,{expected_version:r.version,source,state},other,'large-proposal');
 const path=`/api/resources/${r.id}/commit`,body={expected_version:r.version,proposal_id:proposed.body.proposal.id};const accepted=await request(service,'POST',path,body,actor,'large-decision');assert.equal(accepted.body.resource.source,source);assert.equal(accepted.body.resource.state,state);assert.deepEqual(await request(service,'POST',path,body,actor,'large-decision'),accepted);
});

test('manifest discloses proposal/decision contracts and proposal reads are pure under current visibility',async()=>{
 const {store,service}=await setup();let r=await created(service,{...arithmetic,visibility:'public'});const manifest=(await request(service,'GET',`/api/resources/${r.id}/manifest`)).body;
 const commit=manifest.operations.find(x=>x.name==='commit'),propose=manifest.operations.find(x=>x.name==='propose');assert.deepEqual(commit.input_schema.required,['expected_version','proposal_id']);assert.deepEqual(commit.input_schema.properties.decision.enum,['accept','reject']);assert.ok(propose.input_schema.properties.source);assert.equal(manifest.links.proposals,`http://127.0.0.1:8180/api/resources/${r.id}/proposals`);
 const p=(await request(service,'POST',`/api/resources/${r.id}/propose`,{expected_version:r.version,state:1},other)).body.proposal;const before=JSON.stringify(store.state);
 await request(service,'GET',`/api/resources/${r.id}/proposals`,{}, {...other,scopes:['resources:read']});await request(service,'GET',`/api/resources/${r.id}/proposals/${p.id}`);assert.equal(JSON.stringify(store.state),before);
 r=(await built(service,r)).body.resource;r=(await request(service,'POST',`/api/resources/${r.id}/publish`,{expected_version:r.version,visibility:'private'})).body.resource;
 await assert.rejects(request(service,'GET',`/api/resources/${r.id}/proposals/${p.id}`,{},other),code('not_found'));assert.equal((await request(service,'GET',`/api/resources/${r.id}/proposals/${p.id}`)).body.proposal.id,p.id);
});

test('private reads and the collection require active resource scopes even for the same principal in CGIT',async()=>{
 const {service}=await setup();const r=await created(service,{...arithmetic,state:{secret:'private-state'}}),cgit={...actor,product:'cgit',scopes:['cgit:read','cgit:write']};
 await assert.rejects(request(service,'GET','/api/resources',{},cgit),code('forbidden'));
 for(const suffix of ['', '/source','/manifest','/continuity','/history','/replay','/executions','/artifacts','/builds','/releases'])await assert.rejects(request(service,'GET',`/api/resources/${r.id}${suffix}`,{},cgit),code('forbidden'));
 for(const expiresAt of ['invalid',undefined,'2001-01-01T00:00:00Z'])await assert.rejects(request(service,'GET',`/api/resources/${r.id}`,{}, {...actor,expiresAt}),code('authentication_required'));
 assert.equal((await request(service,'GET',`/api/resources/${r.id}/source`,{}, {...actor,scopes:['resources:read']})).body.source,arithmetic.source);
 const publicResource=await created(service,{...arithmetic,visibility:'public'}),manifest=(await request(service,'GET',`/api/resources/${publicResource.id}/manifest`,{},null)).body;assert.deepEqual(manifest.authority.rights,['read']);assert.equal(manifest.operations.find(x=>x.name==='fork').available,false);
});

test('admitted concurrent jobs terminalize once if owner commands consume the remaining history',async()=>{
 const {store,service}=await setup();let r=await created(service,{title:'Bounded history',source:'input number | math.add 2'});r=(await request(service,'POST',`/api/resources/${r.id}/build`,{expected_version:r.version})).body.resource;
 while(r.version<197)r=(await request(service,'POST',`/api/resources/${r.id}/source`,{expected_version:r.version,state:r.version})).body.resource;
 const first=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:1});r=first.body.resource;
 r=(await request(service,'POST',`/api/resources/${r.id}/checkpoint`,{expected_version:r.version,summary:'Owner consumed another history version'})).body.resource;
 const last=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:2});assert.equal(last.body.resource.version,200);
 const a=await service.workOnce({workerId:'history-cap-first'}),b=await service.workOnce({workerId:'history-cap-second'});assert.equal(a.status,'failed');assert.equal(b.status,'failed');assert.equal(a.error.code,'history_limit');assert.equal(b.error.code,'history_limit');assert.equal(await service.workOnce({workerId:'no-repeat'}),null);assert.equal((await store.list(actor.id,{prefix:'resource-artifact/'})).length,0);
 for(const job of [first.body.execution,last.body.execution])assert.equal((await request(service,'GET',`/api/resources/${r.id}/executions/${job.id}`)).body.execution.attempts,1);
});

test('decimal-expanded artifact storage refusal becomes a small permanent terminal failure',async()=>{
 const {store,service}=await setup();const source={language:'purl/1',input:'json',steps:[{op:'constant',args:{value:Array(500).fill(1e-308)}}]};let r=await created(service,{title:'Finite decimal output',source});r=(await request(service,'POST',`/api/resources/${r.id}/build`,{expected_version:r.version})).body.resource;
 const queued=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:null});const completed=await service.workOnce({workerId:'decimal-worker'});assert.equal(completed.status,'failed');assert.equal(completed.error.code,'row_limit');assert.equal((await store.list(actor.id,{prefix:'resource-artifact/'})).length,0);assert.equal(await service.workOnce({workerId:'no-permanent-retry'}),null);
 const saved=(await request(service,'GET',`/api/resources/${r.id}/executions/${queued.body.execution.id}`)).body.execution;assert.equal(saved.status,'failed');assert.equal(saved.attempts,1);assert.equal(saved.lease,null);
});

test('resource child listing and replay select the resource before unrelated owner pagination',async()=>{
 const {store,service}=await setup();let r=await created(service);r=(await built(service,r)).body.resource;const queued=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});await service.workOnce({workerId:'real-child'});
 for(const kind of ['job','artifact','build','release'])for(let start=0;start<200;start+=25)await store.commit(actor.id,Array.from({length:25},(_,n)=>({key:`resource-${kind}/aaaa${String(start+n).padStart(4,'0')}`,expectedVersion:0,value:{resource_id:'unrelated-resource',status:'succeeded'}})));
 const listing=(await request(service,'GET',`/api/resources/${r.id}/executions`)).body;assert.equal(listing.items.length,1);assert.equal(listing.items[0].id,queued.body.execution.id);
 assert.equal((await request(service,'GET',`/api/resources/${r.id}/artifacts`)).body.items.length,1);assert.equal((await request(service,'GET',`/api/resources/${r.id}/builds`)).body.items.length,1);
 const replay=(await request(service,'GET',`/api/resources/${r.id}/replay`)).body;assert.equal(replay.executions.length,1);assert.equal(replay.valid,true);
 const row=await store.read(actor.id,`resource-job/${queued.body.execution.id}`);await store.commit(actor.id,[{key:row.key,expectedVersion:row.version,value:null}]);const missing=(await request(service,'GET',`/api/resources/${r.id}/replay`)).body;assert.equal(missing.valid,false);assert.equal(missing.executions_complete,false);
});

test('fresh discovery provides valid checkpoint input and publish/fork options',async()=>{
 const {service}=await setup();const r=await created(service),manifest=(await request(service,'GET',`/api/resources/${r.id}/manifest`)).body;
 const checkpoint=manifest.operations.find(x=>x.name==='checkpoint'),publish=manifest.operations.find(x=>x.name==='publish'),fork=manifest.operations.find(x=>x.name==='fork');assert.deepEqual(checkpoint.input_schema.required,['expected_version','summary']);assert.equal(checkpoint.input_schema.properties.summary.maxLength,6000);assert.ok(checkpoint.input_schema.properties.next);assert.ok(checkpoint.input_schema.properties.evidence);assert.deepEqual(publish.input_schema.properties.visibility.enum,['public','private']);assert.ok(fork.input_schema.properties.title);assert.deepEqual(fork.input_schema.properties.visibility.enum,['private','public']);
 const response=await request(service,'POST',new URL(checkpoint.href).pathname,{expected_version:r.version,summary:'Discovered continuation',next:['Read evidence'],evidence:[{kind:'assertion'}]});assert.equal(response.body.checkpoint.summary,'Discovered continuation');
});

test('permanent completion failure terminalizes an existing job even when tenant bytes or metadata are saturated',async()=>{
 const {execute}=await import('../../service/compiler.js');
 for(const quota of ['tenant_quota','metadata_quota']){
  let release,entered;const pause=new Promise(r=>release=r),barrier=new Promise(r=>entered=r);const {store,service}=await setup({executor:async(...args)=>{entered();await pause;return execute(...args);}});let r=await created(service);r=(await built(service,r)).body.resource;await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});
  const worker=service.workOnce({workerId:'w'});await barrier;
  if(quota==='tenant_quota'){
   let remaining=10*1024*1024-Object.values(store.state.scopes[actor.id].records).reduce((sum,row)=>sum+(row.value===null?0:Buffer.byteLength(JSON.stringify(row.value))),0),n=0;
   while(remaining>0){const size=Math.min(250000,remaining);assert.ok(size>=2);await store.commit(actor.id,[{key:`quota-fill/${n++}`,expectedVersion:0,value:'x'.repeat(size-2)}]);remaining-=size;}
  }else{
   let remaining=4096-Object.keys(store.state.scopes[actor.id].records).length,n=0;while(remaining>0){const count=Math.min(32,remaining);await store.commit(actor.id,Array.from({length:count},()=>({key:`metadata-fill/${n++}`,expectedVersion:0,value:{}})));remaining-=count;}
  }
  release();const failed=await worker;assert.equal(failed.status,'failed');assert.equal(failed.error.code,quota);assert.equal(await service.workOnce({workerId:'no-repeat-saturated'}),null);
 }
});

test('quota saturation after queue admission terminalizes pre-claim failure or revoked cancellation once',async()=>{
 for(const quota of ['tenant_quota','metadata_quota'])for(const revoked of [false,true]){
  const {store,service}=await setup({authenticateActor:async()=>revoked?null:actor});let r=await created(service);r=(await built(service,r)).body.resource;
  const queued=await request(service,'POST',`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});assert.equal(queued.status,202);const key=`resource-job/${queued.body.execution.id}`,initial=await store.read(actor.id,key);
  if(quota==='tenant_quota'){
   let remaining=10*1024*1024-Object.values(store.state.scopes[actor.id].records).reduce((sum,row)=>sum+(row.value===null?0:Buffer.byteLength(JSON.stringify(row.value))),0),n=0;
   while(remaining>0){const size=Math.min(250000,remaining);assert.ok(size>=2);await store.commit(actor.id,[{key:`queued-quota/${n++}`,expectedVersion:0,value:'x'.repeat(size-2)}]);remaining-=size;}
  }else{
   let remaining=4096-Object.keys(store.state.scopes[actor.id].records).length,n=0;while(remaining>0){const count=Math.min(32,remaining);await store.commit(actor.id,Array.from({length:count},()=>({key:`queued-metadata/${n++}`,expectedVersion:0,value:{}})));remaining-=count;}
  }
  const result=await service.workOnce({workerId:'w'});assert.equal(result.status,revoked?'cancelled':'failed');assert.equal(result.error.code,revoked?'authority_expired':quota);assert.equal(result.lease,null);assert.equal((await store.list(actor.id,{prefix:'resource-artifact/'})).length,0);
  if(quota==='tenant_quota'){assert.equal(result.attempts,0);assert.ok(Buffer.byteLength(JSON.stringify(result))<=Buffer.byteLength(JSON.stringify(initial.value)));}
  assert.equal(await service.workOnce({workerId:'w'}),null);assert.equal((await store.read(actor.id,key)).value.status,result.status);
 }
});
