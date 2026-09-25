// A small JSON Schema (2020-12) validator covering the keywords PURL's
// schemas use. Unsupported keywords are reported as errors at registration
// time rather than silently ignored, so the schemas in schemas/ stay honest.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED = new Set([
  '$schema', '$id', '$ref', '$defs', '$comment', 'title', 'description', 'examples', 'default',
  'type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum',
  'maximum', 'anyOf', 'oneOf', 'format', 'propertyNames', 'minProperties', 'maxProperties',
  'x-purl-category',
]);

export class SchemaRegistry {
  constructor() {
    this.schemas = new Map();
  }

  add(schema) {
    checkKeywords(schema, schema.$id ?? '(anonymous)');
    if (schema.$id) this.schemas.set(schema.$id, schema);
    return schema;
  }

  get(id) {
    return this.schemas.get(id);
  }

  /** Returns [] when valid, otherwise a list of {path, message}. */
  validate(schemaOrId, value) {
    const root = typeof schemaOrId === 'string' ? this.schemas.get(schemaOrId) : schemaOrId;
    if (!root) throw new Error(`unknown schema ${schemaOrId}`);
    const errors = [];
    this.#check(root, root, value, '', errors);
    return errors;
  }

  #resolve(ref, root) {
    const [base, frag] = ref.split('#');
    const doc = base ? this.schemas.get(base) : root;
    if (!doc) throw new Error(`unresolvable $ref ${ref}`);
    if (!frag) return { schema: doc, root: doc };
    let node = doc;
    for (const part of frag.split('/').filter(Boolean)) node = node[part];
    if (!node) throw new Error(`unresolvable $ref ${ref}`);
    return { schema: node, root: doc };
  }

  #check(schema, root, value, path, errors) {
    if (schema === true) return;
    if (schema === false) return void errors.push({ path, message: 'no value allowed here' });
    if (schema.$ref) {
      const r = this.#resolve(schema.$ref, root);
      this.#check(r.schema, r.root, value, path, errors);
    }
    const at = path || '/';
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((t) => typeMatches(t, value))) {
        errors.push({ path: at, message: `expected ${types.join('|')}, got ${typeName(value)}` });
        return;
      }
    }
    if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) {
      errors.push({ path: at, message: `must equal ${JSON.stringify(schema.const)}` });
    }
    if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
      errors.push({ path: at, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
    }
    if (typeof value === 'string') {
      if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push({ path: at, message: `shorter than ${schema.minLength}` });
      if (schema.maxLength !== undefined && [...value].length > schema.maxLength) errors.push({ path: at, message: `longer than ${schema.maxLength}` });
      if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push({ path: at, message: `does not match ${schema.pattern}` });
      if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push({ path: at, message: 'not a date-time' });
    }
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path: at, message: `less than ${schema.minimum}` });
      if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path: at, message: `greater than ${schema.maximum}` });
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path: at, message: `fewer than ${schema.minItems} items` });
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push({ path: at, message: `more than ${schema.maxItems} items` });
      if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push({ path: at, message: 'items not unique' });
      if (schema.items !== undefined) value.forEach((v, i) => this.#check(schema.items, root, v, `${path}/${i}`, errors));
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push({ path: at, message: `fewer than ${schema.minProperties} properties` });
      if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) errors.push({ path: at, message: `more than ${schema.maxProperties} properties` });
      for (const req of schema.required ?? []) {
        if (!(req in value)) errors.push({ path: at, message: `missing required property "${req}"` });
      }
      const props = schema.properties ?? {};
      for (const k of keys) {
        const p = `${path}/${escapePointer(k)}`;
        if (schema.propertyNames) this.#check(schema.propertyNames, root, k, p, errors);
        if (k in props) this.#check(props[k], root, value[k], p, errors);
        else if (schema.additionalProperties === false) errors.push({ path: p, message: 'property not allowed' });
        else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          this.#check(schema.additionalProperties, root, value[k], p, errors);
        }
      }
    }
    if (schema.anyOf) {
      const ok = schema.anyOf.some((s) => {
        const e = [];
        this.#check(s, root, value, path, e);
        return e.length === 0;
      });
      if (!ok) errors.push({ path: at, message: 'matches none of anyOf' });
    }
    if (schema.oneOf) {
      const n = schema.oneOf.filter((s) => {
        const e = [];
        this.#check(s, root, value, path, e);
        return e.length === 0;
      }).length;
      if (n !== 1) errors.push({ path: at, message: `matches ${n} of oneOf (expected exactly 1)` });
    }
  }
}

function checkKeywords(schema, where) {
  if (typeof schema !== 'object' || schema === null) return;
  if (Array.isArray(schema)) return schema.forEach((s) => checkKeywords(s, where));
  for (const [k, v] of Object.entries(schema)) {
    if (!SUPPORTED.has(k)) throw new Error(`schema ${where} uses unsupported keyword "${k}"`);
    if (k === 'properties' || k === '$defs') Object.values(v).forEach((s) => checkKeywords(s, where));
    else if (['items', 'additionalProperties', 'propertyNames'].includes(k)) checkKeywords(v, where);
    else if (k === 'anyOf' || k === 'oneOf') v.forEach((s) => checkKeywords(s, where));
  }
}

function typeMatches(t, v) {
  switch (t) {
    case 'null': return v === null;
    case 'boolean': return typeof v === 'boolean';
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return Number.isInteger(v);
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return false;
  }
}

function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function escapePointer(k) {
  return k.replace(/~/g, '~0').replace(/\//g, '~1');
}

export const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');

/** Registry pre-loaded with every schema in schemas/. */
export function loadProtocolSchemas(dir = SCHEMA_DIR) {
  const reg = new SchemaRegistry();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    reg.add(JSON.parse(readFileSync(join(dir, f), 'utf8')));
  }
  return reg;
}
