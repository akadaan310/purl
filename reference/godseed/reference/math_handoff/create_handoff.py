from pathlib import Path
import json, hashlib
p=Path(__file__).resolve().parent
results=json.loads((p/'experiments/results.json').read_text())
source_records=[
 ('purl','3df4452a3624b3f5492bf23c2dacc49d8d2b33c7',['SPEC.md','ARCHITECTURE.md','PRINCIPLES.md','SECURITY.md','src/continuity/operations.js','src/continuity/store.js','src/research/projection.js','test/http.test.js']),
 ('seurl','620ff955b87857c3eb7a7700a81b6a4d0217400a',['README.md','NAI-CI.md']),
 ('substrateIO','7ace119a544fc736f0d4ec1d72cded9dad0a83e3',['PROTOCOL.md','research/ONTOLOGY.md','substrate/purl.py']),
 ('NetGovComEduGovOrgEduGovComNet','9fcf2e1da3ce01a4e66eb5be5e2249b1f211878b',['PROTOCOL.md','src/protocol/operations.ts']),
 ('computationalgrammartheory','bfe32fc37f7fa61d50da50ecd2aa7fa97c0dd5a1',['DEFINITIONS.md','FORMAL_MODELS.md','RESULTS.md']),
 ('grammarinnumbers','2a94f8a6be686078a9dad88863be9aafc5e6379b',['DEFINITIONS.md','CGT_CONCEPT_MAP.md','ARITHMETIC_GRAMMAR.md'])
]
sources=[]
for repo,sha,paths in source_records:
    sources.append({'repository':f'akadaan310/{repo}','commit':sha,'inspection':'GitHub read-only contents and source snippets','files':[{'path':x,'url':f'https://github.com/akadaan310/{repo}/blob/{sha}/{x}'} for x in paths]})
sources.append({'repository':'akadaan310/grammarinnumbers','commit':'5c96ddca7b032ff76ab11d1c8306d2aef4bcf211','inspection':'research branch previously retrieved in this conversation; PR unmerged at that inspection','files':[{'path':'research/the-number/FOUNDATIONS.md','url':'https://github.com/akadaan310/grammarinnumbers/blob/5c96ddca7b032ff76ab11d1c8306d2aef4bcf211/research/the-number/FOUNDATIONS.md'},{'path':'research/the-number/FALSIFICATION_MATRIX.md','url':'https://github.com/akadaan310/grammarinnumbers/blob/5c96ddca7b032ff76ab11d1c8306d2aef4bcf211/research/the-number/FALSIFICATION_MATRIX.md'}]})

