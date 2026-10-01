// npm run bridge:cold — the cold reconstruction test (C-051).
//
// Nothing transient is used: every repository is cloned from COMMITTED refs into a fresh
// directory (SOURCE=origin clones the pushed session branch from GitHub; default clones the
// local repositories' committed HEAD, never their working trees), dependencies come from
// lockfiles, and the circle is restarted from committed snapshots only. Then:
//   1. rerun every suite              4. replay the committed checkpoint snapshot
//   2. verify recorded hashes         5. rerun EXP-CIRCLE-E2E and compare with record-2
//   3. verify stasis commits exist    6. ask the circle the questions of directive §51
// Writes circle/cold/report-N.json (into the CURRENT working tree, as a new record).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = resolve(HERE_ROOT, '..');
const BRANCH = process.env.BRANCH ?? 'ccr-d0887a23-30wf63';
const SOURCE = process.env.SOURCE ?? 'local';
const REPOS = { purl: 'purl', substrateIO: 'substrateIO', NetGovComEduGovOrgEduGovComNet: 'NetGovComEduGovOrgEduGovComNet', seurl: 'seurl', 'golden-surface': 'golden-surface', MUSA: 'MUSA' };
const WORK = mkdtempSync(join(tmpdir(), 'cold-'));
const report = { started: new Date().toISOString(), source: SOURCE, branch: BRANCH, work: WORK, clones: {}, suites: {}, hashes: {}, stases: {}, questions: {}, verdicts: [] };
const sha = (b) => 'sha256:' + createHash('sha256').update(b).digest('hex');
const sh = (cmd, args, cwd, timeout = 900000) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 1 << 26 }); return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }; };
const step = (name, ok, detail) => { report.verdicts.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); };

