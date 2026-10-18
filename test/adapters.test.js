import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashOf } from '../src/core/canonical.js';
import { compile, execute } from '../service/compiler.js';

const adapter = await import('../service/adapters.js').catch(() => ({}));

test('alternate source adapters exist as explicit pure compatibility interfaces', () => {
  for (const name of ['parseSeurl', 'mapSubstrateTerm', 'importComposition', 'compatibilitySources', 'substrateOperations']) assert.equal(typeof adapter[name], 'function', name);
});

test('actual SEURL FSM keeps mutations prepared, recognizes uppercase TALK target, and rejects illegal moves', () => {
  assert.equal(adapter.parseSeurl('/seurl?format=json').state, 'IDLE');
  const result = adapter.parseSeurl('/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD/TALK/acsp/ABC');
  assert.equal(result.state, 'WRITING');
  assert.equal(result.would_reach, 'BUILT');
  assert.equal(result.current_address, '/map/eca/90/8/state/5/next');
  assert.deepEqual(result.prepared, [{ verb: 'COMMIT' }, { verb: 'BUILD' }, { verb: 'TALK', to: { system: 'acsp', resource_id: 'ABC' } }]);
  assert.throws(() => adapter.parseSeurl('/seurl/START/space/8/BUILD'), /legal move/);
  assert.throws(() => adapter.parseSeurl('/seurl/START/space/8?token=secret'), /credential/i);
  assert.throws(() => adapter.parseSeurl('/seurl/START/space/8?%63ap=secret'), /credential/i);
  assert.throws(() => adapter.parseSeurl('/seurl?format=json?&token=secret'), /credential/i);
});

test('Substrate term mapping matches Python registry fixtures including optional and unmaterialized terms', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../evidence/reconstruction/substrate-term-fixtures.json', import.meta.url)));
  for (const fixture of fixtures) {
    const actual = adapter.mapSubstrateTerm(fixture.address);
    assert.equal(actual.address, fixture.address);
    assert.equal(actual.kind, fixture.kind);
    assert.equal(actual.derivation_id, fixture.derivation_id);
    assert.deepEqual(actual.steps, fixture.steps);
    assert.deepEqual(actual.requires, fixture.requires);
    assert.equal(actual.evaluated, false);
    assert.equal(actual.value_id, null);
  }
  assert.throws(() => adapter.mapSubstrateTerm('/space/8/next'), /applies/);
  assert.throws(() => adapter.mapSubstrateTerm('/map/eca/90'), /needs/);
  assert.throws(() => adapter.mapSubstrateTerm('/space/-1'), /integer/);
  assert.throws(() => adapter.mapSubstrateTerm('/space/9007199254740993'), /safe integer/);
  const spectrum = adapter.substrateOperations().find((o) => o.id === 'numpy.map.spectrum');
  assert.deepEqual(spectrum.requires, ['numpy']);
  assert.equal(spectrum.executable_here, undefined);
});

const literal = (id, value) => ({ id, type: 'compute-literal', version: 1, state: { compute: 'purl.compute/0.1', node: 'literal', value } });
const pin = (record) => ({ resource: record.id, version: record.version, state_hash: hashOf(record) });

test('composition imports re-evaluate pinned snapshots and emit compiler source without claiming event-chain verification', () => {
  const a = literal('r_a', '1010');
  const b = literal('r_b', '0011');
  const c = { id: 'r_c', type: 'compute-application', version: 3, state: { compute: 'purl.compute/0.1', node: 'application', operation: 'XOR', operands: [pin(a), pin(b)], value: '1001' } };
  const before = JSON.stringify([a, b, c]);
  const imported = adapter.importComposition([a, b, c], 'r_c', { version: 3 });
  assert.equal(imported.value, '1001');
  assert.deepEqual(imported.source, { language: 'purl/1', input: 'json', steps: [{ op: 'constant', args: { value: '1010' } }, { op: 'bits.xor', args: { value: '0011' } }] });
  assert.equal(imported.provenance.event_chains_verified, false);
  assert.equal(imported.provenance.authority_imported, false);
  assert.equal(imported.provenance.snapshots.length, 3);
  assert.equal(JSON.stringify([a, b, c]), before);
  c.state.value = '0000';
  assert.throws(() => adapter.importComposition([a, b, c], 'r_c'), /claim/);
  c.state.value = '1001';
  a.state.value = '0101';
  assert.throws(() => adapter.importComposition([a, b, c], 'r_c'), /hash/);
  a.state.value = '1010';
  c.state.operands[0].version = 2;
  assert.throws(() => adapter.importComposition([a, b, c], 'r_c'), /snapshot/);
});

