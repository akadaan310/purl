import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import {DockerSandbox,NODE_IMAGE,PYTHON_IMAGE} from '../service/sandbox.js';
const runId=new Date().toISOString().replaceAll(':','-');
const dir=new URL(`../evidence/sandbox/runs/${runId}/`,import.meta.url);await mkdir(dir,{recursive:true});
const sandbox=new DockerSandbox({enabled:true,verified:true,timeoutMs:3500});
const checks=[];
async function check(name,fn){const start=Date.now();try{const result=await fn();checks.push({name,status:'PASS',elapsed_ms:Date.now()-start,result});}catch(e){checks.push({name,status:'FAIL',elapsed_ms:Date.now()-start,error:e.message});}}
await check('javascript-real-result',async()=>{const r=await sandbox.execute({language:'javascript',source:'function main(x){return x*2}',input:7});assert.equal(r.value,14);return r.environment;});
await check('typescript-real-result',async()=>{const r=await sandbox.execute({language:'typescript',source:'export default function main(x:number):number{return x*2}',input:7});assert.equal(r.value,14);return r.environment;});
await check('python-real-result',async()=>{const r=await sandbox.execute({language:'python',source:'def main(x):\n return x*3',input:7});assert.equal(r.value,21);return r.environment;});
await check('filesystem-host-paths-and-root-write',async()=>{
 const r=await sandbox.execute({language:'javascript',source:`async function main(){ const fs=process.getBuiltinModule('fs');let host=false,rootWrite=false;try{fs.readFileSync('/workspace/purl/package.json');host=true}catch{}try{fs.writeFileSync('/purl-escape','bad');rootWrite=true}catch{}return {host,rootWrite,uid:process.getuid(),tmp:fs.statSync('/tmp').isDirectory()}}`,input:null});
 assert.equal(r.value.host,false);assert.equal(r.value.rootWrite,false);assert.equal(r.value.uid,10001);return r.value;
});
await check('network-ssrf-cloud-metadata',async()=>{
 const r=await sandbox.execute({language:'javascript',source:`async function main(){try{await fetch('http://169.254.169.254/latest/meta-data/',{signal:AbortSignal.timeout(500)});return {connected:true}}catch(e){return {connected:false,error:e.cause?.code??e.name}}}`,input:null});assert.equal(r.value.connected,false);return r.value;
});
await check('environment-credentials-absent',async()=>{
 const r=await sandbox.execute({language:'javascript',source:`function main(){return ['SUPABASE_SERVICE_ROLE_KEY','RAILWAY_TOKEN','GITHUB_TOKEN','DATABASE_URL','DOCKER_HOST'].filter(x=>process.env[x])}`,input:null});assert.deepEqual(r.value,[]);return r.value;
});
await check('process-budget-and-no-privileges',async()=>{
 const r=await sandbox.execute({language:'javascript',source:`function main(){const fs=process.getBuiltinModule('fs');return {pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim(),status:fs.readFileSync('/proc/self/status','utf8').split('\\n').filter(x=>/^(CapEff|NoNewPrivs):/.test(x))}}`,input:null});assert.equal(r.value.pids,'32');assert.ok(r.value.status.some(x=>/^CapEff:\s+0+$/.test(x)));assert.ok(r.value.status.some(x=>/^NoNewPrivs:\s+1$/.test(x)));return r.value;
});
await check('cpu-infinite-loop-terminated',async()=>{await assert.rejects(sandbox.execute({language:'javascript',source:'function main(){while(true){}}',input:null}),/timeout/i);return {terminated:true};});
await check('output-flood-terminated',async()=>{await assert.rejects(sandbox.execute({language:'javascript',source:'function main(){while(true){console.log("X".repeat(10000))}}',input:null}),/output limit/i);return {terminated:true};});
await check('unconfigured-adapter-denied',async()=>{await assert.rejects(new DockerSandbox().execute({language:'javascript',source:'function main(){return 1}',input:null}),/not verified/i);return {denied:true};});
const result={protocol:'purl-sandbox-verification/1',run_id:runId,execution_class:'LIVE_LOCAL_DOCKER',images:{node:NODE_IMAGE,python:PYTHON_IMAGE},public_arbitrary_execution_enabled:false,assurance:'Defense-in-depth configuration and specified attacks only; not a kernel/container security certification. Shared-kernel Docker and daemon privileges remain in the threat model.',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length};
await writeFile(new URL('results.json',dir),JSON.stringify(result,null,2)+'\n');await writeFile(new URL('../evidence/sandbox/latest.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
