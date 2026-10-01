// npm run bridge:differential — for every defect found by a fresh participant (or by the
// instrument), run the SAME check against the old committed implementation and the current
// one, each in a clean git worktree, and keep both results:
//   circle/differential/results.json
// A defect is differential evidence only if the old run FAILS and the new run PASSES.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUB = process.env.SUBSTRATE_DIR ?? resolve(ROOT, '..', 'substrateIO');
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();

function worktree(repo, ref) {
  const dir = mkdtempSync(join(tmpdir(), 'diff-wt-'));
  rmSync(dir, { recursive: true });
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', '-q', dir, ref]);
  return { dir, done: () => execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', dir]) };
}

// Circle checks: start the OLD circle from its own worktree, run the CURRENT check code against it.
async function circleChecks(ref, names) {
  const wt = worktree(ROOT, ref);
  try {
    const { startCircle } = await import(pathToFileURL(join(wt.dir, 'scripts', 'circle-lib.js')));
    const { runConformance } = await import(pathToFileURL(join(ROOT, 'src', 'circle', 'conformance.js')));
    const c = await startCircle({ substrateDir: SUB, substratePort: 39000 + Math.floor(Math.random() * 500), purlDataDir: mkdtempSync(join(tmpdir(), 'diff-purl-')) });
    try {
      const r = await runConformance(c.circle, { session_id: `differential-${ref}`, assurance: 'asserted' }, { acspResource: null });
      return Object.fromEntries(names.map((n) => [n, r.checks[n] ?? { ok: null, detail: 'check absent' }]));
    } finally { await c.close(); }
  } finally { wt.done(); }
}

// substrateIO regression tests: run the CURRENT test file against the OLD implementation.
function substrateTest(ref, testFile, testName) {
  const wt = worktree(SUB, ref);
  try {
    execFileSync('cp', [join(SUB, testFile), join(wt.dir, testFile)]);
    try {
      const out = execFileSync('python3', ['-m', 'unittest', `${testFile.replace(/\//g, '.').replace(/\.py$/, '')}.${testName}`], { cwd: wt.dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, detail: 'OK' };
    } catch (e) {
      return { ok: false, detail: String(e.stderr ?? e.message).split('\n').filter((l) => /Error|assert|FAIL/.test(l)).slice(0, 3).join(' | ') };
    }
  } finally { wt.done(); }
}

const CASES = [
  { id: 'F-C1', found_by: 'EXP-CIRCLE-FRESH condition B', repo: 'purl', old: '09d13b6', check: 'fork_does_not_inherit_records', kind: 'circle' },
  { id: 'F-C1b', found_by: 'EXP-CIRCLE-FRESH condition B', repo: 'purl', old: '09d13b6', check: 'aliases_only_from_own_builds', kind: 'circle' },
  { id: 'F-C2', found_by: 'EXP-CIRCLE-FRESH condition B', repo: 'purl', old: '09d13b6', check: 'scrolls_publicly_readable', kind: 'circle' },
  { id: 'F-010', found_by: 'the instrument (reproduced before the fix)', repo: 'substrateIO', old: '7ace119', kind: 'substrate', file: 'tests/test_purl_terms.py', test: 'TestIdentityDecomposition.test_store_compare_uses_value_id_across_addresses' },
  { id: 'B-SDK', found_by: 'dogfood (STASIS-2): build_id did not exist', repo: 'purl', old: '1acfb0c', check: 'build_does_not_change_source', kind: 'circle' },
];

const results = [];
for (const c of CASES) {
  const newRef = git(c.repo === 'purl' ? ROOT : SUB, 'rev-parse', '--short', 'HEAD');
  let oldR, newR;
  if (c.kind === 'circle') {
    oldR = (await circleChecks(c.old, [c.check]))[c.check];
    newR = (await circleChecks('HEAD', [c.check]))[c.check];
  } else {
    oldR = substrateTest(c.old, c.file, c.test);
    newR = substrateTest('HEAD', c.file, c.test);
  }
  const verdict = oldR.ok === false && newR.ok === true ? 'DIFFERENTIAL (old fails, new passes)' : oldR.ok === true && newR.ok === true ? 'NOT DIFFERENTIAL (old passes too)' : 'INCONCLUSIVE';
  results.push({ ...c, new: newRef, old_result: oldR, new_result: newR, verdict });
  console.log(c.id, verdict);
}
mkdirSync(join(ROOT, 'circle', 'differential'), { recursive: true });
writeFileSync(join(ROOT, 'circle', 'differential', 'results.json'), JSON.stringify({ ran_at: new Date().toISOString(), results }, null, 1) + '\n');
