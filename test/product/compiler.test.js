import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile, execute, operators, checkProjection, compileTrace, mapSeurl, identity } from '../../service/compiler.js';
const source = (input, steps) => ({ language: 'purl/1', input, steps });
const run = (program, input, options) => {
  const result = compile(program);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return execute(result.plan, input, options);
};

test('compiles a typed arithmetic pipeline to a serializable versioned plan', () => {
  assert.equal(typeof compile, 'function', 'the PURL compiler must be available');
  const result = compile('input number | math.add 2 | math.multiply 3');
  assert.equal(result.ok, true);
  assert.equal(result.plan.language, 'purl/1');
  assert.equal(result.plan.ir_version, 'purl-ir/1');
  assert.equal(result.plan.input_type, 'number');
  assert.equal(result.plan.output_type, 'number');
  assert.deepEqual(result.plan.effects, []);
  assert.deepEqual(result.plan.requires, []);
  assert.equal(execute(JSON.parse(JSON.stringify(result.plan)), 4).value, 18);
});

test('JSON and DSL normalize to the same derivation', () => {
  const a = compile('input number | add 2 | multiply 3');
  const b = compile(source('number', [{ op: 'math.add', args: { value: 2 } }, { op: 'math.multiply', args: { value: 3 } }]));
  assert.equal(a.ok, true);
  assert.equal(a.derivation_id, b.derivation_id);
});

test('diagnostics distinguish parsing, types, capabilities and normalization', () => {
  const cases = [
    ['input number | math.add {', 'parse', 'SYNTAX'],
    ['input string | math.add 1', 'type', 'TYPE_MISMATCH'],
    ['input json | network.fetch', 'capability', 'MISSING_CAPABILITY'],
    [source('number', [{ repeat: { count: 1001, steps: [{ op: 'math.add', args: { value: 1 } }] } }]), 'normalize', 'REPEAT_BOUND'],
  ];
  for (const [program, stage, code] of cases) {
    const result = compile(program);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some(d => d.stage === stage && d.code === code), JSON.stringify(result));
    assert.equal(result.plan, null);
  }
});

test('rejects unknown operators, malformed arguments, versions and source objects', () => {
  for (const program of [
    'input number | process.exec "whoami"',
    'input number | math.add "2"',
    source('number', [{ op: 'math.add', version: '99', args: { value: 2 } }]),
    { language: 'purl/999', input: 'json', steps: [] },
    { language: 'purl/1', input: 'number', steps: [{ op: 'math.add', args: { value: Infinity } }] },
    source('number', [{ op: 'math.add', args: { value: 2, unexpected: 'ignored?' } }]),
  ]) assert.equal(compile(program).ok, false, JSON.stringify(program));
});

test('branch paths agree on output type and join both effect rows', () => {
  const branch = { branch: {
    when: { op: 'math.greaterThan', args: { value: 0 } },
    then: [{ op: 'math.multiply', args: { value: 2 } }],
    else: [{ op: 'math.abs' }],
  } };
  assert.equal(run(source('number', [branch]), 3).value, 6);
  assert.equal(run(source('number', [branch]), -3).value, 3);
  const bad = structuredClone(branch);
  bad.branch.else = [{ op: 'json.stringify' }];
  assert.equal(compile(source('number', [bad])).ok, false);
  const effectful = structuredClone(branch);
  effectful.branch.then = [{ op: 'artifact.write' }];
  assert.equal(compile(source('number', [effectful])).ok, false);
});

test('bounded repetition and nested composition preserve types and execute in order', () => {
  const program = source('number', [
    { compose: [{ op: 'math.add', args: { value: 1 } }, { repeat: { count: 3, steps: [{ op: 'math.multiply', args: { value: 2 } }] } }] },
  ]);
  assert.equal(run(program, 2).value, 24);
  assert.equal(compile(source('number', [{ repeat: { count: 2, steps: [{ op: 'json.stringify' }] } }])).ok, false);
  assert.equal(run('input number | repeat 3 { math.add 2 }', 0).value, 6);
});

