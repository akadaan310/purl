// The composition layer: algebra, closure, provenance, authority, hashing,
// equivalence, sharing, dynamic update, persistence and independent replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { makeStore, pkg } from './helpers.js';
import { Store } from '../src/continuity/store.js';
import { sequentialIds } from '../src/core/ids.js';
import { hashOf } from '../src/core/canonical.js';
import { createPurlServer, ensureProtocolResource } from '../src/transport/server.js';
import { vocabulary } from '../src/transport/documents.js';
import { PurlClient } from '../src/client/client.js';
import { evaluate, OPERATIONS } from '../src/compute/algebra.js';
import { StorePort, HttpPort } from '../src/compute/ports.js';
import { Composer, nodeErrors } from '../src/compute/composer.js';
import { merkleByValue, valueHash, differingPaths } from '../src/compute/commitments.js';

// hashOf(vocabulary()) at the pre-registration baseline (purl 3df4452), before any composition code.
const BASELINE_VOCABULARY_HASH = 'sha256:1422638e52fa160f1bf60c1a859000a92506a75434533391df5754617860f697';

const compose = (store, who) => new Composer(new StorePort(store, who));
const hashAt = (store, id) => hashOf(store.get(id));

async function serve(store) {
  const server = createPurlServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close(); } };
}

// ---- algebra ----------------------------------------------------------------------------
test('algebra: the worked examples and every declared property, exhaustively over bits', () => {
  assert.equal(evaluate('XOR', ['0', '1']), '1');
  assert.equal(evaluate('XOR', [evaluate('XOR', ['0', '1']), '1']), '0');
  assert.equal(evaluate('AND', [evaluate('XOR', ['0', '1']), '1']), '1');
  assert.equal(evaluate('CONCAT', ['10', '01']), '1001');
  assert.match(evaluate('HASH', ['0']), /^[01]{256}$/);
  assert.equal(evaluate('HASH', ['0']), evaluate('HASH', ['0']), 'deterministic');
  const bits = ['0', '1'];
  for (const [name, op] of Object.entries(OPERATIONS)) {
    if (op.arity !== 2) continue;
    for (const a of bits) for (const b of bits) {
      if (op.properties.includes('commutative')) assert.equal(evaluate(name, [a, b]), evaluate(name, [b, a]), `${name} commutative`);
      if (op.properties.includes('idempotent')) assert.equal(evaluate(name, [a, a]), a, `${name} idempotent`);
      if (op.properties.includes('self-inverse')) assert.equal(evaluate(name, [evaluate(name, [a, b]), b]), a, `${name} self-inverse`);
      for (const c of bits) if (op.properties.includes('associative')) assert.equal(evaluate(name, [evaluate(name, [a, b]), c]), evaluate(name, [a, evaluate(name, [b, c])]), `${name} associative`);
    }
  }
  for (const a of bits) assert.equal(evaluate('NOT', [evaluate('NOT', [a])]), a, 'NOT involution');
});

test('algebra: explicit input schemas reject bad operands and unknown operations', () => {
  assert.throws(() => evaluate('XOR', ['0']), (e) => e.type === 'invalid-input');
  assert.throws(() => evaluate('XOR', ['0', '2']), (e) => e.type === 'invalid-input');
  assert.throws(() => evaluate('AND', ['01', '1']), /equal length/);
  assert.throws(() => evaluate('eval', ['0']), /unknown operation/);
});

// ---- closure and provenance ----------------------------------------------------------------
test('closure: XOR(0,1) → XOR(·,1) → AND(·,1); every output is a resource usable as an operand', async () => {
  const { store, A } = makeStore();
  const c = compose(store, A);
  const zero = await c.literal('0');
  const one = await c.literal('1');
  const C1 = await c.apply('XOR', [zero.id, one.id]);
  const C2 = await c.apply('XOR', [C1.id, one.id]);
  const C3 = await c.apply('AND', [C1.id, one.id]);
  assert.deepEqual([C1.value, C2.value, C3.value], ['1', '0', '1']);
  for (const n of [C1, C2, C3]) {
    const r = store.get(n.id);
    assert.equal(r.type, 'compute-application');
    assert.deepEqual(nodeErrors(r.state), []);
    assert.equal(store.verify(n.id).valid, true);
    assert.equal((await c.verify(n.id)).valid, true);
  }
  assert.equal(store.get(C2.id).state.operands[0].resource, C1.id, 'a derived node is pinned as an operand');
  assert.equal(hashOf(vocabulary()), BASELINE_VOCABULARY_HASH, 'the PURL operation vocabulary is unchanged');
});

