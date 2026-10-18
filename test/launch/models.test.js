import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { ModelGateway } from '../../service/launch/models.js';
import { MemoryLaunchStore } from '../../service/launch/store.js';

const actor = { id: 'owner-one', kind: 'human', verified: true, product: 'purls', scopes: ['models:read','models:write','chat:write','constellations:write'] };
const model = 'test/declared';
const env = { OPENROUTER_MODEL_CATALOG_JSON: JSON.stringify([{id:model, promptMicroUSDPerToken:1, completionMicroUSDPerToken:2}]), MODEL_DAILY_BUDGET_MICROUSD:'20000', MODEL_CALL_BUDGET_MICROUSD:'12000', MODEL_DAILY_CALL_LIMIT:'20' };
async function setup(t, responder) {
 const histories=[];
 const server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;histories.push({body:JSON.parse(raw),authorization:req.headers.authorization});await responder?.(req,res,histories);if(!res.headersSent){res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'generation',choices:[{message:{content:'Actual HTTP fixture answer'}}],usage:{prompt_tokens:20,completion_tokens:10,cost:0.00004}}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const store=new MemoryLaunchStore();const encryptionKey=randomBytes(32).toString('base64');
 const transport=(url,init)=>{assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');return fetch(`http://127.0.0.1:${server.address().port}`,init);};
 const gateway=new ModelGateway({store,encryptionKey,env,fetch:transport});
 const key=(await gateway.handle('POST','/api/models/keys',{provider:'openrouter',key:'private-key-do-not-echo',label:'mine'},actor)).body.key;
 const request={model,keyId:key.id,messages:[{role:'user',content:'Question'}],max_tokens:100,idempotencyKey:'request-one'};
 return {gateway,store,key,request,histories,encryptionKey,transport};
}

test('hosted unavailable without operator key; metadata GET is pure',async()=>{
 const store=new MemoryLaunchStore();const gateway=new ModelGateway({store,env:{}});
 const out=await gateway.handle('GET','/api/models',{},actor);
 assert.equal(out.body.hostedAvailable,false);assert.equal(out.body.pricing.collectionEnabled,false);
 assert.deepEqual(await store.list(actor.id,{prefix:'model-',limit:200}),[]);
 await assert.rejects(gateway.complete(actor,{model:'unknown',messages:[{role:'user',content:'hello'}],idempotencyKey:'x'}),e=>e.code==='MODEL_UNAVAILABLE');
});
test('encrypted BYOK, redacted listing, real HTTP usage reconciliation and idempotent billing',async(t)=>{
 const s=await setup(t);const records=await s.store.list(actor.id,{prefix:'model-key/',limit:200});
 assert.ok(!JSON.stringify(records).includes('private-key-do-not-echo'));
 assert.ok(!JSON.stringify((await s.gateway.handle('GET','/api/models/keys',{},actor)).body).includes('ciphertext'));
 const first=await s.gateway.complete(actor,s.request);const second=await s.gateway.complete(actor,s.request);
 assert.deepEqual(first,second);assert.equal(first.cost.actualMicroUSD,40);assert.equal(first.usage.promptTokens,20);assert.equal(s.histories.length,1);
 assert.equal(s.histories[0].authorization,'Bearer private-key-do-not-echo');
 const quota=(await s.gateway.handle('GET','/api/models',{},actor)).body.quota;assert.equal(quota.chargedMicroUSD,40);assert.equal(quota.reservedMicroUSD,0);
 await assert.rejects(s.gateway.complete(actor,{...s.request,messages:[{role:'user',content:'changed'}]}),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('private scopes, explicit selected context, revocation and fixed provider prevent leakage',async(t)=>{
 const s=await setup(t);const stranger={...actor,id:'owner-two'};
 await assert.rejects(s.gateway.complete(stranger,s.request),e=>e.code==='KEY_UNAVAILABLE');
 await assert.rejects(s.gateway.complete(actor,{...s.request,selectedContext:[{id:'memory-1',text:'private memory'}]}),e=>e.code==='CONSENT_REQUIRED');
 await assert.rejects(s.gateway.complete(actor,{...s.request,url:'https://attacker.example'}),e=>e.code==='INVALID_REQUEST');
 await assert.rejects(s.gateway.complete({...actor,scopes:[]},s.request),e=>e.status===403);
 await s.gateway.handle('POST',`/api/models/keys/${s.key.id}/revoke`,{},actor);
 await assert.rejects(s.gateway.complete(actor,s.request),e=>e.code==='KEY_UNAVAILABLE');assert.equal(s.histories.length,0);
});
test('concurrent same idempotency key executes one request and quota reservations prevent overspend',async(t)=>{
 const s=await setup(t,async()=>{await new Promise(r=>setTimeout(r,20));});
 const many=await Promise.allSettled(Array.from({length:8},()=>s.gateway.complete(actor,s.request)));
 assert.equal(many.filter(x=>x.status==='fulfilled').length>=1,true);assert.equal(s.histories.length,1);
 assert.ok(many.filter(x=>x.status==='rejected').every(x=>['CALL_IN_PROGRESS'].includes(x.reason.code)));
 const constrained=new ModelGateway({store:s.store,encryptionKey:s.encryptionKey,env:{...env,MODEL_DAILY_BUDGET_MICROUSD:'300'},fetch:s.transport});
 await assert.rejects(constrained.complete(actor,{...s.request,idempotencyKey:'too-much'}),e=>e.code==='QUOTA_EXCEEDED');
});
test('timeout and missing usage hold conservative reservation and never repeat ambiguous requests',async(t)=>{
 const s=await setup(t,async(req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'Unknown billed usage'}}]}));});
 const out=await s.gateway.complete(actor,s.request);assert.equal(out.cost.actualMicroUSD,null);assert.equal(out.receipt.status,'usage_unknown');
 await s.gateway.complete(actor,s.request);assert.equal(s.histories.length,1);
 const timeoutGateway=new ModelGateway({store:s.store,encryptionKey:s.encryptionKey,env,fetch:async()=>{throw new Error('secret-upstream');}});
 await assert.rejects(timeoutGateway.complete(actor,{...s.request,idempotencyKey:'timeout'}),e=>e.code==='PROVIDER_AMBIGUOUS'&&!e.message.includes('secret'));
 await assert.rejects(timeoutGateway.complete(actor,{...s.request,idempotencyKey:'timeout'}),e=>e.code==='PROVIDER_AMBIGUOUS');
 const quota=(await s.gateway.handle('GET','/api/models',{},actor)).body.quota;assert.ok(quota.reservedMicroUSD>0);
});
test('known rejected request refunds reservation and persists bounded owner-private chat thread',async(t)=>{
 const s=await setup(t);const out=await s.gateway.handle('POST','/api/chat',{...s.request,selectedContext:[{id:'m',text:'selected memory'}],consent:true},actor);
 assert.equal(out.status,200);assert.ok(out.body.threadId);
 const thread=await s.gateway.handle('GET',`/api/chat/threads/${out.body.threadId}`,{},actor);assert.equal(thread.body.thread.messages[0].content,'Question');
 await assert.rejects(s.gateway.handle('GET',`/api/chat/threads/${out.body.threadId}`,{},{...actor,id:'stranger'}),e=>e.status===404);
 assert.ok(s.histories[0].body.messages.some(x=>x.content.includes('selected memory')));
 const rejected=new ModelGateway({store:s.store,encryptionKey:s.encryptionKey,env,fetch:async()=>new Response('{}',{status:401})});
 await assert.rejects(rejected.complete(actor,{...s.request,idempotencyKey:'rejected'}),e=>e.code==='PROVIDER_REJECTED');
 assert.equal((await rejected.handle('GET','/api/models',{},actor)).body.quota.reservedMicroUSD,0);
});

