import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductServer } from '../../service/http.js';

async function withServer(fn) {
  const calls = [];
  const service = { async handle(method,path,body,context) { calls.push({method,path,body,context}); return {status:200,body:{method,path,body}}; }, repository:{async read(){return {revision:1,data:{}};} } };
  const server=createProductServer({service});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try { await fn(`http://127.0.0.1:${server.address().port}`,calls); }
  finally { await new Promise(r=>server.close(r)); }
}
test('HTTP enforces JSON body, rejects URL credentials and cross-origin writes',()=>withServer(async(base,calls)=>{
  let r=await fetch(base+'/api/session',{method:'POST',body:'{}'}); assert.equal(r.status,415);
  r=await fetch(base+'/api/programs?token=secret'); assert.equal(r.status,400);
  r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.invalid'},body:'{}'}); assert.equal(r.status,403);
  assert.equal(calls.length,0);
}));
test('HTTP gives bounded errors and never forwards a credential to a static resource',()=>withServer(async(base,calls)=>{
  let r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}); assert.equal(r.status,400);
  r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:'x'.repeat(300000)})}); assert.equal(r.status,413);
  r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer safe-token'},body:'{"label":"test"}'}); assert.equal(r.status,200);
  assert.equal(calls[0].context.token,'safe-token');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'"));
  r=await fetch(base+'/healthz'); assert.equal(r.status,200); assert.equal((await r.json()).status,'ok');
}));
test('read-only program URL negotiates machine manifest without mutation',()=>withServer(async(base,calls)=>{
  const r=await fetch(base+'/p/mission-godseed',{headers:{Accept:'application/purl+json'}});
  assert.equal(r.status,200); assert.equal(calls[0].method,'GET'); assert.equal(calls[0].path,'/api/programs/mission-godseed/manifest');
}));
test('trace compilation returns a concrete hidden-state witness without writing state',()=>withServer(async(base,calls)=>{
 const response=await fetch(base+'/api/transitions/compile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:[[0,0],[0,1],[1,0],[1,1]],domain_complete:true,projection:{op:'json.get',args:{path:[0],type:'number'}},operations:[{name:'swap',operator:{op:'array.reverse'}}],trace:[[0,0],[0,1]]})});
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.ok,false);assert.equal(result.witness.reason,'successor');assert.equal(calls.length,0);
}));
