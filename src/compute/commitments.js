// Commitment analysis (transformations, not substrate properties).
//
// PURL itself stores exactly one kind of commitment per version: the state
// hash, sha256(canonical JSON of the whole resource record). The functions
// below compute other candidate identifiers from observed records so that
// they can be compared with it:
//
//   valueHash          hash of the value only
//   merkleByValue      controlled baseline: leaves by value, applications by
//                      (operation, child hashes) — a Merkle DAG over values
//   merkleByIdentity   controlled baseline: leaves by pin (resource, version,
//                      state hash), applications by (operation, child hashes)
//
// None of these is computed or stored by a PURL server.
import { hashOf } from '../core/canonical.js';

export const valueHash = (value) => hashOf(value);

/**
 * @param getRecord (resource, version) → record   synchronous lookup over observed records
 * @param root      { resource, version }
 */
export function merkleByValue(getRecord, root, memo = new Map()) {
  const k = `${root.resource}@${root.version}`;
  if (memo.has(k)) return memo.get(k);
  const s = getRecord(root.resource, root.version).state;
  const h = s.node === 'literal' ? hashOf(['lit', s.value]) : hashOf(['app', s.operation, s.operands.map((p) => merkleByValue(getRecord, p, memo))]);
  memo.set(k, h);
  return h;
}

export function merkleByIdentity(getRecord, root, stateHashOf, memo = new Map()) {
  const k = `${root.resource}@${root.version}`;
  if (memo.has(k)) return memo.get(k);
  const rec = getRecord(root.resource, root.version);
  const s = rec.state;
  const h = s.node === 'literal' ? hashOf(['pin', root.resource, root.version, stateHashOf(rec)]) : hashOf(['app', s.operation, s.operands.map((p) => merkleByIdentity(getRecord, p, stateHashOf, memo))]);
  memo.set(k, h);
  return h;
}

/** JSON Pointer paths at which two JSON values differ (leaf granularity). */
export function differingPaths(a, b, path = '') {
  if (a === b) return [];
  const obj = (v) => v !== null && typeof v === 'object';
  if (!obj(a) || !obj(b) || Array.isArray(a) !== Array.isArray(b)) return [path || '/'];
  const out = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) out.push(...differingPaths(a[k], b[k], `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  return out;
}

/**
 * Split a record's fields into those determined by (operation, operand pins,
 * value, evaluator) and everything else the state hash also covers. The
 * second list is the "metadata" any function F(H(A), H(B), …) reproducing the
 * state hash would additionally need.
 */
export function stateHashInputs(record) {
  const determined = ['/state/compute', '/state/node', '/state/operation', '/state/operands', '/state/value', '/state/evaluator'];
  const all = [];
  const walk = (v, p) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && p !== '/state/operands') {
      const ks = Object.keys(v);
      if (!ks.length) all.push(p);
      for (const k of ks) walk(v[k], `${p}/${k}`);
    } else all.push(p || '/');
  };
  walk(record, '');
  return { determined: all.filter((p) => determined.some((d) => p === d || p.startsWith(d + '/'))), other: all.filter((p) => !determined.some((d) => p === d || p.startsWith(d + '/'))) };
}
