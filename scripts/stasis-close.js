// STASIS=3 node scripts/stasis-close.js — produce a stasis checkpoint snapshot reproducibly (STASIS-2's was
// produced by hand; this is the same procedure as code). Isolated circle with persistent stores inside
// circle/checkpoints/stasis-N/; one representative program (COMMIT/BUILD/TALK to a local ACSP resource the
// operator creates), one conformance run, one checkpoint. Writes checkpoint.json, resume.json and the ACSP
// event list. The circle principal's token file is removed: only token hashes remain in the store.
import { mkdirSync, existsSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCircle } from './circle-lib.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.env.STASIS ?? 3);
const DIR = join(ROOT, 'circle', 'checkpoints', `stasis-${N}`);
if (existsSync(DIR)) { console.error(`${DIR} exists: a stasis snapshot is never overwritten`); process.exit(1); }
const SESSION = `stasis-${N}-close`;
mkdirSync(join(DIR, 'purl-store'), { recursive: true });
mkdirSync(join(DIR, 'substrate-store'), { recursive: true });
const c = await startCircle({ substrateDir: resolve(ROOT, '..', 'substrateIO'), acspDir: resolve(ROOT, '..', 'NetGovComEduGovOrgEduGovComNet'), substrateStore: join(DIR, 'substrate-store'),
  purlDataDir: join(DIR, 'purl-store'), substratePort: 42865, acspPort: 42887 });
const h = async (m, p, b) => { const r = await fetch(c.base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, doc: await r.json() }; };
const acsp = async (p, init) => (await fetch(c.acspBase + p, init)).json();
let out = {};
try {
  const intent = await acsp(`/new?format=json&session_id=operator-owner&title=STASIS-${N}`);
  const rid = (await acsp('/r', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intent.request) })).resource_id;
  c.cfg.acspResource = rid;
  const prog = await h('POST', `/seurl/START/map/eca/90/8/state/5/WRITE/next/PERTURB/0/WRITE/damage/8/COMMIT/BUILD/TALK/acsp/${rid}?session=${SESSION}`);
  const run = await h('POST', `/conformance/runs?session=${SESSION}`);
  const next = process.env.NEXT ?? `STASIS-${N + 1}: see circle/CURRENT-STATE.md and circle/OPEN-PROBLEMS.md`;
  const cp = await h('POST', `/checkpoints?session=${SESSION}`, { next });
  const id = cp.doc.checkpoint?.id ?? cp.doc.id;
  const resume = await h('GET', `/resume/${id}`);
  writeFileSync(join(DIR, 'checkpoint.json'), JSON.stringify(cp.doc, null, 1) + '\n');
  writeFileSync(join(DIR, 'resume.json'), JSON.stringify(resume.doc, null, 1) + '\n');
  writeFileSync(join(DIR, `acsp-${rid}-events.json`), JSON.stringify(await acsp(`/r/${rid}/events?format=json`), null, 1) + '\n');
  out = { program_status: prog.status, conformance: { run: run.doc.run, summary: run.doc.summary, implementation_id: run.doc.implementation_id }, checkpoint: id, content_id: cp.doc.content_id ?? cp.doc.checkpoint?.content_id, intact: resume.doc.intact, acsp_resource: rid };
} finally { await c.close(); }
for (const f of readdirSync(join(DIR, 'purl-store'))) if (f.endsWith('.token')) rmSync(join(DIR, 'purl-store', f));
writeFileSync(join(DIR, 'close.json'), JSON.stringify({ stasis: N, closed_by: SESSION, ...out, procedure: 'scripts/stasis-close.js' }, null, 1) + '\n');
console.log(JSON.stringify(out));
process.exit(0);
