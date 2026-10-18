import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { MemoryLaunchStore } from '../../service/launch/store.js';
import { createLaunchApplication } from '../../service/launch/application.js';
import { createLaunchServer } from '../../service/launch/http.js';

async function fixture(t,product='purls'){
 const store=new MemoryLaunchStore(),env={NODE_ENV:'test',PURL_PRODUCT:product,PURL_BASE_URL:'http://127.0.0.1:0',PURL_IDENTITY_ALLOW_HTTP:'true',PURL_IDENTITY_ENCRYPTION_KEY:Buffer.alloc(32,11).toString('base64')};
 const app=createLaunchApplication({store,env}),server=createLaunchServer({app});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const url=`http://127.0.0.1:${server.address().port}`;app.configureOrigin(url);
 const call=async(path,{body,headers={},cookie,method=body===undefined?'GET':'POST'}={})=>{
  const r=await fetch(url+path,{method,headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,headers:r.headers,data};
 };
 const config=await call('/api/identity/config'),cookie=config.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const preview=await call('/api/identity/guest',{body:{label:'HTTP test preview'},cookie,headers:{origin:url,'x-csrf-token':config.data.csrf_token}});assert.equal(preview.status,200);
 const session=preview.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),csrf=preview.data.csrf_token;
 const authenticated=(path,body,extra={})=>call(path,{body,cookie:session,headers:{origin:url,'x-csrf-token':csrf,...extra}});
 return {store,app,url,call,authenticated,session,csrf};
}

