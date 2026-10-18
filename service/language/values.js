import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ sourceBytes: 65536, valueBytes: 1048576, workBytes: 16777216, arrayLength: 10000, depth: 32, nodes: 512, steps: 10000, repeat: 1000, graphNodes: 1000, graphEdges: 10000 });
export const TYPES = Object.freeze(['json', 'number', 'integer', 'string', 'boolean', 'null', 'array', 'object', 'graph', 'artifact']);
export const EFFECTS = Object.freeze(['local', 'external-read', 'mutation']);

export class LanguageError extends Error {
  constructor(stage, code, message, path = '$') { super(message); this.name = 'LanguageError'; Object.assign(this, { stage, code, path }); }
}
export const fail = (stage, code, message, path) => { throw new LanguageError(stage, code, message, path); };
export const diagnostic = error => ({ stage: error.stage || 'runtime', code: error.code || 'INVALID_VALUE', message: error.message, path: error.path || '$' });
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// A closed, finite JSON value universe avoids prototypes, getters, cycles and non-JSON hashes.
export function validateValue(value, { bytes = LIMITS.valueBytes, depth = LIMITS.depth, arrayLength = LIMITS.arrayLength } = {}) {
  const active = new Set();
  let size = 0;
  let visited = 0;
  function walk(v, level) {
    if (++visited > 100000) fail('runtime', 'VALUE_QUOTA', 'Value node limit exceeded');
    if (level > depth) fail('runtime', 'VALUE_QUOTA', 'Value nesting depth limit exceeded');
    if (v === null || typeof v === 'boolean') { size += 5; return; }
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v))) fail('runtime', 'UNSAFE_NUMBER', 'Numbers must be finite; integer values must be safe integers');
      size += 24; return;
    }
    if (typeof v === 'string') { size += Buffer.byteLength(v, 'utf8') + 2; }
    else if (Array.isArray(v) || isRecord(v)) {
      if (active.has(v)) fail('runtime', 'INVALID_VALUE', 'Cyclic values are not JSON');
      active.add(v);
      if (Array.isArray(v) && v.length > arrayLength) fail('runtime', 'VALUE_QUOTA', 'Array length quota exceeded');
      if (Object.getOwnPropertySymbols(v).length) fail('runtime', 'INVALID_VALUE', 'Symbol properties are not JSON');
      for (const key of Object.getOwnPropertyNames(v)) {
        if (Array.isArray(v) && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail('runtime', 'INVALID_VALUE', 'Only enumerable JSON data properties are supported; getters are forbidden');
      }
      const keys = Object.keys(v);
      if (Array.isArray(v) && keys.length !== v.length) fail('runtime', 'INVALID_VALUE', 'Sparse or decorated arrays are not supported');
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        if (!descriptor || !('value' in descriptor)) fail('runtime', 'INVALID_VALUE', 'Getters are not supported in JSON values');
        if (!Array.isArray(v)) size += Buffer.byteLength(key, 'utf8') + 3;
        walk(descriptor.value, level + 1);
      }
      active.delete(v);
    } else fail('runtime', 'INVALID_VALUE', 'Only finite plain JSON values are supported');
    if (size > bytes) fail('runtime', 'VALUE_QUOTA', 'Value byte quota exceeded');
  }
  walk(value, 0);
  if (size > bytes) fail('runtime', 'VALUE_QUOTA', 'Value byte quota exceeded');
  return value;
}

export function canonical(value) {
  validateValue(value);
  const encode = v => v === null || typeof v !== 'object' ? JSON.stringify(Object.is(v, -0) ? 0 : v)
    : Array.isArray(v) ? `[${v.map(encode).join(',')}]`
      : `{${Object.keys(v).sort().map(key => `${JSON.stringify(key)}:${encode(v[key])}`).join(',')}}`;
  return encode(value);
}

export const clone = value => JSON.parse(canonical(value));
export const digest = value => `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')}`;
export function identity(kind, value) {
  if (!['address', 'derivation', 'value', 'content', 'environment', 'build', 'execution', 'principal', 'session'].includes(kind)) fail('identity', 'IDENTITY_KIND', 'Unknown identity kind; semantic equivalence is not a hash identity');
  if (kind === 'address') {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      value = { policy: 'whatwg-http-url/1', locator: url.href };
    } catch { fail('identity', 'ADDRESS', 'Address identity requires an absolute HTTP(S) URL without credentials'); }
  }
  return `${kind}:${digest({ policy: 'purl-canonical-json/1', kind, value }).slice(7)}`;
}

export function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
export const compatible = (actual, expected) => expected === 'json' || actual === expected || (actual === 'integer' && expected === 'number') || (['graph', 'artifact'].includes(actual) && expected === 'object');
export function assertType(value, type) {
  validateValue(value);
  let ok = type === 'json' || valueType(value) === type || (type === 'integer' && Number.isSafeInteger(value));
  if (type === 'graph') {
    ok = isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges);
    if (ok) {
      if (value.nodes.length > LIMITS.graphNodes || value.edges.length > LIMITS.graphEdges) fail('runtime', 'GRAPH_QUOTA', 'Graph node or edge quota exceeded');
      const ids = value.nodes.map(canonical);
      const idSet = new Set(ids);
      ok = idSet.size === ids.length && value.edges.every(edge => Array.isArray(edge) && edge.length === 2 && edge.every(node => idSet.has(canonical(node))));
    }
  }
  if (type === 'artifact') ok = isRecord(value) && typeof value.media_type === 'string' && typeof value.content === 'string' && typeof value.content_id === 'string';
  if (!ok) fail('runtime', 'INPUT_TYPE', `Expected ${type} input, received ${valueType(value)}`);
  return value;
}

export function exactKeys(value, allowed, stage = 'parse', path = '$') {
  if (!isRecord(value)) fail(stage, 'SHAPE', 'Expected a plain object', path);
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) fail(stage, 'UNKNOWN_FIELD', `Unknown field: ${extra[0]}`, path);
}
