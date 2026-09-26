// exp-0002 measurement procedures. Everything except `timing` runs on
// deterministic stores (sequential ids, a clock that advances 1 s per read),
// so its output is byte-reproducible and enters the output hash.
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store } from '../../src/continuity/store.js';
import { sequentialIds } from '../../src/core/ids.js';
import { hashOf, canonicalize } from '../../src/core/canonical.js';
import { createPurlServer } from '../../src/transport/server.js';
import { vocabulary } from '../../src/transport/documents.js';
import { StorePort, HttpPort, NODE_TYPES } from '../../src/compute/ports.js';
import { Composer } from '../../src/compute/composer.js';
import { valueHash, merkleByValue, merkleByIdentity, differingPaths, stateHashInputs } from '../../src/compute/commitments.js';
import { rng } from '../../src/research/rng.js';

export const BASELINE_VOCABULARY_HASH = 'sha256:1422638e52fa160f1bf60c1a859000a92506a75434533391df5754617860f697';

// ---- instrumentation ---------------------------------------------------------------------
const HashProto = Object.getPrototypeOf(createHash('sha256'));
const originalDigest = HashProto.digest;
export const hashOps = { n: 0 };
HashProto.digest = function digest(...a) {
  hashOps.n += 1;
  return originalDigest.apply(this, a);
};

/** Count reads/writes/hash operations of `fn`. */
async function measure(port, fn) {
  const r0 = port.counters.reads;
  const w0 = port.counters.writes;
  const h0 = hashOps.n;
  const out = await fn();
  return { out, reads: port.counters.reads - r0, writes: port.counters.writes - w0, hash_ops: hashOps.n - h0 };
}

// ---- deterministic worlds ------------------------------------------------------------------
export function deterministicStore(opts = {}) {
  let t = Date.UTC(2026, 0, 1);
  let tok = 0;
  return new Store({ newId: sequentialIds(), now: () => new Date((t += 1000)).toISOString(), token: () => `exp-0002-token-${++tok}`, limits: { maxResources: 100_000 }, ...opts });
}

export function world(opts = {}) {
  const store = deterministicStore(opts);
  const { principal } = store.registerPrincipal({ kind: 'agent', label: 'composer' });
  const port = new StorePort(store, principal);
  return { store, principal, port, composer: new Composer(port) };
}

