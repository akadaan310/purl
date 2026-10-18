import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as api from '../../service/launch/store.js';

const change = (key, expectedVersion, value) => ({ key, expectedVersion, value });
const errorCode = code => error => error.code === code && Number.isInteger(error.status);

test('store exports the required adapters', () => {
  for (const name of ['MemoryLaunchStore','FileLaunchStore','SupabaseLaunchStore','createLaunchStore']) assert.equal(typeof api[name], 'function');
});
for (const adapter of ['memory', 'file', ...(process.env.PURL_TEST_LAUNCH_URL ? ['supabase'] : [])]) {
  test(`${adapter}: atomic competing CAS, isolation, immutable reads and tombstone versions`, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'launch-store-')); t.after(() => rm(dir, { recursive:true, force:true }));
    const store = adapter === 'memory' ? new api.MemoryLaunchStore() : adapter === 'file' ? new api.FileLaunchStore(join(dir, 'launch.json')) : new api.SupabaseLaunchStore({url:process.env.PURL_TEST_LAUNCH_URL,serviceRoleKey:process.env.PURL_TEST_LAUNCH_KEY});
    if(adapter === 'supabase') for(const scope of ['a','b','c']) await store.erase(scope);
    assert.equal(await store.read('a','one'), null);
    const attempts = await Promise.allSettled([store.commit('a',[change('one',0,{n:1})]),store.commit('a',[change('one',0,{n:2})])]);
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(attempts.find(x => x.status === 'rejected').reason.code,'version_conflict');
    const first = await store.read('a','one'); first.value.n = 9;
    assert.notEqual((await store.read('a','one')).value.n,9);
    assert.equal(await store.read('b','one'),null);
    await assert.rejects(store.commit('a',[change('two',0,{}),change('one',0,{})]),errorCode('version_conflict'));
    assert.equal(await store.read('a','two'),null);
    await store.commit('a',[change('one',1,null)]);
    assert.deepEqual(await store.read('a','one'),{key:'one',version:2,value:null});
    await assert.rejects(store.commit('a',[change('one',0,{})]),errorCode('version_conflict'));
    await store.commit('a',[change('one',2,{ok:true})]);
    if(adapter === 'file') assert.deepEqual(await new api.FileLaunchStore(join(dir,'launch.json')).read('a','one'),{key:'one',version:3,value:{ok:true}});
  });
  test(`${adapter}: payload-bound retry and global handle reservation are atomic and erase releases all aliases`, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'launch-store-')); t.after(() => rm(dir,{recursive:true,force:true}));
    const store = adapter === 'memory' ? new api.MemoryLaunchStore() : adapter === 'file' ? new api.FileLaunchStore(join(dir,'launch.json')) : new api.SupabaseLaunchStore({url:process.env.PURL_TEST_LAUNCH_URL,serviceRoleKey:process.env.PURL_TEST_LAUNCH_KEY});
    if(adapter === 'supabase') for(const scope of ['a','b','c']) await store.erase(scope);
    const changes = [change('profile',0,{handle:'pearl'})], options = {idempotencyKey:'claim',payloadHash:'hash',handle:{name:'pearl'}};
    const first = await store.commit('a',changes,options);
    assert.deepEqual(await store.commit('a',changes,options),{...first,duplicate:true});
    await assert.rejects(store.commit('a',[change('profile',0,{handle:'other'})],options),errorCode('idempotency_conflict'));
    await assert.rejects(store.commit('a',changes,{...options,payloadHash:'other'}),errorCode('idempotency_conflict'));
    await assert.rejects(store.commit('b',[change('private',0,{})],{handle:{name:'pearl'}}),errorCode('handle_conflict'));
    assert.equal(await store.read('b','private'),null);
    await store.commit('a',[change('profile',1,{handle:'new'})],{handle:{name:'new'}});
    assert.deepEqual(await store.resolveHandle('pearl'),{subject:'a',handle:'new'});
    const contested = await Promise.allSettled(['b','c'].map(scope=>store.commit(scope,[change('p',0,{})],{handle:{name:'contested'}})));
    assert.equal(contested.filter(x=>x.status === 'fulfilled').length,1);
    await store.erase('a');
    assert.equal(await store.read('a','profile'),null); assert.equal(await store.resolveHandle('pearl'),null); assert.equal(await store.resolveHandle('new'),null);
    await store.commit('b',[change('profile',0,{})],{handle:{name:'pearl'}});
  });
}
test('lists and global status scans are bounded, exclude tombstones and remain pure', async()=>{
  const store = new api.MemoryLaunchStore();
  await store.commit('a',[change('job:one',0,{status:'pending'}),change('job:two',0,{status:'done'}),change('deleted',0,null)]);
  await store.commit('b',[change('job:one',0,{status:'pending'})]);
  assert.deepEqual((await store.list('a',{prefix:'job:',limit:1})).map(x=>x.key),['job:one']);
  assert.deepEqual((await store.scan({prefix:'job:',statuses:['pending'],limit:200})).map(x=>x.scope),['a','b']);
  assert.equal((await store.list('a',{})).length,2);
  await assert.rejects(store.list('a',{limit:201}),errorCode('invalid_input'));
  await assert.rejects(store.scan({limit:Infinity}),errorCode('invalid_input'));
  const next=await store.commit('a',[change('next',0,{})]); assert.equal(next.revision,2);
});
test('rejects malformed or unbounded data before mutating and enforces tenant quota', async()=>{
  const store = new api.MemoryLaunchStore();
  for(const value of [{n:NaN},{n:undefined},JSON.parse('{"__proto__":{}}'),new Date(),{constructor:'bad'}]) await assert.rejects(store.commit('a',[change('invalid',0,value)]),errorCode('invalid_input'));
  await assert.rejects(store.commit('a',Array.from({length:33},(_,i)=>change(`x${i}`,0,{}))),errorCode('invalid_input'));
  await assert.rejects(store.commit('a',[change('x',0,{}),change('x',0,{})]),errorCode('invalid_input'));
  await assert.rejects(store.commit('a',[change('big',0,'x'.repeat(256*1024))]),errorCode('row_limit'));
  const value='x'.repeat(256*1024-2);
  await store.commit('a',Array.from({length:32},(_,i)=>change(`q${i}`,0,value)));
  await store.commit('a',Array.from({length:8},(_,i)=>change(`q${32+i}`,0,value)));
  await assert.rejects(store.commit('a',[change('overflow',0,1)]),errorCode('tenant_quota'));
  assert.equal(await store.read('a','overflow'),null);
  await store.commit('a',[change('q0',1,null),change('overflow',0,1)]);
});
test('development file reads never create files and production factory fails closed',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'launch-pure-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'launch.json'),store=new api.FileLaunchStore(path);
  await store.read('a','x'); await store.list('a',{}); await store.scan({});await store.resolveHandle('unknown');
  await assert.rejects(readFile(path),{code:'ENOENT'});
  for(const mode of ['memory','file']) assert.throws(()=>api.createLaunchStore({NODE_ENV:'production',PURL_LAUNCH_PERSISTENCE:mode}));
  assert.throws(()=>api.createLaunchStore({NODE_ENV:'production'}));
  assert.ok(api.createLaunchStore({PURL_LAUNCH_PERSISTENCE:'memory'}) instanceof api.MemoryLaunchStore);
});