test('provider request enforces published token price ceiling and denies provider data collection',async(t)=>{
 const s=await setup(t);await s.gateway.complete(actor,s.request);
 assert.deepEqual(s.histories[0].body.provider.max_price,{prompt:1,completion:2});
 assert.equal(s.histories[0].body.provider.data_collection,'deny');assert.equal(s.histories[0].body.provider.require_parameters,true);
});
test('simultaneous different calls cannot exceed daily reserved budget',async(t)=>{
 let release;const gate=new Promise(r=>release=r);const s=await setup(t,async()=>gate);
 const limited=new ModelGateway({store:s.store,encryptionKey:s.encryptionKey,env:{...env,MODEL_DAILY_BUDGET_MICROUSD:'350'},fetch:s.transport});
 const requests=Array.from({length:8},(_,i)=>limited.complete(actor,{...s.request,idempotencyKey:`race-${i}`}));
 const waiting=Promise.allSettled(requests);await new Promise(r=>setTimeout(r,20));release();const results=await waiting;
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(s.histories.length,1);assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='QUOTA_EXCEEDED'));
});

test('real HTTP timeout retains reservation and restarting gateway cannot execute that request again',async(t)=>{
 const s=await setup(t,async()=>new Promise(r=>setTimeout(r,80)));
 const timed=new ModelGateway({store:s.store,encryptionKey:s.encryptionKey,env:{...env,MODEL_TIMEOUT_MS:'10'},fetch:s.transport});
 await assert.rejects(timed.complete(actor,s.request),e=>e.code==='PROVIDER_AMBIGUOUS');
 const restarted=new ModelGateway({store:s.store,encryptionKey:s.encryptionKey,env,fetch:s.transport});await assert.rejects(restarted.complete(actor,s.request),e=>e.code==='PROVIDER_AMBIGUOUS');assert.equal(s.histories.length,1);
 assert.ok((await restarted.handle('GET','/api/models',{},actor)).body.quota.reservedMicroUSD>0);
});
test('revocation committed during preparation prevents a later reservation or provider call',async(t)=>{
 const s=await setup(t);const credential=s.gateway.credential.bind(s.gateway);
 s.gateway.credential=async(...args)=>{const out=await credential(...args);await s.gateway.handle('POST',`/api/models/keys/${s.key.id}/revoke`,{},actor);return out;};
 await assert.rejects(s.gateway.complete(actor,s.request),e=>e.code==='KEY_UNAVAILABLE');assert.equal(s.histories.length,0);
});

