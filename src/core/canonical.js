// Canonical JSON and content hashing.
//
// Keys are sorted by UTF-16 code unit order and numbers use ECMAScript
// serialisation, which matches RFC 8785 (JCS) for the value space PURL uses
// (objects, arrays, strings, finite numbers, booleans, null).
import { createHash } from 'node:crypto';

export function canonicalize(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonical JSON forbids non-finite numbers');
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
      const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
    }
    default:
      throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
  }
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Content hash of any JSON value, prefixed with the algorithm name. */
export function hashOf(value) {
  return 'sha256:' + sha256(canonicalize(value));
}

/** Structured clone for plain JSON values. */
export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Round every float to `digits` significant digits (for cross-platform output hashes). */
export function roundDeep(value, digits = 10) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isInteger(value)) return value;
    return Number(value.toPrecision(digits));
  }
  if (Array.isArray(value)) return value.map((v) => roundDeep(v, digits));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = roundDeep(v, digits);
    return out;
  }
  return value;
}