test('dictionary-shaped identifiers cannot resolve inherited prototype members',async()=>{
  const store=new api.MemoryLaunchStore();
  assert.equal(await store.read('toString','valueOf'),null);
  await store.commit('toString',[change('valueOf',0,{ok:true})],{idempotencyKey:'hasOwnProperty',payloadHash:'hash'});
  assert.deepEqual((await store.read('toString','valueOf')).value,{ok:true});
  assert.equal((await store.commit('toString',[change('valueOf',0,{ok:true})],{idempotencyKey:'hasOwnProperty',payloadHash:'hash'})).duplicate,true);
});
test('strict JSON validation rejects accessors, symbol properties, unsupported Unicode and overflowing versions',async()=>{
  const store=new api.MemoryLaunchStore();let accessed=false;
  const array=[];Object.defineProperty(array,'0',{get(){accessed=true;return 'side effect';},enumerable:true});
  const symbolArray=[1];symbolArray[Symbol('hidden')]=true;
  for(const value of [array,symbolArray,'\u0000','\ud800']) await assert.rejects(store.commit('a',[change('bad',0,value)]),errorCode('invalid_input'));
  assert.equal(accessed,false);
  await assert.rejects(store.commit('a',[change('bad',Number.MAX_SAFE_INTEGER,{})]),errorCode('invalid_input'));
});