async function httpWorld() {
  const w = world();
  const { token } = { token: 'exp-0002-token-1' };
  const server = createPurlServer({ store: w.store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const port = new HttpPort(base, token);
  return { ...w, base, port, composer: new Composer(port), close: () => { server.closeAllConnections(); server.close(); } };
}

/** Snapshot of a node for the record. */
async function nodeInfo(port, id) {
  const h = await port.head(id);
  const s = h.record.state;
  return { id, version: h.version, state_hash: h.state_hash, value: s.value, node: s.node, operation: s.operation ?? null, operands: s.operands ?? null };
}

const recordGetter = (store) => (rid, v) => store.stateAt(rid, v);

// ---- S1: examples and closure ----------------------------------------------------------------
export async function examples() {
  const w = await httpWorld();
  try {
    const c = w.composer;
    const zero = await c.literal('0');
    const one = await c.literal('1');
    const C1 = await c.apply('XOR', [zero.id, one.id]);
    const C2 = await c.apply('XOR', [C1.id, one.id]);
    const C3 = await c.apply('AND', [C1.id, one.id]);
    const K = await c.apply('CONCAT', [C1.id, one.id]);
    const Hk = await c.apply('HASH', [K.id]);
    const H0 = await c.apply('HASH', [zero.id]);
    const HX = await c.apply('XOR', [Hk.id, H0.id]);
    const N = await c.apply('NOT', [C3.id]);
    const E = await c.apply('OR', [C2.id, N.id]);
    const constructionEvaluations = { ...c.evaluations };
    const named = { '0': zero, '1': one, 'C1 = XOR(0,1)': C1, 'C2 = XOR(C1,1)': C2, 'C3 = AND(C1,1)': C3, 'K = CONCAT(C1,1)': K, 'HK = HASH(K)': Hk, 'H0 = HASH(0)': H0, 'HX = XOR(HK,H0)': HX, 'N = NOT(C3)': N, 'E = OR(C2,N)': E };
    const nodes = {};
    for (const [name, n] of Object.entries(named)) {
      const info = await nodeInfo(w.port, n.id);
      const doc = await (await fetch(`${w.base}/r/${n.id}`, { headers: { Accept: 'application/purl+json' } })).json();
      const manifest = await (await fetch(`${w.base}/r/${n.id}/manifest`, { headers: { Accept: 'application/purl+json' } })).json();
      const verify = await w.port.verify(n.id);
      const lineage = await (await fetch(`${w.base}/r/${n.id}/lineage`, { headers: { Accept: 'application/purl+json' } })).json();
      const cone = info.node === 'application' ? await c.verify(n.id) : null;
      nodes[name] = {
        ...info,
        value: info.value.length > 16 ? `${info.value.slice(0, 16)}…(${info.value.length} bits)` : info.value,
        value_sha256: valueHash(info.value),
        closure: {
          document_kind: doc.kind,
          protocol: doc.protocol,
          manifest_kind: manifest.kind,
          manifest_operations: manifest.operations.length,
          substrate_verify_valid: verify.valid,
          substrate_events: verify.events,
          cone_verify_valid: cone?.valid ?? null,
          cone_nodes: cone?.distinct_nodes ?? null,
          used_as_operand: false,
          inbound_references: lineage.inbound.filter((r) => r.rel === 'references').map((r) => r.from),
        },
      };
    }
    const used = new Set(Object.values(nodes).flatMap((n) => (n.operands ?? []).map((p) => p.resource)));
    for (const n of Object.values(nodes)) n.closure.used_as_operand = used.has(n.id);
    return {
      transport: 'HTTP (HttpPort → createPurlServer over a deterministic store)',
      vocabulary_hash: hashOf(vocabulary()),
      baseline_vocabulary_hash: BASELINE_VOCABULARY_HASH,
      evaluations: { construction: constructionEvaluations, including_verification: c.evaluations },
      nodes,
      http_reads: w.port.counters,
    };
  } finally {
    w.close();
  }
}

// ---- S2: determinism -------------------------------------------------------------------------
export async function determinism() {
  const run = async () => {
    const w = world();
    const c = w.composer;
    const zero = await c.literal('0');
    const one = await c.literal('1');
    const C1 = await c.apply('XOR', [zero.id, one.id]);
    const C2 = await c.apply('XOR', [C1.id, one.id]);
    const C3 = await c.apply('AND', [C1.id, one.id]);
    const ids = [zero, one, C1, C2, C3].map((n) => n.id);
    return {
      nodes: ids.map((id) => ({ id, version: w.store.get(id).version, state_hash: hashOf(w.store.get(id)) })),
      event_heads: ids.map((id) => w.store.events(id).at(-1).hash),
      event_hashes: ids.flatMap((id) => w.store.events(id).map((e) => e.hash)),
    };
  };
  const a = await run();
  const b = await run();
  return { run_1: a, identical: canonicalize(a) === canonicalize(b), events_compared: a.event_hashes.length };
}

// ---- S3: equivalence and invariance ------------------------------------------------------------
function identifiers(store, id) {
  const rec = store.get(id);
  const get = recordGetter(store);
  const root = { resource: id, version: rec.version };
  return {
    resource_id: id,
    value: rec.state.value,
    value_hash: valueHash(rec.state.value),
    state_hash: hashOf(rec),
    merkle_by_value: merkleByValue(get, root),
    merkle_by_identity: merkleByIdentity(get, root, hashOf),
    head_event_hash: store.events(id).at(-1).hash,
  };
}

function compare(store, a, b) {
  const x = identifiers(store, a);
  const y = identifiers(store, b);
  return {
    a: x,
    b: y,
    equal: Object.fromEntries(Object.keys(x).map((k) => [k, x[k] === y[k]])),
    differing_record_paths: differingPaths(store.get(a), store.get(b)),
  };
}

export async function equivalence() {
  const out = {};
  {
    const { store, composer: c } = world();
    const zero = await c.literal('0');
    const one = await c.literal('1');
    const x1 = await c.apply('XOR', [zero.id, one.id]);
    const x2 = await c.apply('XOR', [zero.id, one.id]);
    out.E1_same_expression_twice = compare(store, x1.id, x2.id);
    const zero2 = await c.literal('0');
    const one2 = await c.literal('1');
    const x3 = await c.apply('XOR', [zero2.id, one2.id]);
    out.E2_operand_renaming = compare(store, x1.id, x3.id);
    const x4 = await c.apply('XOR', [one.id, zero.id]);
    out.E3_commutative_permutation = compare(store, x1.id, x4.id);
    const n1 = await c.apply('NOT', [one.id]);
    const n2 = await c.apply('NOT', [n1.id]);
    const and11 = await c.apply('AND', [one.id, one.id]);
    const or01 = await c.apply('OR', [zero.id, one.id]);
    const forms = { 'literal 1': one.id, 'XOR(0,1)': x1.id, 'NOT(NOT(1))': n2.id, 'AND(1,1)': and11.id, 'OR(0,1)': or01.id };
    const ids = Object.fromEntries(Object.entries(forms).map(([k, id]) => [k, identifiers(store, id)]));
    const distinct = (f) => new Set(Object.values(ids).map((i) => i[f])).size;
    out.E4_closed_forms_of_value_1 = { forms: ids, distinct_counts: Object.fromEntries(['resource_id', 'value', 'value_hash', 'state_hash', 'merkle_by_value', 'merkle_by_identity'].map((f) => [f, distinct(f)])) };

    // H9: pairs agreeing on (operation, operand state hashes, value) — collect all applications in this store.
    const apps = store.list(null, { type: NODE_TYPES.application });
    const groups = new Map();
    for (const r of apps) {
      const k = canonicalize([r.state.operation, r.state.operands.map((p) => p.state_hash), r.state.value]);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r.id);
    }
    const collisions = [...groups.values()].filter((g) => g.length > 1).map((g) => ({ nodes: g, state_hashes: g.map((id) => hashOf(store.get(id))), equal_state_hash: new Set(g.map((id) => hashOf(store.get(id)))).size === 1 }));
    out.H9_triples = { applications: apps.length, groups_with_equal_triple: collisions, state_hash_inputs_of_an_application: stateHashInputs(store.get(x1.id)) };
  }
  // E9 (exploratory, not pre-registered): the registry declares link idempotent; invoke it twice.
  {
    const { store, port, composer: c } = world();
    const zero = await c.literal('0');
    const x = await c.apply('NOT', [zero.id]);
    const before = { version: store.get(x.id).version, relations: store.get(x.id).relations.length, state_hash: hashOf(store.get(x.id)), events: store.events(x.id).length };
    await port.invoke(x.id, 'link', { rel: 'references', target: zero.id, version: 2 });
    const after = { version: store.get(x.id).version, relations: store.get(x.id).relations.length, state_hash: hashOf(store.get(x.id)), events: store.events(x.id).length };
    out.E9_repeated_link_exploratory = { declared_idempotent: 'link: idempotent: true (src/continuity/operations.js)', before, after, relations_unchanged: before.relations === after.relations, event_appended: after.events === before.events + 1, state_hash_changed: before.state_hash !== after.state_hash, differing_record_paths: differingPaths(store.stateAt(x.id, before.version), store.get(x.id)) };
  }
  // E5 serialisation: the same literal state, two byte serialisations, two fresh deterministic stores, over HTTP.
  {
    const bodies = [
      '{"type":"compute-literal","state":{"compute":"purl.compute/0.1","node":"literal","value":"1"},"public":"reader"}',
      '{ "public" : "reader",\n  "state": { "value":"1", "node":"literal" , "compute":"purl.compute/0.1" },\n  "type":"compute-literal" }',
    ];
    const hashes = [];
    for (const body of bodies) {
      const w = await httpWorld();
      try {
        const n = await w.port.create(null, null, { rawBody: body });
        hashes.push({ id: n.id, state_hash: (await w.port.head(n.id)).state_hash, body_sha256: 'sha256:' + createHash('sha256').update(body).digest('hex') });
      } finally {
        w.close();
      }
    }
    out.E5_serialisation = { submissions: hashes, bodies_differ: hashes[0].body_sha256 !== hashes[1].body_sha256, equal_state_hash: hashes[0].state_hash === hashes[1].state_hash };
  }
  // E6 irrelevant metadata.
  {
    const a = world();
    const b = world();
    const na = await a.composer.literal('1');
    const nb = await b.composer.literal('1', { note: 'irrelevant' });
    out.E6_irrelevant_metadata = {
      without_note: { state_hash: hashOf(a.store.get(na.id)), value_hash: valueHash('1') },
      with_note: { state_hash: hashOf(b.store.get(nb.id)), value_hash: valueHash('1') },
      equal_state_hash: hashOf(a.store.get(na.id)) === hashOf(b.store.get(nb.id)),
      differing_record_paths: differingPaths(a.store.get(na.id), b.store.get(nb.id)),
    };
  }
  // E7 graph traversal (construction) order.
  {
    const build = async (order) => {
      const w = world();
      const c = w.composer;
      const L = { A: await c.literal('0'), B: await c.literal('1'), C: await c.literal('0'), D: await c.literal('0') };
      const X = await c.apply('XOR', [L.A.id, L.B.id]);
      const made = { X };
      for (const n of order) made[n] = n === 'Y' ? await c.apply('AND', [X.id, L.C.id]) : await c.apply('OR', [X.id, L.D.id]);
      return Object.fromEntries(Object.entries(made).map(([k, v]) => [k, { id: v.id, value: v.value, state_hash: hashOf(w.store.get(v.id)), merkle_by_value: merkleByValue(recordGetter(w.store), { resource: v.id, version: w.store.get(v.id).version }) }]));
    };
    const yz = await build(['Y', 'Z']);
    const zy = await build(['Z', 'Y']);
    out.E7_construction_order = { Y_then_Z: yz, Z_then_Y: zy, equal: Object.fromEntries(['X', 'Y', 'Z'].map((k) => [k, { id: yz[k].id === zy[k].id, value: yz[k].value === zy[k].value, state_hash: yz[k].state_hash === zy[k].state_hash, merkle_by_value: yz[k].merkle_by_value === zy[k].merkle_by_value }])) };
  }
  // E8 open expressions over mutable literals: extensional equivalence (H7).
  {
    const { store, port, composer: c } = world();
    const a = await c.literal('0');
    const b = await c.literal('0');
    const X1 = await c.apply('XOR', [a.id, b.id]);
    const na = await c.apply('NOT', [a.id]);
    const nb = await c.apply('NOT', [b.id]);
    const l = await c.apply('AND', [a.id, nb.id]);
    const r = await c.apply('AND', [na.id, b.id]);
    const X2 = await c.apply('OR', [l.id, r.id]);
    const X3 = await c.apply('AND', [a.id, b.id]);
    const table = [];
    for (const [va, vb] of [['0', '0'], ['0', '1'], ['1', '0'], ['1', '1']]) {
      if (store.get(a.id).state.value !== va) {
        await port.invoke(a.id, 'update', { merge_patch: { value: va } });
        await c.recomputeInPlace(a.id);
      }
      if (store.get(b.id).state.value !== vb) {
        await port.invoke(b.id, 'update', { merge_patch: { value: vb } });
        await c.recomputeInPlace(b.id);
      }
      const row = { a: va, b: vb };
      for (const [k, id] of Object.entries({ X1: X1.id, X2: X2.id, X3: X3.id })) row[k] = identifiers(store, id);
      table.push(row);
    }
    const eqAll = (p, q, f) => table.every((row) => row[p][f] === row[q][f]);
    const fields = ['resource_id', 'value', 'value_hash', 'state_hash', 'merkle_by_value', 'merkle_by_identity'];
    const verified = await c.verifyMany([X1, X2, X3].map((n) => [n.id, store.get(n.id).version]));
    out.E8_extensional = {
      expressions: { X1: 'XOR(a,b)', X2: 'OR(AND(a,NOT(b)),AND(NOT(a),b))', X3: 'AND(a,b)' },
      assignments: table.map((row) => ({ a: row.a, b: row.b, values: { X1: row.X1.value, X2: row.X2.value, X3: row.X3.value } })),
      X1_X2_extensionally_equivalent: eqAll('X1', 'X2', 'value'),
      X1_X3_extensionally_equivalent: eqAll('X1', 'X3', 'value'),
      identifier_equal_in_every_assignment: {
        X1_X2: Object.fromEntries(fields.map((f) => [f, eqAll('X1', 'X2', f)])),
        X1_X3: Object.fromEntries(fields.map((f) => [f, eqAll('X1', 'X3', f)])),
      },
      final_cone_verification: { valid: verified.valid, distinct_nodes: verified.distinct_nodes },
    };
  }
  return out;
}

// ---- S4 + S5: shared subexpression and dynamic update ---------------------------------------------
async function sharedDag(w) {
  const c = w.composer;
  const L = { A: await c.literal('0'), B: await c.literal('1'), C: await c.literal('0'), D: await c.literal('0') };
  const X = await c.apply('XOR', [L.A.id, L.B.id]);
  const Y = await c.apply('AND', [X.id, L.C.id]);
  const Z = await c.apply('OR', [X.id, L.D.id]);
  const W = await c.apply('AND', [L.C.id, L.D.id]);
  return { A: L.A.id, B: L.B.id, C: L.C.id, D: L.D.id, X: X.id, Y: Y.id, Z: Z.id, W: W.id };
}

/** Same expressions with no sharing: each consumer gets its own copy of XOR(A,B). */
async function treeBaseline(w) {
  const c = w.composer;
  const L = { A: await c.literal('0'), B: await c.literal('1'), C: await c.literal('0'), D: await c.literal('0') };
  const X1 = await c.apply('XOR', [L.A.id, L.B.id]);
  const X2 = await c.apply('XOR', [L.A.id, L.B.id]);
  const Y = await c.apply('AND', [X1.id, L.C.id]);
  const Z = await c.apply('OR', [X2.id, L.D.id]);
  const W = await c.apply('AND', [L.C.id, L.D.id]);
  return { A: L.A.id, B: L.B.id, C: L.C.id, D: L.D.id, X1: X1.id, X2: X2.id, Y: Y.id, Z: Z.id, W: W.id };
}

function storage(store) {
  let events = 0;
  let bytes = 0;
  let resources = 0;
  for (const id of store.resources.keys()) {
    if (id === 'purl-protocol') continue;
    resources += 1;
    for (const e of store.events(id)) {
      events += 1;
      bytes += Buffer.byteLength(JSON.stringify({ type: 'event', event: e })) + 1;
    }
  }
  return { resources, events, log_bytes: bytes };
}

export async function sharing() {
  const shared = world();
  const s0 = shared.composer.evaluations;
  const dag = await sharedDag(shared);
  const evalShared = { ...s0 };
  const tree = world();
  const t = await treeBaseline(tree);
  const pinOfX = (id) => shared.store.get(id).state.operands.find((p) => p.resource === dag.X);
  const vShared = await measure(shared.port, () => shared.composer.verifyMany([[dag.Y, shared.store.get(dag.Y).version], [dag.Z, shared.store.get(dag.Z).version]]));
  const vSep = await measure(shared.port, async () => [await shared.composer.verify(dag.Y), await shared.composer.verify(dag.Z)]);
  const vNaive = await measure(shared.port, () => shared.composer.verifyMany([[dag.Y, shared.store.get(dag.Y).version], [dag.Z, shared.store.get(dag.Z).version]], { memo: false }));
  const xEvents = shared.store.events(dag.X).length;
  return {
    graph: 'A,B,C,D literals; X = XOR(A,B); Y = AND(X,C); Z = OR(X,D); W = AND(C,D)',
    ids: dag,
    values: Object.fromEntries(Object.entries(dag).map(([k, id]) => [k, shared.store.get(id).state.value])),
    shared: { ...storage(shared.store), evaluations: evalShared },
    tree_baseline: { ...storage(tree.store), evaluations: tree.composer.evaluations, ids: t },
    pins_of_X: { in_Y: pinOfX(dag.Y), in_Z: pinOfX(dag.Z), identical: canonicalize(pinOfX(dag.Y)) === canonicalize(pinOfX(dag.Z)) },
    provenance: { events_of_X: xEvents, copies_of_X_provenance_in_shared: 1, copies_in_tree_baseline: 2, inbound_to_X: shared.store.inboundRelations(dag.X).map((r) => ({ from: r.from, rel: r.rel, version: r.version })) },
    lookup: { X_by_id_reads: (await measure(shared.port, () => shared.port.head(dag.X))).reads },
    verification: {
      one_pass_shared_memo: { nodes_visited: vShared.out.nodes_visited, distinct: vShared.out.distinct_nodes, reads: vShared.reads, hash_ops: vShared.hash_ops, valid: vShared.out.valid },
      two_separate_passes: { nodes_visited: vSep.out.reduce((s, v) => s + v.nodes_visited, 0), reads: vSep.reads, hash_ops: vSep.hash_ops, valid: vSep.out.every((v) => v.valid) },
      naive_no_memo: { nodes_visited: vNaive.out.nodes_visited, distinct: vNaive.out.distinct_nodes, reads: vNaive.reads, hash_ops: vNaive.hash_ops, valid: vNaive.out.valid },
    },
    hash_behaviour: {
      X_merkle_by_value_equal_in_tree_baseline: merkleByValue(recordGetter(tree.store), { resource: t.X1, version: tree.store.get(t.X1).version }) === merkleByValue(recordGetter(tree.store), { resource: t.X2, version: tree.store.get(t.X2).version }),
      X_state_hash_equal_in_tree_baseline: hashOf(tree.store.get(t.X1)) === hashOf(tree.store.get(t.X2)),
    },
  };
}

/** Stale anywhere in the cone: local staleness is only visible where a pin lags its operand's head. */
async function transitivelyStale(c, id) {
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    if ((await c.stale(cur)).length) return true;
    const s = (await c.port.head(cur)).record.state;
    for (const p of s.operands ?? []) stack.push(p.resource);
  }
  return false;
}

