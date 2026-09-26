// In-process probes (deterministic store from the packet's own procedure library).
// Run: node review/inprocess-probe.mjs
import { world } from '../purl/scripts/lib/composition.js';
import { hashOps } from '../purl/scripts/lib/composition.js';
import { StorePort } from '../purl/src/compute/ports.js';
import { Composer } from '../purl/src/compute/composer.js';

const out = {};

// P1: diamond ladder x_i = XOR(x_{i-1}, x_{i-1}) — maximal sharing. The packet's families (chain, tree) have
// no internal sharing, so memoised vs naive verification was never tested where it matters.
out.P1_diamond_ladder = [];
for (const n of [1, 2, 4, 8, 12, 16]) {
  const w = world();
  const c = w.composer;
  let cur = (await c.literal('1')).id;
  for (let i = 0; i < n; i++) cur = (await c.apply('XOR', [cur, cur])).id;
  const r0 = w.port.counters.reads; const h0 = hashOps.n;
  const m = await c.verify(cur);
  const memo = { visited: m.nodes_visited, reads: w.port.counters.reads - r0, hash_ops: hashOps.n - h0, valid: m.valid };
  let naive = null;
  if (n <= 16) {
    const r1 = w.port.counters.reads; const h1 = hashOps.n;
    const v = await c.verify(cur, { memo: false });
    naive = { visited: v.nodes_visited, reads: w.port.counters.reads - r1, hash_ops: hashOps.n - h1, valid: v.valid };
  }
  out.P1_diamond_ladder.push({ n, nodes: n + 1, memo, naive });
}

// P2: no early cut-off. Y = AND(X, C) with C = 0 has value 0 regardless of X. After changing A,
// how many nodes downstream of Y are recomputed although Y's value did not change?
{
  const w = world();
  const c = w.composer;
  const A = await c.literal('0');
  const B = await c.literal('1');
  const C0 = await c.literal('0');
  const X = await c.apply('XOR', [A.id, B.id]);
  let cur = (await c.apply('AND', [X.id, C0.id])).id; // constant 0
  for (let i = 0; i < 50; i++) cur = (await c.apply('NOT', [cur])).id;
  await w.port.invoke(A.id, 'update', { merge_patch: { value: '1' } });
  const r = await c.recomputePathCopy(A.id);
  out.P2_no_early_cutoff = { affected: r.affected, created: r.created, value_changed: r.steps.filter((s) => s.value_changed).length };
}

// P3: inbound index injection makes recomputation fail (a non-application "references" a literal).
{
  const w = world();
  const c = w.composer;
  const { principal } = w.store.registerPrincipal({ kind: 'agent', label: 'other' });
  const other = new Composer(new StorePort(w.store, principal));
  const A = await c.literal('0');
  const B = await c.literal('1');
  await c.apply('XOR', [A.id, B.id]);
  const spam = await other.literal('1');
  await other.port.invoke(spam.id, 'link', { rel: 'references', target: A.id, version: 1 });
  await w.port.invoke(A.id, 'update', { merge_patch: { value: '1' } });
  try { const r = await c.recomputePathCopy(A.id); out.P3_inbound_injection = { ok: true, affected: r.affected }; } catch (e) { out.P3_inbound_injection = { ok: false, error: e.message }; }
}

// P4: the "recompute evaluations" reported in observations.update include verification evaluations.
{
  const w = world();
  const c = w.composer;
  const A = await c.literal('0'); const B = await c.literal('1'); const C = await c.literal('0'); const D = await c.literal('0');
  const X = await c.apply('XOR', [A.id, B.id]);
  await c.apply('AND', [X.id, C.id]); await c.apply('OR', [X.id, D.id]); await c.apply('AND', [C.id, D.id]);
  await w.port.invoke(A.id, 'update', { merge_patch: { value: '1' } });
  const tot = () => Object.values(c.evaluations).reduce((a, b) => a + b, 0);
  const e0 = tot();
  await c.recomputePathCopy(A.id);
  out.P4_recompute_only_evaluations = tot() - e0;
}

// P5: equality of values across closed forms says nothing about the expression: CONCAT associativity
// declared but never exercised; check declared properties hold extensionally on 1..3-bit strings.
{
  const { evaluate, OPERATIONS } = await import('../purl/src/compute/algebra.js');
  const strs = []; for (let L = 1; L <= 3; L++) for (let i = 0; i < 2 ** L; i++) strs.push(i.toString(2).padStart(L, '0'));
  const fails = {};
  for (const [op, spec] of Object.entries(OPERATIONS)) for (const p of spec.properties) {
    let bad = 0; let tried = 0;
    for (const a of strs) for (const b of strs) for (const d of strs) {
      try {
        tried++;
        if (p === 'commutative' && evaluate(op, [a, b]) !== evaluate(op, [b, a])) bad++;
        if (p === 'associative' && evaluate(op, [evaluate(op, [a, b]), d]) !== evaluate(op, [a, evaluate(op, [b, d])])) bad++;
        if (p === 'idempotent' && evaluate(op, [a, a]) !== a) bad++;
        if (p === 'self-inverse' && evaluate(op, [evaluate(op, [a, b]), b]) !== a) bad++;
        if (p === 'involution' && evaluate(op, [evaluate(op, [a])]) !== a) bad++;
      } catch { tried--; }
    }
    fails[`${op}.${p}`] = { counterexamples: bad, cases: tried };
  }
  out.P5_declared_properties = fails;
}
console.log(JSON.stringify(out, null, 1));
