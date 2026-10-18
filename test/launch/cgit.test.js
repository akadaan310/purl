import test from 'node:test';
import assert from 'node:assert/strict';
import { CgitService } from '../../service/launch/cgit.js';
import { MemoryLaunchStore } from '../../service/launch/store.js';
const actor={id:'alice',kind:'guest',verified:false,products:{cgit:true},scopes:['cgit:read','cgit:write']};
const artifact=(content='hello')=>({path:'notes/research.json',type:'research',content:{text:content},provenance:{source:'authored'}});
const setup=()=>new CgitService({store:new MemoryLaunchStore()});
async function create(s){return (await s.handle('POST','/api/cgit/repos/create',{name:'Research'},actor)).body.repository;}
test('immutable artifacts, concurrent heads, branches, releases, forks, diff and restore',async()=>{
 const s=setup();const repo=await create(s);
 const a=await s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:null,artifacts:[artifact()]});
 assert.match(a.commit.hash,/^[a-f0-9]{64}$/); assert.equal(a.commit.parents.length,0);
 await assert.rejects(s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:null,artifacts:[artifact('stale')]}),{status:409});
 await s.handle('POST',`/api/cgit/repos/${repo.id}/branch`,{name:'experiment',from:a.commit.hash},actor);
 const b=await s.commitArtifact(actor,{repositoryId:repo.id,branch:'experiment',expectedHead:a.commit.hash,artifacts:[artifact('new')]});
 const diff=await s.handle('GET',`/api/cgit/repos/${repo.id}/diff`,{},actor,{query:{from:a.commit.hash,to:b.commit.hash}});
 assert.deepEqual(diff.body.changes.map(x=>x.kind),['modified']);
 const release=await s.handle('POST',`/api/cgit/repos/${repo.id}/release`,{name:'v1',commit:a.commit.hash},actor); assert.equal(release.body.release.commit,a.commit.hash);
 await assert.rejects(s.handle('POST',`/api/cgit/repos/${repo.id}/release`,{name:'v1',commit:b.commit.hash},actor),{status:409});
 const fork=await s.handle('POST',`/api/cgit/repos/${repo.id}/fork`,{name:'Fork'},actor); assert.equal(fork.body.repository.branches.main,a.commit.hash);
 const snapshot=(await s.handle('GET',`/api/cgit/repos/${repo.id}/export`,{},actor)).body;
 await s.handle('POST',`/api/cgit/repos/${repo.id}/delete`,{confirm:true},actor);
 const restored=(await s.handle('POST','/api/cgit/import',{snapshot},actor)).body.repository;
 assert.equal(restored.branches.experiment,b.commit.hash);
 const exported=(await s.handle('GET',`/api/cgit/repos/${restored.id}/export`,{},actor)).body;
 assert.deepEqual(exported.commits,snapshot.commits); assert.deepEqual(exported.blobs,snapshot.blobs);
});
test('authorization, conversation consent, unsafe paths and attribution bounds',async()=>{
 const s=setup();await assert.rejects(s.handle('GET','/api/cgit/repos',{}, {...actor,products:{}}),{status:403});
 const repo=await create(s);
 await assert.rejects(s.handle('GET',`/api/cgit/repos/${repo.id}`,{}, {...actor,id:'mallory'}),{status:404});
 for(const path of ['../x','/etc/passwd','a/../x','a\\b','a//b','%2e%2e/x'])await assert.rejects(s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:null,artifacts:[{...artifact(),path}]}),{status:400});
 await assert.rejects(s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:null,artifacts:[{...artifact(),type:'conversation'}]}),{code:'conversation_consent_required'});
 await assert.rejects(s.handle('POST',`/api/cgit/repos/${repo.id}/branch`,{name:'../unsafe'},actor),{status:400});
});
test('import rejects altered hashes, missing parents, ownership claims and excessive content',async()=>{
 const s=setup(),repo=await create(s);await s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:null,artifacts:[artifact()]});
 const snapshot=(await s.handle('GET',`/api/cgit/repos/${repo.id}/export`,{},actor)).body;
 const bad=structuredClone(snapshot);bad.blobs[0].content={evil:true};await assert.rejects(s.handle('POST','/api/cgit/import',{snapshot:bad},actor),{status:400});
 const foreign=structuredClone(snapshot);foreign.repository.owner='mallory';await assert.rejects(s.handle('POST','/api/cgit/import',{snapshot:foreign},actor),{status:403});
 await assert.rejects(s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:snapshot.repository.branches.main,artifacts:[{...artifact(),content:'x'.repeat(210000)}]}),{status:413});
});
test('persisted separate CGIT consent works; HTTP reads do not write',async()=>{
 const store=new MemoryLaunchStore();await store.commit('alice',[{key:'profile/cgit',expectedVersion:0,value:{active:true,consented:true}}]);
 const s=new CgitService({store});const a={...actor,products:{}};await s.handle('POST','/api/cgit/repos/create',{name:'Profile consent'},a);
 const before=await store.list('alice',{prefix:'',limit:200});await s.handle('GET','/api/cgit/repos',{},a);assert.deepEqual(await store.list('alice',{prefix:'',limit:200}),before);
});
test('real identity product profiles and attenuated credentials enforce consent plus read/write scopes',async()=>{
 const store=new MemoryLaunchStore(),s=new CgitService({store});
 await store.commit('alice',[{key:'profile:cgit',expectedVersion:0,value:{product:'cgit',active:true,consent:{source:'explicit-activation',at:new Date().toISOString(),version:1}}}]);
 const live={...actor,product:'purls',products:['purls','cgit'],scopes:['cgit:read','cgit:write']};
 const repo=(await s.handle('POST','/api/cgit/repos/create',{name:'Scoped'},live)).body.repository;
 const readOnly={...live,kind:'agent',scopes:['cgit:read']};assert.equal((await s.handle('GET',`/api/cgit/repos/${repo.id}`,{},readOnly)).status,200);
 await assert.rejects(s.commitArtifact(readOnly,{repositoryId:repo.id,expectedHead:null,artifacts:[artifact()]}),{status:403,code:'scope_required'});
 await assert.rejects(s.handle('POST','/api/cgit/repos/create',{name:'No'},readOnly),{status:403,code:'scope_required'});
 await assert.rejects(s.handle('GET','/api/cgit/repos',{}, {...live,scopes:[]}),{status:403,code:'scope_required'});
});
test('parallel expected-head commits publish one head and no losing immutable objects',async()=>{
 const s=setup(),repo=await create(s);const result=await Promise.allSettled([1,2].map(n=>s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:null,artifacts:[artifact(String(n))]})));
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
 const snapshot=(await s.handle('GET',`/api/cgit/repos/${repo.id}/export`,{},actor)).body;assert.equal(snapshot.commits.length,1);assert.equal(snapshot.blobs.length,1);
});
test('prototype paths and forged hash-consistent missing-parent imports are rejected',async()=>{
 const {hash}=await import('../../service/launch/structural-index.js');const s=setup(),repo=await create(s);
 await assert.rejects(s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:null,artifacts:[{...artifact(),path:'__proto__'}]}),{status:400});
 await s.commitArtifact(actor,{repositoryId:repo.id,expectedHead:null,artifacts:[artifact()]});const snapshot=(await s.handle('GET',`/api/cgit/repos/${repo.id}/export`,{},actor)).body;
 const forged=structuredClone(snapshot),commit=forged.commits[0];commit.parents=['f'.repeat(64)];delete commit.hash;commit.hash=hash(commit);forged.repository.branches.main=commit.hash;
 forged.contentHash=hash({format:forged.format,repository:forged.repository,commits:forged.commits,blobs:forged.blobs});
 await assert.rejects(s.handle('POST','/api/cgit/import',{snapshot:forged},actor),{code:'import_missing_parent'});
 const tampered=structuredClone(snapshot);tampered.blobs[0].content={evil:true};tampered.contentHash=hash({format:tampered.format,repository:tampered.repository,commits:tampered.commits,blobs:tampered.blobs});await assert.rejects(s.handle('POST','/api/cgit/import',{snapshot:tampered},actor),{code:'import_hash_mismatch'});
});
test('native code artifact diff reports syntax symbol changes',async()=>{
 const s=setup(),repo=await create(s);
 const first=await s.commitArtifact(actor,{repoId:repo.id,expectedHead:null,artifacts:[{path:'src/main.ts',type:'code',content:'export const oldName: number = 1;'}]});
 const second=await s.commitArtifact(actor,{repoId:repo.id,expectedHead:first.commit.hash,artifacts:[{path:'src/main.ts',type:'code',content:'export const newName: number = 2;'}]});
 const result=await s.handle('GET',`/api/cgit/repos/${repo.id}/diff`,{},actor,{query:{from:first.commit.hash,to:second.commit.hash}});
 assert.deepEqual(result.body.changes[0].structure.addedSymbols,['newName']);assert.deepEqual(result.body.changes[0].structure.removedSymbols,['oldName']);
});
test('file-backed CGIT commits survive a fresh store process boundary',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const {FileLaunchStore}=await import('../../service/launch/store.js');const dir=await mkdtemp(join(tmpdir(),'cgit-launch-'));
 try{const file=join(dir,'launch.json'),first=new CgitService({store:new FileLaunchStore(file)}),repo=await create(first);const {commit}=await first.commitArtifact(actor,{repoId:repo.id,expectedHead:null,artifacts:[artifact('durable')]});const fresh=new CgitService({store:new FileLaunchStore(file)});const loaded=(await fresh.handle('GET',`/api/cgit/repos/${repo.id}`,{},actor)).body;assert.equal(loaded.head.hash,commit.hash);assert.equal(loaded.artifacts[0].content.text,'durable');}finally{await rm(dir,{recursive:true,force:true});}
});
test('import rejects forged format/date claims and resumes unpublished staged objects after interruption',async()=>{
 const {hash}=await import('../../service/launch/structural-index.js');const store=new MemoryLaunchStore(),s=new CgitService({store}),repo=await create(s);let head=null;
 for(let n=0;n<17;n++)head=(await s.commitArtifact(actor,{repoId:repo.id,expectedHead:head,artifacts:[artifact(String(n))]})).commit.hash;
 const snapshot=(await s.handle('GET',`/api/cgit/repos/${repo.id}/export`,{},actor)).body;
 const forged=structuredClone(snapshot);forged.repository.gitWireProtocol=true;forged.repository.createdAt='yesterday';forged.contentHash=hash({format:forged.format,repository:forged.repository,commits:forged.commits,blobs:forged.blobs});await assert.rejects(s.handle('POST','/api/cgit/import',{snapshot:forged},actor),{code:'invalid_import'});
 const before=await store.list(actor.id,{prefix:'cgit/',limit:200}),original=store.commit.bind(store);let stageBatches=0;
 store.commit=async(scope,changes,options)=>{if(changes.some(c=>c.key.startsWith('cgit/object/')&&!c.key.startsWith(`cgit/object/${repo.id}/`)&&c.value!==null)&&++stageBatches===2)throw Object.assign(Error('simulated interruption'),{status:503,code:'interrupted'});return original(scope,changes,options);};
 await assert.rejects(s.handle('POST','/api/cgit/import',{snapshot},actor),{code:'interrupted'});
 assert.equal((await store.list(actor.id,{prefix:'cgit/repo/',limit:200})).length,1);
 const resumed=(await s.handle('POST','/api/cgit/import',{snapshot},actor)).body.repository;assert.equal(resumed.branches.main,head);assert.equal((await store.list(actor.id,{prefix:'cgit/object/',limit:200})).length,68);
});
test('restore retries after a hard interruption reuse staged objects across fresh service instances',async()=>{
 const store=new MemoryLaunchStore(),s=new CgitService({store}),repo=await create(s);let head=null;
 for(let n=0;n<17;n++)head=(await s.commitArtifact(actor,{repoId:repo.id,expectedHead:head,artifacts:[artifact(`recovery-${n}`)]})).commit.hash;
 const snapshot=(await s.handle('GET',`/api/cgit/repos/${repo.id}/export`,{},actor)).body,original=store.commit.bind(store);let stages=0,crashed=false;
 store.commit=async(scope,changes,options)=>{const staged=changes.some(c=>c.key.startsWith('cgit/object/')&&!c.key.startsWith(`cgit/object/${repo.id}/`));if(staged&&(crashed||++stages===2)){crashed=true;throw Object.assign(Error('process unavailable'),{status:503});}return original(scope,changes,options);};
 await assert.rejects(s.handle('POST','/api/cgit/import',{snapshot},actor),{status:503});assert.equal((await store.list(actor.id,{prefix:'cgit/repo/',limit:200})).length,1);
 store.commit=original;const fresh=new CgitService({store});const restored=(await fresh.handle('POST','/api/cgit/import',{snapshot},actor)).body.repository;
 assert.equal(restored.branches.main,head);assert.equal((await store.list(actor.id,{prefix:'cgit/object/',limit:200})).length,68);
});
test('concurrent restores cannot delete another importer immutable objects',async()=>{
 const s=setup(),repo=await create(s);let head=null;for(let n=0;n<17;n++)head=(await s.commitArtifact(actor,{repoId:repo.id,expectedHead:head,artifacts:[artifact(`concurrent-${n}`)]})).commit.hash;
 const snapshot=(await s.handle('GET',`/api/cgit/repos/${repo.id}/export`,{},actor)).body;
 const results=await Promise.allSettled([s.handle('POST','/api/cgit/import',{snapshot},actor),s.handle('POST','/api/cgit/import',{snapshot},actor)]),restored=results.find(r=>r.status==='fulfilled');assert.ok(restored);
 const exported=(await s.handle('GET',`/api/cgit/repos/${restored.value.body.repository.id}/export`,{},actor)).body;assert.deepEqual(exported.commits,snapshot.commits);assert.deepEqual(exported.blobs,snapshot.blobs);
});
test('deletion blocks restore publication until immutable cleanup completes and can resume',async()=>{
 const store=new MemoryLaunchStore(),s=new CgitService({store}),repo=await create(s);await s.commitArtifact(actor,{repoId:repo.id,expectedHead:null,artifacts:[artifact()]});const snapshot=(await s.handle('GET',`/api/cgit/repos/${repo.id}/export`,{},actor)).body;
 const restored=(await s.handle('POST','/api/cgit/import',{snapshot},actor)).body.repository;const original=store.commit.bind(store);let release,entered;const wait=new Promise(r=>release=r),barrier=new Promise(r=>entered=r);
 store.commit=async(scope,changes,options)=>{if(changes.some(c=>c.key.startsWith(`cgit/object/${restored.id}/`)&&c.value===null)){entered();await wait;}return original(scope,changes,options);};
 const deletion=s.handle('POST',`/api/cgit/repos/${restored.id}/delete`,{confirm:true},actor);await barrier;
 const [during]=await Promise.allSettled([s.handle('POST','/api/cgit/import',{snapshot},actor)]);release();await deletion;
 assert.equal(during.status,'rejected');assert.equal(during.reason.code,'repository_deleting');
 const recovered=(await s.handle('POST','/api/cgit/import',{snapshot},actor)).body.repository;assert.equal((await s.handle('GET',`/api/cgit/repos/${recovered.id}`,{},actor)).body.artifacts.length,1);
});
