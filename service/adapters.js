// Pure compatibility seams reconstructed from actual supplied branches.
// No adapter grants authority, calls a service, records an execution or evaluates authored code.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hashOf } from '../src/core/canonical.js';
import { run as runSeurl } from './compat/seurl.js';

const SUBSTRATE_SHA = '165712038643f306f3ec882d9c50da84477de534';
const COMPOSITION_SHA = '18c85bf2960685ce8903937598e3ac0506409673';
const CIRCLE_SHA = '83d6bcaf8b811e9d2744fb15a6d42ae5d899de1c';
const registry = JSON.parse(readFileSync(new URL('./compat/substrate-registry.json', import.meta.url), 'utf8'));
const MAX_ADDRESS = 16384;
const MAX_SNAPSHOTS = 512;
const ARITY = new Map([['NOT', 1], ['AND', 2], ['OR', 2], ['XOR', 2], ['CONCAT', 2], ['HASH', 1]]);
const HASH = /^sha256:[a-f0-9]{64}$/;

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function checkedAddress(path) {
  if (typeof path !== 'string' || path.length > MAX_ADDRESS || !path.startsWith('/') || path.includes('://') || path.includes('#')) fail('invalid_address', 'Use a bounded local address path.');
  const question = path.indexOf('?');
  const query = new URLSearchParams(question < 0 ? '' : path.slice(question + 1));
  for (const key of query.keys()) {
    if (/^(cap|capability|token|access_token|auth|authorization|key|api_key|apikey|bearer|password|secret)$/i.test(key)) fail('credential_in_url', 'Credentials are forbidden in compatibility URLs.');
  }
  return path;
}

/** Pinned source declarations; assertions about old deployments are never imported as current facts. */
export function compatibilitySources() {
  return [
    { repository: 'purl', branch: 'claude/purl-protocol-research-bxevq5', sha: '3df4452a3624b3f5492bf23c2dacc49d8d2b33c7', role: 'original continuity implementation' },
    { repository: 'purl', branch: 'claude/acsp-purl-composition-adsbn6', sha: COMPOSITION_SHA, role: 'pinned bit-string computation snapshots', path: 'src/compute/composer.js' },
    { repository: 'purl', branch: 'ccr-d0887a23-30wf63', sha: CIRCLE_SHA, role: 'actual pure SEURL FSM (vendored unchanged)', path: 'src/circle/seurl.js' },
    { repository: 'substrateIO', branch: 'ccr-d0887a23-30wf63', sha: SUBSTRATE_SHA, role: 'typed mathematical registry; parse-only mapping', path: 'substrate/purl.py' },
    { repository: 'substrateIO', branch: 'claude/research-substrate-bootstrap-bfd02a', sha: '7ace119a544fc736f0d4ec1d72cded9dad0a83e3', role: 'original research instruments and Program 001 transition-history reader' },
    { repository: 'NetGovComEduGovOrgEduGovComNet', branch: 'claude/agent-continuity-protocol-doi4bn', sha: '9fcf2e1da3ce01a4e66eb5be5e2249b1f211878b', role: 'original ACSP/0.1 continuity; no live mutations authorized by these adapters' },
    { repository: 'NetGovComEduGovOrgEduGovComNet', branch: 'claude/acsp-program-001-k616hw', sha: '417da6c740de22aaa497e10a09251c4c2af7b948', role: 'divergent agent identity, immutable Scrolls and transition export; not merged' },
    { repository: 'NetGovComEduGovOrgEduGovComNet', branch: 'claude/acsp-purl-composition-adsbn6', sha: 'edd1963750d1fc839cc350797b6a9bc9da8f6a20', role: 'divergent ACSP/0.2 operation records/extensions; not merged' },
    { repository: 'NetGovComEduGovOrgEduGovComNet', branch: 'ccr-d0887a23-30wf63', sha: 'e8d989afee2025e2315605b4349ccfa833db13bf', role: 'ACSP/0.1 plus local server and historical snapshots' },
    { repository: 'seurl', branch: 'master', sha: '620ff955b87857c3eb7a7700a81b6a4d0217400a', role: 'static seven-verb page; no executable runtime' },
  ];
}

/** Actual circle FSM. COMMIT/BUILD/TALK are prepared values and have no side effects. */
export function parseSeurl(path) {
  checkedAddress(path);
  const word = path.replace(/^\/seurl(?=\/|\?|$)/, '');
  return { ...runSeurl(word), evaluated: false, effects: 'none', source_sha: CIRCLE_SHA };
}

/** Descriptors do not import executable_here from the machine that generated the snapshot. */
export function substrateOperations() {
  return registry.operations.map(({ executable_here: _oldEnvironmentObservation, ...op }) => structuredClone(op));
}

