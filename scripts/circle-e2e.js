// npm run circle:e2e — EXP-CIRCLE-E2E: one SEURL entry carried through every arrow of the
// circle, each HTTP transition recorded. Writes circle/experiments/e2e/record-<n>.json.
// Deterministic content (addresses, derivation_ids, value_ids, FSM states, stages) is hashed;
// wall-clock times and generated ids (scroll ids, proposal ids) are kept but excluded.
import { writeFileSync, mkdirSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCircle, killTree } from './circle-lib.js';
import { ownerResource } from './circle-conformance.js';
import { sha256 } from '../src/circle/adapters.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUBSTRATE_DIR = process.env.SUBSTRATE_DIR ?? resolve(ROOT, '..', 'substrateIO');
const ACSP_DIR = process.env.ACSP_DIR ?? resolve(ROOT, '..', 'NetGovComEduGovOrgEduGovComNet');
const PROGRAM = '/seurl/START/map/eca/90/8/state/5/WRITE/next/PERTURB/0/WRITE/damage/16';

const purlDir = mkdtempSync(join(tmpdir(), 'e2e-purl-'));
let c = await startCircle({ substrateDir: SUBSTRATE_DIR, acspDir: ACSP_DIR, substratePort: 48765, acspPort: 48787, purlDataDir: purlDir });
const transcript = [];
const det = [];
async function step(arrow, method, path, pick) {
  const t0 = Date.now();
  const r = await fetch(c.base + path, { method, headers: { Accept: 'application/json' } });
  const doc = await r.json();
  const kept = pick(doc);
  transcript.push({ arrow, method, path, status: r.status, ms: Date.now() - t0, observed: kept.observed });
  det.push({ arrow, status: r.status, ...kept.det });
  if (r.status >= 400 && !kept.allowFailure) throw new Error(`${arrow}: ${r.status} ${JSON.stringify(doc.error)}`);
  return doc;
}

try {
  const acspResource = await ownerResource(c.acspBase, 'EXP-CIRCLE-E2E');
  const v0 = (await (await fetch(`${c.acspBase}/r/${acspResource}?action=status&format=json`)).json()).version;
  await step('enter', 'GET', '/', (d) => ({ det: { verbs: d.verbs, constitution: d.constitution.content_id }, observed: { moves: d.moves.map((m) => m.rel) } }));
  await step('discover-constitution', 'GET', '/constitution', (d) => ({ det: { clauses: d.document.clauses.length }, observed: { content_id: d.content_id } }));
  await step('legal-operations', 'GET', `/naici/legal?url=${encodeURIComponent('/seurl/START/map/eca/90/8/state/5')}`, (d) => ({ det: { legal: d.legal.map((m) => m.rel) }, observed: {} }));
  await step('construct (SEURL -> typed term -> value)', 'GET', PROGRAM, (d) => ({ det: { state: d.state, address: d.current_address, derivation_id: d.term.derivation_id, value_id: d.value.identity.value_id }, observed: { value: d.value.value } }));
  await step('prepare (GET changes nothing)', 'GET', `${PROGRAM}/COMMIT/BUILD/TALK/acsp/${acspResource}`, (d) => ({ det: { state: d.state, would_reach: d.prepared.would_reach }, observed: { prepared: d.prepared.moves } }));
  const perf = await step('perform (PURL scroll, substrate executions, ACSP propose, substrate observation)', 'POST', `${PROGRAM}/COMMIT/BUILD/TALK/acsp/${acspResource}?session=exp-e2e&agent=circle-e2e`, (d) => {
    const [cm, b, t] = d.steps;
    return { det: { stages: d.steps.map((s) => s.stage), records: b.build.records.map((r) => ({ address: r.address, derivation_id: r.derivation_id, value_id: r.value_id, status: r.epistemic_status })), observation: t.observation?.measurements, observation_status: t.observation?.epistemic_status },
      observed: { scroll: cm.scroll.id, proposal: t.proposal_id, execution_ids: b.build.records.map((r) => r.execution_id) } };
  });
  const sid = perf.scroll.id;
  const v1 = (await (await fetch(`${c.acspBase}/r/${acspResource}?action=status&format=json`)).json()).version;
  det.push({ arrow: 'acsp-version-delta', delta: v1 - v0 });
  await step('observe scroll', 'GET', `/scrolls/${sid}`, (d) => ({ det: { address: d.address, builds: d.builds.map((b) => b.outcome), talks: d.talks.map((t) => t.stage) }, observed: {} }));
  const cp = await step('checkpoint', 'POST', `/checkpoints?session=exp-e2e&scroll=${sid}&acsp_resource=${acspResource}&next=resume%20and%20rebuild`, (d) => ({ det: { active_scroll_is_this: d.active_scroll === sid }, observed: { id: d.id, content_id: d.content_id } }));
  // a later session: a new circle process over the same PURL store, no transcript
  await c.close({ children: false });
  const neighbours = c;
  c = await startCircle({ substrateBase: neighbours.substrateBase, acspBase: neighbours.acspBase, purlDataDir: purlDir, acspOrigin: 'harness' });
  await step('resume (new process)', 'GET', `/resume/${cp.id}`, (d) => ({ det: { intact: d.intact, constitution_changed: d.constitution_changed, next: d.next, changed: d.scrolls.map((s) => s.changed_since) }, observed: {} }));
  await step('rebuild from resumed state', 'POST', `/scrolls/${sid}/build?session=exp-e2e-later`, (d) => (d.build ? { det: { outcome: d.build.outcome, value_ids: d.build.records.map((r) => r.value_id), reruns: d.build.records.map((r) => r.rerun) }, observed: {} }
    : { det: { error: d.error.code }, observed: { error: d.error }, allowFailure: true }));
  for (const ch of neighbours.children) killTree(ch);

  const dir = join(ROOT, 'circle', 'experiments', 'e2e');
  mkdirSync(dir, { recursive: true });
  const n = readdirSync(dir).filter((f) => f.startsWith('record-')).length + 1;
  const record = { experiment: 'EXP-CIRCLE-E2E', run: n, commits: c.cfg.commits, epistemic_status: 'SIMULATED (actors are this script; ACSP is a local in-memory instance)', deterministic_sha256: sha256(det), deterministic: det, transcript };
  writeFileSync(join(dir, `record-${n}.json`), JSON.stringify(record, null, 1) + '\n');
  console.log(`record-${n}: ${record.deterministic_sha256}`);
} finally {
  await c.close();
}
