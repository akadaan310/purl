import collections,hashlib,json,pathlib
out=pathlib.Path('/workspace/purl/evidence/deployment/public-cold-session/independent-graph')
p=json.loads((out/'04-program.json').read_text())['program'];g=p['state']['graph'];ns=g['nodes'];es=g['edges'];ids=[n['id'] for n in ns];byid={n['id']:n for n in ns}
deps=[(d,n['id']) for n in ns for d in n.get('dependencies',[])];edges=[(e.get('from'),e.get('to')) for e in es]
ready=[n['id'] for n in ns if n.get('status')!='PASS' and all(byid.get(d,{}).get('status')=='PASS' for d in n.get('dependencies',[]))]
missing=[{'node':n['id'],'dependency':d} for n in ns for d in n.get('dependencies',[]) if d not in byid]
invalid=[e for e in es if e.get('from') not in byid or e.get('to') not in byid]
indegree={i:0 for i in byid};children=collections.defaultdict(list)
for a,b in set(deps):
 if a in byid and b in byid: indegree[b]+=1;children[a].append(b)
q=collections.deque(i for i in ids if indegree[i]==0);topo=[]
while q:
 i=q.popleft();topo.append(i)
 for c in children[i]:
  indegree[c]-=1
  if indegree[c]==0:q.append(c)
report={'scope':'Independent public HTTP GET-only check. No session, mutations, original run, repository code, environment files, or existing reports used. Reads only downloaded public responses and this analysis script.',
'program':{'id':p['id'],'version':p['version'],'source_revision':p.get('source_revision'),'source':p['source'],'active_build':p.get('active_build'),'state_completion':p['state'].get('completion'),'state_evidence_class':p['state'].get('evidence_class')},
'graph':{'node_count':len(ns),'edge_count':len(es),'unique_node_count':len(byid),'explicit_dependency_count':len(deps),'type_totals':dict(collections.Counter(n.get('type') for n in ns)),'status_totals':dict(collections.Counter(n.get('status') for n in ns)),'relation_totals':dict(collections.Counter(e.get('relation') for e in es)),'evidence_entry_count':sum(len(n.get('evidence',[])) for n in ns),'test_assertion_count':sum(len(n.get('tests',[])) for n in ns)},
'ready_frontier':{'criterion':"node.status != 'PASS' and every explicit node.dependencies reference resolves to a node with status exactly 'PASS'; zero dependencies satisfy this vacuously",'node_ids':ready,'nodes':[{'id':byid[i]['id'],'title':byid[i]['title'],'status':byid[i].get('status'),'dependencies':byid[i].get('dependencies',[])} for i in ready]},
'structural_consistency':{'duplicate_node_ids':[k for k,c in collections.Counter(ids).items() if c>1],'missing_dependency_targets':missing,'invalid_edge_endpoints':invalid,'duplicate_edge_pairs':[list(k) for k,c in collections.Counter(edges).items() if c>1],'edges_without_explicit_dependency':[list(x) for x in sorted(set(edges)-set(deps))],'explicit_dependencies_without_edge':[list(x) for x in sorted(set(deps)-set(edges))],'edge_orientation':'edge.from is prerequisite, edge.to is dependent, checked against every explicit node.dependencies entry','acyclic':len(topo)==len(byid),'topologically_processed_nodes':len(topo),'unprocessed_node_ids':[i for i in ids if i not in topo],'empty_evidence_nodes':[n['id'] for n in ns if not n.get('evidence')]},
'advertised_operator':next(x for x in json.loads((out/'05-operators.json').read_text())['items'] if x.get('name')=='mission.inspect'),
'limitations':['This check validates public response graph structure and calculates readiness from recorded statuses; it does not validate the truth or completeness of mission requirements, proofs, tests, or evidence.','No native mission.inspect execution or original mission program run was requested or performed. Its advertised metadata and persisted source/build were inspected only.','Every node is NOT_RUN with empty evidence in this snapshot; readiness of the mission root is an execution ordering result, not completion.','Recorded state.evidence_class is LIVE_LOCAL and completion is NOT_RUN/unverified; the check does not relabel these claims.','Observations cover the public snapshot retrieved at the response metadata timestamps, not future state.']}
(out/'analysis.json').write_text(json.dumps(report,indent=2)+'\n')
(out/'source.purl').write_text(p['source']+'\n')
(out/'graph.json').write_text(json.dumps(g,indent=2)+'\n')
(out/'node-status-dependencies.json').write_text(json.dumps([{'id':n['id'],'status':n.get('status'),'dependencies':n.get('dependencies',[])} for n in ns],indent=2)+'\n')
checks={k:v for k,v in report['structural_consistency'].items() if k!='empty_evidence_nodes'}
print(json.dumps({k:report[k] for k in ['program','graph','ready_frontier']},indent=2));print(json.dumps(checks,indent=2))
lines=['# Independent public graph check','',f"Public program `{p['id']}` version {p['version']}, source revision {p['source_revision']}.",'',f"Graph: {len(ns)} nodes, {len(es)} edges, {len(deps)} explicit dependencies. Status totals: {report['graph']['status_totals']}.",'',f"Ready frontier: {', '.join(ready)}. A non-PASS node is ready when every explicit dependency resolves to status PASS; zero dependencies pass vacuously.",'',f"Structural result: {'acyclic' if report['structural_consistency']['acyclic'] else 'cycle or missing structure'}; {len(topo)} nodes topologically processed; no duplicate IDs, dangling references, duplicate edge pairs, or dependency/edge mismatches were found." if not any([report['structural_consistency'][k] for k in ['duplicate_node_ids','missing_dependency_targets','invalid_edge_endpoints','duplicate_edge_pairs','edges_without_explicit_dependency','explicit_dependencies_without_edge']]) else 'See analysis.json for graph issues.','',f"Persisted source: `{p['source']}`. Public registry advertises `mission.inspect@1.0.0`, deterministic, available, empty effects and requirements. No execution was performed.",'','Limitations:']
lines.extend('- '+x for x in report['limitations']);lines+=['','Discovery: entry HTTP Link → /.well-known/purl → mission manifest → inspect/source link → public program JSON. The manifest also links /api/operators. All five GET requests returned HTTP 200 and were spaced more than one second apart. No credentials were used.','', 'Artifacts: raw response bodies and response metadata, graph.json, source.purl, node-status-dependencies.json, analysis.json, and reproducible analyze.py.']
(out/'REPORT.md').write_text('\n'.join(lines)+'\n')
manifest={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.iterdir()) if f.is_file() and f.name!='SHA256SUMS.json'}
(out/'SHA256SUMS.json').write_text(json.dumps(manifest,indent=2)+'\n')
