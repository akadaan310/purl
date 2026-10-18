import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryLaunchStore, FileLaunchStore } from '../../service/launch/store.js';
import { ModelGateway } from '../../service/launch/models.js';
import { ConstellationService } from '../../service/launch/constellations.js';
const actor={id:'constellation-owner',kind:'human',credentialId:'fixture-credential',verified:true,product:'purls',products:{cgit:true},scopes:['models:read','models:write','chat:write','constellations:read','constellations:write']};
async function setup(t,{onRequest,cgit,clock,persistencePath}={}){
 const histories=[];const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);histories.push(data);await onRequest?.(histories.length);res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:`Participant ${histories.length}: claim ${histories.length===2?'disagree':'uncertain'}. Evidence: fixture only.`}}],usage:{prompt_tokens:50,completion_tokens:20,cost:0.00009}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const store=persistencePath?new FileLaunchStore(persistencePath):new MemoryLaunchStore(),env={OPENROUTER_MODEL_CATALOG_JSON:JSON.stringify([{id:'test/model',promptMicroUSDPerToken:1,completionMicroUSDPerToken:2}]),MODEL_DAILY_BUDGET_MICROUSD:'100000',MODEL_CALL_BUDGET_MICROUSD:'40000'};
 const gateway=new ModelGateway({store,env,clock,encryptionKey:randomBytes(32).toString('base64'),fetch:(url,init)=>fetch(`http://127.0.0.1:${server.address().port}`,init)});
 const key=(await gateway.handle('POST','/api/models/keys',{provider:'openrouter',key:'secret-fixture-key'},actor)).body.key;
 const service=new ConstellationService({store,gateway,cgit,clock,authenticateActor:async()=>actor});
 const create=async(extra={})=>(await service.handle('POST','/api/constellations',{question:'What evidence would resolve this?',model:'test/model',keyId:key.id,max_tokens:50,selectedContext:[{id:'chosen',text:'Selected context only'}],consent:true,...extra},actor)).body.constellation;
 return {store,gateway,service,create,histories};
}
test('three initial HTTP contexts are independent; attributed evidence survives restart and replay',async(t)=>{
 const s=await setup(t);const job=await s.create();assert.equal(job.participants.length,3);
 await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);
 const restarted=new ConstellationService({store:s.store,gateway:s.gateway,authenticateActor:async()=>actor});await restarted.workOnce({workerId:'worker-a'});
 const out=(await restarted.handle('GET',`/api/constellations/${job.id}`,{},actor)).body.constellation;
 assert.equal(out.status,'succeeded');assert.equal(out.contributions.length,3);assert.equal(s.histories.length,3);
 for(const h of s.histories){assert.ok(h.messages.some(m=>m.content.includes('Selected context only')));assert.ok(!JSON.stringify(h.messages).includes('Participant 1:'));}
 assert.deepEqual(out.contributions.map(c=>c.role),['researcher','challenger','verifier']);assert.equal(out.disagreements.status,'unassessed');
 const replay=(await restarted.handle('GET',`/api/constellations/${job.id}/replay`,{},actor)).body;assert.equal(replay.verified,true);assert.equal(replay.contributions.length,3);
 await restarted.workOnce({workerId:'worker-b'});assert.equal(s.histories.length,3);
 await assert.rejects(restarted.handle('GET',`/api/constellations/${job.id}`,{},{...actor,id:'stranger'}),e=>e.status===404);
});
test('checkpoint pauses; restart resumes persisted participants without repeating completed provider call',async(t)=>{
 const s=await setup(t);const job=await s.create();await s.service.handle('POST',`/api/constellations/${job.id}/checkpoint`,{},actor);
 assert.equal(await s.service.workOnce({workerId:'paused'}),null);
 await s.service.handle('POST',`/api/constellations/${job.id}/resume`,{},actor);
 const original=s.gateway.complete.bind(s.gateway);let completed=0;s.gateway.complete=async(...args)=>{if(completed===1)throw Object.assign(new Error('interrupted'),{code:'PROVIDER_AMBIGUOUS',status:502});const out=await original(...args);completed++;return out;};
 await s.service.workOnce({workerId:'first'});
 let saved=(await s.service.handle('GET',`/api/constellations/${job.id}`,{},actor)).body.constellation;assert.equal(saved.contributions.length,1);assert.equal(saved.status,'failed');
 s.gateway.complete=original;await s.service.handle('POST',`/api/constellations/${job.id}/resume`,{},actor);await new ConstellationService({store:s.store,gateway:s.gateway,authenticateActor:async()=>actor}).workOnce({workerId:'second'});
 saved=(await s.service.handle('GET',`/api/constellations/${job.id}`,{},actor)).body.constellation;assert.equal(saved.contributions.length,3);assert.equal(s.histories.length,3);
});
test('expired lease fencing prevents stale worker writes and completed-call recovery uses saved receipt',async(t)=>{
 let now=Date.now(),release;let blocked=false;
 const gate=new Promise(r=>release=r);const s=await setup(t,{clock:()=>now,onRequest:async n=>{if(n===1){blocked=true;await gate;}}});
 const job=await s.create();await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);
 const first=s.service.workOnce({workerId:'old',leaseMs:1000});while(!blocked)await new Promise(r=>setTimeout(r,1));now+=2000;
 const second=new ConstellationService({store:s.store,gateway:s.gateway,clock:()=>now,authenticateActor:async()=>actor});await second.workOnce({workerId:'new',leaseMs:1000});release();await first;
 const saved=(await s.store.read(actor.id,`constellation-job/${job.id}`)).value;assert.equal(saved.status,'failed');assert.equal(saved.contributions.length,0);assert.equal(s.histories.length,1);
 await second.handle('POST',`/api/constellations/${job.id}/resume`,{},actor);await second.workOnce({workerId:'recover'});assert.equal(s.histories.length,3);
});
test('replay rejects tampering and optional steward requires separate consent and commits real artifact',async(t)=>{
 const commits=[];const s=await setup(t,{cgit:{commitArtifact:async(a,p)=>{assert.equal(a.id,actor.id);commits.push(p);return {commit:{id:'content-addressed-commit'}};}}});
 await assert.rejects(s.create({steward:{repoId:'repo',consent:false}}),e=>e.code==='CONSENT_REQUIRED');
 const job=await s.create({steward:{repoId:'repo',consent:true}});await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);await s.service.workOnce({workerId:'steward'});
 assert.equal(commits.length,1);assert.equal(commits[0].artifacts[0].type,'trace');assert.equal(commits[0].artifacts[0].content.contributions.length,3);
 const row=await s.store.read(actor.id,`constellation-job/${job.id}`);row.value.contributions[0].text='tampered';await s.store.commit(actor.id,[{key:row.key,expectedVersion:row.version,value:row.value}]);
 await assert.rejects(s.service.handle('GET',`/api/constellations/${job.id}/replay`,{},actor),e=>e.code==='REPLAY_INTEGRITY');
});
test('baseline is NOT_RUN without explicit budget consent and reports actual measured usage when authorized',async(t)=>{
 const s=await setup(t);const job=await s.create();await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);await s.service.workOnce({workerId:'measure'});
 const no=(await s.service.handle('POST',`/api/constellations/${job.id}/baseline`,{},actor)).body.baseline;assert.equal(no.status,'NOT_RUN');assert.equal(s.histories.length,3);
 const saved=(await s.service.handle('GET',`/api/constellations/${job.id}`,{},actor)).body.constellation;
 const budget=saved.contributions.reduce((n,c)=>n+c.cost.estimatedMaximumMicroUSD,0);
 const yes=(await s.service.handle('POST',`/api/constellations/${job.id}/baseline`,{consent:true,budgetMicroUSD:budget},actor)).body.baseline;assert.equal(yes.status,'MEASURED');assert.equal(yes.result.cost.actualMicroUSD,90);assert.equal(yes.taskSuccess,'NOT_ASSESSED');assert.equal(s.histories.length,4);
});