// 0. clone committed refs
for (const [name, dir] of Object.entries(REPOS)) {
  const src = SOURCE === 'origin' ? execFileSync('git', ['-C', join(PARENT, dir), 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim() : join(PARENT, dir);
  // Repositories this work never changed have no session branch on the remote: use their default branch, and say so.
  let ref = BRANCH;
  let r = sh('git', ['clone', '-q', '--branch', BRANCH, '--single-branch', src, join(WORK, dir)], WORK, 300000);
  if (r.code !== 0) {
    const sym = sh('git', ['ls-remote', '--symref', src, 'HEAD'], WORK).out.match(/refs\/heads\/(\S+)\s+HEAD/);
    ref = sym ? sym[1] : null;
    if (ref) r = sh('git', ['clone', '-q', '--branch', ref, '--single-branch', src, join(WORK, dir)], WORK, 300000);
  }
  const head = r.code === 0 ? execFileSync('git', ['-C', join(WORK, dir), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() : null;
  report.clones[name] = { head, ref, ok: r.code === 0, session_branch_on_remote: ref === BRANCH };
  step(`clone ${name}`, r.code === 0, head ? `${head} (${ref})` : r.out.slice(0, 200));
}
const W = (d) => join(WORK, d);

// 1. suites
{
  const r = sh('npm', ['ci', '--no-audit', '--no-fund'], W('NetGovComEduGovOrgEduGovComNet'));
  step('ACSP npm ci (lockfile)', r.code === 0, r.code === 0 ? '' : r.out.slice(-300));
}
const suites = [
  ['substrateIO unittest', 'python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-t', '.'], 'substrateIO', (o) => /^OK/m.test(o) && (o.match(/Ran (\d+) tests/) ?? [])[1]],
  ['substrateIO validate', 'python3', ['-m', 'tools.validate'], 'substrateIO', (o) => /^0 violation/m.test(o) && '0 violations'],
  ['substrateIO run_ids', 'python3', ['-m', 'experiments.run_all', '--dry'], 'substrateIO', (o) => {
    const ids = [...o.matchAll(/(EXP-[A-G]-[0-9a-f]{12})/g)].map((m) => m[1]);
    const reg = JSON.parse(readFileSync(join(W('substrateIO'), 'research/registries/experiments.json'), 'utf8')).flatMap((e) => e.runs.map((x) => x.run_id));
    return ids.length === 7 && ids.every((i) => reg.includes(i)) && `${ids.length} run_ids = registry`; }],
  ['ACSP vitest', 'npx', ['vitest', 'run'], 'NetGovComEduGovOrgEduGovComNet', (o) => /Tests\s+(\d+) passed/.test(o) && !/failed/.test(o.split('Tests')[1] ?? '') && o.match(/Tests\s+(\d+) passed/)[1] + ' passed'],
  ['purl npm test (incl. circle, golden, musa)', 'npm', ['test'], 'purl', (o) => /# fail 0/.test(o) && `${(o.match(/# pass (\d+)/) ?? [])[1]} pass, ${(o.match(/# skipped (\d+)/) ?? [])[1]} skipped`],
];
for (const [name, cmd, args, dir, judge] of suites) {
  const r = sh(cmd, args, W(dir));
  const v = judge(r.out);
  report.suites[name] = { code: r.code, result: v || 'FAILED', tail: v ? undefined : r.out.slice(-800) };
  step(name, Boolean(v), v || r.out.slice(-200));
}

// 2. recorded hashes, re-derived from committed bytes
{
  const c = sha(readFileSync(W('purl/circle/constitution/constitution-v1.json')));
  report.hashes.constitution = c;
  step('constitution content id unchanged since STASIS-1', c === 'sha256:319402d8efca5b2bbab32d78b898fe200ace7886cbf2d4db89ada598f73b8cb4', c);
  const man = JSON.parse(readFileSync(W('NetGovComEduGovOrgEduGovComNet/migration/relay-gen1/manifest.json'), 'utf8'));
  const bad = Object.entries(man.files).filter(([f, h]) => sha(readFileSync(W(`NetGovComEduGovOrgEduGovComNet/migration/relay-gen1/${f}`))) !== h).map(([f]) => f);
  step('relay generation-1 snapshot hashes', bad.length === 0, bad.join(',') || `${Object.keys(man.files).length} files`);
}

// 3. every stasis names commits that exist in the clones
{
  const st = JSON.parse(readFileSync(W('purl/circle/stases.json'), 'utf8'));
  for (const s of st.stases.filter((x) => Object.keys(x.commits ?? {}).length)) {
    const missing = Object.entries(s.commits).filter(([repo]) => REPOS[repo === 'acsp' ? 'NetGovComEduGovOrgEduGovComNet' : repo]).filter(([repo, c]) => {
      const d = W(REPOS[repo === 'acsp' ? 'NetGovComEduGovOrgEduGovComNet' : repo]);
      return sh('git', ['-C', d, 'cat-file', '-e', `${c}^{commit}`], d).code !== 0;
    }).map(([r, c]) => `${r}@${c}`);
    report.stases[s.id] = { missing };
    step(`${s.id} commits reachable`, missing.length === 0, missing.join(',') || 'all');
  }
}

// 4–6. restart the circle from the clone, from committed snapshots only
const { startCircle } = await import(pathToFileURL(W('purl/scripts/circle-lib.js')));
const purlDir = mkdtempSync(join(tmpdir(), 'cold-purl-'));
cpSync(W('purl/circle/checkpoints/final/purl-store'), purlDir, { recursive: true });
const subStore = mkdtempSync(join(tmpdir(), 'cold-sub-'));
cpSync(W('purl/circle/checkpoints/final/substrate-store'), subStore, { recursive: true });
const c = await startCircle({ substrateDir: W('substrateIO'), substrateStore: subStore, acspDir: W('NetGovComEduGovOrgEduGovComNet'), purlDataDir: purlDir, substratePort: 47765, acspPort: 47787, gitRepos: Object.fromEntries(Object.values(REPOS).map((d) => [d, W(d)])) });
const get = async (p) => { const r = await fetch(c.base + p); return { status: r.status, doc: await r.json() }; };
try {
  const res = await get('/resume/r_HMGMD46GSD');
  step('resume STASIS-1 checkpoint from committed snapshot', res.status === 200 && res.doc.intact === true && res.doc.constitution_changed === false, `intact=${res.doc.intact}`);
  const ques = {
    'What is this?': ['/', (d) => d.what],
    'What protocols exist?': ['/sdk', (d) => d.questions['what protocol is this?']],
    'What can I do?': ['/sdk', (d) => `${d.routes.length} routes`],
    'What is the current state?': ['/observatory', (d) => d.current_state],
    'What happened previously?': ['/stases', (d) => d.stases.map((s) => s.id)],
    'What can I execute?': ['/seurl/START/map/eca/90/8/state/5/WRITE/next', (d) => d.value?.value?.x],
    'What can I observe?': ['/transitions/coverage', (d) => d.matrix.map((m) => m.system)],
    'How do I continue?': ['/resume/r_HMGMD46GSD', (d) => d.next],
    'How do I test?': ['/tests', (d) => `${d.runs.length} recorded runs`],
    'How do I reproduce?': ['/stases/1', (d) => d.reconstruct],
  };
  for (const [q, [path, pick]] of Object.entries(ques)) {
    const r = await get(path);
    const a = r.status === 200 ? pick(r.doc) : null;
    report.questions[q] = { path, status: r.status, answer: a };
    step(`§51 ${q}`, r.status === 200 && a != null, `${path} -> ${JSON.stringify(a)?.slice(0, 80)}`);
  }
} finally { await c.close(); }

// 5. rerun EXP-CIRCLE-E2E in the clone; compare with the committed record-2
{
  const r = sh('node', ['scripts/circle-e2e.js'], W('purl'));
  const rec = readdirSync(W('purl/circle/experiments/e2e')).filter((f) => f.startsWith('record-')).sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/))).at(-1);
  const now = JSON.parse(readFileSync(W(`purl/circle/experiments/e2e/${rec}`), 'utf8'));
  const ref = JSON.parse(readFileSync(W('purl/circle/experiments/e2e/record-2.json'), 'utf8'));
  report.hashes.e2e = { reference: ref.deterministic_sha256, cold: now.deterministic_sha256 };
  const same = now.deterministic_sha256 === ref.deterministic_sha256;
  const diff = same ? [] : now.deterministic.map((x, i) => (JSON.stringify(x) === JSON.stringify(ref.deterministic[i]) ? null : x.arrow)).filter(Boolean);
  report.hashes.e2e.differing_arrows = diff;
  step('EXP-CIRCLE-E2E reproduces record-2 deterministic hash', same, same ? now.deterministic_sha256 : `differs at: ${diff.join(', ')} (exit ${r.code})`);
}

report.finished = new Date().toISOString();
report.summary = { pass: report.verdicts.filter((v) => v.ok).length, fail: report.verdicts.filter((v) => !v.ok).length };
const out = join(HERE_ROOT, 'circle', 'cold');
mkdirSync(out, { recursive: true });
const n = (existsSync(out) ? readdirSync(out).filter((f) => f.startsWith('report-')).length : 0) + 1;
writeFileSync(join(out, `report-${n}.json`), JSON.stringify(report, null, 1) + '\n');
console.log(`report-${n}: ${report.summary.pass} pass, ${report.summary.fail} fail`);
for (const ch of c.children ?? []) { try { process.kill(-ch.pid, 'SIGTERM'); } catch { /* gone */ } }
process.exit(0);
