import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LIMITS, TYPES, EFFECTS, fail, isRecord, exactKeys, validateValue, assertType, valueType, canonical, clone, digest, identity } from './values.js';

const implementationDigest = digest(readFileSync(new URL(import.meta.url), 'utf8') + readFileSync(new URL('./values.js', import.meta.url), 'utf8'));
const registry = new Map();
const schemas = {};
function register(name, input, output, execute, schema = {}, options = {}) {
  const descriptor = {
    name, input, output, effects: [], requires: [], version: '1.0.0', determinism: 'deterministic',
    dependencies: [{ name: 'purl-standard-library', version: '1.0.0', digest: implementationDigest }],
    provenance: { source: 'service/language/registry.js', license: 'project', authority: 'trusted-bundled-operator' },
    tests: ['test/product/compiler.test.js'], available: true, ...options,
    args_schema: schema,
  };
  descriptor.digest = digest(descriptor);
  schemas[name] = schema;
  registry.set(name, { ...descriptor, execute });
}

const arg = (kind, required = true) => ({ kind, required });
const numberArg = { value: arg('number') };
const stringArg = { value: arg('string') };
const allocation = bytes => { if (bytes > LIMITS.valueBytes) fail('runtime', 'VALUE_QUOTA', 'Predicted string allocation exceeds the value byte quota'); };
const noZero = divisor => { if (divisor === 0) fail('runtime', 'DIVISION_BY_ZERO', 'Division by zero'); };
const numbers = array => { for (const x of array) assertType(x, 'number'); return array; };
const forbiddenPath = key => ['__proto__', 'constructor', 'prototype'].includes(String(key));
const pathParts = path => Array.isArray(path) ? path : String(path).split('.');
function getPath(value, path) {
  for (const key of pathParts(path)) {
    if (forbiddenPath(key) || value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) fail('runtime', 'MISSING_PATH', `JSON path does not exist: ${String(key)}`);
    value = value[key];
  }
  return value;
}

register('identity', 'json', 'same', value => value);
register('constant', 'json', 'value', (_, args) => clone(args.value), { value: arg('json') });
for (const [name, op] of Object.entries({ add: (a, b) => a + b, subtract: (a, b) => a - b, multiply: (a, b) => a * b, divide: (a, b) => { noZero(b); return a / b; }, mod: (a, b) => { noZero(b); return a % b; }, power: (a, b) => a ** b })) {
  register(`math.${name}`, 'number', 'number', (value, args) => op(value, args.value), numberArg);
}
for (const [name, op] of Object.entries({ abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, round: Math.round, negate: x => -x })) register(`math.${name}`, 'number', 'number', value => op(value));
for (const [name, op] of Object.entries({ sum: a => a.reduce((n, x) => { const sum = n + x; assertType(sum, 'number'); return sum; }, 0), mean: a => a.length ? a.reduce((n, x) => n + x / a.length, 0) : fail('runtime', 'EMPTY_ARRAY', 'Mean requires a nonempty array'), min: a => a.length ? Math.min(...a) : fail('runtime', 'EMPTY_ARRAY', 'Min requires a nonempty array'), max: a => a.length ? Math.max(...a) : fail('runtime', 'EMPTY_ARRAY', 'Max requires a nonempty array') })) register(`math.${name}`, 'array', 'number', value => op(numbers(value)));
for (const [name, op] of Object.entries({ greaterThan: (a, b) => a > b, lessThan: (a, b) => a < b, equal: (a, b) => a === b })) register(`math.${name}`, 'number', 'boolean', (value, args) => op(value, args.value), numberArg);
register('math.clamp', 'number', 'number', (value, args) => {
  if (args.min > args.max) fail('runtime', 'BOUNDS', 'Clamp min must not exceed max');
  return Math.min(args.max, Math.max(args.min, value));
}, { min: arg('number'), max: arg('number') });
register('math.gcd', 'integer', 'integer', (value, args) => {
  let a = Math.abs(value), b = Math.abs(args.value);
  while (b) [a, b] = [b, a % b];
  return a;
}, { value: arg('integer') });

