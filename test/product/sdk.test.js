import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PurlClient } from '../../sdk/client.js';

test('SDK refuses to forward bearer credentials to off-origin operation links',async()=>{
  const client=new PurlClient('http://localhost:8080',{token:'secret'});
  await assert.rejects(client.request('https://evil.invalid/steal'),/origin/i);
  assert.equal(client.token,'secret');
});
test('SDK uses response errors rather than claiming successful operations',async()=>{
  const client=new PurlClient('http://localhost:8080',{fetch:async()=>new Response(JSON.stringify({error:{code:'version-conflict',message:'stale'}}),{status:409})});
  await assert.rejects(client.get('missing'),e=>e.status===409&&e.code==='version-conflict');
});
test('SDK resolves program addresses and preserves expected_version in mutation',async()=>{
  const calls=[];
  const client=new PurlClient('https://purl.example/p/test',{fetch:async(url,options)=>{
    calls.push({url:String(url),options});return new Response(JSON.stringify({program:{id:'test',version:3},operations:[]}),{status:200});
  }});
  await client.manifest(); await client.invoke('test','compile',{expected_version:3});
  assert.equal(calls[0].url,'https://purl.example/api/programs/test/manifest');
  assert.deepEqual(JSON.parse(calls[1].options.body),{expected_version:3});
});
