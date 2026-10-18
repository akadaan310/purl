import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=new URL('../',import.meta.url).pathname;
const dir=join(root,'evidence/cold-rebuild');await mkdir(dir,{recursive:true});
const runId=new Date().toISOString().replaceAll(':','-');const checkout=await mkdtemp(join(tmpdir(),'purl-cold-'));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const checks=[];let api,worker;
async function command(name,cmd,args,options={}){const started=Date.now();const r=await new Promise(resolve=>{const c=spawn(cmd,args,{cwd:checkout,...options,stdio:['ignore','pipe','pipe']});let out='',err='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>err+=x);c.on('exit',code=>resolve({code,stdout:out,stderr:err}));});await writeFile(join(dir,`${runId}-${name}.txt`),r.stdout+r.stderr);checks.push({name,status:r.code===0?'PASS':'FAIL',elapsed_ms:Date.now()-started,exit_code:r.code});if(r.code!==0)throw Error(`${name} failed`);return r;}
try{
 // Local clone preserves committed history and starts with no node_modules or data.
 await command('clean-clone','git',['clone','--no-hardlinks','--branch','codex/godseed-v3',root,join(checkout,'repo')]);
 const clean=join(checkout,'repo');
 await command('dependencies','npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:clean});
 const test=await command('test','npm',['test'],{cwd:clean});
 const count=/ℹ tests (\d+)/.exec(test.stdout)?.[1]??null;
 const state=join(checkout,'cold-state.json');const port=18181;
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),PURL_DATA_FILE:state,PURL_BASE_URL:`http://127.0.0.1:${port}`,PURL_PERSISTENCE:'file',PURL_WORKER_HEARTBEAT_FILE:join(checkout,'heartbeat.json')};
 let errors='';api=spawn(process.execPath,['service/main.js'],{cwd:clean,env,stdio:['ignore','ignore','pipe']});api.stderr.on('data',x=>errors+=x);worker=spawn(process.execPath,['service/worker.js'],{cwd:clean,env,stdio:['ignore','ignore','pipe']});worker.stderr.on('data',x=>errors+=x);
 for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${port}/healthz`);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 const smoke=await command('cold-client',process.execPath,['scripts/cold-client.js',`http://127.0.0.1:${port}/p/godseed-mission`],{cwd:clean});const observed=JSON.parse(smoke.stdout);if(!observed.replay_valid||observed.mission_nodes<50)throw Error('Cold mission reconstruction failed');
 const report={status:'PASS',run_id:runId,source_revision:revision,execution_class:'CLEAN_LOCAL_GIT_CLONE_NO_NODE_MODULES_OR_STATE',checkout,tests:Number(count),checks,mission:observed,hosted_supabase_migrations:'Separate real PostgreSQL/PostgREST verification; hosted application BLOCKED',errors};
 await writeFile(join(dir,`${runId}-results.json`),JSON.stringify(report,null,2)+'\n');await writeFile(join(dir,'latest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,revision,tests:count,checks},null,2));
}catch(error){const report={status:'FAIL',run_id:runId,source_revision:revision,checks,error:error.stack};await writeFile(join(dir,`${runId}-results.json`),JSON.stringify(report,null,2));await writeFile(join(dir,'latest.json'),JSON.stringify(report,null,2));console.error(error);process.exitCode=1;}
finally{for(const c of [api,worker])if(c){c.kill('SIGTERM');await new Promise(r=>c.once('exit',r));}}
