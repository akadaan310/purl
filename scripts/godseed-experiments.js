import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {FileRepository} from '../service/repository.js';
import {PurlService} from '../service/domain.js';
import {createProductServer} from '../service/http.js';
import {DockerSandbox} from '../service/sandbox.js';
import {PurlClient} from '../sdk/client.js';
import {runMathExperiments} from './math-experiments.js';

const ROOT=new URL('../',import.meta.url).pathname;
const runId=new Date().toISOString().replaceAll(':','-');
const dir=join(ROOT,'evidence/experiments/runs',runId);await mkdir(dir,{recursive:true});
const protocol=JSON.parse(await readFile(join(ROOT,'experiments/godseed-v3/protocol.json'),'utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const sourceFiles=[];async function walk(path){for(const e of await readdir(path,{withFileTypes:true})){if(['node_modules','.git','.purl','evidence','test-results','playwright-report'].includes(e.name))continue;const p=join(path,e.name);if(e.isDirectory())await walk(p);else if(/\.(js|json|md|css|html|sql|ya?ml|toml)$/.test(e.name)||e.name==='Dockerfile')sourceFiles.push({path:relative(ROOT,p),sha256:hash(await readFile(p))});}}
await walk(ROOT);
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const results=await runMathExperiments();
const work=await mkdtemp(join(tmpdir(),'purl-godseed-'));
const dataFile=join(work,'state.json');const repository=new FileRepository(dataFile);
const sandbox=new DockerSandbox({enabled:true,verified:true});
const service=new PurlService({repository,sandboxAdapter:sandbox});
const server=createProductServer({service,maxRequests:1000});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;service.baseUrl=base;await service.seed();
let worker;
function startWorker(){worker=spawn(process.execPath,['service/worker.js'],{cwd:ROOT,env:{...process.env,PURL_DATA_FILE:dataFile,PURL_BASE_URL:base,PURL_SANDBOX_ENABLED:'1',PURL_SANDBOX_VERIFIED:'1',PURL_WORKER_HEARTBEAT_FILE:join(work,'heartbeat.json')},stdio:['ignore','pipe','pipe']});worker.stdout.on('data',c=>{});worker.stderr.on('data',c=>{});}
async function stopWorker(){if(!worker)return;const w=worker;worker=null;w.kill('SIGTERM');await new Promise(r=>w.once('exit',r));}
startWorker();
const owner=new PurlClient(base);await owner.session('Experiment owner','agent');
async function experiment(id,fn){const started=Date.now();try{results.push({id,status:'PASS',...await fn(),elapsed_ms:Date.now()-started});}catch(error){results.push({id,status:'FAIL',error:error.stack,details:error.details,elapsed_ms:Date.now()-started});}}
async function create(client,extra={}){return (await client.create({title:'Experiment arithmetic',language:'purl',source:'input number | math.add 2 | math.multiply 3',visibility:'public',input_schema:{type:'number'},output_schema:{type:'number'},tests:[{input:4,expected:18}],...extra})).program;}
async function act(client,p,op,body={}){return client.act(typeof p==='string'?p:p.id,op,body);}
const jsonChild=(file,args,env={})=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file,...args],{cwd:ROOT,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('exit',code=>{if(code!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch{reject(Error(out+err));}});});
try{
 await experiment('E05',async()=>{
  const outputs=[];
  for(const [language,source] of [['purl','input number | math.add 2 | math.multiply 3'],['javascript','function main(input){return (input+2)*3}'],['typescript','export default function main(input: number): number {return (input+2)*3}'],['python','def main(input):\n return (input+2)*3']]){
   const p=await create(owner,{title:`AI-authored ${language} performer`,language,source});
   const compiled=await act(owner,p,'compile');assert.equal(compiled.ok,true);
   const built=await act(owner,p,'build');assert.equal(built.build.status,'passed',JSON.stringify(built.build));
   const queued=await act(owner,p,'run',{input:4,seed:19});const execution=await owner.awaitExecution(queued.execution.id,{timeoutMs:15000});assert.equal(execution.status,'succeeded',JSON.stringify(execution));assert.equal(execution.value,18);
   const published=await act(owner,p,'publish');assert.ok(published.release.immutable);
   const cold=await jsonChild('scripts/cold-client.js',[`${base}/p/${p.id}`]);assert.equal(cold.program_id,p.id);assert.equal(cold.replay_valid,true);
   const independent=new PurlClient(`${base}/p/${p.id}`);await independent.session(`Independent reuse ${language}`);
   const fork=await independent.act(p.id,'fork',{title:`Reused ${language}`});const fb=await act(independent,fork.program,'build');assert.equal(fb.build.status,'passed');
   const fr=await act(independent,fork.program,'run',{input:4});const fe=await independent.awaitExecution(fr.execution.id,{timeoutMs:15000});assert.equal(fe.value,18);
   outputs.push({language,program_id:p.id,build_id:built.build.id,build_hash:built.build.content_id,execution_id:execution.id,value:execution.value,release_id:published.release.id,release_url:published.release.url,reused_fork:fork.program.id,reused_execution:fe.id,cold_process:cold});
  }
  return {execution_class:'LIVE_HTTP_WITH_SEPARATE_WORKER_AND_DOCKER',metrics:{languages:4,passing_builds:8,reused_outputs:4,value:18},programs:outputs,limitations:['Fresh reuse is an independent HTTP client and Node process, not a cross-provider AI study','Registry promotion beyond personal/public releases requires separate authority; no fake package-count claim']};
 });
 await experiment('E06',async()=>{
  const p=await create(owner,{title:'Security controls'});await act(owner,p,'build');
  const guest=new PurlClient(base);const session=await guest.session('Untrusted claimed AI');
  await assert.rejects(guest.invoke(p.id,'source',{expected_version:p.version,source:'input number'}),e=>e.status===403);
  const forged=new PurlClient(base,{token:p.owner});await assert.rejects(forged.get(p.id),e=>e.status===401);
  await assert.rejects(owner.invoke(p.id,'source',{expected_version:1,source:'input number'}),e=>e.status===409);
  const grant=await act(owner,p,'grants',{principal_id:session.principal.id,rights:['read','checkpoint','run']});
  const version=grant.program.version;const body={expected_version:version,summary:'Test idempotency'};
  const first=await guest.invoke(p.id,'checkpoint',body,{idempotencyKey:'same'});const second=await guest.invoke(p.id,'checkpoint',body,{idempotencyKey:'same'});assert.equal(first.checkpoint.id,second.checkpoint.id);
  await assert.rejects(guest.invoke(p.id,'checkpoint',{...body,summary:'changed'},{idempotencyKey:'same'}),e=>e.status===409);
  await stopWorker();const q=await act(guest,p,'run',{input:4});await act(owner,p,'revoke',{grant_id:grant.grant.id});
  await assert.rejects(guest.invoke(p.id,'checkpoint',body,{idempotencyKey:'same'}),e=>e.status===403);
  startWorker();const denied=await owner.awaitExecution(q.execution.id);assert.equal(denied.status,'denied');
  const before=(await repository.read()).revision;const dangerous=await fetch(`${base}/api/programs/${p.id}/run`,{headers:{Accept:'application/json'}});assert.equal(dangerous.status,404);assert.equal((await repository.read()).revision,before);
  const ssrf=await create(owner,{source:'input json | network.fetch',input_schema:{},output_schema:{},tests:[]});const check=await act(owner,ssrf,'compile');assert.equal(check.ok,false);
  const urlToken=await fetch(`${base}/api/programs?token=nope`);assert.equal(urlToken.status,400);
  const sandboxEvidence=JSON.parse(await readFile(join(ROOT,'evidence/sandbox/latest.json'),'utf8'));assert.equal(sandboxEvidence.failed,0);
  return {execution_class:'LIVE_HTTP_AUTHORITY_AND_DOCKER_ATTACKS',metrics:{sandbox_checks:sandboxEvidence.passed,forged_denied:true,revoked_idempotent_replay_denied:true,queued_revocation_denied:true,stale_rejected:true,get_mutations:0,ssrf_compile_rejected:true},sandbox_run:sandboxEvidence.run_id,negative_evidence:'These attacks do not certify kernel security, unrestricted dependency installs or multi-tenant safety. Authored runtime remains disabled in default public configuration.'};
 });
 await experiment('E07',async()=>{
  const a=new PurlClient(base),b=new PurlClient(base),c=new PurlClient(base);await a.session('Session A');const bs=await b.session('Session B');await c.session('Session C');
  let p=await create(a,{title:'A/B/C continuation'});await act(a,p,'checkpoint',{summary:'A: compile this source, build and record evidence',next:'B proposes a refinement'});
  await act(a,p,'grants',{principal_id:bs.principal.id,rights:['read','propose','checkpoint']});
  const proposal=await act(b,p,'propose',{summary:'B: preserve value18 from4 with a simpler derivation',source:'input number | math.multiply 3 | math.add 6'});
  await assert.rejects(act(b,p,'commit',{proposal_id:proposal.proposal.id}),e=>e.status===403);
  await act(a,p,'commit',{proposal_id:proposal.proposal.id});await act(b,p,'checkpoint',{summary:'B: proposal accepted; next session rebuilds and executes',next:'Build then run input4'});
  const continuity=await c.continuity(p.id);assert.ok(continuity.checkpoint.summary.includes('B:'));assert.equal((await c.get(p.id)).program.source,'input number | math.multiply 3 | math.add 6');assert.equal((await c.replay(p.id)).valid,true);
  const cold=await jsonChild('scripts/cold-client.js',[`${base}/p/${p.id}`]);assert.equal(cold.checkpoint.summary,continuity.checkpoint.summary);
  return {execution_class:'THREE_ISOLATED_CREDENTIALLED_HTTP_CLIENTS_PLUS_FRESH_PROCESS',metrics:{sessions:3,proposals:1,commits:1,checkpoints:2,unauthorized_commits:0,replay_valid:true},reconstruction:cold,limitations:['Client sessions are programmatic, not three independent AI providers','No claim of transferred private memory or model identity']};
 });
 await experiment('E08',async()=>{
  const x=new PurlClient(base),o=new PurlClient(base);await x.session('Player X');await o.session('Player O');let p=await create(x,{title:'A persisted game',kind:'game'});
  p=(await act(o,p,'join')).program;
  const race=await Promise.allSettled([x.invoke(p.id,'move',{expected_version:p.version,cell:0}),x.invoke(p.id,'move',{expected_version:p.version,cell:1})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);const fail=race.find(r=>r.status==='rejected');assert.equal(fail.reason.status,409);p=race.find(r=>r.status==='fulfilled').value.program;
  const firstCell=p.state.board.findIndex(mark=>mark==='X');assert.ok([0,1].includes(firstCell));await assert.rejects(act(x,p,'move',{cell:8}),e=>e.status===409);
  const remaining=[0,1,2].filter(cell=>cell!==firstCell);
  for(const [client,cell]of [[o,3],[x,remaining[0]],[o,4],[x,remaining[1]]])p=(await act(client,p,'move',{cell})).program;
  assert.equal(p.state.winner,'X');await assert.rejects(act(o,p,'move',{cell:8}),e=>e.status===409);
  const restarted=new PurlService({repository:new FileRepository(dataFile),baseUrl:base});const read=await restarted.handle('GET',`/api/programs/${p.id}`);assert.equal(read.body.program.state.winner,'X');const replay=await restarted.handle('GET',`/api/programs/${p.id}/replay`);assert.equal(replay.body.valid,true);
  return {execution_class:'LIVE_HTTP_TWO_PLAYERS_AND_REOPENED_DURABLE_STORE',metrics:{race_commits:1,race_conflicts:1,valid_moves:5,winner:'X',replay_after_restart:true},program_id:p.id};
 });
 await experiment('E09',async()=>{
  const meta=await owner.discover();const id=meta.mission.id;const manifest=await owner.manifest(id);const {program}=await owner.get(id);assert.equal(program.state.directive,await readFile(join(ROOT,'reference/godseed/GODSEED.md'),'utf8'));assert.equal(program.state.amendment,await readFile(join(ROOT,'reference/godseed/DEPLOYMENT_AMENDMENT.md'),'utf8'));
  const graph=program.state.graph;assert.ok(graph.nodes.length>=50);for(const node of graph.nodes){assert.ok(node.completion_predicate&&node.tests.length);for(const dep of node.dependencies)assert.ok(graph.nodes.some(n=>n.id===dep));}
  const cold=await jsonChild('scripts/cold-client.js',[meta.mission.url]);assert.equal(cold.mission_nodes,graph.nodes.length);assert.ok(cold.ready_nodes.length);assert.equal(cold.replay_valid,true);
  const fork=(await owner.act(id,'fork',{title:'Executable God-seed continuation',visibility:'public'})).program;
  await act(owner,fork,'build');const q=await act(owner,fork,'run',{input:fork.state});const executed=await owner.awaitExecution(q.execution.id);assert.equal(executed.status,'succeeded');assert.deepEqual(executed.value.ready_nodes,cold.ready_nodes);assert.equal(executed.value.verified,false);
  const checkpoint=await act(owner,fork,'checkpoint',{summary:'Cold reconstruction verified full mission graph and directive; checkpoint preserved',next:'Attach verified requirement evidence in dependency order',evidence:executed.artifacts});
  const plain={full_directive_characters:program.state.directive.length,authenticated:false,live_state:false,operations:false,checkpoint:false};
  return {execution_class:'LIVE_EXECUTABLE_MISSION_AND_FRESH_NO_TRANSCRIPT_PROCESS',metrics:{mission_nodes:graph.nodes.length,edges:graph.edges.length,ready_nodes:cold.ready_nodes,executable_result:executed.value,checkpoint_id:checkpoint.checkpoint.id},single_purl:cold,plain_text_control:plain,limitations:['Feature structure comparison only; no randomized token/cost/success advantage measured','Mission artifact integrity is checked; requirement truth still requires independent review','Fresh same-provider AI reconstruction is recorded separately when available']};
 });
}finally{await stopWorker();await new Promise(r=>server.close(r));}
let ui,containers,cold;for(const [name,file]of [['ui','evidence/ui/latest.json'],['containers','evidence/infrastructure/container-smoke.json'],['cold','evidence/cold-rebuild/latest.json']]){try{const data=JSON.parse(await readFile(join(ROOT,file),'utf8'));if(name==='ui')ui=data;else if(name==='containers')containers=data;else cold=data;}catch{}}
results.push({id:'E10',status:ui?.status==='PASS'&&containers?.status==='PASS'&&cold?.status==='PASS'?'PASS':'BLOCKED',execution_class:'LOCAL_COLD_BUILD_AND_REAL_BROWSER',ui:ui??{status:'NOT_RUN'},containers:containers??{status:'NOT_RUN'},cold_rebuild:cold??{status:'NOT_RUN'},hosted_deployment:{status:'BLOCKED',reason:'No Railway token/linked project and no configured PURL Supabase production project; Oracle adapter deferred by amendment'},limitations:['Hosted Supabase Storage/Auth integration and public Railway deployment cannot be exercised without configured service access.']});
const report={protocol:protocol.protocol,run_id:runId,registered_at:protocol.registered_at,registration_class:protocol.registration_class,source_revision:revision,source_snapshot_sha256:hash(JSON.stringify(sourceFiles)),source_files:sourceFiles,environment:{node:process.version,architecture:process.arch,platform:process.platform},base_url_during_run:base,experiments:results,summary:Object.fromEntries(['PASS','FAIL','BLOCKED','NOT_RUN'].map(status=>[status,results.filter(r=>r.status===status).length])),production_deployed:false};
await writeFile(join(dir,'results.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(ROOT,'evidence/experiments/latest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({run_id:runId,summary:report.summary,experiments:results.map(r=>({id:r.id,status:r.status,error:r.error})),evidence:dir},null,2));if(report.summary.FAIL)process.exitCode=1;
