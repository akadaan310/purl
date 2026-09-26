// Re-verify the three live ACSP handoff resources against the live PURL instance, independently.
// Run: node review/acsp-probe.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HttpPort } from '../purl/src/compute/ports.js';
import { Composer } from '../purl/src/compute/composer.js';
import { AcspSession } from '../purl/src/bridge/acsp.js';

const live = JSON.parse(readFileSync(new URL('../live.json', import.meta.url)));
const acspBase = new URL(live.acsp_instance).origin;
const purlBase = new URL(live.purl_instance).origin;
const reg = await (await fetch(`${purlBase}/principals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'agent', label: 'acsp-reviewer' }) })).json();
const port = new HttpPort(purlBase, reg.token);
const c = new Composer(port);
const out = {};
for (const r of live.acsp_resources) {
  const doc = await (await fetch(r.acsp_resource_json)).json();
  const rid = doc.resource?.id ?? r.acsp_resource.split('/r/')[1];
  const s = new AcspSession(acspBase, { session_id: 'reviewer' });
  const cps = [];
  for (const cp of doc.checkpoints) { const v = await s.verifyCheckpoint(rid, cp.number); cps.push({ n: cp.number, ok: v.ok, status: v.status }); }
  const claims = [];
  for (const k of doc.knowledge.items) {
    let j; try { j = JSON.parse(k.content); } catch { continue; }
    if (j.schema !== 'purl.compute.result/0.1') continue;
    const at = await port.at(j.purl.resource, j.purl.version);
    const v = await c.verify(j.purl.resource, { version: j.purl.version });
    claims.push({ tok: k.id, by: k.source.session_id, step: j.step, claimed: j.value, purl_value: at.record.state.value, pin_hash_ok: at.state_hash === j.purl.state_hash, cone_valid: v.valid, problems: v.problems.map((p) => p.problem), annotations: (k.annotations ?? []).map((a) => `${a.kind} by ${a.source.session_id}`) });
  }
  // task literals: are they still at the version the claims pinned?
  out[r.run] = { checkpoints: cps, claims, handoffs: doc.handoffs.map((h) => `${h.id}:${h.status}->${h.to.session_id}`) };
}
// Can an anonymous caller (no capability) write a result claim into someone else's ACSP resource?
{
  const rid = live.acsp_resources[0].acsp_resource.split('/r/')[1];
  const s = new AcspSession(acspBase, { session_id: 'session-a', agent_id: 'agent-a' });
  const r = await s.op(rid, 'append', { type: 'finding', title: 'forged', content: '{}' });
  out.anonymous_append_as_session_a = { status: r.status, code: r.body?.error?.code ?? null };
}
// Does ACSP accept (from its own owner) a claim about a PURL node whose value is false? (it never interprets content)
{
  const s = new AcspSession(acspBase, { session_id: 'reviewer-owner', kind: 'human' });
  const cr = await s.op(null, 'create', { title: 'reviewer probe', focus: 'probe' });
  const rid = cr.body.resource_id;
  const ap = await s.op(rid, 'append', { type: 'finding', title: 'C = XOR(0,1) = 0', content: JSON.stringify({ schema: 'purl.compute.result/0.1', step: 'C', value: '0' }) });
  out.acsp_accepts_false_claim = { create: cr.status, append: ap.status };
}
console.log(JSON.stringify(out, null, 1));
