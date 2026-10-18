import json,pathlib,collections,datetime,hashlib
P=pathlib.Path('/workspace/purl/evidence/deployment/public-cold-session');D=P/'final-handoff-http'
R={f.name[4:-5]:json.loads(f.read_text()) for f in D.glob('[0-9][0-9][0-9]-*.json')}
def b(n):return R[n]['response']['body']
def h(o):return 'sha256:'+hashlib.sha256(json.dumps(o,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
parent=b('parent-mission-before')['program'];fork=b('new-public-fork')['program'];final=b('final-public-program')['program'];e=b('execution-poll-5')['execution'];build=b('build')['build'];rel=b('publish')['release'];cp=b('final-public-continuity')['checkpoint'];replay=b('final-public-replay');manifest=b('final-public-canonical');g=final['state']['graph'];nodes=g['nodes'];byid={n['id']:n for n in nodes};ready=[n['id'] for n in nodes if n['status']!='PASS' and all(byid[d]['status']=='PASS' for d in n.get('dependencies',[]))]
rebased_parent=json.loads(json.dumps(parent['state']).replace(parent['id'],fork['id']))
checks={
 'new_principal':b('new-principal')['principal']['id']!='principal_e3b3006cd498c1fac8fae857',
 'new_principal_self_declared':b('new-principal')['principal']['identity_verified'] is False,
 'parent_v6_public':parent['version']==6 and parent['visibility']=='public',
 'new_principal_original_rights_only_read':b('parent-manifest-authority')['authority']['rights']==['read'],
 'fork_available_via_read':next(o for o in b('parent-manifest-authority')['operations'] if o['name']=='fork')['available'],
 'new_public_fork_created':R['new-public-fork']['response']['status']==201 and fork['visibility']=='public',
 'parent_lineage_exact':fork['lineage']['program_id']==parent['id'] and fork['lineage']['version']==6,
 'native_source_cloned_unchanged':fork['source']==parent['source']=='input json | mission.inspect',
 'mission_state_cloned_with_only_automatic_href_rebase':fork['state']==rebased_parent,
 'source_unchanged_through_lifecycle':final['source']==fork['source'],
 'state_unchanged_through_lifecycle':final['state']==fork['state'],
 'compile_passed':b('compile')['ok'] is True,
 'build_passed':build['status']=='passed' and build['tests_passed'] is True,
 'native_bounded_effects_empty':build['environment']['runtime']=='purl-bounded-interpreter' and build['plan']['effects']==[],
 'run_uses_entire_fork_state':e['input']==fork['state'],
 'execution_succeeded':e['status']=='succeeded',
 'actual_worker_node22':e['runtime_environment']['runtime_version']=='v22.14.0',
 'node_count52':len(nodes)==e['value']['total_nodes']==52,
 'edge_count65':len(g['edges'])==e['value']['dependency_edges']==65,
 'frontier_agrees':ready==e['value']['ready_nodes']==['mission'],
 'all52_statuses_notrun':all(n['status']=='NOT_RUN' for n in nodes),
 'graph_evidence_empty':all(n['evidence']==[] for n in nodes),
 'inspector_completion_notrun':e['value']['completion']=='NOT_RUN',
 'inspector_verified_false':e['value']['verified'] is False,
 'immutable_release_published':rel['immutable'] and R['publish']['response']['status']==201,
 'release_anonymously_readable':R['final-public-release']['response']['status']==200 and b('final-public-release')['release']['id']==rel['id'],
 'checkpoint_anonymously_readable':R['final-public-continuity']['response']['status']==200 and cp['id']==b('checkpoint')['checkpoint']['id'],
 'checkpoint_evidence_unverified':cp['evidence_verified'] is False,
 'checkpoint_next_starts_with_current_evidence':cp['next'].startswith('Read linked ACCEPTANCE.json and handoff.json first'),
 'checkpoint_next_targets_auth':all(t in cp['next'] for t in ['verified human Auth','production redirect','production email']),
 'summary_records_limitations':all(t in cp['summary'] for t in ['Full scope remains incomplete','NOT_RUN','disabled']),
 'canonical_anonymous_manifest':R['final-public-canonical']['response']['status']==200 and manifest['program']['url']==final['url'],
 'replay_valid':replay['valid'] and replay['program_valid'] and not replay['problems'] and all(x['valid'] and x['replayable'] for x in replay['executions']),
 'final_version6':final['version']==6,
}
assert all(checks.values()),checks
instants=sorted(datetime.datetime.fromisoformat(r['started_at'].replace('Z','+00:00')).timestamp() for r in R.values());max60=max(sum(t<=s<t+60 for s in instants) for t in instants)
errors=[{'file':str((D/(str(r['sequence']).zfill(3)+'-'+name+'.json')).relative_to(P)),'status':r['response']['status'],'body':r['response']['body']} for name,r in R.items() if r['response']['status']>=400]
report={
 'schema':'purl.final-public-continuation-handoff/1','status':'PASS bounded final handoff lifecycle; full mission remains incomplete',
 'canonical_url':final['url'],'program_id':final['id'],'version':final['version'],'visibility':final['visibility'],
 'principal':b('new-principal')['principal'],'parent':{'id':parent['id'],'url':parent['url'],'version':parent['version'],'published_release':'release_c9474f31ad7f07b0d02c733b','new_principal_rights':b('parent-manifest-authority')['authority']['rights']},
 'lineage':final['lineage'],'source':final['source'],'source_content_id':build['source_content_id'],
 'state_preservation':{'exact_source_clone':checks['native_source_cloned_unchanged'],'parent_state_rebased_only_for_new_mission_hrefs':checks['mission_state_cloned_with_only_automatic_href_rebase'],'fork_state_unchanged_after_clone':checks['state_unchanged_through_lifecycle'],'cloned_state_sha256':h(fork['state']),'final_state_sha256':h(final['state']),'no_source_or_state_mutation_endpoint_called':True},
 'graph':{'nodes':len(nodes),'edges':len(g['edges']),'status_counts':dict(collections.Counter(n['status'] for n in nodes)),'evidence_entries':sum(len(n['evidence']) for n in nodes),'ready_frontier':ready,'native_output':e['value'],'requirement_truth_verified':False},
 'build':{k:build[k] for k in ['id','build_id','content_id','source_content_id','status','tests','tests_passed','environment','immutable']},
 'execution':{k:e[k] for k in ['id','status','attempts','value','value_id','artifacts','logs','runtime_environment','runtime_environment_id','receipt']},
 'execution_url':'https://purl-api-production.up.railway.app/api/executions/'+e['id'],
 'artifact_urls':['https://purl-api-production.up.railway.app/api/artifacts/'+a for a in e['artifacts']],
 'release':{k:rel[k] for k in ['id','url','immutable','content_id','source_content_id','build_id','build_content_id']},
 'checkpoint':cp,'continuity_url':'https://purl-api-production.up.railway.app/api/programs/'+final['id']+'/continuity','replay':replay,
 'checks':checks,'checks_passed':sum(checks.values()),'checks_failed':0,
 'coordinated_progress_provenance':'Progress beyond this final fork and earlier cold session was supplied by root as verified results. It is carried as explicitly attributed checkpoint author assertions, with references to current acceptance/handoff/recovery reports. This agent did not rerun those suites or read local product source/env/database/reports. Root publishes latest referenced reports before final delivery.',
 'coordinated_progress':{'api_and_worker':'LIVE, Supabase persistence','product_revision':'0670bad','host_node':'24','pinned_deployed_node':'22','clean_cold_checks':'197/197','local_experiments':'10/10','hosted_checks':42,'private_storage_byte_retrieval':'PASS','same_project_restore':'PASS','public_ui_devices':2,'public_ui_checks':12,'axe_findings':0,'prior_fresh_cold_session_checks':'30/30','public_restart_native_node22_strict_replay':'57/57 PASS','historical_node24_strict_replay':'Expected environment mismatch under Node22'},
 'remaining':{'verified_human_auth_redirect':'PENDING','production_email':'PENDING','independent_cross_provider_continuity':'NOT_RUN','oracle_arm':'NOT_RUN','cross_project_disaster_restore':'NOT_RUN','public_authored_JS_TS_Python':'DISABLED','full_scope_complete':False},
 'frozen_v6_preservation':'Independent read-only agent reported both original programs at expected version 6/state_hash/head, valid and replayable both before and after this final fork lifecycle; after-handoff preservation PASS is recorded under independent-graph/final-frozen-preservation-after-handoff.json. No mutation targeted either frozen program except read-authorized fork creation, which does not change the parent program.',
 'preservation_report':'independent-graph/final-frozen-preservation-after-handoff.json',
 'http':{'evidence_dir':'final-handoff-http','index':'final-handoff-http/http-index.json','calls':len(R),'max_calls_per_rolling_60_seconds':max60,'post_count':sum(r['request']['method']=='POST' for r in R.values()),'rate_limit':60,'rate_limit_errors':sum(r['response']['status']==429 for r in R.values()),'errors_preserved':errors,'token':'New bearer held only in process memory and redacted; no recovery of old credentials. Final memory-to-files comparison performed separately.'},
 'limitations':['Checkpoint evidence_verified remains false; graph statuses are recorded claims, not requirement truth.','Mission inherited zero embedded tests; narrow client checks assert actual API lifecycle and inspector output. No broad suite was rerun.','One anonymous status GET returned500 internal_error, followed by successful authenticated retries. Execution eventually succeeded on attempt2; failed status response and execution logs are retained.','Root-provided coordinated results are attributed, with pending publication of latest public GitHub references; this agent did not independently rerun them.','Frozen original cold-session report and v6 program releases/checkpoints were not overwritten.'],
}
(P/'final-handoff-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
md=f'''# Final public continuation handoff

Created a new public mission under a new self-declared principal. **{sum(checks.values())}/{len(checks)} narrow API checks passed**. The original frozen v6 programs and original cold-session report are preserved.

- Canonical continuation: [{final['id']}]({final['url']}) — public, version6.
- Build: `{build['id']}`; content `{build['content_id']}`.
- Execution: [{e['id']}](https://purl-api-production.up.railway.app/api/executions/{e['id']}) — succeeded; actual worker `v22.14.0`, attempt {e['attempts']}.
- Immutable release: [{rel['id']}]({rel['url']}).
- Latest checkpoint: [{cp['id']}](https://purl-api-production.up.railway.app/api/programs/{final['id']}/continuity) — `evidence_verified: false`.

The native inspector ran the cloned fork state: **52 nodes/65 edges**, frontier `["mission"]`, all 52 statuses `NOT_RUN`, completion `NOT_RUN`, verified `false`. Source and cloned state stayed unchanged throughout the lifecycle. Fork creation automatically rebased mission hrefs to the new program; no requirement text, status, evidence or dependency changed. The mission has zero inherited embedded build tests; actual lifecycle and inspector behavior were checked through narrow API assertions.

The substantive checkpoint summarizes coordinated verification: LIVE API/worker with Supabase, product revision 0670bad, host Node 24/pinned Node 22, clean checks 197/197, local experiments 10/10, 42 hosted checks, private Storage byte retrieval and same-project restore PASS, public UI two devices/12 checks/zero axe findings, prior fresh 30/30, public restart 57/57/native Node 22 strict replay PASS. Historical Node24 replay correctly detects the Node22 environment mismatch. These coordinated results are attributed root-provided assertions with current public acceptance/handoff/recovery references; they were not rerun here.

**Full scope is incomplete.** Verified human Auth redirect and production email remain pending. Independent cross-provider continuation, Oracle ARM and cross-project disaster restore remain NOT_RUN. Public authored JS/TS/Python execution remains disabled.

Checkpoint.next begins by reading linked ACCEPTANCE.json, handoff.json, current documentation and recovery evidence, then completing production Auth redirect/email setup. It preserves existing reconstruction evidence and directs remaining evidence-backed work.

One status GET returned HTTP500 and is retained. Authenticated retries worked; the bounded execution succeeded on attempt2. Anonymous final program/continuity/canonical/release reads and strict replay passed. No fresh execution was queued in response to the transient error.

Exact IDs, hashes, checkpoint text, assertions and limits are in `final-handoff-report.json`; redacted exchanges are in `final-handoff-http/`. Independent preservation evidence is `independent-graph/final-frozen-preservation-after-handoff.json`. This final phase made {len(R)} HTTP calls ({sum(r['request']['method']=='POST' for r in R.values())} POSTs), with a maximum of {max60} calls in a rolling minute and zero 429 responses.
'''
(P/'final-handoff-report.md').write_text(md)
print(json.dumps({'checks_passed':sum(checks.values()),'checks_failed':0,'canonical_url':final['url'],'execution_id':e['id'],'release_id':rel['id'],'checkpoint_id':cp['id'],'http_calls':len(R),'transient_errors':len(errors)},indent=2))