test('live credential revocation blocks queued jobs and every subsequent participant',async(t)=>{
 const s=await setup(t);const job=await s.create();await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);
 const revoked=new ConstellationService({store:s.store,gateway:s.gateway,authenticateActor:async()=>null});
 assert.equal((await revoked.workOnce({workerId:'revoked'})).code,'CREDENTIAL_REVOKED');assert.equal(s.histories.length,0);
 await s.service.handle('POST',`/api/constellations/${job.id}/resume`,{},actor);
 let checks=0;const expires=new ConstellationService({store:s.store,gateway:s.gateway,authenticateActor:async()=>++checks<3?actor:null});
 assert.equal((await expires.workOnce({workerId:'expires'})).code,'CREDENTIAL_REVOKED');assert.equal(s.histories.length,1);
});
test('missing live validator fails closed, and oversized serialized initial contexts are rejected before storage',async(t)=>{
 const s=await setup(t);const job=await s.create();await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);
 const unconfigured=new ConstellationService({store:s.store,gateway:s.gateway});assert.equal((await unconfigured.workOnce({workerId:'missing'})).code,'LIVE_AUTH_UNAVAILABLE');assert.equal(s.histories.length,0);
 await assert.rejects(s.create({participants:['researcher','challenger','verifier','engineer','synthesizer'].map(role=>({role,model:'test/model'})),selectedContext:[{id:'large',text:'界'.repeat(7900)}]}),e=>e.code==='CONSTELLATION_SIZE_LIMIT');
});