register('json.parse', 'string', 'json', value => {
  try { return JSON.parse(value); } catch { fail('runtime', 'JSON_SYNTAX', 'Invalid JSON input'); }
});
register('json.stringify', 'json', 'string', value => canonical(value));
register('json.get', 'json', 'selected', (value, args) => assertType(getPath(value, args.path), args.type || 'json'), { path: arg('path'), type: arg('type', false) });
register('json.keys', 'object', 'array', value => Object.keys(value).sort());
register('json.values', 'object', 'array', value => Object.keys(value).sort().map(key => value[key]));
register('json.entries', 'object', 'array', value => Object.keys(value).sort().map(key => [key, value[key]]));
register('json.pick', 'object', 'object', (value, args) => Object.fromEntries(args.keys.map(key => {
  if (!Object.hasOwn(value, key)) fail('runtime', 'MISSING_PATH', `JSON key does not exist: ${key}`);
  return [key, value[key]];
})), { keys: arg('strings') });
register('json.merge', 'object', 'object', (value, args) => Object.fromEntries([...Object.entries(value), ...Object.entries(args.value)]), { value: arg('object') });
register('json.equal', 'json', 'boolean', (value, args) => canonical(value) === canonical(args.value), { value: arg('json') });
register('boolean.not', 'boolean', 'boolean', value => !value);
register('boolean.and', 'boolean', 'boolean', (value, args) => value && args.value, { value: arg('boolean') });
register('boolean.or', 'boolean', 'boolean', (value, args) => value || args.value, { value: arg('boolean') });

for (const [name, op] of Object.entries({ trim: s => s.trim(), uppercase: s => s.toUpperCase(), lowercase: s => s.toLowerCase(), reverse: s => Array.from(s).reverse().join('') })) register(`string.${name}`, 'string', 'string', value => op(value));
register('string.length', 'string', 'integer', value => Array.from(value).length);
register('string.concat', 'string', 'string', (value, args) => value + args.value, stringArg);
register('string.includes', 'string', 'boolean', (value, args) => value.includes(args.value), stringArg);
register('string.split', 'string', 'array', (value, args) => {
  const parts = value.split(args.value, LIMITS.arrayLength + 1);
  if (parts.length > LIMITS.arrayLength) fail('runtime', 'VALUE_QUOTA', 'String split exceeds array length quota');
  return parts;
}, stringArg);
register('string.replace', 'string', 'string', (value, args) => {
  if (!args.search.length) fail('runtime', 'BOUNDS', 'Replacement search must be nonempty');
  let count = 0, index = 0;
  while ((index = value.indexOf(args.search, index)) !== -1) { count++; index += args.search.length; }
  allocation(Buffer.byteLength(value) + count * (Buffer.byteLength(args.replacement) - Buffer.byteLength(args.search)));
  return value.split(args.search).join(args.replacement);
}, { search: arg('string'), replacement: arg('string') });
register('string.slice', 'string', 'string', (value, args) => Array.from(value).slice(args.start, args.end).join(''), { start: arg('integer'), end: arg('integer', false) });
register('array.join', 'array', 'string', (value, args) => {
  value.forEach(x => assertType(x, 'string'));
  allocation(value.reduce((bytes, item) => bytes + Buffer.byteLength(item), 0) + Math.max(0, value.length - 1) * Buffer.byteLength(args.value));
  return value.join(args.value);
}, stringArg);
register('array.length', 'array', 'integer', value => value.length);
register('array.reverse', 'array', 'array', value => [...value].reverse());
register('array.take', 'array', 'array', (value, args) => { if (args.count < 0) fail('runtime', 'BOUNDS', 'Array count must be nonnegative'); return value.slice(0, args.count); }, { count: arg('integer') });
register('array.unique', 'array', 'array', value => [...new Map(value.map(x => [canonical(x), x])).values()]);
register('array.sort', 'array', 'array', (value, args) => {
  const type = args.type || 'number';
  value.forEach(x => assertType(x, type));
  return [...value].sort(type === 'number' ? (a, b) => a - b : (a, b) => a < b ? -1 : a > b ? 1 : 0);
}, { type: arg('sortType', false) });

