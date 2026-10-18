import json,pathlib,hashlib,collections,datetime
P=pathlib.Path('/workspace/purl/evidence/deployment/public-cold-session')
records={}
for f in P.glob('[0-9][0-9][0-9]-*.json'):
 r=json.loads(f.read_text());records[f.name[4:-5]]=r

def body(n):return records[n]['response']['body']
def sha(o):return 'sha256:'+hashlib.sha256(json.dumps(o,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
seed=body('seed-before')['program'];after=body('seed-after')['program'];graph=body('mission-run-input')['program']['state']['graph'];nodes=graph['nodes'];edges=graph['edges'];byid={n['id']:n for n in nodes}
ready=[n['id'] for n in nodes if n.get('status')!='PASS' and all(byid[d].get('status')=='PASS' for d in n.get('dependencies',[]))]
waiting=[n['id'] for n in nodes if n.get('status')!='PASS' and n['id'] not in ready]
completed=[n['id'] for n in nodes if n.get('status')=='PASS']
mission=body('mission-execution')['execution'];arith=body('arithmetic-execution-final')['execution']
checks={
 'mission_execution_succeeded':mission['status']=='succeeded',
 'mission_ready_matches_independent_dependencies':mission['value']['ready_nodes']==ready,
 'mission_waiting_matches_independent_dependencies':mission['value']['waiting_nodes']==waiting,
 'mission_completed_matches_recorded_status':mission['value']['completed_nodes']==completed,
 'mission_total_nodes_matches_count':mission['value']['total_nodes']==len(nodes)==52,
 'mission_edges_matches_count':mission['value']['dependency_edges']==len(edges)==65,
 'mission_completion_honest':mission['value']['completion']=='NOT_RUN',
 'mission_verification_honest':mission['value']['verified'] is False,
 'arithmetic_execution_succeeded':arith['status']=='succeeded',
 'arithmetic_input4_output18':arith['input']==4 and arith['value']==18,
 'arithmetic_three_build_tests_passed':len(body('arithmetic-build')['build']['tests'])==3 and all(t['passed'] for t in body('arithmetic-build')['build']['tests']),
 'arithmetic_actual_runtime_node22':arith['runtime_environment']['runtime_version']=='v22.14.0',
 'mission_actual_runtime_node22':mission['runtime_environment']['runtime_version']=='v22.14.0',
 'seed_source_preserved':seed['source']==after['source'],
 'seed_state_preserved':seed['state']==after['state'],
 'seed_version_preserved':seed['version']==after['version']==1,
 'seed_state_hash_preserved':body('seed-continuity')['changes_since_checkpoint'][-1]['state_hash']==body('seed-replay-after')['state_hash'],
 'seed_has_no_executions':body('seed-replay-after')['executions']==[],
}
for prefix in ['arithmetic','mission']:
 rp=body(prefix+'-replay');pub=body(prefix+'-final-public')['program'];cp=body(prefix+'-continuity-public')['checkpoint'];canonical=body(prefix+'-canonical-public')['program']['url']
 checks[prefix+'_replay_valid']=rp['valid'] and rp['program_valid'] and not rp['problems'] and all(e['valid'] and e['replayable'] for e in rp['executions'])
 checks[prefix+'_public']=pub['visibility']=='public'
 checks[prefix+'_canonical_url']=canonical==pub['url'] and canonical.startswith('https://purl-api-production.up.railway.app/p/')
 checks[prefix+'_checkpoint_unverified']=cp['evidence_verified'] is False
 checks[prefix+'_release_public_read']=records[prefix+'-release-public']['response']['status']==200
 checks[prefix+'_artifact_public_read']=records[prefix+'-artifact-public']['response']['status']==200
assert all(checks.values()),checks
(P/'client-assertions.json').write_text(json.dumps({'scope':'Independent client checks over public HTTP evidence; mission build has zero embedded tests. These assertions are not requirement truth verification.','checks':checks,'passed':sum(checks.values()),'failed':0},indent=2)+'\n')

programs={}
for prefix,e in [('mission',mission),('arithmetic',arith)]:
 p=body(prefix+'-final-public')['program'];b=body(prefix+'-build')['build'];rel=body(prefix+'-publish')['release'];cp=body(prefix+'-continuity-public')['checkpoint']
 programs[prefix]={
  'id':p['id'],'url':p['url'],'visibility':p['visibility'],'version':p['version'],'source':p['source'],'source_revision':p['source_revision'],'source_content_id':b['source_content_id'],'lineage':p['lineage'],
  'build':{k:b[k] for k in ['id','build_id','content_id','status','tests','tests_passed','environment','immutable']},
  'build_container_url':records[prefix+'-final-public']['request']['url'],
  'execution':{k:e[k] for k in ['id','status','input_id','value','value_id','artifacts','environment_id','runtime_environment','runtime_environment_id','receipt']},
  'execution_url':'https://purl-api-production.up.railway.app/api/executions/'+e['id'],
  'artifact_urls':['https://purl-api-production.up.railway.app/api/artifacts/'+a for a in e['artifacts']],
  'release':{k:rel[k] for k in ['id','url','content_id','immutable','build_id','build_content_id','source_content_id']},
  'checkpoint':cp,'checkpoint_container_url':records[prefix+'-continuity-public']['request']['url'],
  'replay':body(prefix+'-replay'),'replay_url':records[prefix+'-replay']['request']['url'],
 }
status_totals=collections.Counter(n.get('status') for n in nodes)
instants=sorted(datetime.datetime.fromisoformat(r['started_at'].replace('Z','+00:00')).timestamp() for r in records.values())
max_60=max(sum(t<=s<t+60 for s in instants) for t in instants)
report={
 'schema':'purl.public-cold-session-evidence/1','result':'PASS for bounded public discovery, isolated native program lifecycle, graph output checks, replay and seed preservation; broader mission NOT_RUN',
 'starting_url':'https://purl-api-production.up.railway.app/p/godseed-mission','started_at':min(r['started_at'] for r in records.values()),'last_http_at':max(r['started_at'] for r in records.values()),
 'method':{'fresh_agent_session':True,'prior_conversation_supplied':False,'program_evidence':'Public-origin HTTP only, discovered from starting URL','local_source_database_environment_other_reports_read':False,'local_files_read':'Only own HTTP evidence in this output directory','authority':'New self-declared AI principal; original public read grants enable fork; owner grants authorize new fork and arithmetic lifecycle. No credential inherited.','sdk':'Discovered SDK source and docs read over HTTP; bounded requests used Python standard-library HTTP rather than importing SDK.','authorization':'Explicit parent authorization for public fork/create/build/run/publish/checkpoint; no third-party messages or original mutations.','http_evidence':'Numbered JSON files preserve redacted request/response headers, bodies and status; these are structured HTTP records, not packet captures.','concurrency':'Independent read-only subagent checked public graph. Same provider/team; not independent cross-provider proof.'},
 'protocol':body('discovery')['protocol'],'live_runtime':body('runtime'),'health':body('health'),
 'principal':body('session')['principal'],'original_authenticated_rights':body('seed-auth-manifest')['authority'],
 'original_seed':{'version_before':seed['version'],'version_after':after['version'],'source':seed['source'],'source_content_id':seed['builds'][0]['source_content_id'],'state_content_sha256_before':sha(seed['state']),'state_content_sha256_after':sha(after['state']),'service_state_hash_before':body('seed-continuity')['changes_since_checkpoint'][-1]['state_hash'],'service_state_hash_after':body('seed-replay-after')['state_hash'],'event_head_before':body('seed-continuity')['changes_since_checkpoint'][-1]['hash'],'event_head_after':body('seed-replay-after')['head'],'events_after':body('seed-replay-after')['events'],'executions_after':body('seed-replay-after')['executions'],'whole_program_body_equal':seed==after,'preserved':checks['seed_source_preserved'] and checks['seed_state_preserved'] and checks['seed_state_hash_preserved']},
 'graph':{'node_count':len(nodes),'edge_count':len(edges),'explicit_dependency_count':sum(len(n.get('dependencies',[])) for n in nodes),'status_counts':dict(status_totals),'evidence_entries':sum(len(n.get('evidence',[])) for n in nodes),'ready_frontier':ready,'frontier_algorithm':'Non-PASS node whose every explicit dependency has recorded status exactly PASS.','completed_nodes':completed,'waiting_count':len(waiting),'native_output':mission['value'],'requirement_truth_verified':False,'independent_graph_report':'independent-graph/REPORT.md'},
 'programs':programs,
 'verification':{'client_assertions':checks,'client_pass_count':sum(checks.values()),'client_fail_count':0,'mission_embedded_build_test_count':len(body('mission-build')['build']['tests']),'arithmetic_embedded_build_test_count':len(body('arithmetic-build')['build']['tests']),'original_program_not_run':True,'public_anonymous_read_checks':True},
 'request_discipline':{'expected_version':'Fresh authenticated GET before every lifecycle mutation; original manifest current version used for fork.','idempotency':'Every mutation except session has a stable unique operation/payload key; corrected create used a new key. No key reused with a changed payload.','public_rate_limit_per_minute':60,'min_delay_after_response_seconds':1.1,'main_session_http_calls':len(records),'max_main_session_calls_in_rolling_60_seconds':max_60,'independent_readonly_graph_calls':5,'no_rate_limit_responses':not any(r['response']['status']==429 for r in records.values()),'bearer_storage':'Token held only in live process memory; request Authorization and issued token values redacted from records; memory comparison confirmed token absent from all evidence files. No token in URL.'},
 'observed_error':{'status':400,'code':'invalid_kind','cause':'Kind math was inferred from seed metadata, but creation endpoint accepts program, mission or game.','resolution':'Created native arithmetic with kind program and new idempotency key.','evidence':'015-arithmetic-create.json'},
 'limitations':[
  'Mission graph structure, statuses, content hashes and inspector output do not establish requirement truth; all 52 nodes remain NOT_RUN and verified false.',
  'Checkpoint evidence is author assertions with evidence_verified false. Service state-hash verification does not upgrade claim truth.',
  'Mission inherited zero embedded build tests; this session verified execution contract through independent client assertions and a separate read-only graph session. Arithmetic has three actual passing build tests.',
  'Only bounded native PURL operators executed. Arbitrary Python/JavaScript/TypeScript, sandbox isolation and AI-authored code reuse were not tested; untrusted execution remains disabled.',
  'Fresh actual worker runtime v22.14.0 is recorded. Seed historical build metadata Node24.19.0 was preserved and was not used as live execution evidence.',
  'This session does not claim Railway service restart durability, worker interruption recovery, database policies, backup coverage, visual UI acceptance, full mission completion or independent cross-provider continuity. Those require separate evidence.',
  'The public continuity reference describes preserved PURL/0.1 on a separate instance unavailable at this origin; tokens/grants are not imported.',
  'No git source revision was inspected. Immutable build/source/registry content IDs identify exactly what this HTTP session compiled and executed.',
 ],
 'next_action':'Use frozen public program/release/execution/artifact/checkpoint records as restart baselines; after restart verify anonymous retrieval and strict replay. Continue reconstruction/formal-contract work before changing any mission requirement status.',
 'evidence_index':'http-index.json','client_assertions_file':'client-assertions.json'
}
# Actual error filename is selected from own evidence rather than assumed sequence.
report['observed_error']['evidence']=next(f.name for f in P.glob('[0-9][0-9][0-9]-*.json') if json.loads(f.read_text())['response']['status']==400)
(P/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
lines=[
 '# Public PURL cold-session evidence',
 '',
 'PASS for the bounded public lifecycle and replay checks. The broader mission remains NOT_RUN; requirement truth was not verified.',
 '',
 'Started with only https://purl-api-production.up.railway.app/p/godseed-mission . All protocol, SDK, program and runtime evidence came from HTTP on that public origin. No local source, database, environment variables or other reports were inspected. A new self-declared AI principal performed authorized operations on public isolated programs. Tokens stayed in process memory and are redacted in evidence.',
 '',
 'PURL/0.2 discovery led to the SDK, operation manifests, current authority, runtime and continuity. Original authenticated rights were read/run/propose; forking required authenticated read. Both created programs are public and owner-controlled. Each lifecycle mutation used a freshly read expected_version and a payload-specific idempotency key.',
 '',
 '| Record | Mission fork | Native arithmetic |',
 '|---|---|---|',
]
for label,fun in [
 ('Program',lambda x:f"[{x['id']}]({x['url']}) (v{x['version']})"),
 ('Build object ID',lambda x:x['build']['id']),
 ('Build SHA-256',lambda x:x['build']['build_id']),
 ('Execution',lambda x:f"[{x['execution']['id']}]({x['execution_url']})"),
 ('Artifact',lambda x:f"[{x['execution']['artifacts'][0]}]({x['artifact_urls'][0]})"),
 ('Immutable release',lambda x:f"[{x['release']['id']}]({x['release']['url']})"),
 ('Checkpoint in continuity',lambda x:f"[{x['checkpoint']['id']}]({x['checkpoint_container_url']})"),
 ('Strict replay',lambda x:f"[valid, replayable]({x['replay_url']})"),
 ('Actual worker runtime',lambda x:x['execution']['runtime_environment']['runtime_version']),
 ]: lines.append('| '+label+' | '+fun(programs['mission'])+' | '+fun(programs['arithmetic'])+' |')
lines += [
 '',
 'The mission fork compiled/built `input json | mission.inspect` and executed the fork state. Independent counting found **52 nodes, 65 edges**, all **NOT_RUN**, with **zero evidence entries**. Explicit dependencies produce the frontier **`["mission"]`**, and the native inspector agreed. Its output remains `completion: "NOT_RUN"` and `verified: false`. Mission builds inherit zero embedded tests; independent client assertions verify the inspector output, with a second read-only agent checking the graph separately.',
 '',
 'Arithmetic source is `input number | math.add 2 | math.multiply 3`. Its immutable build passed **3/3 tests**: `4 → 18`, `0 → 6`, and `-2 → 0`. The queued worker execution succeeded with `4 → 18`; its actual runtime environment is `v22.14.0`. Both programs’ strict replay reports are valid with no problems and execution replayability true.',
 '',
 f"**{sum(checks.values())}/{len(checks)} client checks passed**. Anonymous read-back returned HTTP 200 for both canonical manifests, releases, artifacts and continuity checkpoints. Both checkpoint records explicitly have `evidence_verified: false`. The only failed request was a corrected `400 invalid_kind`: create accepts `program`, `mission` or `game`, while seed metadata had suggested `math`. The corrected request used a fresh idempotency key.",
 '',
 'Original seed preservation: version 1, source and state identical, one unchanged event, no executions. The original seed service state hash stayed `'+report['original_seed']['service_state_hash_before']+'`. No original compile, build, run, publish or checkpoint was requested.',
 '',
 'Structured redacted HTTP exchanges are the numbered JSON files in this directory; `http-index.json` lists them. `report.json` contains exact IDs, content hashes, runtime receipts, results, checks and limits. `client-assertions.json` lists the independent checks. `independent-graph/REPORT.md` records the separate read-only graph investigation. Main session made '+str(len(records))+' HTTP calls, with at most '+str(max_60)+' in any rolling 60 seconds; independent graph session made 5 spaced GETs. No rate-limit rejection occurred.',
 '',
 'Limits: this is native bounded PURL execution in a fresh same-provider agent session. It does not verify arbitrary-code sandboxing, Python/JS self-extension, cross-provider independence, full mission requirements, visual UI, database policy/backups, interrupted-job recovery, or restart durability. Seed historical Node24 metadata was preserved; fresh executions provide actual Node22 evidence. Content hashes prove internal consistency, not external authenticity.',
 '',
 'Next: compare these frozen records and strict replay after the separately coordinated API/worker restart. Continue reconstruction and formal-contract evidence gathering before proposing mission status changes.',
 ]
(P/'report.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'report':'report.json','markdown':'report.md','http_calls':len(records),'checks_passed':sum(checks.values()),'checks_failed':0,'original_seed_preserved':report['original_seed']['preserved'],'max_calls_per_60_seconds':max_60},indent=2))
