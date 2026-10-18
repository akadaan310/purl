import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogService } from '../../service/launch/catalog.js';
import { operations, runOperation } from '../../service/launch/catalog-operations.js';
import { MemoryService } from '../../service/launch/memory.js';
import { MemoryLaunchStore } from '../../service/launch/store.js';
const actor={id:'catalog-owner',kind:'human',verified:true,scopes:['catalog:run','memory:read','memory:write','memory:share']};
const setup=()=>{const store=new MemoryLaunchStore(),memory=new MemoryService({store,baseUrl:'https://purl.test'});return {store,memory,catalog:new CatalogService({store,memory,baseUrl:'https://purl.test'})};};

test('every working experience has a unique typed executable graph and real expected sample',async()=>{
 const {catalog,memory}=setup();await memory.handle('POST','/api/memory/create',{text:'Selected context',tags:['research','decision','business']},actor);
 const entries=catalog.catalog(),working=entries.filter(x=>x.status==='working');assert(working.length>=40);assert(working.length<=60);
 assert.equal(new Set(working.map(e=>JSON.stringify(e.graph))).size,working.length);
 for(const e of working) {
  for(const field of ['id','title','audience','outcome','capability_class','input_schema','output_schema','graph','state','effects','permissions','free_limits','tests','provenance','limitations']) assert(e[field]!==undefined,`${e.id} lacks ${field}`);
  const sample=e.tests[0];assert(sample&&sample.input&&sample.expected,`missing sample: ${e.id}`);
  const r=await catalog.handle('POST',`/api/catalog/${e.id}/run`,{input:sample.input},actor);
  assert.equal(r.status,200,e.id);for(const [key,val] of Object.entries(sample.expected)) assert.deepEqual(r.body.result[key],val,`${e.id}.${key}`);
  assert.deepEqual(r.body.graph,e.graph);assert.match(r.body.receipt.output_hash,/^[a-f0-9]{64}$/);assert.equal(r.body.receipt.owner_persisted,e.state.writes);
  await assert.rejects(catalog.handle('POST',`/api/catalog/${e.id}/run`,{input:{...sample.input,invented:true}},actor),err=>err.status===400,`reject unknown fields: ${e.id}`);
 }
});
test('required titles exist and unavailable inference never fabricates AI output',async()=>{
 const {catalog}=setup(),titles=['Never Start Over','Memory Passport','Memory Atlas','AI Connections','Research Continuity','AI Inbox','Resume Here','Constellation Debate','Evidence Jury','Code Review Constellation','Program Forge','GitHub Computational Lens','Architecture Map','Structural Diff','Team Decision Memory','Business Context','Reproducible Research','CGIT Steward','Bring Your Own Model','Personal AI Workspace'];
 const entries=catalog.catalog();for(const title of titles) assert(entries.some(x=>x.title===title),title);
 for(const e of entries.filter(x=>x.status!=='working')) await assert.rejects(catalog.handle('POST',`/api/catalog/${e.id}/run`,{input:{}},actor),err=>err.status===503);
 assert.equal((await catalog.handle('GET','/api/catalog',{},null)).status,200);
});
test('authorization, typed validation and bounded input are enforced before executing',async()=>{
 const {catalog}=setup();await assert.rejects(catalog.handle('POST','/api/catalog/numeric-summary/run',{input:{values:[1,2]}},null),e=>e.status===401);
 await assert.rejects(catalog.handle('POST','/api/catalog/numeric-summary/run',{input:{values:[1,2]}},{...actor,scopes:[]}),e=>e.status===403);
 await assert.rejects(catalog.handle('POST','/api/catalog/numeric-summary/run',{input:{values:['2']}},actor),e=>e.status===400);
 await assert.rejects(catalog.handle('POST','/api/catalog/json-canonical/run',{input:{value:JSON.parse('{"constructor":{"x":2}}')}},actor),e=>e.status===400);
 await assert.rejects(catalog.handle('POST','/api/catalog/never-start-over/run',{input:{}},{...actor,scopes:['catalog:run']}),e=>e.status===403);
});
test('independent operation boundaries: CSV quotes, numeric math, graph cycles, dates and JSON pointer',()=>{
 assert.deepEqual(runOperation('csv-table',{text:'name,note\nAda,"hello, world"\nBob,"a""b"'}).rows,[{name:'Ada',note:'hello, world'},{name:'Bob',note:'a"b'}]);
 const stats=runOperation('numeric-summary',{values:[2,4,4,4,5,5,7,9]});assert.equal(stats.mean,5);assert.equal(stats.standard_deviation,2);
 assert.throws(()=>runOperation('graph-order',{nodes:['a','b'],edges:[['a','b'],['b','a']]}),e=>e.code==='GRAPH_CYCLE');
 assert.equal(runOperation('graph-path',{nodes:['a','b','c'],edges:[['a','b']],from:'a',to:'c'}).reachable,false);
 assert.equal(runOperation('unit-convert',{value:32,from:'F',to:'C'}).value,0);
 assert.throws(()=>runOperation('unit-convert',{value:1,from:'kg',to:'m'}),e=>e.code==='UNIT_DIMENSION');
 assert.equal(runOperation('deadline-plan',{start:'2026-10-16',workdays:1}).deadline,'2026-10-19');
 assert.equal(runOperation('json-select',{value:{'a/b':{'~key':3}},pointer:'/a~1b/~0key'}).value,3);
 assert.throws(()=>runOperation('json-select',{value:{},pointer:'/missing'}),e=>e.status===404);
 assert.throws(()=>runOperation('weighted-decision',{criteria:[{id:'x',weight:0}],options:[{name:'A',scores:{x:2}}]}),e=>e.status===400);
 assert.throws(()=>runOperation('csv-table',{text:'a,a\n1,2'}),e=>e.status===400);
 assert.throws(()=>runOperation('timeline-sort',{events:[{date:'not-a-date',label:'a'}]}),e=>e.status===400);
 assert.equal(operations.length,32);
});
test('projection bounds and normalized identifiers match their declared behavior',()=>{
 assert.equal(runOperation('compound-growth',{principal:1,annual_rate:0,months:1200,monthly_contribution:1}).series.length,1200);
 assert.equal(runOperation('link-inventory',{text:'https://example.com https://example.com/'}).count,1);
 assert.throws(()=>runOperation('timeline-sort',{events:[{date:'2026-02-31',label:'Impossible date'}]}),e=>e.status===400);
});
test('independent results cover text, tables, finance, decisions, research and continuity computations',async()=>{
 assert.deepEqual(runOperation('text-compare',{before:'same\nsame',after:'same'}),{added:[],removed:['same'],unchanged:1});
 assert.equal(runOperation('text-metrics',{text:''}).words,0);
 assert.equal(runOperation('outline-extract',{text:'ordinary prose'}).count,0);
 assert.equal(runOperation('action-checklist',{text:'- [x] Done'}).completion,1);
 assert.deepEqual(runOperation('word-frequency',{text:'CAFÉ café'}).terms,[{term:'café',count:2}]);
 assert.equal(runOperation('json-canonical',{value:null}).sha256,'74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b');
 assert.deepEqual(runOperation('json-diff',{before:{'a/b':1},after:{}}).changes,[{path:'/a~1b',op:'remove',before:1}]);
 assert.deepEqual(runOperation('table-profile',{rows:[{a:null},{}]}).columns,[{key:'a',present:1,missing:2,unique:1}]);
 assert.throws(()=>runOperation('table-group',{rows:[{team:'A',cost:'2'}],group_by:'team',value_key:'cost'}),e=>e.status===400);
 assert.deepEqual(runOperation('table-deduplicate',{rows:[{id:1,value:'first'},{id:1,value:'second'}],key:'id'}).rows,[{id:1,value:'first'}]);
 assert.equal(runOperation('budget-balance',{income:[],expenses:[{category:'Rent',amount:100}]}).balance,-100);
 assert(Math.abs(runOperation('loan-payment',{principal:1000,annual_rate:0.12,months:12}).payment-88.8487886783416)<1e-9);
 assert.equal(runOperation('risk-register',{risks:[{title:'Certain',likelihood:1,impact:9,mitigation:'A'},{title:'Low',likelihood:0.1,impact:10,mitigation:'B'}]}).ranked[0].title,'Certain');
 assert.throws(()=>runOperation('schedule-cpm',{tasks:[{id:'a',duration:1,depends_on:['missing']}]}),e=>e.code==='GRAPH_EDGE');
 assert.deepEqual(runOperation('graph-components',{nodes:[],edges:[]}),{components:[],count:0});
 assert.deepEqual(runOperation('graph-impact',{nodes:['a','b'],edges:[['a','b'],['b','a']],changed:'a'}).affected,['b']);
 assert.deepEqual(runOperation('evidence-matrix',{claims:[{id:'x',text:'X'}],evidence:[{claim_id:'x',source:'A',stance:'supports'},{claim_id:'x',source:'B',stance:'opposes'}]}).contested,['x']);
 assert.deepEqual(runOperation('citation-audit',{text:'[a] [a]',references:[{id:'b',url:'https://example.com'}]}),{cited:['a'],missing:['a'],unused:['b']});
 assert.equal(runOperation('meeting-record',{as_of:'2026-10-18',decisions:[],actions:[{task:'T',assignee:'A',due:'2026-10-17',done:true}]}).overdue.length,0);
 assert.equal(runOperation('experiment-summary',{control:{successes:0,trials:10},variant:{successes:1,trials:10}}).relative_lift,null);
 assert.throws(()=>runOperation('experiment-summary',{control:{successes:11,trials:10},variant:{successes:1,trials:10}}),e=>e.code==='EXPERIMENT_COUNTS');
 const {catalog}=setup();const stranger={...actor,id:'another-owner'};
 assert.equal((await catalog.handle('POST','/api/catalog/never-start-over/run',{input:{}},stranger)).body.result.context,'');
});
test('accepted larger canonical JSON and combined owner memory produce valid bounded outputs',async()=>{
 const {catalog,memory}=setup();
 const value={one:'a'.repeat(15000),two:'b'.repeat(15000)};
 const canonicalResult=await catalog.handle('POST','/api/catalog/json-canonical/run',{input:{value}},actor);
 assert.equal(canonicalResult.body.result.canonical,JSON.stringify(value));
 for(let i=0;i<6;i++)await memory.handle('POST','/api/memory/create',{text:String(i).repeat(4000)},actor);
 const result=(await catalog.handle('POST','/api/catalog/never-start-over/run',{input:{}},actor)).body.result;
 assert.equal(result.fact_count,6);assert(result.context.length>24000);
 assert.equal(result.context.split('\n').length,6);
 assert(canonicalResult.body.graph.output_schema.properties.canonical.maxLength>=30000);
 assert((await catalog.handle('GET','/api/catalog/never-start-over',{},null)).body.experience.output_schema.properties.context.maxLength>=250000);
});
test('catalog passport run requires supplied consent and never creates an implicit share',async()=>{
 const {catalog,memory}=setup();await memory.handle('POST','/api/memory/create',{text:'Context',tags:['research']},actor);
 const input={tags:['research'],purpose:'Continuation',expires_in_hours:24};
 for(const consent of [undefined,false]) await assert.rejects(catalog.handle('POST','/api/catalog/memory-passport/run',{input:{...input,...(consent===undefined?{}:{consent})}},actor),e=>e.status===400);
 assert.equal((await memory.snapshot(actor)).passports.length,0);
 const r=await catalog.handle('POST','/api/catalog/memory-passport/run',{input:{...input,consent:true}},actor);assert.equal(r.body.result.selected_count,1);assert.equal(r.body.receipt.owner_persisted,true);
});