register('parse.number', 'string', 'number', value => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) fail('runtime', 'NUMBER_SYNTAX', 'Expected a decimal number string');
  return Number(value);
});
register('parse.csv', 'string', 'array', value => {
  // RFC 4180-style quotes; no formulas, evaluation or dialect guessing.
  const rows = [], row = [];
  let field = '', quoted = false, closed = false;
  const finish = () => { row.push(field); field = ''; closed = false; };
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted) {
      if (c === '"') { if (value[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c;
    } else if (c === ',') finish();
    else if (c === '\r' || c === '\n') { if (c === '\r' && value[i + 1] === '\n') i++; finish(); rows.push(row.splice(0)); }
    else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') fail('runtime', 'CSV_SYNTAX', 'Unexpected character after CSV quote'); field += c; }
    if (rows.length > LIMITS.arrayLength || row.length > LIMITS.arrayLength) fail('runtime', 'VALUE_QUOTA', 'CSV row or column quota exceeded');
  }
  if (quoted) fail('runtime', 'CSV_SYNTAX', 'Unclosed CSV quote');
  if (field || row.length || !rows.length || closed) { finish(); rows.push(row); }
  return rows;
});

function adjacency(graph) {
  assertType(graph, 'graph');
  const byId = new Map(graph.nodes.map(node => [canonical(node), node]));
  const edges = new Map([...byId.keys()].map(id => [id, []]));
  for (const [a, b] of graph.edges) edges.get(canonical(a)).push(canonical(b));
  return { byId, edges };
}
register('graph.bfs', 'graph', 'array', (value, args) => {
  const { byId, edges } = adjacency(value);
  const first = canonical(args.start);
  if (!byId.has(first)) fail('runtime', 'GRAPH_START', 'Graph start node is absent');
  const queue = [first], seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) for (const next of edges.get(queue[i])) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  return queue.map(key => byId.get(key));
}, { start: arg('json') });
register('graph.toposort', 'graph', 'array', value => {
  const { byId, edges } = adjacency(value);
  const degree = new Map([...byId.keys()].map(key => [key, 0]));
  for (const successors of edges.values()) for (const target of successors) degree.set(target, degree.get(target) + 1);
  const queue = [...degree].filter(([, count]) => count === 0).map(([key]) => key);
  for (let i = 0; i < queue.length; i++) for (const target of edges.get(queue[i])) { degree.set(target, degree.get(target) - 1); if (!degree.get(target)) queue.push(target); }
  if (queue.length !== byId.size) fail('runtime', 'GRAPH_CYCLE', 'Topological sorting requires an acyclic graph');
  return queue.map(key => byId.get(key));
});

register('state.toggle', 'number', 'number', value => {
  if (value !== 0 && value !== 1) fail('runtime', 'STATE_DOMAIN', 'Toggle state must be bit 0 or 1');
  return 1 - value;
});
register('state.cycle007', 'string', 'string', value => {
  const labels = ['007', '070', '700'], index = labels.indexOf(value);
  if (index < 0) fail('runtime', 'STATE_DOMAIN', '007 cycle requires exact label 007, 070 or 700');
  return labels[(index + 1) % 3];
});
register('state.transition', 'json', 'selected', (value, args) => {
  const key = canonical(value);
  const entry = args.transitions.find(entry => canonical(entry.from) === key);
  if (!entry) fail('runtime', 'STATE_DOMAIN', 'No transition is defined for this state');
  return assertType(entry.to, args.type || 'json');
}, { transitions: arg('transitions'), type: arg('type', false) });

function bits(value) { if (!/^[01]{1,4096}$/.test(value)) fail('runtime', 'BITS_DOMAIN', 'Binary strings must have 1 to 4096 bits'); return value; }
register('bits.not', 'string', 'string', value => Array.from(bits(value), c => c === '0' ? '1' : '0').join(''));
for (const [name, op] of Object.entries({ and: (a, b) => a & b, or: (a, b) => a | b, xor: (a, b) => a ^ b })) register(`bits.${name}`, 'string', 'string', (value, args) => {
  bits(value); bits(args.value);
  if (value.length !== args.value.length) fail('runtime', 'BITS_WIDTH', 'Binary operands require equal length');
  return Array.from(value, (c, i) => String(op(Number(c), Number(args.value[i])))).join('');
}, { value: arg('bits') });
register('bits.concat', 'string', 'string', (value, args) => bits(bits(value) + args.value), { value: arg('bits') });
register('bits.hash', 'string', 'string', value => Array.from(createHash('sha256').update(bits(value), 'ascii').digest(), byte => byte.toString(2).padStart(8, '0')).join(''));
register('artifact.json', 'json', 'artifact', value => {
  const content = canonical(value);
  return { media_type: 'application/json', content, content_id: identity('content', { media_type: 'application/json', content }) };
});
register('artifact.text', 'string', 'artifact', content => ({ media_type: 'text/plain', content, content_id: identity('content', { media_type: 'text/plain', content }) }));
register('content.hash', 'json', 'string', value => identity('content', value));
register('mission.inspect', 'json', 'json', value => {
  const nodes = value?.graph?.nodes;
  if (!Array.isArray(nodes) || nodes.length > 256) fail('runtime', 'MISSION_GRAPH', 'A mission requires a bounded graph.nodes array (at most 256 nodes)');
  const index = new Map();
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.id !== 'string' || !node.id || node.id.length > 128 || index.has(node.id)) fail('runtime', 'MISSION_GRAPH', 'Mission node IDs must be unique bounded strings; duplicate or invalid node');
    if (!Array.isArray(node.dependencies) || node.dependencies.length > 256 || new Set(node.dependencies).size !== node.dependencies.length) fail('runtime', 'MISSION_GRAPH', 'Mission dependencies must be a unique bounded array');
    if (node.status !== undefined && !['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(node.status)) fail('runtime', 'MISSION_GRAPH', 'Unknown mission node status');
    index.set(node.id, node);
  }
  const visited = new Set(), active = new Set();
  function visit(id) {
    if (!index.has(id)) fail('runtime', 'MISSION_GRAPH', `Missing mission dependency ${id}`);
    if (active.has(id)) fail('runtime', 'MISSION_CYCLE', 'Mission dependency cycle rejected');
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of index.get(id).dependencies) visit(dependency);
    active.delete(id); visited.add(id);
  }
  for (const id of index.keys()) visit(id);
  const completed = nodes.filter(node => node.status === 'PASS').map(node => node.id);
  const ready = nodes.filter(node => (node.status ?? 'NOT_RUN') === 'NOT_RUN' && node.dependencies.every(id => index.get(id).status === 'PASS')).map(node => node.id);
  return { total_nodes: nodes.length, dependency_edges: nodes.reduce((sum, node) => sum + node.dependencies.length, 0), ready_nodes: ready, completed_nodes: completed, waiting_nodes: nodes.filter(node => !ready.includes(node.id) && node.status !== 'PASS').map(node => node.id), completion: completed.length === nodes.length ? 'PASS' : 'NOT_RUN', verified: false, evidence_policy: 'Statuses are recorded claims; dependency validation and artifact integrity do not establish requirement truth.' };
});