test('composition rejects malformed operators, width mismatches and ambiguous snapshot versions', () => {
  const a = literal('r_a', '1010');
  const b = literal('r_b', '1');
  const c = { id: 'r_c', type: 'compute-application', version: 1, state: { compute: 'purl.compute/0.1', node: 'application', operation: 'AND', operands: [pin(a), pin(b)], value: '1' } };
  assert.throws(() => adapter.importComposition([a, b, c], 'r_c'), /equal length/);
  c.state.operation = '__proto__';
  assert.throws(() => adapter.importComposition([a, b, c], 'r_c'), /operation/);
  assert.throws(() => adapter.importComposition([a, a], 'r_a'), /duplicate/i);
  assert.throws(() => adapter.importComposition([literal('r_empty', '')], 'r_empty'), /bit string/);
});

test('all six imported bit operators match fixtures produced by original composition algebra', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../evidence/reconstruction/composition-algebra-fixtures.json', import.meta.url)));
  for (const fixture of fixtures) {
    const operands = fixture.operands.map((value, index) => literal(`r_${index}`, value));
    const root = { id: 'r_root', type: 'compute-application', version: 1, state: { compute: 'purl.compute/0.1', node: 'application', operation: fixture.operation, operands: operands.map(pin), value: fixture.value } };
    const imported = adapter.importComposition([...operands, root], root.id);
    assert.equal(imported.value, fixture.value);
    assert.equal(imported.source.steps.at(-1).op, `bits.${fixture.operation.toLowerCase()}`);
  }
  const ops = adapter.substrateOperations();
  ops[0].id = 'mutated';
  assert.equal(adapter.substrateOperations()[0].id, 'substrate.space');
});

test('composition bounds complete snapshot metadata before recursive hashing', () => {
  const a = literal('r_a', '1');
  let deep = {};
  for (let i = 0; i < 10000; i++) deep = { nested: deep };
  a.metadata = deep;
  assert.throws(() => adapter.importComposition([a], a.id), (error) => error.code === 'limit_exceeded');
  a.metadata = 'x'.repeat(2 * 1024 * 1024);
  assert.throws(() => adapter.importComposition([a], a.id), (error) => error.code === 'limit_exceeded');
  a.metadata = a;
  assert.throws(() => adapter.importComposition([a], a.id), (error) => error.code === 'invalid_snapshot');
  a.metadata = new Array(2200000);
  assert.throws(() => adapter.importComposition([a], a.id), (error) => error.code === 'limit_exceeded');
  a.metadata = new Array(10);
  assert.throws(() => adapter.importComposition([a], a.id), (error) => error.code === 'invalid_snapshot');
});

test('imported sources execute in the safe compiler with the original six operator values', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../evidence/reconstruction/composition-algebra-fixtures.json', import.meta.url)));
  for (const fixture of fixtures) {
    const operands = fixture.operands.map((value, index) => literal(`r_${index}`, value));
    const root = { id: 'r_root', type: 'compute-application', version: 1, state: { compute: 'purl.compute/0.1', node: 'application', operation: fixture.operation, operands: operands.map(pin), value: fixture.value } };
    const imported = adapter.importComposition([...operands, root], root.id);
    const compiled = compile(imported.source);
    assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
    assert.equal(execute(compiled.plan, null).value, fixture.value);
  }
});
