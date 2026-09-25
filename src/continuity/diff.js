// Structural diff and three-way merge over JSON values, addressed by
// JSON Pointer (RFC 6901). Arrays and empty objects are treated as leaves.
import { canonicalize } from '../core/canonical.js';
import { isObject } from './reducer.js';

export const escape = (k) => k.replace(/~/g, '~0').replace(/\//g, '~1');
export const unescape = (k) => k.replace(/~1/g, '/').replace(/~0/g, '~');
const eq = (a, b) => (a === undefined || b === undefined ? a === b : canonicalize(a) === canonicalize(b));

export function flatten(value, prefix = '', out = new Map()) {
  if (isObject(value) && Object.keys(value).length) {
    for (const [k, v] of Object.entries(value)) flatten(v, `${prefix}/${escape(k)}`, out);
  } else {
    out.set(prefix, value);
  }
  return out;
}

/** JSON-Patch-shaped list of differences from a to b. */
export function diff(a, b) {
  const fa = flatten(a);
  const fb = flatten(b);
  const ops = [];
  for (const [p, v] of fa) {
    if (!fb.has(p)) ops.push({ op: 'remove', path: p, old: v });
    else if (!eq(v, fb.get(p))) ops.push({ op: 'replace', path: p, old: v, value: fb.get(p) });
  }
  for (const [p, v] of fb) if (!fa.has(p)) ops.push({ op: 'add', path: p, value: v });
  return ops.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
}

/**
 * Three-way merge of plain objects. Returns { mergePatch, changes, conflicts }.
 * A path conflicts when ours and theirs both changed it relative to base, to different values.
 */
export function threeWayMerge(base, ours, theirs, resolutions = {}) {
  const fb = flatten(base);
  const fo = flatten(ours);
  const ft = flatten(theirs);
  const paths = [...new Set([...fb.keys(), ...fo.keys(), ...ft.keys()])].sort();
  const changes = [];
  const conflicts = [];
  for (const p of paths) {
    if (p === '') continue;
    const b = fb.get(p), o = fo.get(p), t = ft.get(p);
    if (eq(o, t) || eq(b, t)) continue;
    if (eq(b, o)) changes.push({ path: p, value: t });
    else if (p in resolutions) changes.push({ path: p, value: resolutions[p], resolved: true });
    else conflicts.push({ path: p, base: b ?? null, ours: o ?? null, theirs: t ?? null });
  }
  const mergePatch = {};
  for (const c of changes) {
    const parts = c.path.split('/').slice(1).map(unescape);
    let node = mergePatch;
    parts.slice(0, -1).forEach((k) => { node = isObject(node[k]) ? node[k] : (node[k] = {}); });
    node[parts.at(-1)] = c.value === undefined ? null : c.value;
  }
  return { mergePatch, changes, conflicts };
}
