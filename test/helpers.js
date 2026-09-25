import { Store } from '../src/continuity/store.js';
import { sequentialIds } from '../src/core/ids.js';

/** Deterministic store: sequential ids, a clock that advances one second per call. */
export function makeStore(opts = {}) {
  let t = Date.UTC(2026, 0, 1);
  let tok = 0;
  const clock = { advance: (ms) => (t += ms) };
  const store = new Store({
    newId: sequentialIds(),
    now: () => new Date((t += 1000)).toISOString(),
    token: () => `test-token-${++tok}`,
    ...opts,
  });
  const principals = {};
  for (const name of ['A', 'B', 'C', 'D']) principals[name] = store.registerPrincipal({ kind: 'agent', label: name }).principal;
  const invoke = (who, id, op, input = {}) => store.invoke(who, id, op, { expected_version: store.get(id).version, input });
  return { store, clock, invoke, ...principals };
}

export const pkg = (extra = {}) => ({ task: 'Investigate X', objective: 'Establish whether X holds', ...extra });
