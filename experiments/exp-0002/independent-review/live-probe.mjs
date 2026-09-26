// Independent probes against the live PURL instance (see ../live.json).
// Run: node review/live-probe.mjs
import { readFileSync } from 'node:fs';
import { HttpPort } from '../purl/src/compute/ports.js';
import { Composer } from '../purl/src/compute/composer.js';
import { hashOf } from '../purl/src/core/canonical.js';

const live = JSON.parse(readFileSync(new URL('../live.json', import.meta.url)));
const base = new URL(live.purl_instance).origin;
const idOf = (u) => u.split('/r/')[1];
const out = {};
const reg = async (label) => (await (await fetch(`${base}/principals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'agent', label }) })).json());
const P1 = await reg('reviewer-1');
const P2 = await reg('reviewer-2');
const port = new HttpPort(base, P1.token);
const port2 = new HttpPort(base, P2.token);
const c = new Composer(port);
const c2 = new Composer(port2);

// L1: state hash reported by events == client hashOf(record)?
{
  const id = idOf(live.purl_resources.examples.C1);
  const h = await port.head(id);
  const ev = await (await fetch(`${base}/r/${id}/events`, { headers: { Accept: 'application/purl+json' } })).json();
  out.L1_state_hash_matches_server_state_after = h.state_hash === ev.events.at(-1).state_after;
}

// L2: verify every published node on the live instance, cones and all.
{
  const all = { ...live.purl_resources.examples, ...live.purl_resources.graph_2 };
  delete all.note;
  out.L2_live_nodes = {};
  for (const [k, u] of Object.entries(all)) {
    const id = idOf(u);
    const h = await port.head(id);
    const v = await c.verify(id);
    out.L2_live_nodes[k] = { id, version: h.version, value: h.record.state.value, op: h.record.state.operation ?? null, operands: (h.record.state.operands ?? []).map((p) => `${p.resource}@${p.version}`), stale: await c.stale(id), cone_valid: v.valid, problems: v.problems.map((p) => p.problem) };
  }
}

// L3: no content addressing — the same literal twice.
{
  const a = await c.literal('1');
  const b = await c.literal('1');
  const ha = await port.head(a.id);
  const hb = await port.head(b.id);
  out.L3_same_literal_twice = { ids: [a.id, b.id], equal_id: a.id === b.id, equal_state_hash: ha.state_hash === hb.state_hash };
}

// L4: the server accepts a false application (wrong value) and substrate verify says valid.
const zero = await c.literal('0');
const one = await c.literal('1');
{
  const bad = await c.apply('XOR', [zero.id, one.id], { claim: '0' });
  const sub = await port.verify(bad.id);
  const cone = await c.verify(bad.id);
  out.L4_false_value = { id: bad.id, created: true, substrate_verify_valid: sub.valid, composer_cone_valid: cone.valid, problems: cone.problems.map((p) => p.problem) };
}

// L5: forged pins accepted by server: dangling version, non-existent resource, bogus state hash, wrong arity.
{
  const mk = async (name, state) => {
    try {
      const n = await port.create('compute-application', state);
      let cone;
      try { cone = await c.verify(n.id); cone = { valid: cone.valid, problems: cone.problems.map((p) => p.problem) }; } catch (e) { cone = { threw: e.message }; }
      return { accepted_by_server: true, id: n.id, substrate_valid: (await port.verify(n.id)).valid, composer_verify: cone };
    } catch (e) { return { accepted_by_server: false, error: e.message }; }
  };
  const base0 = { compute: 'purl.compute/0.1', node: 'application', evaluator: 'x' };
  out.L5_forged = {
    future_version_pin: await mk('future', { ...base0, operation: 'NOT', operands: [{ resource: zero.id, version: 99, state_hash: 'sha256:' + '0'.repeat(64) }], value: '1' }),
    nonexistent_resource_pin: await mk('nx', { ...base0, operation: 'NOT', operands: [{ resource: 'r_ZZZZZZZZZZ', version: 1, state_hash: 'sha256:' + '0'.repeat(64) }], value: '1' }),
    bogus_state_hash: await mk('bogus', { ...base0, operation: 'NOT', operands: [{ resource: zero.id, version: 2, state_hash: 'sha256:' + '1'.repeat(64) }], value: '1' }),
    wrong_arity_NOT_two_operands: await mk('arity', { ...base0, operation: 'NOT', operands: [{ resource: zero.id, version: 2, state_hash: (await port.at(zero.id, 2)).state_hash }, { resource: one.id, version: 2, state_hash: (await port.at(one.id, 2)).state_hash }], value: '1' }),
    not_a_compute_node_type_free: await (async () => { try { const n = await port.create('compute-application', { hello: 'world' }); return { accepted_by_server: true, id: n.id }; } catch (e) { return { accepted_by_server: false, error: e.message }; } })(),
  };
}

// L6: staleness is version-based, not value-based: a grant (no value change) makes dependents "stale".
{
  const x = await c.apply('XOR', [zero.id, one.id]);
  const before = await c.stale(x.id);
  const v = (await port.head(zero.id)).version;
  // owner links the literal to something (no change to value)
  await port.invoke(zero.id, 'link', { rel: 'parent', target: one.id, version: 2 });
  const after = await c.stale(x.id);
  const valueSame = (await port.head(zero.id)).record.state.value === '0';
  out.L6_version_staleness = { before, after, operand_value_unchanged: valueSame, operand_version_before: v };
}

// L7: can a different principal update someone else's public literal or create an application pinning it?
{
  let upd;
  try { await port2.invoke(one.id, 'update', { merge_patch: { value: '0' } }); upd = 'accepted'; } catch (e) { upd = `refused: ${e.status}`; }
  const y = await c2.apply('NOT', [one.id]);
  out.L7_cross_principal = { update_others_literal: upd, pin_others_literal_created: y.id, link_recorded_inbound_on_target: (await port.inbound(one.id)).some((r) => r.from === y.id) };
}

// L8: can anyone else inject "dependents" into my node's inbound index (link spam)?
{
  const spam = await port2.create('compute-literal', { compute: 'purl.compute/0.1', node: 'literal', value: '1' });
  await port2.invoke(spam.id, 'link', { rel: 'references', target: zero.id, version: 1 });
  const deps = await c.dependents(zero.id);
  out.L8_inbound_index_injection = { spam_literal: spam.id, appears_in_dependents_of_zero: deps.ids.includes(spam.id) };
}

// L9: identical application built twice by different principals: equal (op, pins, value) but distinct state hashes.
{
  const a = await c.apply('AND', [zero.id, one.id]);
  const b = await c2.apply('AND', [zero.id, one.id]);
  const ha = await port.head(a.id), hb = await port.head(b.id);
  out.L9_same_triple = { same_pins: JSON.stringify(ha.record.state.operands) === JSON.stringify(hb.record.state.operands), same_value: ha.record.state.value === hb.record.state.value, equal_state_hash: ha.state_hash === hb.state_hash };
}
console.log(JSON.stringify(out, null, 1));
