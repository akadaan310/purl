// node scripts/axes-probe.js — is "conformance" independent of "authority" (and of "evidence")?
// The two-axis model is FALSIFIED if any quadrant cannot be produced by an actual operation.
// Runs on an isolated circle (temporary stores, local ACSP); writes circle/experiments/axes/record-N.json.
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCircle } from './circle-lib.js';
import { sha256 } from '../src/circle/adapters.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const c = await startCircle({ substrateDir: resolve(ROOT, '..', 'substrateIO'), acspDir: resolve(ROOT, '..', 'NetGovComEduGovOrgEduGovComNet'),
  substratePort: 41765, acspPort: 41787, purlDataDir: mkdtempSync(join(tmpdir(), 'axes-purl-')) });
const h = async (m, p, b) => { const r = await fetch(c.base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, doc: await r.json() }; };
const acsp = async (p, init) => { const r = await fetch(c.acspBase + p, init); return { status: r.status, doc: await r.json().catch(() => null) }; };
const runCheck = async (name) => { const r = await h('POST', '/conformance/runs?session=axes-probe'); return { run: r.doc.run, check: r.doc.checks?.[name] ?? null, implementation_id: r.doc.implementation_id }; };
const out = { experiment: 'EXP-AXES-1', started: new Date().toISOString(), commit: c.cfg.commits, quadrants: {}, evidence_axis: {} };
try {
  const intent = await acsp('/new?format=json&session_id=owner-human&title=axes');
  const rid = (await acsp('/r', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intent.doc.request) })).doc.resource_id;
  c.cfg.acspResource = rid;

  // Q1 conformant ∧ authorized: TALK = an ACSP propose (needs no capability), stage 'submitted'
  const q1 = await h('POST', `/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD/TALK/acsp/${rid}?session=axes-probe`);
  const talk = q1.doc.steps?.find((s) => s.verb === 'TALK');
  out.quadrants.conformant_authorized = { operation: 'TALK (ACSP propose)', http: q1.status, acsp_stage: talk?.stage, proposal: talk?.proposal_id,
    authority: talk?.stage === 'submitted' ? 'granted (propose requires none)' : 'refused', conformance_check: (await runCheck('talk_stage_never_committed')).check };

  // Q2 conformant ∧ ¬authorized: a VALID prepared append (ACSP says valid) submitted without a capability
  const prep = await acsp(`/r/${rid}?action=prepare_append&format=json&session_id=axes-probe&type=observation&title=probe&content=x`);
  const sub = await acsp(`/r/${rid}/operations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prep.doc.request) });
  out.quadrants.conformant_unauthorized = { operation: 'ACSP append (prepared intent, submitted without capability)', prepared_valid: prep.doc.validation?.valid, http: sub.status,
    authority: sub.status >= 400 ? `refused (${sub.doc?.error?.code})` : 'granted', conformance: 'the request is schema-valid (ACSP validation.valid) and violates no bridge clause: it was not sent through the circle (K-04 binds the circle, not the participant)' };

  // Q3 ¬conformant ∧ authorized: the PURL owner rewrites a scroll's program in place (PURL permits it; K-12 forbids it)
  const s = await h('POST', '/seurl/START/map/eca/30/8/state/1/WRITE/next/COMMIT?session=axes-probe');
  const before = await runCheck('scroll_program_immutable');
  const id = s.doc.scroll.id;
  const doc = await c.circle.purl.request('GET', `/r/${id}`);
  const forged = '/seurl/START/map/eca/30/8/state/1/WRITE/next/WRITE/next';
  const upd = await c.circle.purl.request('POST', `/r/${id}/ops/update`, { expected_version: doc.json.version, input: { merge_patch: { seurl: forged, content_id: sha256(forged) } } });
  // evidence axis: before any new run, the latest recorded evidence still says the check passed
  const latest = await h('GET', '/conformance');
  out.evidence_axis = { before_tamper: before.check, latest_run_after_tamper_without_rerun: { run: latest.doc.run, check: latest.doc.checks?.scroll_program_immutable },
    meaning: 'conformance evidence is about the (constitution, enforcement, implementation, DATA) at run time; after the data changed, the recorded TESTED is stale until a new run' };
  const after = await runCheck('scroll_program_immutable');
  out.quadrants.nonconformant_authorized = { operation: 'PURL update of a scroll program in place, by the scroll owner (the circle principal)', http: upd.status,
    authority: upd.ok ? 'granted (owner rights in PURL)' : `refused (${upd.status})`, conformance_check: after.check };

  // Q4 ¬conformant ∧ ¬authorized: rewrite the constitution through the system it governs; act on a credential in a URL
  const q4a = await h('POST', '/constitution', { clauses: [] });
  const q4b = await h('POST', '/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT?session=axes-probe&cap=stolen');
  out.quadrants.nonconformant_unauthorized = { operations: [{ op: 'POST /constitution', http: q4a.status, code: q4a.doc.error?.code }, { op: 'COMMIT with ?cap=', http: q4b.status, code: q4b.doc.error?.code }],
    authority: 'none exists for either', conformance: 'K-13 and K-06 forbid them' };

  const q = out.quadrants;
  const produced = {
    conformant_authorized: q.conformant_authorized.acsp_stage === 'submitted' && q.conformant_authorized.conformance_check?.ok === true,
    conformant_unauthorized: q.conformant_unauthorized.prepared_valid === true && q.conformant_unauthorized.http >= 400,
    nonconformant_authorized: upd.ok && q.nonconformant_authorized.conformance_check?.ok === false,
    nonconformant_unauthorized: q4a.status === 405 && q4b.status === 400,
  };
  out.produced = produced;
  out.verdict = Object.values(produced).every(Boolean) ? 'all four quadrants produced by actual operations: conformance and authority are independent axes (model NOT falsified)' : 'a quadrant could not be produced: the two-axis model is FALSIFIED as stated';
  out.evidence_axis.verdict = before.check?.ok === true && out.evidence_axis.latest_run_after_tamper_without_rerun.check?.ok === true && after.check?.ok === false
    ? 'stale evidence observed: a third axis (evidence currency) is needed' : 'stale evidence NOT observed';
} finally { await c.close(); }
const dir = join(ROOT, 'circle', 'experiments', 'axes');
mkdirSync(dir, { recursive: true });
const n = readdirSync(dir).filter((f) => f.startsWith('record-')).length + 1;
writeFileSync(join(dir, `record-${n}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out.produced), '\n', out.verdict, '\n', out.evidence_axis.verdict);
process.exit(0);
