// State-transition graphs estimated from a symbol sequence. At order m a node
// is a block of m consecutive symbols (a sub-graph of the de Bruijn graph) and
// an edge joins overlapping blocks. With edge probabilities this is the
// empirical transition graph of an order-m Markov model.
//
// Graph-theoretic vocabulary used, with the established Markov-chain meaning:
//   strongly connected component (SCC); closed (bottom) class — an SCC with no
//   edge leaving it, the finite-chain notion that "attractor-like" points at;
//   transient node — not in a closed class; period — gcd of cycle lengths.

export function transitionGraph(symbols, { order = 1, labels = null, maxCycleLength = 6, maxCycles = 50 } = {}) {
  const label = (s) => (labels ? labels[s] ?? String(s) : String(s));
  const single = !labels || labels.every((l) => String(l).length === 1);
  const key = (i) => symbols.slice(i, i + order).map(label).join(single ? '' : '·');
  const nodes = new Map();
  const edges = new Map();
  const nStates = symbols.length - order + 1;
  for (let i = 0; i < nStates; i++) {
    const k = key(i);
    const node = nodes.get(k) ?? { id: k, count: 0, out: 0, in: 0 };
    node.count++;
    nodes.set(k, node);
    if (i + 1 < nStates) {
      const to = key(i + 1);
      const ek = `${k}\u0000${to}`;
      edges.set(ek, { from: k, to, count: (edges.get(ek)?.count ?? 0) + 1 });
    }
  }
  const out = new Map();
  for (const e of edges.values()) {
    nodes.get(e.from).out += e.count;
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)).push(e);
  }
  for (const e of edges.values()) {
    nodes.get(e.to).in += e.count;
    e.p = e.count / nodes.get(e.from).out;
  }
  const ids = [...nodes.keys()].sort();
  const adj = new Map(ids.map((id) => [id, (out.get(id) ?? []).map((e) => e.to).sort()]));

  const sccs = tarjan(ids, adj);
  const compOf = new Map();
  sccs.forEach((c, i) => c.forEach((id) => compOf.set(id, i)));
  const closed = sccs.filter((c) => c.every((id) => adj.get(id).every((to) => compOf.get(to) === compOf.get(id))));
  const closedSet = new Set(closed.flat());
  const lastState = nStates > 0 ? key(nStates - 1) : null;

  return {
    order,
    n_states_observed: nStates,
    nodes: ids.map((id) => {
      const n = nodes.get(id);
      return { id, count: n.count, out_weight: n.out, in_weight: n.in, out_degree: adj.get(id).length, in_degree: [...edges.values()].filter((e) => e.to === id).length };
    }),
    edges: [...edges.values()].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1)),
    analysis: {
      possible_nodes: labels ? labels.length ** order : null,
      scc: sccs.map((c) => [...c].sort()),
      closed_classes: closed.map((c) => {
        const members = [...c].sort();
        return {
          members,
          period: period(members, adj),
          stationary: stationary(members, edges),
          // A closed class made only of the final observed state is an artefact of where observation stopped.
          boundary_artifact: members.length === 1 && members[0] === lastState && nodes.get(lastState).out === 0,
        };
      }),
      transient: ids.filter((id) => !closedSet.has(id)),
      branching: ids.filter((id) => adj.get(id).length > 1).length,
      merging: ids.filter((id) => [...edges.values()].filter((e) => e.to === id).length > 1).length,
      mean_out_degree: ids.length ? ids.reduce((a, id) => a + adj.get(id).length, 0) / ids.length : 0,
      cycles: simpleCycles(ids, adj, maxCycleLength, maxCycles),
    },
  };
}

function tarjan(ids, adj) {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  const visit = (v) => {
    idx.set(v, index); low.set(v, index); index++;
    stack.push(v); onStack.add(v);
    for (const w of adj.get(v)) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      out.push(comp);
    }
  };
  for (const v of ids) if (!idx.has(v)) visit(v);
  return out;
}

/** Period of a strongly connected class: gcd of (level(u) + 1 − level(v)) over its edges. */
function period(members, adj) {
  const set = new Set(members);
  const level = new Map([[members[0], 0]]);
  const queue = [members[0]];
  while (queue.length) {
    const u = queue.shift();
    for (const v of adj.get(u)) if (set.has(v) && !level.has(v)) { level.set(v, level.get(u) + 1); queue.push(v); }
  }
  let g = 0;
  for (const u of members) for (const v of adj.get(u)) if (set.has(v)) g = gcd(g, Math.abs(level.get(u) + 1 - level.get(v)));
  return g || null; // null: a single node without a self-loop has no cycle
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Stationary distribution of the empirical chain restricted to a closed class (lazy power iteration). */
function stationary(members, edges) {
  const i = new Map(members.map((m, k) => [m, k]));
  const n = members.length;
  const P = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of edges.values()) if (i.has(e.from) && i.has(e.to)) P[i.get(e.from)][i.get(e.to)] = e.p;
  let pi = new Array(n).fill(1 / n);
  for (let it = 0; it < 2000; it++) {
    const next = new Array(n).fill(0);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) next[b] += pi[a] * (0.5 * P[a][b] + (a === b ? 0.5 : 0));
    const delta = next.reduce((s, v, k) => s + Math.abs(v - pi[k]), 0);
    pi = next;
    if (delta < 1e-12) break;
  }
  return Object.fromEntries(members.map((m, k) => [m, pi[k]]));
}

/** Elementary circuits up to a length bound (bounded DFS from each start, smallest-id rooted). */
function simpleCycles(ids, adj, maxLen, maxCount) {
  const cycles = [];
  const order = new Map(ids.map((id, k) => [id, k]));
  for (const start of ids) {
    const path = [start];
    const onPath = new Set([start]);
    const dfs = (v) => {
      if (cycles.length >= maxCount) return;
      for (const w of adj.get(v)) {
        if (order.get(w) < order.get(start)) continue;
        if (w === start) cycles.push([...path]);
        else if (!onPath.has(w) && path.length < maxLen) {
          path.push(w); onPath.add(w);
          dfs(w);
          path.pop(); onPath.delete(w);
        }
      }
    };
    dfs(start);
  }
  return cycles.sort((a, b) => a.length - b.length || (a.join() < b.join() ? -1 : 1)).slice(0, maxCount);
}
