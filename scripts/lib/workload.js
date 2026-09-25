// A seeded, simulated multi-agent workload against the Layer 1 store. Produces
// a real PURL event log whose ground truth (which invocation produced which
// events) is known — the bridge dataset for Layer 2.
import { Store } from '../../src/continuity/store.js';
import { sequentialIds } from '../../src/core/ids.js';
import { rng } from '../../src/research/rng.js';

const WEIGHTS = { append: 30, update: 18, annotate: 10, acknowledge: 10, checkpoint: 6, handoff: 8, supersede: 7, assign: 4, grant: 4, revoke: 3 };

export function purlWorkload({ invocations = 400, seed = 1, mean_interval_s = 30 }) {
  const r = rng(seed);
  let t = Date.UTC(2026, 0, 1);
  const store = new Store({ newId: sequentialIds(), now: () => new Date(t).toISOString(), token: () => 'workload' });
  const P = ['A', 'B', 'C', 'D'].map((label) => store.registerPrincipal({ label }).principal);
  const owner = P[0];
  const id = store.create(owner, { type: 'research-session' }).resource.id;
  const call = (who, op, input) => {
    try {
      store.invoke(who, id, op, { expected_version: store.get(id).version, input });
      return true;
    } catch {
      return false;
    }
  };
  call(owner, 'grant', { grantee: P[1].id, rights: ['observe', 'read', 'append', 'update', 'assign', 'link', 'grant'] });
  call(owner, 'grant', { grantee: P[2].id, rights: 'operator' });
  call(owner, 'grant', { grantee: P[3].id, rights: 'contributor' });

  const ops = Object.keys(WEIGHTS);
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const probs = ops.map((o) => WEIGHTS[o] / total);
  const tally = { attempted: 0, accepted: 0, rejected: {} };
  for (let i = 0; i < invocations; i++) {
    t += Math.round(r.exponential(1 / mean_interval_s) * 1000);
    const s = store.get(id);
    const assignee = P.find((p) => p.id === s.assignee);
    const actor = assignee && r.next() < 0.6 ? assignee : P[r.int(P.length)];
    const op = ops[r.choice(probs)];
    const other = P.filter((p) => p.id !== actor.id)[r.int(P.length - 1)];
    const findings = s.collections.findings ?? [];
    const pkg = { task: `task ${i}`, objective: 'continue' };
    const input = {
      append: { collection: r.next() < 0.7 ? 'findings' : 'notes', body: { i } },
      update: { merge_patch: { [`k${r.int(5)}`]: i } },
      annotate: { about: findings.length ? findings[r.int(findings.length)].id : '/', body: { i } },
      acknowledge: {},
      checkpoint: { package: pkg },
      handoff: { to: other.id, package: pkg, ...(r.next() < 0.5 ? { grant: { rights: 'contributor' } } : {}) },
      supersede: findings.length ? { collection: 'findings', supersedes: findings[r.int(findings.length)].id, body: { i } } : null,
      assign: { assignee: other.id },
      grant: { grantee: other.id, rights: r.next() < 0.5 ? 'reader' : 'contributor' },
      revoke: (() => {
        const g = Object.values(s.grants).filter((g) => !g.revoked && g.parent !== null);
        return g.length ? { grant: g[r.int(g.length)].id } : null;
      })(),
    }[op];
    tally.attempted++;
    if (input && call(actor, op, input)) tally.accepted++;
    else tally.rejected[op] = (tally.rejected[op] ?? 0) + 1;
  }
  return { events: store.events(id), tally, verify: store.verify(id) };
}