export async function dynamicUpdate() {
  const out = {};
  for (const mode of ['path-copy', 'in-place']) {
    const w = world();
    const c = w.composer;
    const dag = await sharedDag(w);
    const names = Object.fromEntries(Object.entries(dag).map(([k, v]) => [v, k]));
    const before = Object.fromEntries(Object.entries(dag).map(([k, id]) => [k, { version: w.store.get(id).version, state_hash: hashOf(w.store.get(id)), value: w.store.get(id).state.value, merkle_by_value: merkleByValue(recordGetter(w.store), { resource: id, version: w.store.get(id).version }) }]));
    const truth = ['X', 'Y', 'Z'];
    await w.port.invoke(dag.A, 'update', { merge_patch: { value: '1' } });
    const deps = await measure(w.port, () => c.dependents(dag.A));
    const scan = await measure(w.port, () => c.dependentsByScan(dag.A));
    const stale = {};
    for (const [k, id] of Object.entries(dag)) stale[k] = await c.stale(id);
    const transitive = {};
    for (const [k, id] of Object.entries(dag)) transitive[k] = await transitivelyStale(c, id);
    const evalBefore = Object.values(c.evaluations).reduce((a, b) => a + b, 0);
    const recompute = await measure(w.port, () => (mode === 'path-copy' ? c.recomputePathCopy(dag.A) : c.recomputeInPlace(dag.A)));
    const recomputeEvaluations = Object.values(c.evaluations).reduce((a, b) => a + b, 0) - evalBefore;
    const originals = await c.verifyMany(Object.values(dag).filter((id) => w.store.get(id).state.node === 'application').map((id) => [id, before[names[id]].version]));
    const after = {};
    for (const step of recompute.out.steps) {
      const oldName = names[step.old ?? step.node];
      const nid = step.new ?? step.node;
      const rec = w.store.get(nid);
      after[oldName] = { id: nid, version: rec.version, value: rec.state.value, state_hash: hashOf(rec), merkle_by_value: merkleByValue(recordGetter(w.store), { resource: nid, version: rec.version }), value_changed: step.value_changed };
    }
    const newRoots = Object.values(after).map((a) => [a.id, a.version]);
    const newValid = await c.verifyMany(newRoots);
    out[mode] = {
      change: 'A: "0" → "1" (update, in place)',
      ground_truth_dependents: truth,
      dependents_via_inbound_index: { found: deps.out.ids.map((id) => names[id] ?? id), traversed: deps.out.traversed, reads: deps.reads },
      dependents_via_scan: { found: scan.out.ids.map((id) => names[id] ?? id), scanned: scan.out.scanned, reads: scan.reads },
      stale_before_recompute: Object.fromEntries(Object.entries(stale).map(([k, v]) => [k, v.map((s) => ({ operand: names[s.operand] ?? s.operand, pinned: s.pinned, current: s.current }))])),
      transitively_stale_before_recompute: Object.entries(transitive).filter(([, v]) => v).map(([k]) => k),
      recompute: { affected: recompute.out.affected, created: recompute.out.created, writes: recompute.writes, reads: recompute.reads, hash_ops: recompute.hash_ops, evaluations: recomputeEvaluations },
      before,
      after,
      unchanged_nodes: Object.keys(dag).filter((k) => !after[k] && k !== 'A'),
      original_nodes_still_verify_at_their_versions: originals.valid,
      recomputed_nodes_verify: newValid.valid,
      W_stale: stale.W.length > 0,
      value_unchanged_but_state_hash_changed: Object.entries(after).filter(([k, a]) => !a.value_changed && a.state_hash !== before[k].state_hash).map(([k]) => k),
      merkle_by_value_unchanged_where_value_unchanged: Object.entries(after).filter(([, a]) => !a.value_changed).map(([k, a]) => [k, a.merkle_by_value === before[k].merkle_by_value]),
      supersedes_links_on_old_nodes: mode === 'path-copy' ? Object.fromEntries(['X', 'Y', 'Z'].map((k) => [k, w.store.inboundRelations(dag[k]).filter((r) => r.rel === 'supersedes').map((r) => r.from)])) : null,
    };
  }
  return out;
}