test('effects are explicit and rights never activate external adapters', () => {
  const result = compile('input json | network.fetch', { capabilities: ['external:read'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.effects, ['external-read']);
  assert.deepEqual(result.plan.requires, ['external:read']);
  assert.throws(() => execute(result.plan, { url: 'https://example.invalid' }), /adapter|unavailable/i);
  for (const name of ['artifact.write', 'state.commit']) {
    const denied = compile(source('json', [{ op: name }]));
    assert.equal(denied.ok, false);
    assert.ok(denied.diagnostics.some(d => d.stage === 'capability'));
  }
});

test('replay records capture seed input versions environment and every pure transition', () => {
  const a = run('input number | math.add 2 | math.multiply 3', 4, { seed: 19 });
  const b = run('input number | math.add 2 | math.multiply 3', 4, { seed: 19 });
  assert.deepEqual(a, b);
  assert.equal(a.trace.seed, 19);
  assert.equal(a.trace.input, 4);
  assert.equal(a.trace.steps.length, 2);
  assert.equal(a.trace.steps[0].op, 'math.add');
  assert.ok(a.trace.operators.every(op => op.version && op.digest));
  assert.ok(a.trace.environment_id);
  assert.equal(a.trace.determinism, 'deterministic');
});

test('tampered plans and unsafe values cannot bypass the checker at execution', () => {
  const result = compile('input number | math.add 2');
  const forged = structuredClone(result.plan);
  forged.steps[0].op = 'process.exec';
  assert.throws(() => execute(forged, 1), /plan|operator|integrity/i);
  for (const input of [Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '2']) {
    assert.throws(() => execute(result.plan, input), /number|safe|finite|type/i);
  }
  assert.throws(() => run('input number | math.divide 0', 5), /zero/i);
  assert.throws(() => run('input number | math.multiply 2', Number.MAX_SAFE_INTEGER), /safe/i);
});

test('runtime and compilation quotas bound values, source and expanded work', () => {
  assert.equal(compile(`input string | string.concat ${JSON.stringify('x'.repeat(70_000))}`).ok, false);
  const huge = source('number', [{ repeat: { count: 1000, steps: [{ repeat: { count: 1000, steps: [{ op: 'identity' }] } }] } }]);
  assert.equal(compile(huge).ok, false);
  assert.throws(() => run('input array | array.length', Array.from({ length: 10001 }, () => 0)), /quota|limit/i);
});

test('allocation preflight and cumulative work quotas reject amplification before allocating', () => {
  const text = 'a'.repeat(50_000);
  const replacement = 'b'.repeat(20_000);
  assert.throws(() => run(source('string', [{ op: 'string.replace', args: { search: 'a', replacement } }]), text), /quota|limit/i);
  assert.throws(() => run(source('array', [{ op: 'array.join', args: { value: replacement } }]), Array.from({ length: 1000 }, () => 'a')), /quota|limit/i);
  assert.throws(() => run('input string | string.split ""', text), /quota|limit/i);
  assert.throws(() => run('input string | repeat 1000 { string.reverse }', 'a'.repeat(30_000)), /work|quota|limit/i);
});

test('literal data cannot run getters or coercion hooks and prototype keys remain inert', () => {
  let executed = false;
  const hostile = { language: 'purl/1', input: 'number', steps: [] };
  Object.defineProperty(hostile, 'steps', { enumerable: true, get() { executed = true; return []; } });
  assert.equal(compile(hostile).ok, false);
  assert.equal(executed, false);
  const hiddenGetter = { steps: [] };
  Object.defineProperty(hiddenGetter, 'input', { get() { executed = true; return 'json'; } });
  assert.equal(compile(hiddenGetter).ok, false);
  assert.equal(executed, false);
  assert.throws(() => identity('value', { [Symbol('hidden')]: 1 }), /JSON|symbol|property/i);
  assert.equal(compile(source('string', [{ op: 'bits.xor', args: { value: { toString() { executed = true; return '1'; } } } }])).ok, false);
  assert.equal(executed, false);
  assert.equal(compile('input json | json.get {"path":["__proto__"]}').ok, false);
  const data = JSON.parse('{"__proto__":{"safe":true}}');
  assert.equal(run('input json | json.stringify', data).value, '{"__proto__":{"safe":true}}');
  assert.equal({}.safe, undefined);
});

test('identity separates address derivation value content environment build and execution', () => {
  assert.equal(identity('value', { b: 2, a: 1 }), identity('value', { a: 1, b: 2 }));
  assert.notEqual(identity('content', { a: 1 }), identity('value', { a: 1 }));
  assert.equal(identity('address', 'https://EXAMPLE.com:443/a'), identity('address', 'https://example.com/a'));
  const a = run('input number | math.add 2', 1);
  const b = run('input number | math.add 1', 2);
  assert.equal(a.value_id, b.value_id);
  assert.notEqual(compile('input number | math.add 2').derivation_id, compile('input number | math.add 1').derivation_id);
  assert.throws(() => identity('semantic_equivalence', 'same'), /identity|semantic|kind/i);
});

test('pure library supports parsing JSON strings arrays graphs state machines and artifacts', () => {
  assert.equal(run('input string | string.trim | string.uppercase', ' purl ').value, 'PURL');
  assert.deepEqual(run('input string | json.parse | json.get {"path":["items"],"type":"array"} | array.reverse', '{"items":[1,2,3]}').value, [3, 2, 1]);
  assert.equal(run('input array | math.sum', [1, 2, 3]).value, 6);
  assert.equal(run('input string | parse.number', '007').value, 7);
  assert.deepEqual(run('input string | parse.csv', 'a,b\n"c,d",e').value, [['a', 'b'], ['c,d', 'e']]);
  assert.deepEqual(run('input graph | graph.bfs {"start":"a"}', { nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] }).value, ['a', 'b', 'c']);
  assert.deepEqual(run('input graph | graph.toposort', { nodes: ['a', 'b'], edges: [['a', 'b']] }).value, ['a', 'b']);
  const artifact = run('input json | artifact.json', { b: 2, a: 1 }).value;
  assert.equal(artifact.media_type, 'application/json');
  assert.equal(artifact.content, '{"a":1,"b":2}');
  assert.ok(artifact.content_id);
  assert.ok(operators().length >= 35);
  for (const op of operators()) assert.ok(op.version && op.digest && op.input && op.output && op.determinism && op.provenance && op.tests);
});

test('bit toggles and 007 labels retain their exact finite state behavior', () => {
  for (const initial of [0, 1]) {
    assert.equal(run('input number | repeat 8 { state.toggle }', initial).value, initial);
    assert.equal(run('input number | repeat 9 { state.toggle }', initial).value, 1 - initial);
  }
  for (const initial of ['007', '070', '700']) assert.equal(run('input string | repeat 3 { state.cycle007 }', initial).value, initial);
  assert.throws(() => run('input string | state.cycle007', '7'), /007|label|state/i);
});

test('composition binary-string operators retain width and reject unequal operands', () => {
  assert.equal(run('input string | bits.not', '0011').value, '1100');
  assert.equal(run('input string | bits.xor "1010"', '1100').value, '0110');
  assert.equal(run('input string | bits.and "1010"', '1100').value, '1000');
  assert.equal(run('input string | bits.or "1010"', '1100').value, '1110');
  assert.equal(run('input string | bits.concat "01"', '1100').value, '110001');
  assert.match(run('input string | bits.hash', '1100').value, /^[01]{256}$/);
  assert.throws(() => run('input string | bits.xor "1"', '1100'), /length|width/i);
});

const swapProjection = () => ({
  domain: [[0, 0], [0, 1], [1, 0], [1, 1]],
  domain_complete: true,
  projection: { op: 'json.get', args: { path: [0], type: 'number' } },
  operations: [{ name: 'swap', operator: { op: 'array.reverse' } }],
});

test('projection compiler rejects a hidden-bit swap with a concrete successor witness', () => {
  const result = checkProjection(swapProjection());
  assert.equal(result.ok, false);
  assert.equal(result.complete, true);
  assert.equal(result.witness.reason, 'successor');
  assert.deepEqual(result.witness.left, [0, 0]);
  assert.deepEqual(result.witness.right, [0, 1]);
  assert.equal(compileTrace({ ...swapProjection(), trace: [[0, 0], [0, 1]] }).ok, false);
});

test('complete finite projection checks enabledness effects and closure', () => {
  const base = {
    domain: [{ visible: 0, hidden: 0 }, { visible: 0, hidden: 1 }], domain_complete: true,
    projection: { op: 'json.get', args: { path: ['visible'], type: 'number' } },
  };
  const enabled = checkProjection({ ...base, operations: [{ name: 'enabled', transitions: [
    { from: base.domain[0], to: base.domain[0], effects: [] },
    { from: base.domain[1], enabled: false },
  ] }] });
  assert.equal(enabled.witness.reason, 'enabledness');
  const effects = checkProjection({ ...base, operations: [{ name: 'effect', transitions: [
    { from: base.domain[0], to: base.domain[0], effects: [] },
    { from: base.domain[1], to: base.domain[1], effects: ['mutation'] },
  ] }] });
  assert.equal(effects.witness.reason, 'effects');
  assert.equal(checkProjection({ ...base, operations: [{ name: 'incomplete', transitions: [] }] }).ok, false);
  assert.equal(checkProjection({ ...swapProjection(), domain_complete: false }).ok, false);
});

test('positive complete quotient compiles a replayable transition program', () => {
  const spec = {
    domain: [0, 1], domain_complete: true,
    projection: { op: 'identity' },
    operations: [{ name: 'flip', operator: { op: 'state.toggle' } }],
    trace: [0, 1, 0, 1], labels: ['flip', 'flip', 'flip'],
  };
  const checked = checkProjection(spec);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal(checked.fibers, 2);
  const compiled = compileTrace(spec);
  assert.equal(compiled.ok, true, JSON.stringify(compiled));
  assert.equal(execute(compiled.plan, 0).value, 1);
  assert.equal(execute(compiled.plan, 1).value, 0);
  assert.equal(compiled.evidence.class, 'complete-finite-domain');
});

test('known typed pure operators validate traces without inventing unobserved semantics', () => {
  const valid = compileTrace({ operator: { op: 'state.cycle007' }, trace: ['007', '070', '700', '007'] });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(execute(valid.plan, '070').value, '070');
  assert.equal(valid.evidence.class, 'known-operator-replay');
  assert.equal(compileTrace({ trace: [0, 1, 0] }).ok, false);
  assert.equal(compileTrace({ operator: { op: 'state.cycle007' }, trace: ['007', '700'] }).ok, false);
  assert.equal(compileTrace({ operator: { op: 'network.fetch' }, trace: [{}, {}] }).ok, false);
});

test('SEURL mappings preserve ambiguity and document each seven-verb decision', () => {
  for (const verb of ['START', 'SWITCH', 'WRITE', 'COMMIT', 'BUILD', 'TALK', 'PERTURB']) {
    const mapping = mapSeurl(verb, {});
    assert.equal(mapping.verb, verb);
    assert.equal(mapping.lossless, false);
    assert.ok(mapping.caveats.length);
  }
  assert.equal(mapSeurl('WRITE', { mode: 'append' }).operation, 'append');
  assert.equal(mapSeurl('COMMIT', { mode: 'checkpoint' }).operation, 'checkpoint');
  assert.equal(mapSeurl('TALK', { mode: 'external' }).ok, false);
  assert.equal(mapSeurl('PERTURB', { mode: 'pure', amount: 1 }).operation, 'math.add');
  assert.equal(mapSeurl('UNKNOWN').ok, false);
});