test('file-backed restart recovers completed requests and exports a real CGIT steward diff',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'purl-models-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'launch.json');
 const s=await setup(t,{persistencePath:path});const { CgitService }=await import('../../service/launch/cgit.js');const cgit=new CgitService({store:s.store});
 const cgitActor={...actor,scopes:[...actor.scopes,'cgit:read','cgit:write']};
 const base=await cgit.commitArtifact(cgitActor,{name:'Evidence',expectedHead:null,artifacts:[{path:'question.json',type:'research',content:{question:'original'}}]});
 s.service.cgit=cgit;const job=await s.create({steward:{consent:true,repoId:base.repository.id,expectedHead:base.commit.hash}});
 await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);
 const nextStore=new FileLaunchStore(path);const nextGateway=new ModelGateway({store:nextStore,env:s.gateway.env,encryptionKey:s.gateway.encryptionKey,fetch:s.gateway.fetch});const nextCgit=new CgitService({store:nextStore});
 const restarted=new ConstellationService({store:nextStore,gateway:nextGateway,cgit:nextCgit,authenticateActor:async()=>cgitActor});
 assert.equal((await restarted.workOnce({workerId:'disk-restart'})).status,'succeeded');
 const out=(await restarted.handle('GET',`/api/constellations/${job.id}`,{},actor)).body.constellation;assert.equal(out.steward.status,'committed');
 const diff=await nextCgit.handle('GET',`/api/cgit/repos/${base.repository.id}/diff`,{},cgitActor,{query:{from:base.commit.hash,to:out.steward.commit.hash}});assert.deepEqual(diff.body.changes.map(c=>c.kind),['added']);
 const exported=await nextCgit.export(cgitActor,base.repository.id);assert.equal(exported.commits.length,2);assert.equal(exported.blobs.find(b=>b.type==='trace').content.contributions.length,3);
 const last=new ConstellationService({store:new FileLaunchStore(path),gateway:nextGateway,authenticateActor:async()=>cgitActor});assert.equal(await last.workOnce({workerId:'again'}),null);assert.equal(s.histories.length,3);
 assert.equal((await last.handle('GET',`/api/constellations/${job.id}/replay`,{},actor)).body.verified,true);
});