/** Match substrateIO's many-sorted parse(), without running or materializing any operation. */
export function mapSubstrateTerm(path) {
  checkedAddress(path);
  const tokens = path.split('?')[0].split('/').filter(Boolean);
  if (!tokens.length) fail('empty', 'Empty mathematical address.');
  let kind = 'root';
  let i = 0;
  const steps = [];
  const versions = [];
  const requires = new Set();
  while (i < tokens.length) {
    const candidates = registry.operations.filter((op) => op.applies_to === kind && op.segment.split('/').every((segment, offset) => tokens[i + offset] === segment));
    candidates.sort((a, b) => b.segment.split('/').length - a.segment.split('/').length);
    const op = candidates[0];
    if (!op) fail('unknown_operation', `No operation ${JSON.stringify(tokens[i])} applies to a ${kind}.`);
    const start = i + op.segment.split('/').length;
    if (tokens.length < start + op.params.length) fail('missing_params', `${op.id} needs ${op.params.map((p) => p.name).join(', ')}.`);
    const args = op.params.map((param, offset) => {
      const token = tokens[start + offset];
      if (param.type === 'choice') {
        if (!param.choices.includes(token)) fail('invalid_param', `${param.name} must be one of ${param.choices.join(', ')}.`);
        return token;
      }
      if (!/^\d+$/.test(token)) fail('invalid_param', `${param.name} must be a non-negative integer.`);
      const value = Number(token);
      if (!Number.isSafeInteger(value)) fail('invalid_param', `${param.name} exceeds this JavaScript adapter's safe integer range.`);
      if (value < param.minimum) fail('out_of_range', `${param.name} must be at least ${param.minimum}.`);
      return value;
    });
    i = start + op.params.length;
    const prefix = '/' + tokens.slice(0, i).join('/');
    steps.push({ op: op.id, args, sort: `${op.applies_to} -> ${op.yields}`, prefix });
    versions.push([op.id, op.version, args]);
    for (const requirement of op.requires) requires.add(requirement);
    kind = op.yields;
  }
  const address = '/' + tokens.join('/');
  return {
    protocol: registry.protocol, address, kind, steps, requires: [...requires].sort(),
    address_id: hashOf({ address }), derivation_id: hashOf(versions), value_id: null,
    evaluated: false, effects: 'none', source_sha: SUBSTRATE_SHA,
    constraints: 'Syntax, parameter minima and kind transitions checked; cross-parameter constraints and availability require evaluation in the actual substrate.',
  };
}

function bits(value) {
  if (typeof value !== 'string' || !/^[01]{1,4096}$/.test(value)) fail('invalid_value', 'Expected a nonempty bit string of at most 4096 bits.');
  return value;
}

function evaluateBits(operation, values) {
  const arity = ARITY.get(operation);
  if (!arity || values.length !== arity) fail('invalid_operation', `Unsupported composition operation or arity: ${operation}.`);
  const [a, b] = values.map(bits);
  if (operation === 'NOT') return [...a].map((bit) => bit === '1' ? '0' : '1').join('');
  if (operation === 'HASH') return [...createHash('sha256').update(a, 'ascii').digest()].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  if (operation === 'CONCAT') return bits(a + b);
  if (a.length !== b.length) fail('width_mismatch', 'Bitwise operands must have equal length.');
  return [...a].map((bit, index) => {
    const x = bit === '1';
    const y = b[index] === '1';
    return (operation === 'AND' ? x && y : operation === 'OR' ? x || y : x !== y) ? '1' : '0';
  }).join('');
}

// Check complete exported records before the recursive canonical hash function sees them.
// The iterative walk also rejects cyclic/non-JSON direct callers and accessor properties.
function validateSnapshots(records) {
  const stack = [{ value: records, depth: 0 }];
  const ancestors = new WeakSet();
  let nodes = 0;
  let bytes = 0;
  while (stack.length) {
    const { value, depth, exit } = stack.pop();
    if (exit) { ancestors.delete(value); continue; }
    if (++nodes > 100000 || depth > 64 || bytes > 2 * 1024 * 1024) fail('limit_exceeded', 'Exported snapshots exceed JSON node, depth or 2 MiB size limits.');
    if (value === null || typeof value === 'boolean') { bytes += 5; continue; }
    if (typeof value === 'number' && Number.isFinite(value)) { bytes += 32; continue; }
    if (typeof value === 'string') {
      // Each code unit contributes at least one byte; refuse large strings before encoding them.
      if (value.length > 2 * 1024 * 1024 - bytes) fail('limit_exceeded', 'Exported snapshots exceed the 2 MiB size limit.');
      bytes += Buffer.byteLength(JSON.stringify(value));
      continue;
    }
    if (typeof value !== 'object' || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid_snapshot', 'Exported snapshots must be plain JSON values.');
    if (ancestors.has(value)) fail('invalid_snapshot', 'Exported snapshots cannot be cyclic.');
    if (Array.isArray(value)) {
      if (value.length > 100000 - nodes || value.length > 2 * 1024 * 1024 - bytes) fail('limit_exceeded', 'Exported snapshot arrays exceed the node or byte limit.');
      const keys = Object.keys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) fail('invalid_snapshot', 'Exported snapshot arrays must be dense JSON arrays.');
    }
    if (Object.getOwnPropertySymbols(value).length) fail('invalid_snapshot', 'Exported snapshots cannot contain symbol properties.');
    ancestors.add(value);
    stack.push({ value, exit: true });
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable) {
        if (Array.isArray(value) && key === 'length') continue;
        fail('invalid_snapshot', 'Exported snapshots cannot contain hidden properties.');
      }
      if (!Object.hasOwn(descriptor, 'value')) fail('invalid_snapshot', 'Exported snapshots cannot contain accessors.');
      bytes += Buffer.byteLength(JSON.stringify(key)) + 2;
      stack.push({ value: descriptor.value, depth: depth + 1 });
    }
  }
  if (bytes > 2 * 1024 * 1024) fail('limit_exceeded', 'Exported snapshots exceed the 2 MiB size limit.');
}

