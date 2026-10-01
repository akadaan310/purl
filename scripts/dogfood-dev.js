// node scripts/dogfood-dev.js — EXP-DOGFOOD-3 (circle/experiments/dogfood-3/SPEC.md, pre-registered).
// Replays this phase's development (purl commits since STASIS-2) through the circle's own interface:
// each commit's own test suite is run in a worktree, then recorded as a dev iteration with that evidence.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCircle } from './circle-lib.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'circle', 'experiments', 'dogfood-3');
const BASE = process.env.DOGFOOD_BASE ?? '53f21e4'; // STASIS-2 purl commit
const WT = resolve(ROOT, '..', 'wt-dogfood'); // a sibling, so ../substrateIO etc. resolve as in the main checkout
const SESSION = 'dogfood-3';
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const H = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex');

const dirty = git('status', '--porcelain', '--untracked-files=no');
const commits = git('rev-list', '--first-parent', '--reverse', `${BASE}..HEAD`).split('\n').filter(Boolean);
const out = { experiment: 'EXP-DOGFOOD-3', spec: 'circle/experiments/dogfood-3/SPEC.md', started: new Date().toISOString(), base: BASE, head: git('rev-parse', 'HEAD'),
  working_tree_clean: dirty === '', confounds: ['sibling repositories at their current heads', 'node_modules linked from the main checkout'], suites: [], iterations: [] };

// ---- step 1: each commit's own suite ------------------------------------------------------
for (const c of commits) {
  if (existsSync(WT)) { spawnSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', WT]); rmSync(WT, { recursive: true, force: true }); }
  git('worktree', 'add', '-q', '--detach', WT, c);
  symlinkSync(join(ROOT, 'node_modules'), join(WT, 'node_modules'));
  const t0 = Date.now();
  const r = spawnSync('npm', ['test'], { cwd: WT, encoding: 'utf8', timeout: 600_000, maxBuffer: 1 << 28 });
  const log = (r.stdout ?? '') + (r.stderr ?? '');
  const num = (k) => Number((log.match(new RegExp(`^# ${k} (\\d+)$`, 'm')) ?? [])[1] ?? NaN);
  const failed = [...log.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  out.suites.push({ commit: c, subject: git('show', '-s', '--format=%s', c), command: 'npm test', exit: r.status, tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped'),
    failed, log_content_id: H(log), seconds: Math.round((Date.now() - t0) / 1000) });
  console.log(c.slice(0, 7), 'tests', num('tests'), 'fail', num('fail'), failed.slice(0, 3).join(' | '));
  spawnSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', WT]);
}

// ---- steps 2-4: record through the circle ------------------------------------------------
const c = await startCircle({ substrateDir: resolve(ROOT, '..', 'substrateIO'), substratePort: 42565, purlDataDir: mkdtempSync(join(tmpdir(), 'dogfood3-')) });
const h = async (m, p, b) => { const r = await fetch(c.base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, doc: await r.json() }; };
const state = async () => { const parts = []; for (const t of ['scroll', 'circle-checkpoint', 'conformance-run', 'amendment', 'dev-iteration']) { const r = await fetch(`${c.purlBase}/r?type=${t}`); const j = await r.json(); parts.push([t, (j.items ?? []).map((x) => [x.id, x.version])]); } return H(JSON.stringify(parts)); };
try {
  const run = await h('POST', `/conformance/runs?session=${SESSION}`);
  out.conformance = { status: run.status, run: run.doc.run, implementation_id: run.doc.implementation_id, summary: run.doc.summary };
  for (const s of out.suites) {
    const r = await h('POST', `/dev/iterations?session=${SESSION}`, { repo: 'purl', commit: s.commit, intent: s.subject,
      evidence: [{ kind: 'test-suite', command: s.command, summary: { tests: s.tests, pass: s.pass, fail: s.fail, skipped: s.skipped, failed: s.failed }, log_content_id: s.log_content_id }] });
    out.iterations.push({ commit: s.commit, status: r.status, id: r.doc.id ?? null, implementation_id: r.doc.iteration?.implementation_id ?? null, currency: r.doc.iteration?.conformance_evidence?.currency ?? null, transition: r.doc.iteration?.transition ?? null, error: r.doc.error ?? null });
  }
  const before = (await h('GET', '/dev/iterations')).doc.count;
  const bogus = await h('POST', `/dev/iterations?session=${SESSION}`, { repo: 'purl', commit: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
  const after = (await h('GET', '/dev/iterations')).doc.count;
  out.nonexistent_commit = { status: bogus.status, code: bogus.doc.error?.code, count_before: before, count_after: after };
  const s0 = await state();
  const listing = (await h('GET', '/dev/iterations')).doc;
  const each = []; for (const it of listing.iterations) each.push((await h('GET', it.href)).doc);
  const self = (await h('GET', '/self')).doc;
  const s1 = await state();
  out.gets_change_nothing = { before: s0, after: s1, equal: s0 === s1 };
  out.export = { listing: listing.iterations, iterations: each.map((d) => ({ id: d.id, ...d.iteration })), self: self.concepts };
} finally { await c.close(); }

// ---- evaluation ---------------------------------------------------------------------------
const FIELDS = ['source_ref', 'operation', 'target_ref', 'actor', 'content_id'];
const headImpl = out.conformance?.implementation_id;
out.results = {
  D1: { complete: out.iterations.filter((i) => i.status === 201 && FIELDS.every((f) => i.transition?.[f] != null)).length, of: out.iterations.length },
  D2: { mismatches: out.iterations.filter((i) => i.currency !== (i.implementation_id === headImpl ? 'current' : 'none')).map((i) => i.commit.slice(0, 7)), current: out.iterations.filter((i) => i.currency === 'current').map((i) => i.commit.slice(0, 7)) },
  D3: out.nonexistent_commit,
  D4: { failing_commits: out.suites.filter((s) => !(s.fail === 0 && s.exit === 0)).map((s) => ({ commit: s.commit.slice(0, 7), fail: s.fail, exit: s.exit, failed: s.failed })) },
  D5: out.gets_change_nothing,
};
out.verdicts = {
  D1: out.results.D1.complete === out.results.D1.of ? 'held' : 'FALSIFIED',
  D2: out.results.D2.mismatches.length === 0 ? 'held' : 'FALSIFIED',
  D3: out.nonexistent_commit.status === 404 && out.nonexistent_commit.count_before === out.nonexistent_commit.count_after ? 'held' : 'FALSIFIED',
  D4: out.results.D4.failing_commits.length === 0 ? 'held' : 'FALSIFIED (see failing_commits; diagnose before attributing)',
  D5: out.gets_change_nothing.equal ? 'held' : 'FALSIFIED',
};
out.finished = new Date().toISOString();
const n = readdirSync(DIR).filter((f) => f.startsWith('record-')).length + 1;
writeFileSync(join(DIR, `record-${n}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out.verdicts), JSON.stringify(out.results.D2), JSON.stringify(out.results.D4), 'record', n);
process.exit(0);