for (const [name, effect, right] of [['network.fetch', 'external-read', 'external:read'], ['artifact.write', 'local', 'artifact:write'], ['state.commit', 'mutation', 'state:write']]) register(name, 'json', 'json', () => fail('runtime', 'ADAPTER_UNAVAILABLE', `${name} adapter unavailable: the bounded interpreter has no external I/O`), {}, { effects: [effect], requires: [right], determinism: 'environment-dependent', available: false, unavailable_reason: 'No approved adapter configured in bounded interpreter' });

const aliases = { add: 'math.add', subtract: 'math.subtract', multiply: 'math.multiply', divide: 'math.divide', abs: 'math.abs', sum: 'math.sum', parse: 'json.parse', stringify: 'json.stringify', 'string.upper': 'string.uppercase', 'string.lower': 'string.lowercase', toggle: 'state.toggle', cycle007: 'state.cycle007', id: 'identity', literal: 'constant' };
export const lookup = name => registry.get(aliases[name] || name);
export const operators = () => [...registry.values()].map(({ execute, ...descriptor }) => clone(descriptor));

export function validateArgs(op, args, path) {
  exactKeys(args, Object.keys(schemas[op.name]), 'type', path);
  for (const [name, { kind, required }] of Object.entries(schemas[op.name])) {
    if (!Object.hasOwn(args, name)) { if (required) fail('type', 'ARGUMENT', `${op.name} requires argument ${name}`, path); continue; }
    const value = args[name];
    try {
      if (TYPES.includes(kind)) assertType(value, kind);
      else if (kind === 'type') { if (!TYPES.includes(value)) throw new Error('Unknown type'); }
      else if (kind === 'sortType') { if (!['string', 'number'].includes(value)) throw new Error('Expected string or number'); }
      else if (kind === 'strings') { assertType(value, 'array'); value.forEach(v => assertType(v, 'string')); }
      else if (kind === 'bits') bits(value);
      else if (kind === 'path') {
        if (typeof value !== 'string' && !Array.isArray(value)) throw new Error('Expected path string or array');
        if (pathParts(value).some(key => !['string', 'number'].includes(typeof key) || forbiddenPath(key))) throw new Error('Unsafe JSON path');
      } else if (kind === 'transitions') {
        assertType(value, 'array');
        const seen = new Set();
        for (const transition of value) {
          exactKeys(transition, ['from', 'to'], 'type');
          if (!Object.hasOwn(transition, 'from') || !Object.hasOwn(transition, 'to')) throw new Error('Transition requires from and to');
          if (seen.has(canonical(transition.from))) throw new Error('Duplicate transition source');
          seen.add(canonical(transition.from));
          if (args.type) { assertType(transition.from, args.type); assertType(transition.to, args.type); }
        }
      }
    } catch (error) { fail('type', 'ARGUMENT', `Invalid ${op.name} argument ${name}: ${error.message}`, path); }
  }
  validateValue(args);
  return clone(args);
}

export const outputType = (op, input, args) => op.output === 'same' ? input : op.output === 'value' ? valueType(args.value) : op.output === 'selected' ? args.type || 'json' : op.output;