test('launch discovery, catalog, native manifests and health are self-describing pure reads',async t=>{
 const {store,app,call}=await fixture(t);await app.resources.seedMission({id:'consumer-launch-mission',title:'Consumer mission',source:'input json | mission.inspect',state:{documents:[{name:'CODEX_MASTER.md',markdown:'Continue from this PURL'}],graph:{nodes:[{id:'root',dependencies:[],status:'NOT_RUN'}]}}});const before=JSON.stringify(store.state);
 const health=await call('/healthz');assert.equal(health.status,200);assert.equal(health.data.product,'purls');assert.match(health.data.persistence,/memory/);
 const config=await call('/api/config');assert.equal(config.data.product,'purls');assert.equal(config.data.identity.available,false);
 const provider=await call('/api/identity/provider/config');assert.equal(provider.status,200);assert.equal(provider.data.available,false);assert.ok(provider.data.blockers.length);
 const runtime=await call('/api/runtime');assert.equal(runtime.data.untrusted_authored_execution,false);assert.equal(runtime.data.limits.row_bytes,262144);
 const catalog=await call('/api/catalog');assert.equal(catalog.status,200);assert.ok(catalog.data.catalog.length>=40);
 const purl=await call('/p/consumer-launch-mission',{headers:{accept:'application/purl+json'}});assert.equal(purl.data.program.id,'consumer-launch-mission');assert.match(purl.data.links.continuity,/\/api\/resources\//);
 for(const name of ['executions','artifacts','builds','releases']){assert.equal(typeof purl.data.links[name],'string');const related=await call(new URL(purl.data.links[name]).pathname);assert.equal(related.status,200);assert.ok(Array.isArray(related.data.items));}
 const compiler=await call('/api/compiler');assert.equal(compiler.status,200);assert.equal(compiler.data.operations[0].method,'POST');assert.equal(compiler.data.operations[0].href,app.resources.url('/api/compiler'));
 const wellknown=await call('/.well-known/purl');assert.equal(wellknown.data.name,'PURLs');assert.ok(wellknown.data.endpoints.identity);
 assert.equal(JSON.stringify(store.state),before);
});

test('browser cookie mutation needs exact Origin and session CSRF; explicit bad bearer never becomes anonymous',async t=>{
 const {call,url,session,authenticated}=await fixture(t);
 assert.equal((await call('/api/memory/create',{body:{text:'A secret',kind:'assertion'},cookie:session,headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await call('/api/memory/create',{body:{text:'A secret'},cookie:session,headers:{origin:url}})).status,403);
 const made=await authenticated('/api/memory/create',{text:'Private fact',kind:'user_assertion'});assert.equal(made.status,201);
 assert.equal((await call('/api/identity/me',{headers:{authorization:'Bearer invalid'}})).status,401);
 const loginConfig=await call('/api/identity/config');assert.equal(loginConfig.data.available,false);assert.ok(loginConfig.data.blockers.length);
});

test('native queued program persists execution through a freshly constructed application',async t=>{
 const {store,app,authenticated,call,session,url}=await fixture(t);
 let r=(await authenticated('/api/resources',{title:'HTTP arithmetic',source:'input number | math.add 2 | math.multiply 3',tests:[{input:4,expected:18}]})).data.resource;
 r=(await authenticated(`/api/resources/${r.id}/build`,{expected_version:r.version})).data.resource;
 const queued=await authenticated(`/api/resources/${r.id}/run`,{expected_version:r.version,input:4});assert.equal(queued.status,202);
 const restarted=createLaunchApplication({store,env:{NODE_ENV:'test',PURL_PRODUCT:'purls',PURL_BASE_URL:url,PURL_IDENTITY_ALLOW_HTTP:'true',PURL_IDENTITY_ENCRYPTION_KEY:Buffer.alloc(32,11).toString('base64')}});assert.equal((await restarted.resources.workOnce({workerId:'http-restarted-worker'})).value,18);
 const execution=await call(`/api/resources/${r.id}/executions/${queued.data.execution.id}`,{cookie:session});assert.equal(execution.data.execution.status,'succeeded');assert.equal(execution.data.execution.value,18);
 const replay=await call(`/api/resources/${r.id}/replay`,{cookie:session});assert.equal(replay.data.valid,true);assert.equal(replay.data.executions[0].replayable,true);
});

test('HTTP rejects credential URLs, malformed payloads and arbitrary file paths',async t=>{
 const {call}=await fixture(t);assert.equal((await call('/api/catalog?access_token=secret')).status,400);
 assert.equal((await call('/api/catalog/x/run',{body:'{broken'})).status,400);
 assert.equal((await call('/api/compiler',{body:{source:'x'.repeat(300000)}})).status,413);
 assert.equal((await call('/consumer/not-real.js')).status,404);
 const landing=await call('/');assert.equal(landing.status,200);assert.match(landing.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(landing.data,/Claim your PURL|PURLs/);
});

test('HTTP rejects JSON values incompatible with durable storage before domain writes',async t=>{
 const {authenticated,store}=await fixture(t);const before=JSON.stringify(store.state);
 for(const payload of [{text:'bad\u0000value',kind:'user_assertion'},{text:'bad\ud800value',kind:'user_assertion'}]){
  const result=await authenticated('/api/memory/create',payload);assert.equal(result.status,400);assert.equal(result.data.error.code,'storage_json');
 }
 let deep={};for(let i=0;i<100;i++)deep={child:deep};
 assert.equal((await authenticated('/api/compiler',{source:deep})).status,400);
 assert.equal(JSON.stringify(store.state),before);
});

test('CGIT is independently usable in its own unverified bounded preview',async t=>{
 const {call,authenticated,session}=await fixture(t,'cgit');const config=await call('/api/config');assert.equal(config.data.product,'cgit');
 const created=await authenticated('/api/cgit/repos/create',{name:'Independent repository'});assert.equal(created.status,201);assert.equal(created.data.repository.name,'Independent repository');
 const listed=await call('/api/cgit/repos',{cookie:session});assert.equal(listed.status,200);assert.deepEqual(listed.data.repositories.map(r=>r.id),[created.data.repository.id]);assert.equal((await call('/')).status,200);
 assert.equal((await call(`/api/cgit/repos/${created.data.repository.id}?branch=absent`,{cookie:session})).status,404);
 assert.equal((await call('/account')).status,200);
 const catalog=await call('/api/catalog'),entry=catalog.data.catalog.find(x=>x.status==='working');
 const manifest=await call(`/p/${entry.id}`,{cookie:session,headers:{accept:'application/purl+json'}});
 assert.equal(manifest.data.operations[0].available,false);assert.deepEqual(manifest.data.authority.rights,['read']);
});
