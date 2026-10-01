// Program-transformer admissibility (EXP-PROGRAM-CLOSURE-1). One implementation, used by the
// circle route /programs/closure?mode=… and by scripts/program-closure.js.
// Arms differ only in what they know about the environment:
//   untyped       – nothing
//   typed         – the catalog's kinds (applies_to)
//   constitution  – everything the catalog declares (kinds, param minimum, choices)
//   code          – the above plus limits read from substrateIO source (not declared by the catalog)
export const DESCRIPTOR = {
  module: 'src/circle/closure.js',
  claims: ['pure: admissibility is a function of (mode, candidate, context); it never contacts a service', 'the constitution arm uses only what GET /operations declares'],
  requires: { modules: [], services: [], files: [] },
  produces: ['DESCRIPTOR', 'MODES', 'INT_VALUES', 'candidateAlphabet', 'admissible', 'nBitsOf'],
  changes: [],
};

export const MODES = ['untyped', 'typed', 'constitution', 'code'];
export const INT_VALUES = [0, 1, 7, 8, 9, 4097, 1048577];
const ROOT_KINDS = new Set(['root']);

/** Every catalog operation that does not construct a root, instantiated over INT_VALUES and its choices (+1 undeclared). */
export function candidateAlphabet(catalog) {
  const out = [];
  for (const op of catalog.operations) {
    if (ROOT_KINDS.has(op.applies_to)) continue;
    let combos = [[]];
    for (const p of op.params) {
      const vals = p.type === 'choice' ? [...(p.choices ?? []), 'undeclared'] : INT_VALUES;
      combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
    }
    for (const params of combos) {
      const text = [op.segment, ...params].join('/');
      out.push({ op: op.id, segment: op.segment, applies_to: op.applies_to, params, verb: 'WRITE', move: `WRITE/${text}`, text });
      if (op.id === 'substrate.state.flip') out.push({ op: op.id, segment: op.segment, applies_to: op.applies_to, params, verb: 'PERTURB', move: `PERTURB/${params[0]}`, text });
    }
  }
  return out;
}

/** n (bits) of the state space a value address is bound to, from its root constructor. */
export function nBitsOf(address) {
  const m = /^\/(?:map\/eca\/\d+\/(\d+)|map\/(?:increment|random|permutation)\/(\d+)|space\/(\d+))/.exec(address ?? '');
  return m ? Number(m[1] ?? m[2] ?? m[3]) : null;
}

/**
 * @param mode one of MODES
 * @param cand an element of candidateAlphabet
 * @param ctx {kind, n, catalog, limits}: kind of the prefix (from typing), n bits, the catalog, and (code arm) LIMITS
 */
export function admissible(mode, cand, ctx) {
  if (mode === 'untyped') return true;
  if (cand.applies_to !== ctx.kind) return false;
  if (mode === 'typed') return true;
  const op = ctx.catalog.operations.find((o) => o.id === cand.op);
  for (const [i, p] of op.params.entries()) {
    const v = cand.params[i];
    if (p.type === 'choice' && !(p.choices ?? []).includes(v)) return false;
    if (p.type === 'int' && p.minimum != null && v < p.minimum) return false;
  }
  if (mode === 'constitution') return true;
  // code arm: limits that substrateIO enforces but the catalog does not declare
  const L = ctx.limits ?? {};
  const [a] = cand.params;
  if (cand.segment === 'flip' && ctx.n != null && a >= ctx.n) return false;
  if ((cand.segment === 'trace' || cand.segment === 'damage') && L.trace_steps != null && a > L.trace_steps) return false;
  if (cand.segment === 'power' && L.power != null && a > L.power) return false;
  if (cand.segment === 'table' && L.table_states != null && ctx.n != null && 2 ** ctx.n > L.table_states) return false;
  if (ctx.n != null && L.max_bits != null && ctx.n > L.max_bits) return false;
  return true;
}
