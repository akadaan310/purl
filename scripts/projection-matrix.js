// node scripts/projection-matrix.js — measure what survives each bridge boundary.
// Data: COMMITTED artifacts only (STASIS-1 and STASIS-2 snapshots, the live ACSP fixture, git
// history) plus exhaustive enumeration of a declared finite program space. Loss is measured by
// substrateIO (scripts/projection_matrix_measure.py → substrate.info). Writes circle/PROJECTION-MATRIX.json.
//
// Each boundary is measured twice where identifiers exist:
//   "by-lookup"  — the projection keeps a hash/id, so the source is recoverable by lookup
//   "content"    — identifiers removed: what the projected document itself carries
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/continuity/store.js';
import { run, parseMoves, pathOf } from '../src/circle/seurl.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = (p) => join(ROOT, 'circle', p);

function scrollsFrom(snapshot) {
  const dir = mkdtempSync(join(tmpdir(), 'pm-'));
  cpSync(C(`checkpoints/${snapshot}/purl-store`), dir, { recursive: true });
  const store = new Store({ dataDir: dir });
  const out = [];
  // Store.resources: id -> { state: <resource record {id, type, version, state}>, events }
  for (const e of store.resources.values()) if (e.state?.type === 'scroll') out.push(e.state);
  return out;
}
let scrolls = [];
for (const snap of ['final', 'stasis-2']) {
  try { scrolls = scrolls.concat(scrollsFrom(snap).map((r) => ({ snap, ...r }))); } catch (e) { console.error('snapshot', snap, e.message); }
}
const execs = ['final', 'stasis-2'].flatMap((s) => readFileSync(C(`checkpoints/${s}/substrate-store/executions.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const acspEvents = JSON.parse(readFileSync(C('fixtures/acsp-live-8N2RXG1MW79S-2026-10-01/events.json'), 'utf8')).events;

// ---- exhaustive declared program space (DERIVED) ---------------------------------
const BOUNDS = ['/map/eca/90/8/state/5', '/map/eca/30/8/state/1', '/map/increment/3/state/2'];
const MOVES = [['WRITE', 'next'], ['WRITE', 'flip/0'], ['PERTURB', '0'], ['WRITE', 'orbit']];
const programs = [];
const rec = (prefix, depth) => { programs.push(prefix); if (depth === 3) return; for (const [v, a] of MOVES) rec(`${prefix}/${v}/${a}`, depth + 1); };
for (const b of BOUNDS) rec(`/START${b}`, 0);
const canon = (p) => pathOf(parseMoves(p));
const variants = (p) => [p, p + '/', p.replace('/START/', '/START//'), p.replace(/\/(WRITE|PERTURB)\//g, '//$1/')];

const boundaries = [];
const B = (id, from, to, edge, kind, pairs, note) => boundaries.push({ id, from, to, edge, kind, note, pairs });

B('B1', 'SEURL move word (program)', 'value address', 'PARSE', 'exhaustive (declared space)',
  programs.map((p) => [run(p).current_address, p]), `${BOUNDS.length} bound states x all words of length <= 3 over ${MOVES.length} moves`);
B('B2', 'raw SEURL text', 'canonical program text', 'PARSE', 'exhaustive (declared variants)',
  programs.flatMap((p) => variants(p).map((v) => [canon(v), v])), '4 spellings per program (trailing slash, empty segments)');
B('B3a', 'circle Scroll record', 'SEURL program text (π)', 'PROJECT', 'committed records (content)',
  scrolls.map((r) => [r.state?.seurl, { id: r.id, snap: r.snap, author: r.state?.author?.session_id, parent: r.state?.parent ?? null, version: r.version }]), 'what a record carries beyond its program');
B('B3b', 'SEURL program text', 'circle Scroll record (σ, COMMIT)', 'RECORD', 'committed records',
  scrolls.map((r) => [{ id: r.id, snap: r.snap }, r.state?.seurl]), 'σ is not a function of the program: each COMMIT mints a fresh record (H(output|source) > 0); the program is fully recoverable from the record (loss 0)');
B('B4a', 'value address', 'value_id', 'RESOLVE', 'committed executions (content)',
  execs.filter((x) => x.value_id).map((x) => [x.value_id, x.purl]), 'extensional identity: distinct addresses, one value');
B('B4b', 'value address', 'derivation_id', 'PARSE', 'committed executions',
  execs.map((x) => [x.derivation_id, x.purl]), 'intensional identity');
B('B5a', 'substrate execution record', 'addressed transition (with content_id)', 'PROJECT', 'committed executions (by-lookup)',
  execs.map((x) => [[x.purl, 'execute', x.value_id, x.execution_hash], { purl: x.purl, value: x.value, environment_id: x.environment_id, code_hash: x.code_hash, git: x.git, materialized: x.materialized }]), 'execution_hash identifies the record');
B('B5b', 'substrate execution record', 'addressed transition (identifiers removed)', 'PROJECT', 'committed executions (content)',
  execs.map((x) => [[x.purl, 'execute', x.value_id], { value: x.value, environment_id: x.environment_id, code_hash: x.code_hash, git: x.git, recorded_utc: x.recorded_utc }]), 'what the transition itself carries');
B('B6a', 'ACSP event', 'P-ACSP-EV-1 transition (with t, request_hash)', 'OBSERVE', 'live fixture (by-lookup)',
  acspEvents.map((e) => [[e.version, e.operation, e.actor.session_id, e.request_hash ?? null], e]), 'the field-trial resource 8N2RXG1MW79S, 12 events');
B('B6b', 'ACSP event', 'P-ACSP-EV-1 transition (label, actor only)', 'OBSERVE', 'live fixture (content)',
  acspEvents.map((e) => [[e.operation, e.actor.session_id], { data: e.data ?? null, summary: e.summary }]), 'what of the event payload survives in the label sequence');
let commits = [];
try {
  commits = execFileSync('git', ['-C', ROOT, 'log', '-40', '--format=%H%x09%T%x09%P%x09%an%x09%s'], { encoding: 'utf8' }).trim().split('\n').map((l) => l.split('\t'));
} catch { /* not a git checkout */ }
B('B7a', 'git commit', 'addressed transition (with tree id)', 'PROJECT', 'git history (by-lookup)',
  commits.map(([h, t, p, a]) => [[p, 'commit', h, a, t], { h, subject: commits.find((c) => c[0] === h)[4] }]), 'last 40 purl commits');
B('B7b', 'git commit', 'addressed transition (author, operation only)', 'PROJECT', 'git history (content)',
  commits.map(([h, , , a, s]) => [[a, 'commit'], { h, s }]), 'what remains without ids');

const r = spawnSync('python3', [join(ROOT, 'scripts', 'projection_matrix_measure.py')], { input: JSON.stringify({ boundaries }), encoding: 'utf8', maxBuffer: 1 << 26 });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
const measured = JSON.parse(r.stdout);
const declared = [
  { id: 'D1', from: 'circle Scroll + build', to: 'ACSP TOK in a proposal', edge: 'PUBLISH', kind: 'declared (code: scrollTok)', lost: ['execution ids', 'environment_id', 'code hash', 'PURL event log (URL kept)'], status: 'DECLARED, not measured: the TOK text is built from the record; no corpus of TOKs with their records exists in committed data' },
  { id: 'D2', from: 'Golden Surface tab', to: 'read {url,title,text}', edge: 'RESOLVE', kind: 'declared (relay protocol)', lost: ['DOM structure', 'affordances', 'scroll position'], status: 'DECLARED; FakePhone text is synthetic, so no measurement is possible here' },
  { id: 'D3', from: 'checkpoint', to: 'resume', edge: 'RECONSTRUCT', kind: 'hash-verified', lost: [], status: 'DERIVED: content_id = H(state) re-verified on resume (test "STASIS-2 checkpoint is recoverable")' },
];
const doc = { format: 'projection-matrix/1', generated_by: 'scripts/projection-matrix.js', data: 'committed artifacts only; reproducible from GitHub', loss_definition: 'H(source | output) in bits over the listed pairs (plug-in estimate; mm_bias_bound_bits is the Miller-Madow bias scale for small samples)',
  epistemic_status: { exhaustive: 'DERIVED (exact over the declared space)', committed: 'OBSERVED (of these records only; not a population estimate)', declared: 'DECLARED' },
  counts: { scrolls: scrolls.length, executions: execs.length, acsp_events: acspEvents.length, commits: commits.length, programs: programs.length },
  measured, declared };
writeFileSync(C('PROJECTION-MATRIX.json'), JSON.stringify(doc, null, 1) + '\n');
for (const m of measured) console.log(`${m.id.padEnd(4)} ${m.from} -> ${m.to}: n=${m.n} H(src)=${m.H_source_bits} loss=${m.loss_H_source_given_output_bits} H(out|src)=${m.H_output_given_source_bits}`);