test('unpersistable provider Unicode and oversized escaped text settle known cost into terminal receipts',async(t)=>{
 for(const content of ['answer\u0000end','answer\ud800end','\u0001'.repeat(16384)]){
  const s=await setup(t,async(req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content}}],usage:{prompt_tokens:20,completion_tokens:10,cost:0.00004}}));});
  for(let attempt=0;attempt<2;attempt++)await assert.rejects(s.gateway.complete(actor,s.request),e=>e.code==='PROVIDER_OUTPUT_REJECTED'&&e.receipt.status==='output_rejected'&&e.cost.actualMicroUSD===40);
  assert.equal(s.histories.length,1);const call=(await s.store.list(actor.id,{prefix:'model-call/',limit:200}))[0].value;assert.equal(call.status,'output_rejected');assert.equal(call.result.text,null);assert.equal(call.result.outputError.sha256.length,64);
  const quota=await s.gateway.quota(actor);assert.equal(quota.chargedMicroUSD,40);assert.equal(quota.reservedMicroUSD,0);
 }
});
test('concurrent provider-key creation and duplicate revocation maintain atomic active and total counts',async(t)=>{
 const s=await setup(t);const results=await Promise.allSettled(Array.from({length:25},(_,i)=>s.gateway.handle('POST','/api/models/keys',{provider:'openrouter',key:'fixture-extra-secret',label:String(i)},actor)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,19);assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='KEY_LIMIT'));
 await Promise.all(Array.from({length:8},()=>s.gateway.handle('POST',`/api/models/keys/${s.key.id}/revoke`,{},actor)));
 const index=(await s.store.read(actor.id,'model-key-quota')).value;assert.equal(index.total,20);assert.equal(index.active,19);
 assert.equal((await s.gateway.handle('GET','/api/models/keys',{},actor)).body.keys.length,20);
});
test('public models metadata discloses availability and prices without private usage or keys',async(t)=>{
 const s=await setup(t);await s.gateway.complete(actor,s.request);
 for(const publicActor of [null,{...actor,kind:'guest',scopes:[]}]){const out=await s.gateway.handle('GET','/api/models',{},publicActor);assert.equal(out.status,200);assert.equal(out.body.quota,null);assert.equal(out.body.available,false);assert.equal(out.body.models.length,1);assert.ok(!JSON.stringify(out.body).includes(s.key.id));}
});

test('pre-dispatch storage reservation preserves known-cost settlement when other writes fill tenant quota',async(t)=>{
 let s;s=await setup(t,async()=>{
  const rows=await s.store.list(actor.id,{prefix:'',limit:200});let remaining=10*1024*1024-rows.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r.value)),0);let index=0;
  while(remaining>20){const size=Math.min(250000,remaining);const value={pad:' '.repeat(size-Buffer.byteLength(JSON.stringify({pad:''})))};await s.store.commit(actor.id,[{key:`fill/${index++}`,expectedVersion:0,value}]);remaining-=size;}
 });
 const out=await s.gateway.complete(actor,s.request);assert.equal(out.cost.actualMicroUSD,40);assert.equal((await s.gateway.quota(actor)).chargedMicroUSD,40);assert.equal((await s.gateway.quota(actor)).reservedMicroUSD,0);assert.equal(s.histories.length,1);
});

test('deeply nested non-string provider content rejects terminally without blocking known billing',async(t)=>{
 const body='{"choices":[{"message":{"content":'+'['.repeat(10000)+'0'+']'.repeat(10000)+'}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"cost":0.00004}}';
 const s=await setup(t,async(req,res)=>{res.setHeader('content-type','application/json');res.end(body);});
 for(let attempt=0;attempt<2;attempt++)await assert.rejects(s.gateway.complete(actor,s.request),e=>e.code==='PROVIDER_OUTPUT_REJECTED'&&e.receipt.status==='output_rejected'&&e.cost.actualMicroUSD===40);
 assert.equal(s.histories.length,1);const call=(await s.store.list(actor.id,{prefix:'model-call/',limit:200}))[0].value;
 assert.equal(call.status,'output_rejected');assert.equal(call.result.outputError.hashSource,'provider-response-bytes');assert.equal(call.result.outputError.responseBytes,20104);assert.equal(call.result.outputError.sha256.length,64);
 assert.equal((await s.gateway.quota(actor)).chargedMicroUSD,40);assert.equal((await s.gateway.quota(actor)).reservedMicroUSD,0);
});