// ---- S6: restart persistence ---------------------------------------------------------------------
export async function persistence() {
  const dir = mkdtempSync(join(tmpdir(), 'purl-exp-0002-'));
  try {
    const w = world({ dataDir: dir });
    const dag = await sharedDag(w);
    const before = Object.fromEntries(Object.entries(dag).map(([k, id]) => [k, hashOf(w.store.get(id))]));
    const depsBefore = (await w.composer.dependents(dag.A)).ids;
    const bytes = statSync(join(dir, 'log.jsonl')).size;
    const reloaded = deterministicStore({ dataDir: dir });
    const principal = [...reloaded.principals.values()].find((p) => p.label === 'composer');
    const c2 = new Composer(new StorePort(reloaded, principal));
    const after = Object.fromEntries(Object.entries(dag).map(([k, id]) => [k, hashOf(reloaded.get(id))]));
    const v = await c2.verifyMany(Object.values(dag).map((id) => [id, reloaded.get(id).version]));
    return {
      log_bytes: bytes,
      state_hashes_identical_after_reload: canonicalize(before) === canonicalize(after),
      all_nodes_verify_after_reload: v.valid,
      nodes_verified: v.distinct_nodes,
      re_evaluations: c2.evaluations,
      dependents_identical_after_reload: canonicalize((await c2.dependents(dag.A)).ids) === canonicalize(depsBefore),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- S7: operation counts by graph size -----------------------------------------------------------
async function buildChain(c, n) {
  const x0 = await c.literal('0');
  const b = await c.literal('1');
  let cur = x0.id;
  const apps = [];
  for (let i = 0; i < n; i++) {
    cur = (await c.apply('XOR', [cur, b.id])).id;
    apps.push(cur);
  }
  return { root: cur, leaf: x0.id, apps, literals: [x0.id, b.id] };
}

async function buildTree(c, n, seed) {
  const r = rng(seed);
  const leaves = [];
  for (let i = 0; i < n; i++) leaves.push((await c.literal(r.next() < 0.5 ? '0' : '1')).id);
  let level = leaves;
  const apps = [];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) next.push(level[i]);
      else {
        const id = (await c.apply('XOR', [level[i], level[i + 1]])).id;
        apps.push(id);
        next.push(id);
      }
    }
    level = next;
  }
  return { root: level[0], leaf: leaves[0], apps, literals: leaves };
}

