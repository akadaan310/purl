import assert from 'node:assert/strict';
import {compile,execute,operators,identity,checkProjection,compileTrace,mapSeurl} from '../service/compiler.js';
import {parseSeurl,compatibilitySources,substrateOperations,mapSubstrateTerm} from '../service/adapters.js';
const records=[];
async function experiment(id,fn){try{records.push({id,status:'PASS',...await fn()});}catch(error){records.push({id,status:'FAIL',error:error.stack});}}
export async function runMathExperiments(){
 await experiment('E01',()=>{
  const a=compile('input number | math.add 2'),b=compile('input number | math.add 1');
  assert.ok(a.ok&&b.ok);const x=execute(a.plan,1),y=execute(b.plan,2);assert.equal(x.value,3);assert.equal(y.value,3);assert.equal(x.value_id,y.value_id);assert.notEqual(a.derivation_id,b.derivation_id);
  assert.notEqual(identity('address','https://purl.example/p/a'),identity('address','https://purl.example/p/b'));
  const ids=Object.fromEntries(['address','derivation','value','content','environment','build','execution'].map(k=>[k,identity(k,k==='address'?'https://purl.example/p/a':{same:1})]));assert.equal(new Set(Object.values(ids)).size,7);
  for(let i=0;i<100;i++)assert.equal(identity('value',{a:i,b:2}),identity('value',{b:2,a:i}));
  return {metrics:{stable_canonicalization_cases:100,distinct_namespaces:7,value:3,derivations:[a.derivation_id,b.derivation_id],value_id:x.value_id},controls:['Same mathematical integer from distinct derivations','Reordered object keys'],negative_evidence:'Hash equality is encoding equality; no semantic equivalence or authenticity claim'};
 });
 await experiment('E02',()=>{
  const specs=[['math.add 2','number','number'],['math.multiply 3','number','number'],['string.uppercase','string','string'],['json.stringify','json','string'],['parse.number','string','number']];
  let accepted=0,rejected=0;const failures=[];
  for(const [a,ain,aout]of specs)for(const [b,bin]of specs){const source=`input ${ain} | ${a} | ${b}`;const r=compile(source);const valid=bin==='json'||aout===bin; if(r.ok!==valid)failures.push({source,valid,diagnostics:r.diagnostics});r.ok?accepted++:rejected++;}
  assert.deepEqual(failures,[]);
  const p=compile('input number | repeat 10 { math.add 1 }');assert.ok(p.ok);assert.equal(execute(p.plan,0).value,10);assert.deepEqual(execute(p.plan,0,{seed:7}),execute(p.plan,0,{seed:7}));
  assert.equal(compile('input json | network.fetch').ok,false);assert.equal(compile('input number | process.exec "bad"').ok,false);assert.equal(compile('input number | repeat 1001 { math.add 1 }').ok,false);
  assert.throws(()=>execute(compile('input number | math.divide 0').plan,3));
  const toggle=[];for(const s of [0,1]){let v=s;for(let i=0;i<20;i++){v=execute(compile('input number | state.toggle').plan,v).value;assert.equal(v,s^((i+1)%2));}toggle.push(v);}
  for(const label of ['007','070','700'])assert.equal(execute(compile('input string | repeat 3 { state.cycle007 }').plan,label).value,label);
  return {metrics:{typed_pair_corpus:25,accepted,rejected,false_acceptances:0,false_rejections:0,registry_size:operators().length,toggle_steps:40,cycle_labels:3},controls:['Independently declared operator input/output table','Unknown operation, missing capability, loop bound and divide-by-zero'],negative_evidence:'Bounded contract corpus, not universal type-system soundness or intelligence benchmark'};
 });
 await experiment('E03',()=>{
  const verbs=['START','SWITCH','WRITE','COMMIT','BUILD','TALK','PERTURB'];const mappings=verbs.map(v=>mapSeurl(v,{}));for(const m of mappings){assert.equal(m.lossless,false);assert.ok(m.caveats.length);}
  const valid=parseSeurl('/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD');
  assert.equal(valid.state,'WRITING');assert.equal(valid.would_reach,'BUILT');assert.deepEqual(valid.prepared.map(x=>x.verb),['COMMIT','BUILD']);
  assert.throws(()=>parseSeurl('/WRITE/hello'),/legal move/);const invalid={rejected:true,path:'/WRITE/hello'};
  assert.equal(mapSeurl('WRITE',{mode:'append'}).operation,'append');assert.equal(mapSeurl('COMMIT',{mode:'checkpoint'}).operation,'checkpoint');assert.equal(mapSeurl('TALK',{mode:'external'}).ok,false);
  const substrate=mapSubstrateTerm('/space/4/state/3');
  return {metrics:{verbs:7,lossless_universal_mappings:0,substrate_registry_size:substrateOperations().length},mappings,historical_parser:{valid,invalid},substrate_example:substrate,controls:compatibilitySources(),negative_evidence:'Static SEURL repository and later executable FSM are separate evidence. Contextual mapping is not protocol equivalence; external TALK does not acquire authority.'};
 });
 await experiment('E04',()=>{
  const domain=[[0,0],[0,1],[1,0],[1,1]];
  const negative={domain,domain_complete:true,projection:{op:'json.get',args:{path:[0],type:'number'}},operations:[{name:'swap',operator:{op:'array.reverse'}}]};
  const witness=checkProjection(negative);assert.equal(witness.ok,false);assert.equal(witness.witness.reason,'successor');
  const [left,right]=[witness.witness.left,witness.witness.right];assert.equal(left[0],right[0]);assert.notEqual(left[1],right[1]);assert.equal(compileTrace({...negative,trace:[[0,0],[0,1]]}).ok,false);
  const positive={domain:[0,1],domain_complete:true,projection:{op:'identity'},operations:[{name:'flip',operator:{op:'state.toggle'}}],trace:[0,1,0,1],labels:['flip','flip','flip']};
  const compiled=compileTrace(positive);assert.ok(compiled.ok,JSON.stringify(compiled));assert.equal(execute(compiled.plan,0).value,1);assert.equal(execute(compiled.plan,1).value,0);
  const base={domain:[{a:0,b:0},{a:0,b:1}],domain_complete:true,projection:{op:'json.get',args:{path:['a'],type:'number'}}};
  const enabled=checkProjection({...base,operations:[{name:'partial',transitions:[{from:base.domain[0],to:base.domain[0],effects:[]},{from:base.domain[1],enabled:false}]}]});assert.equal(enabled.witness.reason,'enabledness');
  const effects=checkProjection({...base,operations:[{name:'effect',transitions:[{from:base.domain[0],to:base.domain[0],effects:[]},{from:base.domain[1],to:base.domain[1],effects:['mutation']}]}]});assert.equal(effects.witness.reason,'effects');
  assert.equal(compileTrace({trace:[0,1,0]}).ok,false);assert.equal(checkProjection({...positive,domain_complete:false}).ok,false);
  return {metrics:{finite_full_states:4,positive_projected_states:2,rejected_negative_classes:5},positive:compiled.evidence,witness:witness.witness,definedness_witness:enabled.witness,effect_witness:effects.witness,negative_evidence:'Completeness of the submitted finite universe is a caller/model assertion. No induction from sampled traces or general-program congruence proof.'};
 });
 return records;
}
if(process.argv[1]===new URL(import.meta.url).pathname)console.log(JSON.stringify(await runMathExperiments(),null,2));