test('provenance: pins bind operand version and state hash; links populate the inbound index; events name the author', async () => {
  const { store, A } = makeStore();
  const c = compose(store, A);
  const zero = await c.literal('0');
  const one = await c.literal('1');
  const x = await c.apply('XOR', [zero.id, one.id]);
  const pins = store.get(x.id).state.operands;
  assert.deepEqual(pins.map((p) => [p.resource, p.version, p.state_hash]), [[zero.id, 2, hashAt(store, zero.id)], [one.id, 2, hashAt(store, one.id)]]);
  assert.deepEqual(store.get(x.id).relations.map((l) => [l.rel, l.target.resource, l.target.version]), [['references', zero.id, 2], ['references', one.id, 2]]);
  assert.deepEqual(store.inboundRelations(zero.id).map((r) => r.from), [x.id]);
  assert.ok(store.events(x.id).every((e) => e.actor === A.id && ['creator', 'owner'].includes(e.authority.via)));
});

// ---- authority --------------------------------------------------------------------------------
test('authority: others can read and build on a node, but cannot change it; private operands are invisible', async () => {
  const { store, A, B } = makeStore();
  const a = compose(store, A);
  const b = compose(store, B);
  const zero = await a.literal('0');
  const one = await a.literal('1');
  const x = await a.apply('XOR', [zero.id, one.id]);
  const y = await b.apply('AND', [x.id, one.id]); // B builds on A's node
  assert.equal(y.value, '1');
  assert.equal(store.get(y.id).owner, B.id);
  assert.equal(store.get(x.id).owner, A.id, 'building on a node does not transfer it');
  assert.throws(() => store.invoke(B, x.id, 'update', { expected_version: store.get(x.id).version, input: { merge_patch: { value: '0' } } }), (e) => e.status === 403);
  const hidden = store.create(A, { type: 'compute-literal', state: { compute: 'purl.compute/0.1', node: 'literal', value: '1' } }).resource.id;
  await assert.rejects(b.apply('XOR', [hidden, one.id]), (e) => e.status === 404);
});

// ---- checkpointing -------------------------------------------------------------------------------
test('checkpointing: a PURL checkpoint on a node binds its verified version and state hash', async () => {
  const { store, A, invoke } = makeStore();
  const c = compose(store, A);
  const x = await c.apply('XOR', [(await c.literal('0')).id, (await c.literal('1')).id]);
  const before = hashAt(store, x.id);
  const v = store.get(x.id).version;
  invoke(A, x.id, 'checkpoint', { package: pkg({ task: 'XOR(0,1)', objective: 'value' }) });
  const cp = store.get(x.id).collections.checkpoints[0].body.checkpoint;
  assert.deepEqual(cp, { resource: x.id, version: v, state_hash: before });
  assert.equal((await c.verify(x.id)).valid, true, 'a checkpoint does not disturb the computation');
});

// ---- hashing ---------------------------------------------------------------------------------------
test('hashing: the state hash commits to the record, not the value', async () => {
  const { store, A } = makeStore();
  const c = compose(store, A);
  const zero = await c.literal('0');
  const one = await c.literal('1');
  const x1 = await c.apply('XOR', [zero.id, one.id]);
  const x2 = await c.apply('XOR', [zero.id, one.id]);
  const x3 = await c.apply('XOR', [one.id, zero.id]);
  const get = (rid, v) => store.stateAt(rid, v);
  const mv = (id) => merkleByValue(get, { resource: id, version: store.get(id).version });
  assert.equal(valueHash(store.get(x1.id).state.value), valueHash(store.get(x2.id).state.value));
  assert.notEqual(hashAt(store, x1.id), hashAt(store, x2.id), 'equal value, different state hash');
  assert.equal(mv(x1.id), mv(x2.id), 'the merkle-by-value baseline identifies them');
  assert.notEqual(mv(x1.id), mv(x3.id), 'no identifier identifies XOR(A,B) with XOR(B,A)');
  assert.notEqual(hashAt(store, x1.id), hashAt(store, x3.id));
});

test('hashing: key order and whitespace of a submitted state do not change the state hash', async () => {
  const hashes = [];
  for (const body of ['{"type":"compute-literal","state":{"compute":"purl.compute/0.1","node":"literal","value":"1"}}', '{ "state": {"value":"1","node":"literal","compute":"purl.compute/0.1"},  "type":"compute-literal" }']) {
    const { store } = makeStore();
    const srv = await serve(store);
    try {
      const port = new HttpPort(srv.base, 'test-token-1');
      const n = await port.create(null, null, { rawBody: body });
      hashes.push((await port.head(n.id)).state_hash);
    } finally {
      srv.close();
    }
  }
  assert.equal(hashes[0], hashes[1]);
});

