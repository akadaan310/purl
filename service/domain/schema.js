// Product schemas deliberately support a bounded, stateless JSON Schema subset.
// The historical protocol validator in src/core remains unchanged.
import { canonicalize } from '../../src/core/canonical.js';

const TYPES = new Set(['null', 'boolean', 'string', 'number', 'integer', 'array', 'object']);
const KEYWORDS = new Set(['$schema', '$id', '$defs', '$comment', 'title', 'description', 'examples', 'default', 'type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'anyOf', 'oneOf', 'format', 'propertyNames', 'minProperties', 'maxProperties', 'x-purl-category']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (message, code = 'invalid_schema') => { throw Object.assign(new Error(message), { code }); };

function normalize(value, { nodes, bytes, depth }) {
  let count = 0, size = 0;
  function visit(value, level) {
    if (++count > nodes || level > depth) throw new Error('JSON complexity exceeds the supported bound');
    if (value === null || ['boolean', 'string', 'number'].includes(typeof value)) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON values must be finite');
      size += Buffer.byteLength(JSON.stringify(value));
      if (size > bytes) throw new Error('JSON size exceeds the supported bound');
      return value;
    }
    if (typeof value !== 'object') throw new Error('Only JSON values are supported');
    size += 2;
    if (Array.isArray(value)) return value.map(item => visit(item, level + 1));
    const out = Object.create(null);
    for (const key of Object.keys(value)) {
      size += Buffer.byteLength(JSON.stringify(key)) + 2;
      if (size > bytes) throw new Error('JSON size exceeds the supported bound');
      out[key] = visit(value[key], level + 1);
    }
    return out;
  }
  return visit(value, 0);
}

export function normalizeSchema(value = {}) {
  let schema;
  try { schema = normalize(value, { nodes: 10000, bytes: 64 * 1024, depth: 24 }); }
  catch (error) { invalid(error.message); }
  let count = 0;
  function visit(s, depth) {
    if (++count > 600 || depth > 20) invalid('Schema complexity exceeds the supported bound');
    if (typeof s === 'boolean') return;
    if (!record(s)) invalid('Every schema must be an object or boolean');
    for (const [key, value] of Object.entries(s)) {
      if (key === '$ref' || key === 'pattern') invalid('$ref and pattern are not supported in product schemas', 'unsupported_schema');
      if (!KEYWORDS.has(key)) invalid(`Unsupported schema keyword "${key}"`);
      if (['$schema', '$id', '$comment', 'title', 'description', 'x-purl-category'].includes(key) && typeof value !== 'string') invalid(`${key} must be a string`);
      if (key === 'type') {
        const types = Array.isArray(value) ? value : [value];
        if (!types.length || types.some(type => !TYPES.has(type)) || new Set(types).size !== types.length) invalid('type must contain unique supported JSON types');
      }
      if (key === 'required' && (!Array.isArray(value) || value.some(name => typeof name !== 'string') || new Set(value).size !== value.length)) invalid('required must contain unique property names');
      if (['minItems', 'maxItems', 'minLength', 'maxLength', 'minProperties', 'maxProperties'].includes(key) && (!Number.isSafeInteger(value) || value < 0 || value > 1000000)) invalid(`${key} must be a bounded nonnegative integer`);
      if (['minimum', 'maximum'].includes(key) && (typeof value !== 'number' || !Number.isFinite(value))) invalid(`${key} must be a finite number`);
      if (key === 'uniqueItems' && typeof value !== 'boolean') invalid('uniqueItems must be a boolean');
      if (key === 'format' && value !== 'date-time') invalid('Only the date-time format is supported');
      if (key === 'examples' && !Array.isArray(value)) invalid('examples must be an array');
      if (key === 'enum' && (!Array.isArray(value) || !value.length || new Set(value.map(canonicalize)).size !== value.length)) invalid('enum must contain unique JSON values');
      if (key === 'properties' || key === '$defs') {
        if (!record(value)) invalid(`${key} must be an object`);
        for (const child of Object.values(value)) visit(child, depth + 1);
      }
      if (['items', 'additionalProperties', 'propertyNames'].includes(key)) visit(value, depth + 1);
      if (key === 'anyOf' || key === 'oneOf') {
        if (!Array.isArray(value) || !value.length) invalid(`${key} must be a nonempty array of schemas`);
        for (const child of value) visit(child, depth + 1);
      }
    }
  }
  visit(schema, 0);
  return schema;
}

export function schemaErrors(schema, value) {
  // Own properties and null prototypes keep JSON names such as constructor and
  // __proto__ ordinary data throughout both registration and validation.
  schema = normalizeSchema(schema);
  value = normalize(value, { nodes: 100000, bytes: 1024 * 1024, depth: 64 });
  let work = 0;
  const encodedObjects = new WeakMap();
  const encodedPrimitives = new Map();
  const encoded = value => {
    const cache = value !== null && typeof value === 'object' ? encodedObjects : encodedPrimitives;
    if (!cache.has(value)) cache.set(value, canonicalize(value));
    return cache.get(value);
  };
  const tick = () => { if (++work > 50000) throw new Error('Schema validation work exceeds the supported bound'); };
  function check(s, value, path, errors) {
    tick();
    const add = message => { if (errors.length < 100) errors.push({ path: path || '/', message }); };
    if (s === true) return;
    if (s === false) { add('no value allowed here'); return; }
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      const matches = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? record(value) : type === 'integer' ? Number.isInteger(value) : typeof value === type;
      if (!types.some(matches)) { add(`expected ${types.join('|')}`); return; }
    }
    if (Object.hasOwn(s, 'const') && encoded(s.const) !== encoded(value)) add('must equal the declared constant');
    if (s.enum && !s.enum.some(item => encoded(item) === encoded(value))) add('must equal one of the declared enum values');
    if (typeof value === 'string') {
      const length = [...value].length;
      if (s.minLength !== undefined && length < s.minLength) add(`shorter than ${s.minLength}`);
      if (s.maxLength !== undefined && length > s.maxLength) add(`longer than ${s.maxLength}`);
      if (s.format === 'date-time' && (value.length > 64 || !/^\d{4}-\d\d-\d\d[Tt]\d\d:\d\d:\d\d(?:\.\d+)?(?:[Zz]|[+-]\d\d:\d\d)$/.test(value) || Number.isNaN(Date.parse(value)))) add('not a date-time');
    }
    if (typeof value === 'number') {
      if (s.minimum !== undefined && value < s.minimum) add(`less than ${s.minimum}`);
      if (s.maximum !== undefined && value > s.maximum) add(`greater than ${s.maximum}`);
    }
    if (Array.isArray(value)) {
      if (s.minItems !== undefined && value.length < s.minItems) add(`fewer than ${s.minItems} items`);
      if (s.maxItems !== undefined && value.length > s.maxItems) add(`more than ${s.maxItems} items`);
      if (s.uniqueItems && new Set(value.map(item => { tick(); return encoded(item); })).size !== value.length) add('items not unique');
      if (s.items !== undefined) for (let i = 0; i < value.length; i++) check(s.items, value[i], `${path}/${i}`, errors);
    }
    if (record(value)) {
      const keys = Object.keys(value);
      if (s.minProperties !== undefined && keys.length < s.minProperties) add(`fewer than ${s.minProperties} properties`);
      if (s.maxProperties !== undefined && keys.length > s.maxProperties) add(`more than ${s.maxProperties} properties`);
      for (const key of s.required ?? []) { tick(); if (!Object.hasOwn(value, key)) add(`missing required property "${key}"`); }
      for (const key of keys) {
        tick();
        const at = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        if (s.propertyNames !== undefined) check(s.propertyNames, key, at, errors);
        if (s.properties && Object.hasOwn(s.properties, key)) check(s.properties[key], value[key], at, errors);
        else if (s.additionalProperties !== undefined) check(s.additionalProperties, value[key], at, errors);
      }
    }
    for (const keyword of ['anyOf', 'oneOf']) {
      if (!s[keyword]) continue;
      let matches = 0;
      for (const candidate of s[keyword]) {
        const candidateErrors = [];
        check(candidate, value, path, candidateErrors);
        if (!candidateErrors.length) matches++;
        if (keyword === 'anyOf' && matches || keyword === 'oneOf' && matches > 1) break;
      }
      if (keyword === 'anyOf' ? matches === 0 : matches !== 1) add(`matches ${matches} of ${keyword}`);
    }
  }
  const errors = [];
  check(schema, value, '', errors);
  return errors;
}