record={
 'record_type':'purl-cgt-gin-independent-commission-handoff',
 'schema_version':'0.2-research-only',
 'prepared_utc_date':'2026-10-18',
 'commissioner':'Abed Kadan',
 'recipient':'7u / independent engineering research session',
 'status':'complete-for-isolated-theory-and-toy-tests; no live PURL service integration',
 'production_mutations':[],
 'core_verdict':'Retain PURL/0.1 as discovery/authority/event continuity; add typed/effect-checked mission graph as a versioned extension; do not treat URL or compressed trace as universal program.',
 'source_integrity':{'pinned':True,'source_inspection_only':True,'repository_suites_rerun':False,'external_peer_review':False,'sources':sources},
 'evidence_legend':{
    'SOURCE_IMPLEMENTATION':'verified presence of source mechanism, not deployed behavior',
    'CLASSICAL':'a known mathematical law with a proof or recognized model',
    'TOY_EXECUTED':'our isolated local experiment code ran and passed',
    'PROPOSAL':'architecture not deployed',
    'NOT_RUN':'intended empirical trial not run',
    'COUNTEREXAMPLE':'explicit model falsifying a broad proposition'
 },
 'claims':[
  {'id':'C1','statement':'A typed pure operation fragment has identities and associative composition where types match','sources':['CGT-PROP-001','experiments/commission_checks.py'],'evidence':'CLASSICAL+TOY_EXECUTED','limitations':'not effectful runtime associativity'},
  {'id':'C2','statement':'PURL/0.1 store includes declared per-requester manifests, dynamic rights, expected-version validation and atomic planned events in its abstract execution path','sources':['purl/src/continuity/store.js','purl/src/continuity/operations.js','purl/SPEC.md'],'evidence':'SOURCE_IMPLEMENTATION','limitations':'no independent integration or crash/recovery verification'},
  {'id':'C3','statement':'A projection induces a deterministic transition iff projection-equivalent states have equivalent projected successors','sources':['PURL_INDEPENDENT_DISCOVERIES.md'],'evidence':'CLASSICAL+TOY_EXECUTED','limitations':'proved for deterministic functions on image; more conditions for nondeterministic LTS'},
  {'id':'C4','statement':'Canonical syntax, value and run identities must be distinguished','sources':['GiN-DEF-001..004','experiments/commission_checks.py'],'evidence':'CLASSICAL+TOY_EXECUTED','limitations':'value hashing requires a specified canonical typed encoding'},
  {'id':'C5','statement':'A bare URL does not authenticate a session or grant arbitrary execute rights','sources':['purl/SECURITY.md','purl/src/continuity/store.js'],'evidence':'SOURCE_IMPLEMENTATION','limitations':'real fresh-session trial NOT RUN'},
  {'id':'C6','statement':'Local hash-chain consistency does not by itself anchor historical authenticity','sources':['PURL_INDEPENDENT_DISCOVERIES.md','experiments/commission_checks.py'],'evidence':'CLASSICAL+TOY_EXECUTED','limitations':'real adversarial hosted threat model untested'},
  {'id':'C7','statement':'Fixed-length deterministic 2-state toggle has two histories; 007 3-cycle has three','sources':['PURL_TRANSITION_LANGUAGE.md','experiments/commission_checks.py'],'evidence':'CLASSICAL+TOY_EXECUTED','limitations':'extrinsic labels/times enlarge record space, not internal state count'},
  {'id':'C8','statement':'Current PURL/0.1 source is not evidence of a general-purpose sandboxed program runner','sources':['purl/SPEC.md','purl/ARCHITECTURE.md'],'evidence':'SOURCE_IMPLEMENTATION','limitations':'separate extensions may exist outside inspected sources'}
 ],
 'counterexamples':[
  {'id':'K1','target':'all projections yield executable deterministic grammar','model':'X={0,1}², pi(a,b)=a, swap(a,b)=(b,a)','witness':[[0,0],[0,1]],'evidence':'COUNTEREXAMPLE+TOY_EXECUTED'},
  {'id':'K2','target':'same value implies same URL/AST','model':'add(1,2) and add(2,1), both value 3','evidence':'COUNTEREXAMPLE+TOY_EXECUTED'},
  {'id':'K3','target':'local hash-chain validity alone certifies server honesty','model':'recompute chain after rewriting payload','evidence':'COUNTEREXAMPLE+TOY_EXECUTED'},
  {'id':'K4','target':'a three-state cycle contains universal computation','model':'deterministic 007→070→700→007','evidence':'COUNTEREXAMPLE+CLASSICAL'}
 ],
 'experiment_summaries':{
  'E1':{'status':'TOY_EXECUTED','toggle_fixed_length_count':2,'label_assumption':'external independent binary labels'},
  'E2':{'status':'TOY_EXECUTED','three_cycle_fixed_length_count':3},
  'E3':{'status':'TOY_EXECUTED','all_triples':results['E3']['tested_op_triples'],'well_typed':results['E3']['well_typed'],'ill_typed':results['E3']['ill_typed']},
  'E4':{'status':'TOY_EXECUTED','same_value_not_same_derivation':True},
  'E5':{'status':'TOY_EXECUTED','pure_replay_result':results['E5']['replay_result'],'external_effects':'NOT_RUN'},
  'E6':{'status':'TOY_EXECUTED_OFFLINE_ONLY','external_fresh_session_trial':'NOT_RUN'},
  'E7':{'status':'TOY_EXECUTED_CONTRACT_ONLY','benchmark_against_real_clients':'NOT_RUN'},
  'extra_projection':{'status':'TOY_EXECUTED','counterexample_found':True},
  'extra_hash_anchor':{'status':'TOY_EXECUTED','external_anchor_test':'NOT_RUN'}
 },
 'local_tests':{'path':'experiments/commission_checks.py','passed':17,'failed':0,'command':'python -m unittest discover -s experiments -p commission_checks.py -v','results':'experiments/results.json'},
 'decision_matrix':[
  {'item':'PURL existing safe reads, op registry, grants, versioned events','decision':'IMPORT NOW','qualification':'retain, integrate only via tests'},
  {'item':'CGT pure relational path composition','decision':'IMPORT NOW','qualification':'restricted to well-typed/declared operators'},
  {'item':'GiN representation-vs-value distinctions and layered failures','decision':'IMPORT NOW','qualification':'do not equate values and programs'},
  {'item':'Typed mission DAG and hermetic workers','decision':'EXPERIMENT','qualification':'new extension, not existing product'},
  {'item':'Projection-to-program induction','decision':'EXPERIMENT','qualification':'check kernel congruence or keep hidden state'},
  {'item':'ACSP direct database and actor ID merger','decision':'KEEP SEPARATE','qualification':'cross-contract adapter required'},
  {'item':'SEURL seven verbs as unrestricted production primitives','decision':'REJECT','qualification':'no enforceable semantics or rights evidence'},
  {'item':'GET-triggered mutations / authorization from bare URL','decision':'REJECT','qualification':'unsafe and contrary to RFC 9110'}
 ],
 'open_floor':[
  {'title':'Projection-congruence admission checker','status':'CLASSICAL/ENGINEERING','confidence':'high','evidence':'finite counterexample and short proof','next':'test on PURL projections'},
  {'title':'Versioned typed mission program with receipts','status':'PROPOSAL','confidence':'medium','evidence':'source composition + toy type tests','next':'independent integration'},
  {'title':'Fresh session URL-only reconstruction advantage','status':'NOT_RUN','confidence':'unknown','evidence':'toy offline manifest only','next':'blind external benchmark'},
  {'title':'A new field built from toggle bit or 007 cycle','status':'REJECT','confidence':'high','evidence':'classical finite-state periodicity','next':'none until a nontrivial falsifiable result'}
 ],
 'book_proposals':[
  {'title':'The Number: Representation, Distinction and Execution','classification':'companion volume / chapter candidate','publication_gate':'independent proof review and pedagogy'},
  {'title':'Executable Addresses: Typed Programs, Capabilities and Recoverable Histories','classification':'research note now, potential book later','publication_gate':'live cross-provider evidence and security review'}
 ],
 'next_integration_order':[
  'Freeze purl-mission/0 schema and static typed checker',
  'Test pure deterministic worker and receipts; no shell/network',
  'Bind to PURL/0.1 rights, version and checkpoint flow',
  'Add effect-aware sandboxed build node',
  'Run blinded independent provider benchmark against text and DAG baselines',
  'Commission external proof/implementation audit before public claims'
 ],
 'handoff_files':sorted([str(x.relative_to(p)) for x in p.glob('*.md')] + ['experiments/commission_checks.py','experiments/results.json','PURL_MISSION_EXAMPLE.json']),
 'open_questions':['full effect inference soundness','bounded compiled projection equivalence','timing and hidden state capture','log external anchoring','fresh provider permissions','comparing against workflow-engine baselines']
}
(p/'PURL_REVIEW_HANDOFF.json').write_text(json.dumps(record,indent=2,ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
print('Wrote handoff JSON',len(record['claims']),'claims,',len(record['source_integrity']['sources']),'source revisions')