/** Walk pins from the root without verifying anything: provenance reconstruction. */
async function provenance(port, root) {
  const seen = new Set();
  const stack = [root];
  let visits = 0;
  while (stack.length) {
    const id = stack.pop();
    visits += 1;
    if (seen.has(id)) continue;
    seen.add(id);
    const s = (await port.head(id)).record.state;
    for (const p of s.operands ?? []) stack.push(p.resource);
  }
  return { nodes: seen.size, visits };
}

export async function scalingCounts(sizes, seed) {
  const out = {};
  for (const family of ['chain', 'tree']) {
    out[family] = [];
    for (const n of sizes) {
      const w = world();
      const build = await measure(w.port, () => (family === 'chain' ? buildChain(w.composer, n) : buildTree(w.composer, n, seed + n)));
      const g = build.out;
      const lookup = await measure(w.port, () => w.port.head(g.root));
      const verifyMemo = await measure(w.port, () => w.composer.verify(g.root));
      const verifyNaive = n <= 10_000 ? await measure(w.port, () => w.composer.verify(g.root, { memo: false })) : null;
      const prov = await measure(w.port, () => provenance(w.port, g.root));
      const depsIndex = await measure(w.port, () => w.composer.dependents(g.leaf));
      const depsScan = await measure(w.port, () => w.composer.dependentsByScan(g.leaf));
      const st = storage(w.store);
      await w.port.invoke(g.leaf, 'update', { merge_patch: { value: w.store.get(g.leaf).state.value === '0' ? '1' : '0' } });
      const ev0 = { ...w.composer.evaluations };
      const update = await measure(w.port, () => w.composer.recomputePathCopy(g.leaf));
      const evals = Object.values(w.composer.evaluations).reduce((a, b) => a + b, 0) - Object.values(ev0).reduce((a, b) => a + b, 0);
      // Structural duplication a hash-consing index could remove (baseline; PURL has no such index).
      const get = recordGetter(w.store);
      const memo = new Map();
      const mv = g.apps.map((id) => merkleByValue(get, { resource: id, version: w.store.get(id).version }, memo));
      out[family].push({
        n,
        application_nodes: g.apps.length,
        literal_nodes: g.literals.length,
        construction: { writes: build.writes, reads: build.reads, hash_ops: build.hash_ops, evaluations: g.apps.length },
        storage: st,
        lookup_by_id: { reads: lookup.reads, hash_ops: lookup.hash_ops },
        verify_memo: { reads: verifyMemo.reads, hash_ops: verifyMemo.hash_ops, nodes_visited: verifyMemo.out.nodes_visited, distinct: verifyMemo.out.distinct_nodes, valid: verifyMemo.out.valid },
        verify_naive: verifyNaive && { reads: verifyNaive.reads, hash_ops: verifyNaive.hash_ops, nodes_visited: verifyNaive.out.nodes_visited, valid: verifyNaive.out.valid },
        provenance_reconstruction: { reads: prov.reads, nodes: prov.out.nodes, visits: prov.out.visits },
        dependents_inbound_index: { reads: depsIndex.reads, traversed: depsIndex.out.traversed, found: depsIndex.out.ids.length },
        dependents_scan: { reads: depsScan.reads, scanned: depsScan.out.scanned, found: depsScan.out.ids.length },
        leaf_update_path_copy: { affected: update.out.affected, created: update.out.created, evaluations: evals, writes: update.writes, reads: update.reads, hash_ops: update.hash_ops, value_changed: update.out.steps.filter((s) => s.value_changed).length },
        structural_duplicates: { applications: mv.length, distinct_merkle_by_value: new Set(mv).size },
      });
    }
  }
  return out;
}

