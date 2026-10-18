import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,execute} from '../../service/compiler.js';
const run=state=>{const compiled=compile('input json | mission.inspect');assert.ok(compiled.ok,JSON.stringify(compiled.diagnostics));return execute(compiled.plan,state).value;};
test('executable mission computes the lawful dependency frontier and distinguishes claims from verified completion',()=>{
 const result=run({graph:{nodes:[{id:'parse',dependencies:[],status:'PASS'},{id:'build',dependencies:['parse'],status:'NOT_RUN'},{id:'publish',dependencies:['build'],status:'NOT_RUN'}]}});
 assert.deepEqual(result.ready_nodes,['build']);assert.deepEqual(result.completed_nodes,['parse']);assert.deepEqual(result.waiting_nodes,['publish']);assert.equal(result.completion,'NOT_RUN');assert.equal(result.verified,false);
});
test('mission evaluator rejects duplicate nodes, missing dependencies and dependency cycles',()=>{
 for(const nodes of [[{id:'a',dependencies:[]},{id:'a',dependencies:[]}],[{id:'a',dependencies:['b']}],[{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}]])assert.throws(()=>run({graph:{nodes}}),/mission|dependency|cycle|duplicate/i);
});
