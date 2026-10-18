import { writeFile,rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { createLaunchApplication } from './application.js';

const app=createLaunchApplication(),workerId=process.env.PURL_WORKER_ID??`${hostname()}-${randomUUID()}`;
const heartbeat=process.env.PURL_WORKER_HEARTBEAT_FILE??'/tmp/purl-worker-heartbeat.json';
let draining=false,heartbeatWrite=Promise.resolve(),nextMaintenance=0;
const beat=()=>{heartbeatWrite=heartbeatWrite.then(async()=>{const temporary=heartbeat+'.tmp';await writeFile(temporary,JSON.stringify({updatedAt:new Date().toISOString(),workerId,status:draining?'draining':'running'}));await rename(temporary,heartbeat);}).catch(()=>console.error(JSON.stringify({event:'launch_heartbeat_error'})));return heartbeatWrite;};
const timer=setInterval(beat,5000);await beat();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{draining=true;});
console.log(JSON.stringify({event:'launch_worker_ready',workerId,persistence:app.store.mode}));
while(!draining){
 try{
  if(Date.now()>=nextMaintenance){nextMaintenance=Date.now()+60000;await app.maintain();}
  const native=await app.resources.workOnce({workerId,leaseMs:30000});
  const constellation=await app.constellations.workOnce({workerId,leaseMs:120000});
  if(native||constellation)console.log(JSON.stringify({event:'launch_job_observed',native:native?.status??null,constellation:constellation?.status??null}));
  if(!native&&!constellation)await new Promise(resolve=>setTimeout(resolve,Number(process.env.PURL_WORKER_POLL_MS??1000)));
 }catch(error){console.error(JSON.stringify({event:'launch_worker_error',code:error.code??'internal_error'}));await new Promise(resolve=>setTimeout(resolve,2000));}
}
clearInterval(timer);await beat();console.log(JSON.stringify({event:'launch_worker_drained',workerId}));