test('draft and paused jobs do not occupy the indexed runnable queue',async(t)=>{
 const s=await setup(t);const draft=await s.create();assert.equal(draft.status,'draft');
 await s.service.handle('POST',`/api/constellations/${draft.id}/checkpoint`,{},actor);
 const paused=(await s.service.handle('GET',`/api/constellations/${draft.id}`,{},actor)).body.constellation;assert.equal(paused.status,'paused');
 assert.deepEqual(await s.store.scan({prefix:'constellation-job/',statuses:['queued','running'],limit:200}),[]);
 await s.service.handle('POST',`/api/constellations/${draft.id}/resume`,{},actor);assert.equal((await s.store.scan({prefix:'constellation-job/',statuses:['queued'],limit:200})).length,1);
});

test('escaped provider output fails terminally with attributed receipt rather than overflowing the job row',async(t)=>{
 const s=await setup(t);let calls=0;s.gateway.fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'\u0001'.repeat(16384)}}],usage:{prompt_tokens:1,completion_tokens:1,cost:0.00004}}));};
 const job=await s.create({max_tokens:2048});await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);
 const result=await s.service.workOnce({workerId:'escaped'});assert.equal(result.code,'PROVIDER_OUTPUT_REJECTED');
 const saved=(await s.service.handle('GET',`/api/constellations/${job.id}`,{},actor)).body.constellation;assert.equal(saved.error.participant.role,'researcher');assert.equal(saved.error.receipt.status,'output_rejected');assert.equal(saved.error.cost.actualMicroUSD,40);
 await s.service.handle('POST',`/api/constellations/${job.id}/resume`,{},actor);assert.equal((await s.service.workOnce({workerId:'repeat'})).code,'PROVIDER_OUTPUT_REJECTED');assert.equal(calls,1);
});
test('five maximum accepted serialized outputs plus baseline fit pre-reserved durable job capacity',async(t)=>{
 const s=await setup(t);s.gateway.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'\u0001'.repeat(2700)}}],usage:{prompt_tokens:1,completion_tokens:1,cost:0.00004}}));
 const job=await s.create({participants:['researcher','challenger','verifier','engineer','synthesizer'].map(role=>({role,model:'test/model'}))});await s.service.handle('POST',`/api/constellations/${job.id}/start`,{},actor);
 const before=(await s.store.read(actor.id,`constellation-job/${job.id}`)).value;assert.ok(before.storageCapacityBytes>100000);assert.ok(before.storagePadding.length>90000);
 assert.equal((await s.service.workOnce({workerId:'boundary'})).status,'succeeded');
 const saved=(await s.service.handle('GET',`/api/constellations/${job.id}`,{},actor)).body.constellation;assert.equal(saved.contributions.length,5);assert.equal(saved.storagePadding,undefined);assert.equal(saved.contributions[4].text,'\u0001'.repeat(2700));
 const budget=saved.contributions.reduce((n,c)=>n+c.cost.estimatedMaximumMicroUSD,0);assert.equal((await s.service.handle('POST',`/api/constellations/${job.id}/baseline`,{consent:true,budgetMicroUSD:budget},actor)).body.baseline.status,'MEASURED');
 assert.ok(Buffer.byteLength(JSON.stringify((await s.store.read(actor.id,`constellation-job/${job.id}`)).value))<=256*1024);
});
test('concurrent constellation admissions cannot exceed owner object quota',async(t)=>{
 const s=await setup(t);for(let i=0;i<98;i++)await s.create();
 const results=await Promise.allSettled(Array.from({length:8},()=>s.create()));assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='CONSTELLATION_LIMIT'));
 assert.equal((await s.store.read(actor.id,'constellation-quota')).value.total,100);assert.equal((await s.store.list(actor.id,{prefix:'constellation-job/',limit:200})).length,100);
});