test('ports: in-process and HTTP construction produce the same records up to timestamps', async () => {
  const build = async (port) => {
    const c = new Composer(port);
    const zero = await c.literal('0');
    const one = await c.literal('1');
    const x = await c.apply('XOR', [zero.id, one.id]);
    return [zero.id, one.id, x.id];
  };
  // Starting a server first writes the purl-protocol resource, which advances the
  // deterministic id counters and clock; give the in-process store the same history.
  const s1 = makeStore();
  ensureProtocolResource(s1.store);
  const ids1 = await build(new StorePort(s1.store, s1.A));
  const s2 = makeStore();
  const srv = await serve(s2.store);
  try {
    const ids2 = await build(new HttpPort(srv.base, 'test-token-1'));
    assert.deepEqual(ids2, ids1);
    // The test clock ticks on every now() call, reads included, and the HTTP port reads
    // /status before each invoke: only time fields (and the pins' hashes over them) may differ.
    assert.deepEqual(ids1.slice(0, 2).map((id) => hashAt(s1.store, id)), ids2.slice(0, 2).map((id) => hashAt(s2.store, id)), 'literals: identical state hashes');
    const paths = differingPaths(s1.store.get(ids1[2]), s2.store.get(ids2[2]));
    assert.ok(paths.length > 0 && paths.every((p) => /(^\/(created_at|updated_at)$|\/granted_at$|\/relations\/\d+\/at$|^\/state\/operands\/\d+\/state_hash$)/.test(p)), paths.join(', '));
    assert.deepEqual({ ...s1.store.get(ids1[2]).state, operands: null }, { ...s2.store.get(ids2[2]).state, operands: null });
  } finally {
    srv.close();
  }
});

// ---- equivalence ---------------------------------------------------------------------------------------
test('equivalence: XOR(a,b) and OR(AND(a,NOT b),AND(NOT a,b)) agree on every assignment; no identifier says so', async () => {
  const { store, A } = makeStore();
  const c = compose(store, A);
  const a = await c.literal('0');
  const b = await c.literal('0');
  const x1 = await c.apply('XOR', [a.id, b.id]);
  const l = await c.apply('AND', [a.id, (await c.apply('NOT', [b.id])).id]);
  const r = await c.apply('AND', [(await c.apply('NOT', [a.id])).id, b.id]);
  const x2 = await c.apply('OR', [l.id, r.id]);
  const seen = [];
  for (const [va, vb] of [['0', '1'], ['1', '1'], ['1', '0']]) {
    for (const [lit, v] of [[a, va], [b, vb]]) {
      if (store.get(lit.id).state.value === v) continue;
      store.invoke(A, lit.id, 'update', { expected_version: store.get(lit.id).version, input: { merge_patch: { value: v } } });
      await c.recomputeInPlace(lit.id);
    }
    seen.push([store.get(x1.id).state.value, store.get(x2.id).state.value]);
    assert.notEqual(hashAt(store, x1.id), hashAt(store, x2.id));
  }
  assert.deepEqual(seen, [['1', '1'], ['0', '0'], ['1', '1']]);
  assert.equal((await c.verifyMany([[x1.id, store.get(x1.id).version], [x2.id, store.get(x2.id).version]])).valid, true);
});

// ---- sharing ---------------------------------------------------------------------------------------------
test('sharing: X is stored once, evaluated once, pinned identically by Y and Z; memoised verification visits it once', async () => {
  const { store, A } = makeStore();
  const c = compose(store, A);
  const [a, b, cc, d] = [await c.literal('0'), await c.literal('1'), await c.literal('0'), await c.literal('0')];
  const x = await c.apply('XOR', [a.id, b.id]);
  const y = await c.apply('AND', [x.id, cc.id]);
  const z = await c.apply('OR', [x.id, d.id]);
  assert.equal(c.evaluations.XOR, 1);
  const pin = (id) => store.get(id).state.operands[0];
  assert.deepEqual(pin(y.id), pin(z.id));
  const roots = [[y.id, store.get(y.id).version], [z.id, store.get(z.id).version]];
  const memo = await c.verifyMany(roots);
  const naive = await c.verifyMany(roots, { memo: false });
  assert.equal(memo.nodes_visited, 7);
  assert.equal(naive.nodes_visited, 10, 'X and its operands are re-visited without memoisation');
  assert.equal(memo.valid && naive.valid, true);
});