/**
 * Re-evaluate a bounded exported DAG (512 records, depth 64, 2 MiB), pinned to full PURL record snapshots.
 * The compiler source reproduces the root operation over verified materialized operands.
 * Earlier subexpressions stay in provenance; this is not a rewrite of the original derivation.
 * This verifies supplied snapshot hashes and values, not event chains, identity or authority.
 */
export function importComposition(records, rootId, { version } = {}) {
  if (!Array.isArray(records) || records.length > MAX_SNAPSHOTS) fail('limit_exceeded', `Supply at most ${MAX_SNAPSHOTS} pinned snapshots.`);
  validateSnapshots(records);
  const index = new Map();
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !Number.isSafeInteger(record.version) || record.version < 1) fail('invalid_snapshot', 'A snapshot needs an id and positive integer version.');
    const key = `${record.id}@${record.version}`;
    if (index.has(key)) fail('duplicate_snapshot', `Duplicate snapshot ${key}.`);
    index.set(key, record);
  }
  if (version === undefined) version = Math.max(...records.filter((record) => record.id === rootId).map((record) => record.version));
  const root = index.get(`${rootId}@${version}`);
  if (!root) fail('missing_snapshot', 'The requested root snapshot is missing.');
  const memo = new Map();
  const visiting = new Set();
  const snapshots = [];
  function visit(record, depth = 0) {
    const key = `${record.id}@${record.version}`;
    if (memo.has(key)) return memo.get(key);
    if (depth > 128 || visiting.has(key)) fail('cyclic_or_deep', 'Composition contains a cycle or exceeds depth 128.');
    visiting.add(key);
    const state = record.state;
    if (state?.compute !== 'purl.compute/0.1') fail('invalid_snapshot', `Snapshot ${key} is not purl.compute/0.1.`);
    bits(state.value);
    let value;
    let operands = [];
    if (state.node === 'literal' && record.type === 'compute-literal') value = state.value;
    else if (state.node === 'application' && record.type === 'compute-application') {
      if (!ARITY.has(state.operation) || !Array.isArray(state.operands) || state.operands.length !== ARITY.get(state.operation)) fail('invalid_operation', `Unsupported composition operation or arity: ${state.operation}.`);
      operands = state.operands.map((pin) => {
        if (!pin || typeof pin.resource !== 'string' || !Number.isSafeInteger(pin.version) || !HASH.test(pin.state_hash)) fail('invalid_pin', 'Each operand needs a resource, version and state hash.');
        const operand = index.get(`${pin.resource}@${pin.version}`);
        if (!operand) fail('missing_snapshot', `Missing pinned snapshot ${pin.resource}@${pin.version}.`);
        if (hashOf(operand) !== pin.state_hash) fail('hash_mismatch', `Pinned snapshot hash mismatch for ${pin.resource}@${pin.version}.`);
        return visit(operand, depth + 1).value;
      });
      value = evaluateBits(state.operation, operands);
      if (value !== state.value) fail('false_claim', `Snapshot ${key} claims a value different from independent recomputation.`);
    } else fail('invalid_snapshot', `Invalid computation node/type in ${key}.`);
    const result = { value, operands };
    visiting.delete(key);
    memo.set(key, result);
    snapshots.push({ resource: record.id, version: record.version, state_hash: hashOf(record) });
    return result;
  }
  const result = visit(root);
  const values = result.operands;
  const steps = [{ op: 'constant', args: { value: values.length ? values[0] : result.value } }];
  if (values.length) steps.push({ op: `bits.${root.state.operation.toLowerCase()}`, args: values.length === 2 ? { value: values[1] } : {} });
  return {
    source: { language: 'purl/1', input: 'json', steps }, value: result.value,
    provenance: {
      source_sha: COMPOSITION_SHA, protocol: 'purl.compute/0.1', root: { resource: rootId, version }, snapshots,
      verification: 'supplied_snapshot_hashes_and_recomputed_values', event_chains_verified: false,
      authority_imported: false, effects: 'none',
      mapping: 'Root operation over independently recomputed operand values; original pinned DAG retained as snapshot references, not claimed to have the same derivation identity.',
    },
  };
}