// ---- timing (not in the output hash) -----------------------------------------------------------------
const now = () => Number(process.hrtime.bigint()) / 1e6; // ms

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

async function timeEach(ids, reps, fn) {
  const samples = [];
  for (let r = 0; r < reps; r++) {
    const id = ids[(r * 7919) % ids.length];
    const t0 = now();
    await fn(id);
    samples.push(now() - t0);
  }
  return { median_ms: median(samples), p90_ms: [...samples].sort((a, b) => a - b)[Math.floor(samples.length * 0.9)], samples: samples.length };
}

export async function timing(sizes, seed, { reps = 200 } = {}) {
  const out = {};
  for (const family of ['chain', 'tree']) {
    out[family] = [];
    for (const n of sizes) {
      global.gc?.();
      const heap0 = process.memoryUsage().heapUsed;
      const w = world();
      const t0 = now();
      const g = family === 'chain' ? await buildChain(w.composer, n) : await buildTree(w.composer, n, seed + n);
      const createMs = now() - t0;
      const heap = process.memoryUsage().heapUsed - heap0;
      const server = createPurlServer({ store: w.store });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const http = new HttpPort(`http://127.0.0.1:${server.address().port}`, 'exp-0002-token-1');
      const all = [...g.apps, ...g.literals];
      const row = {
        n,
        nodes: all.length,
        creation: { total_ms: createMs, per_node_ms: createMs / all.length },
        heap_bytes_after_build: heap,
        lookup_direct_map: await timeEach(all, reps * 5, (id) => w.store.get(id)),
        lookup_head_with_state_hash: await timeEach(all, reps, (id) => w.port.head(id)),
        retrieval_replay_at_version: await timeEach(all, reps, (id) => w.port.at(id, w.store.get(id).version)),
        retrieval_http_state: await timeEach(all, Math.min(reps, 100), (id) => http.head(id)),
        validation_single_node_log: await timeEach(g.apps.length ? g.apps : all, reps, (id) => w.port.verify(id)),
        dependents_inbound_index: await timeEach([g.leaf], Math.min(reps, 20), (id) => w.composer.dependents(id)),
        dependents_scan: await timeEach([g.leaf], n >= 10_000 ? 5 : 20, (id) => w.composer.dependentsByScan(id)),
      };
      let t = now();
      await w.composer.verify(g.root);
      row.validation_full_cone_ms = now() - t;
      t = now();
      await provenance(w.port, g.root);
      row.provenance_reconstruction_ms = now() - t;
      // Hash-based lookup baseline: build an index merkle_by_value → id, then look up the root's hash.
      t = now();
      const get = recordGetter(w.store);
      const memo = new Map();
      const index = new Map();
      for (const id of g.apps) index.set(merkleByValue(get, { resource: id, version: w.store.get(id).version }, memo), id);
      row.hash_index_build_ms = now() - t;
      const rootHash = merkleByValue(get, { resource: g.root, version: w.store.get(g.root).version }, memo);
      row.hash_index_lookup = await timeEach([rootHash], reps * 5, (h) => index.get(h));
      row.search_by_value_scan = await timeEach([g.root], n >= 10_000 ? 5 : 20, () => w.store.list(null, { type: NODE_TYPES.application }).find((r) => r.state.value === w.store.get(g.root).state.value && r.state.operation === 'XOR'));
      await w.port.invoke(g.leaf, 'update', { merge_patch: { value: w.store.get(g.leaf).state.value === '0' ? '1' : '0' } });
      t = now();
      await w.composer.recomputePathCopy(g.leaf);
      row.update_path_copy_ms = now() - t;
      server.closeAllConnections();
      server.close();
      out[family].push(row);
    }
  }
  return out;
}

/** Least-squares slope of log10(y) on log10(x). */
export function logLogSlope(xs, ys) {
  const pts = xs.map((x, i) => [Math.log10(x), Math.log10(Math.max(ys[i], 1e-9))]);
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const num = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  return num / den;
}
