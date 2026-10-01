// Development as an observable transition (STASIS-3 phase 8). A dev iteration is a record of one
// git commit as an addressed transition, together with the evidence a participant attaches (test
// results, with a content hash of the log) and the evidence currency the circle can compute itself:
// whether any recorded conformance run covers the implementation at that commit.
// The circle never changes code: there is no route that writes a file or makes a commit. Recording
// an iteration records that a commit happened; it is not the commit.
import { execFileSync } from 'node:child_process';
import { sha256 } from './adapters.js';

export const DESCRIPTOR = {
  module: 'src/circle/dev.js',
  claims: ['a dev iteration refers to an existing commit of a configured repository (refused otherwise)', 'test results are recorded as reported by the declaring session (asserted), never as observed by the circle',
    'evidence currency is computed: implementation_id at the commit vs the implementation_id of recorded conformance runs', 'no route writes code or makes a commit'],
  requires: { modules: ['./adapters.js'], services: ['PURL (records)', 'git (read-only)'], files: [] },
  produces: ['DESCRIPTOR', 'SELF_CONCEPTS', 'implementationIdAt', 'createDev'],
  changes: ['PURL dev-iteration records (POST /dev/iterations)'],
};

/** implementation_id of src/circle at a commit: same construction as the running implementation_id. */
export function implementationIdAt(dir, commit) {
  const names = execFileSync('git', ['-C', dir, 'ls-tree', '--name-only', `${commit}:src/circle`], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js')).sort();
  const files = Object.fromEntries(names.map((f) => [`src/circle/${f}`, sha256(execFileSync('git', ['-C', dir, 'show', `${commit}:src/circle/${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 }))]));
  return { implementation_id: sha256(files), files };
}

/** Six self-* concepts, kept separate: each names what it needs, where it is, and its limit. */
export const SELF_CONCEPTS = {
  'self-description': { definition: 'the environment returns a description of its own interface sufficient to act in it', where: ['/sdk', '/code', '/sdk/constitution'], tested_by: ['sdk_describes_itself', 'test/sdk-v03.test.js (descriptors match source)'], status: 'TESTED', limit: 'describes what it claims; claims about effects are checked only where a check exists' },
  'self-observation': { definition: 'the environment records observations of its own operation as records others can read', where: ['/observatory', '/tests', '/dev/iterations'], tested_by: ['observatory_states_running_code'], status: 'TESTED', limit: 'observes records and running commit, not its own process internals' },
  'self-transformation': { definition: 'the environment produces new programs from its programs by named, versioned transformers', where: ['/programs/transform', '/programs/closure'], tested_by: ['build_does_not_change_source', 'EXP-PROGRAM-MODEL-1 M4'], status: 'TESTED (programs only)', limit: 'it cannot transform its own implementation: no route writes code' },
  'self-testing': { definition: 'the environment runs checks against itself and records every result, failures included', where: ['POST /conformance/runs', '/tests'], tested_by: ['conformance runs are themselves records (axes record-2: stale evidence detected)'], status: 'TESTED', limit: 'the unit test suite (npm test) runs outside the circle; its results enter as reported evidence on a dev iteration' },
  'self-reconstruction': { definition: 'the environment\'s state can be rebuilt from its own records', where: ['/resume/{id}', '/stases', 'scripts/bridge-cold-reconstruct.js'], tested_by: ['STASIS-2 checkpoint is recoverable', 'cold reports'], status: 'TESTED (checkpoint) / external script (cold)', limit: 'cold reconstruction is run by a script outside the circle, not through a route' },
  'self-harnessing': { definition: 'the environment\'s own development is recorded through its own interface as transitions with evidence', where: ['POST /dev/iterations', '/dev/iterations'], tested_by: ['EXP-DOGFOOD-3 (circle/experiments/dogfood-3)'], status: 'IMPLEMENTED this phase', limit: 'records development; does not perform it. The commit stays a human/agent act through git' },
};

export function createDev(x) {
  const { envelope, move, CircleError, cfg, purlCreate, purlRead, purlList, requireSession, gitCommit, transitionOf } = x;

  async function runsByImplementation() {
    const out = new Map();
    for (const r of await purlList('conformance-run')) {
      const d = (await purlRead(r.id)).state;
      if (d.implementation_id) out.set(d.implementation_id, [...(out.get(d.implementation_id) ?? []), { run: r.id, ran_at: d.ran_at, summary: d.summary }]);
    }
    return out;
  }

  async function record(q, body) {
    const author = requireSession(q);
    const b = body ?? {};
    const repo = b.repo ?? 'purl';
    if (typeof b.commit !== 'string') throw new CircleError(422, 'missing_commit', 'body.commit: the commit this iteration records (hex id)');
    const c = gitCommit(repo, b.commit); // 404 if the commit does not exist
    const evidence = Array.isArray(b.evidence) ? b.evidence.slice(0, 20).map((e) => ({ kind: String(e.kind ?? 'test-suite').slice(0, 64), command: String(e.command ?? '').slice(0, 300), summary: e.summary ?? null,
      log_content_id: typeof e.log_content_id === 'string' ? e.log_content_id.slice(0, 80) : null, assurance: 'reported by the declaring session (asserted); not observed by the circle' })) : [];
    let impl = null;
    if (repo === 'purl' && cfg.gitRepos?.purl) { try { impl = implementationIdAt(cfg.gitRepos.purl, c.commit).implementation_id; } catch { impl = null; } }
    const runs = impl ? (await runsByImplementation()).get(impl) ?? [] : [];
    const state = { repo, commit: c.commit, tree: c.tree, parents: c.parents, subject: c.subject, diffstat: c.diffstat, generation: c.generation, committed_at: c.committed_at,
      transition: transitionOf(repo, c), intent: typeof b.intent === 'string' ? b.intent.slice(0, 2000) : null, evidence, by: author,
      implementation_id: impl, conformance_evidence: { runs, currency: impl ? (runs.length ? 'current' : 'none') : 'not computed (not the circle implementation)' } };
    const r = await purlCreate('dev-iteration', state);
    return envelope('dev-iteration-recorded', { id: r.id, iteration: state, note: 'Recorded that a commit happened, with its evidence. The circle did not make the commit and cannot.' },
      [move('iteration', 'GET', `/dev/iterations/${r.id}`, 'read'), move('commit', 'GET', `/git/${repo}/${c.commit}`, 'read')]);
  }

  async function dispatch(method, path, q, body) {
    if (method === 'GET' && path === '/self') return envelope('self', { concepts: SELF_CONCEPTS, rule: 'six separate concepts; none implies another' }, [move('iterations', 'GET', '/dev/iterations', 'read'), move('sdk', 'GET', '/sdk', 'read')]);
    if (method === 'GET' && path === '/dev/iterations') {
      const items = [];
      for (const it of await purlList('dev-iteration')) { const d = (await purlRead(it.id)).state; items.push({ id: it.id, repo: d.repo, commit: d.commit.slice(0, 7), subject: d.subject, evidence: d.evidence.length, currency: d.conformance_evidence.currency, href: `/dev/iterations/${it.id}` }); }
      return envelope('dev-iterations', { count: items.length, iterations: items }, items.map((i) => move(i.commit, 'GET', i.href, 'read')));
    }
    let m;
    if (method === 'GET' && (m = /^\/dev\/iterations\/(r_[0-9A-Z]+)$/.exec(path))) { const d = await purlRead(m[1]); return envelope('dev-iteration', { id: d.id, version: d.version, iteration: d.state }, [move('all', 'GET', '/dev/iterations', 'read')]); }
    if (method === 'POST' && path === '/dev/iterations') return record(q, body);
    return null;
  }
  return { dispatch };
}
