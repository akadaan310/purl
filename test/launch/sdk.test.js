import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PurlLaunchClient } from '../../sdk/launch.js';
import { MemoryLaunchStore } from '../../service/launch/store.js';
import { createLaunchApplication } from '../../service/launch/application.js';
import { createLaunchServer } from '../../service/launch/http.js';

test('fresh SDK reconstructs a URL-only mission and compiles, runs, publishes and checkpoints its own fork',async t=>{
 const app=createLaunchApplication({store:new MemoryLaunchStore(),env:{NODE_ENV:'test',PURL_PRODUCT:'purls',PURL_BASE_URL:'http://127.0.0.1:0',PURL_IDENTITY_ALLOW_HTTP:'true',PURL_IDENTITY_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')}}),server=createLaunchServer({app});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base=`http://127.0.0.1:${server.address().port}`;app.configureOrigin(base);
 await app.resources.seedMission({id:'consumer-launch-mission',title:'Executable mission',source:'input number | math.add 7',tests:[{input:3,expected:10}],state:{documents:[{name:'CODEX_MASTER.md',markdown:'Continue using supported native operations'}],next:['Fork, build, run, inspect and checkpoint']}});
 const sdk=new PurlLaunchClient(base),cold=await sdk.reconstruct(`${base}/p/consumer-launch-mission`);assert.equal(cold.continuity.state.documents[0].name,'CODEX_MASTER.md');assert.equal(cold.permitted_operations.length,0);
 await sdk.preview({label:'SDK initial preview'});await sdk.preview({label:'SDK cold continuation'});await sdk.request('/api/identity/config');let r=(await sdk.operation(cold.manifest.program.id,'fork',cold.manifest.program.version,{title:'SDK continuation'},'sdk-fork')).resource;
 r=(await sdk.operation(r.id,'compile',r.version)).resource;r=(await sdk.operation(r.id,'build',r.version)).resource;
 const queued=await sdk.operation(r.id,'run',r.version,{input:3},'sdk-run');assert.equal(queued.execution.status,'queued');assert.equal((await app.resources.workOnce({workerId:'sdk-worker'})).value,10);
 r=(await sdk.inspect(r.id)).resource;r=(await sdk.operation(r.id,'publish',r.version,{visibility:'public'})).resource;
 r=(await sdk.operation(r.id,'checkpoint',r.version,{summary:'SDK dogfood complete',evidence:[{execution_id:queued.execution.id}],next:['Read replay evidence']})).resource;
 const next=new PurlLaunchClient(base),recovered=await next.reconstruct(`${base}/p/${r.id}`);assert.equal(recovered.continuity.checkpoint.summary,'SDK dogfood complete');assert.equal((await next.request(recovered.manifest.links.replay)).executions[0].replayable,true);
});

test('SDK refuses cross-origin reconstruction and redirect following before leaking cookies',async()=>{
 let calls=0;const sdk=new PurlLaunchClient('https://purls.example',{fetch:async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:307,headers:{location:'https://elsewhere.example'}});}});
 await assert.rejects(sdk.reconstruct('https://elsewhere.example/p/x'),/Cross-origin/);assert.equal(calls,0);
 await assert.rejects(sdk.discover(),/Redirect/);assert.equal(calls,1);
});