test('record tombstones and idempotency counts have hard per-scope bounds',async()=>{
  const store=new api.MemoryLaunchStore();
  for(let start=0;start<4096;start+=32) await store.commit('records',Array.from({length:32},(_,i)=>change(`t${start+i}`,0,null)));
  await assert.rejects(store.commit('records',[change('extra',0,null)]),errorCode('metadata_quota'));
  assert.equal(await store.read('records','extra'),null);
  await store.commit('records',[change('t0',1,null)]);
  for(let i=0;i<1024;i++) await store.commit('retries',[change('counter',i,i)],{idempotencyKey:`r${i}`,payloadHash:`p${i}`});
  await assert.rejects(store.commit('retries',[change('counter',1024,1024)],{idempotencyKey:'overflow',payloadHash:'p'}),errorCode('metadata_quota'));
  assert.equal((await store.read('retries','counter')).version,1024);
  assert.equal((await store.commit('retries',[change('counter',0,0)],{idempotencyKey:'r0',payloadHash:'p0'})).duplicate,true);
});
for(const adapter of ['memory','file',...(process.env.PURL_TEST_LAUNCH_URL?['supabase']:[])]) test(`${adapter}: retry metadata byte quota fails atomically`,async t=>{
  const dir=await mkdtemp(join(tmpdir(),'launch-meta-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=adapter==='memory'?new api.MemoryLaunchStore():adapter==='file'?new api.FileLaunchStore(join(dir,'launch.json')):new api.SupabaseLaunchStore({url:process.env.PURL_TEST_LAUNCH_URL,serviceRoleKey:process.env.PURL_TEST_LAUNCH_KEY});
  if(adapter==='supabase') await store.erase('retry-bytes');
  const changes=Array.from({length:9},(_,i)=>change(`large${i}`,0,'x'.repeat(256*1024-2)));
  await assert.rejects(store.commit('retry-bytes',changes,{idempotencyKey:'large',payloadHash:'payload',handle:{name:'quota-handle'}}),errorCode('metadata_quota'));
  assert.equal(await store.read('retry-bytes','large0'),null); assert.equal(await store.resolveHandle('quota-handle'),null);
  await store.commit('retry-bytes',[change('small',0,true)],{idempotencyKey:'small',payloadHash:'payload'});
});

test('retained aliases are bounded and an existing alias remains usable at capacity',async()=>{
  const store=new api.MemoryLaunchStore();
  for(let i=0;i<1024;i++) await store.commit('aliases',[change('profile',i,{})],{handle:{name:`alias${i}`}});
  await assert.rejects(store.commit('aliases',[change('profile',1024,{})],{handle:{name:'overflow-alias'}}),errorCode('metadata_quota'));
  assert.equal(await store.resolveHandle('overflow-alias'),null);
  assert.equal((await store.resolveHandle('alias0')).handle,'alias1023');
  await store.commit('aliases',[change('profile',1024,{})],{handle:{name:'alias0'}});
});

for(const adapter of ['memory','file',...(process.env.PURL_TEST_LAUNCH_URL?['supabase']:[])]) test(`${adapter}: a large user status field does not overflow the queue index`,async t=>{
  const dir=await mkdtemp(join(tmpdir(),'launch-status-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=adapter==='memory'?new api.MemoryLaunchStore():adapter==='file'?new api.FileLaunchStore(join(dir,'launch.json')):new api.SupabaseLaunchStore({url:process.env.PURL_TEST_LAUNCH_URL,serviceRoleKey:process.env.PURL_TEST_LAUNCH_KEY});
  if(adapter==='supabase') await store.erase('long-status');
  // Low-compressibility data exceeds a btree index entry's maximum size.
  const status=Array.from({length:1000},(_,i)=>`${i.toString(36)}-${(i*7919).toString(36)}`).join('');
  await store.commit('long-status',[change('long-status/job',0,{status})]);
  assert.equal((await store.read('long-status','long-status/job')).value.status,status);
  assert.deepEqual(await store.scan({prefix:'long-status/',statuses:['pending']}),[]);
});

test('row and tenant accounting use compact PostgreSQL JSON bytes for exponent numbers',async()=>{
  const store=new api.MemoryLaunchStore();
  await assert.rejects(store.commit('numbers',[change('large',0,Array(1000).fill(1e-300))]),errorCode('row_limit'));
  await store.commit('numbers',[change('small',0,{number:1e-7})]);
  assert.equal((await store.read('numbers','small')).value.number,1e-7);
});

test('persistence configuration and malformed upstream responses expose only safe store errors',async()=>{
  assert.throws(()=>new api.SupabaseLaunchStore({url:'invalid-private-url',serviceRoleKey:'private-key'}),errorCode('store_configuration'));
  const store=new api.SupabaseLaunchStore({url:'https://example.invalid',serviceRoleKey:'private-key',fetch:async()=>new Response('private upstream detail',{status:200})});
  await assert.rejects(store.read('a','x'),error=>error.code==='store_unavailable'&&error.status===503&&!error.message.includes('private'));
});

test('all read selectors reject nonportable Unicode before Supabase transport',async()=>{
  let calls=0;const remote=new api.SupabaseLaunchStore({url:'https://example.invalid',serviceRoleKey:'private-key',fetch:async()=>{calls++;return new Response('[]');}});
  for(const store of [new api.MemoryLaunchStore(),remote])for(const options of [{prefix:'\ud800'},{statuses:['\u0000']},{statuses:['\ud800']}])await assert.rejects(store.scan(options),errorCode('invalid_input'));
  assert.equal(calls,0);
});