// ---- dynamic update -----------------------------------------------------------------------------------------
test('dynamic update: dependents via the inbound index; only X is locally stale; path copy keeps originals verifiable', async () => {
  const { store, A, invoke } = makeStore();
  const c = compose(store, A);
  const [a, b, cc, d] = [await c.literal('0'), await c.literal('1'), await c.literal('0'), await c.literal('0')];
  const x = await c.apply('XOR', [a.id, b.id]);
  const y = await c.apply('AND', [x.id, cc.id]);
  const z = await c.apply('OR', [x.id, d.id]);
  const w = await c.apply('AND', [cc.id, d.id]);
  const before = { y: hashAt(store, y.id), yv: store.get(y.id).state.value };
  invoke(A, a.id, 'update', { merge_patch: { value: '1' } });
  assert.deepEqual((await c.dependents(a.id)).ids, [x.id, y.id, z.id].sort());
  assert.deepEqual((await c.dependentsByScan(a.id)).ids, [x.id, y.id, z.id].sort());
  assert.equal((await c.stale(x.id)).length, 1);
  assert.equal((await c.stale(y.id)).length, 0, 'Y is not locally stale: its pin to X is still X\'s head');
  assert.equal((await c.stale(w.id)).length, 0);
  const out = await c.recomputePathCopy(a.id);
  assert.equal(out.created, 3);
  const yNew = out.steps.find((s) => s.old === y.id);
  assert.equal(yNew.new_value, before.yv, 'Y keeps its value …');
  assert.notEqual(hashAt(store, yNew.new), before.y, '… under a new identity and state hash');
  for (const n of [x, y, z, w]) assert.equal((await c.verify(n.id)).valid, true, 'original nodes remain valid statements about their pinned operands');
  assert.deepEqual(store.inboundRelations(y.id).filter((r) => r.rel === 'supersedes').map((r) => r.from), [yNew.new]);
});

test('dynamic update in place: versions advance, old versions stay verifiable by replay', async () => {
  const { store, A, invoke } = makeStore();
  const c = compose(store, A);
  const a = await c.literal('0');
  const b = await c.literal('1');
  const x = await c.apply('XOR', [a.id, b.id]);
  const v0 = store.get(x.id).version;
  invoke(A, a.id, 'update', { merge_patch: { value: '1' } });
  await c.recomputeInPlace(a.id);
  assert.equal(store.get(x.id).state.value, '0');
  assert.ok(store.get(x.id).version > v0);
  assert.equal((await c.verify(x.id)).valid, true);
  assert.equal((await c.verify(x.id, { version: v0 })).valid, true, 'the pre-update statement still verifies');
  assert.equal(store.stateAt(x.id, v0).state.value, '1');
});

// ---- faults ---------------------------------------------------------------------------------------------------
test('faults: the server stores a wrong claim; only re-evaluation detects it', async () => {
  const { store, A } = makeStore();
  const c = compose(store, A);
  const bad = await c.apply('XOR', [(await c.literal('0')).id, (await c.literal('1')).id], { claim: '0' });
  assert.equal(store.verify(bad.id).valid, true, 'the substrate log is internally consistent');
  const v = await c.verify(bad.id);
  assert.equal(v.valid, false);
  assert.match(v.problems[0].problem, /recorded value 0 ≠ re-evaluated 1/);
});

// ---- persistence and independent replay ----------------------------------------------------------------------
test('restart persistence: nodes, hashes, values and the inbound index survive a reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'purl-compute-'));
  try {
    const opts = () => {
      let t = Date.UTC(2026, 0, 1);
      return { dataDir: dir, newId: sequentialIds(), now: () => new Date((t += 1000)).toISOString() };
    };
    const s1 = new Store(opts());
    const p = s1.registerPrincipal({ kind: 'agent', label: 'p' }).principal;
    const c = compose(s1, p);
    const a = await c.literal('0');
    const x = await c.apply('XOR', [a.id, (await c.literal('1')).id]);
    const y = await c.apply('NOT', [x.id]);
    const s2 = new Store({ dataDir: dir });
    const c2 = compose(s2, s2.principal(p.id));
    assert.equal(hashAt(s2, y.id), hashAt(s1, y.id));
    assert.equal((await c2.verify(y.id)).valid, true);
    assert.deepEqual((await c2.dependents(a.id)).ids, [x.id, y.id]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('independent replay: a different principal reconstructs and re-verifies a node over HTTP', async () => {
  const { store, A } = makeStore();
  const c = compose(store, A);
  const x = await c.apply('XOR', [(await c.literal('0')).id, (await c.literal('1')).id]);
  const y = await c.apply('AND', [x.id, (await c.literal('1')).id]);
  const srv = await serve(store);
  try {
    const client = new PurlClient(srv.base);
    await client.register();
    const rec = await client.reconstruct(`/r/${y.id}`);
    assert.equal(rec.all_ok, true, 'hash chain, event hashes and state hashes replay');
    assert.equal(rec.final.state.value, '1');
    const other = new Composer(new HttpPort(srv.base, client.token));
    const v = await other.verify(y.id);
    assert.equal(v.valid, true);
    assert.equal(v.distinct_nodes, 5);
  } finally {
    srv.close();
  }
});
