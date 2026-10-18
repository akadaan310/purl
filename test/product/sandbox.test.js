import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DockerSandbox, sandboxArguments } from '../../service/sandbox.js';

test('sandbox always sets network, process, filesystem and privilege restrictions',()=>{
  const args=sandboxArguments({name:'purl-test',image:'node@sha256:'+'a'.repeat(64),language:'javascript'});
  for(const value of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=32','--memory=128m','--cpus=0.5','--user=10001:10001'])assert.ok(args.includes(value),value);
  assert.ok(!args.some(x=>x==='--privileged'||x.startsWith('--volume')||x.startsWith('--mount')));
  assert.ok(args.includes('--input-type=module'),'async runner requires ESM context');
});
test('sandbox cannot silently enable arbitrary execution without explicit verified gate',async()=>{
  const sandbox=new DockerSandbox();
  assert.equal(sandbox.verified,false);
  await assert.rejects(sandbox.execute({language:'javascript',source:'function main(x){return x}',input:1}),/not verified/i);
});
test('sandbox rejects unsupported language and oversized source before spawn',async()=>{
  const sandbox=new DockerSandbox({enabled:true,verified:true});
  await assert.rejects(sandbox.execute({language:'julia',source:'x',input:1}),/unavailable/i);
  await assert.rejects(sandbox.execute({language:'javascript',source:'x'.repeat(300000),input:1}),/limit/i);
});
test('TypeScript runs only inside the same pinned restricted Node container with native type stripping',()=>{
 const args=sandboxArguments({name:'purl-ts',image:'node@sha256:'+'a'.repeat(64),language:'typescript'});
 assert.ok(args.includes('--experimental-strip-types'));
 assert.ok(args.includes('--network=none'));assert.ok(args.includes('--read-only'));
});
