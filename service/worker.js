import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { createRepository } from './repository.js';
import { PurlService } from './domain.js';
import { DockerSandbox } from './sandbox.js';

const repository=createRepository();
const sandboxAdapter=new DockerSandbox({enabled:process.env.PURL_SANDBOX_ENABLED==='1',verified:process.env.PURL_SANDBOX_VERIFIED==='1'});
const service=new PurlService({repository,baseUrl:process.env.PURL_BASE_URL??'http://127.0.0.1:8080',sandboxAdapter});
const workerId=process.env.PURL_WORKER_ID??`${hostname()}-${randomUUID()}`;
const heartbeatFile=process.env.PURL_WORKER_HEARTBEAT_FILE??'/tmp/purl-worker-heartbeat.json';
const leaseMs=Number(process.env.PURL_JOB_LEASE_MS??30000);
const pollMs=Number(process.env.PURL_WORKER_POLL_MS??250);
let draining=false;
const stop=()=>{draining=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
console.log(JSON.stringify({event:'worker_ready',workerId,persistence:repository.mode,sandbox:sandboxAdapter.verified,leaseMs}));
while(!draining){
  await writeFile(heartbeatFile,JSON.stringify({updatedAt:new Date().toISOString(),workerId,status:draining?'draining':'running'}));
  try{
    const result=await service.workOnce({workerId,leaseMs});
    if(result)console.log(JSON.stringify({event:'job_observed',workerId,execution_id:result.id??result.execution?.id,status:result.status??result.execution?.status}));
    else await new Promise(resolve=>setTimeout(resolve,pollMs));
  }catch(error){console.error(JSON.stringify({event:'worker_error',workerId,message:error.message}));await new Promise(resolve=>setTimeout(resolve,Math.min(5000,pollMs*4)));}
}
await writeFile(heartbeatFile,JSON.stringify({updatedAt:new Date().toISOString(),workerId,status:'draining'}));
console.log(JSON.stringify({event:'worker_drained',workerId}));
