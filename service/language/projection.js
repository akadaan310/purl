import { compile, execute } from '../compiler.js';
import { lookup } from './registry.js';
import { EFFECTS, TYPES, fail, diagnostic, canonical, clone, assertType, exactKeys, isRecord, validateValue, valueType } from './values.js';

const errorResult = error => ({ ok: false, complete: false, diagnostics: [diagnostic(error)], witness: null });
const sortedEffects = effects => {
  if (!Array.isArray(effects) || effects.some(effect => !EFFECTS.includes(effect))) fail('effect', 'EFFECT_COVERAGE', 'Transition effects must be explicit known effect names; pure is []');
  return [...new Set(effects)].sort();
};
function program(term, input) {
  const result = compile({ language: 'purl/1', input, steps: Array.isArray(term) ? term : [term] });
  if (!result.ok) fail('projection', 'TYPED_OPERATOR', `Projection requires a known typed pure operator: ${result.diagnostics.map(d => d.message).join('; ')}`);
  if (result.plan.effects.length) fail('effect', 'EFFECTFUL_TRACE', 'Trace-derived programs require pure operators with complete effect coverage');
  return result.plan;
}

function admission(spec) {
  validateValue(spec);
  if (!isRecord(spec) || !Array.isArray(spec.domain) || !spec.domain.length || spec.domain.length > 256) fail('projection', 'FINITE_DOMAIN', 'An explicit finite domain of 1..256 states is required');
  if (spec.domain_complete !== true) fail('projection', 'INCOMPLETE_DOMAIN', 'The complete finite domain must be explicitly declared; samples cannot establish congruence');
  const keys = spec.domain.map(canonical), keySet = new Set(keys);
  if (keys.length !== keySet.size) fail('projection', 'DUPLICATE_STATE', 'Finite domain contains duplicate states');
  if (!Array.isArray(spec.operations) || !spec.operations.length || spec.operations.length > 16) fail('projection', 'OPERATIONS', 'Declare 1..16 operations for exhaustive checking');
  const input = spec.input_type || (spec.domain.every(x => valueType(x) === valueType(spec.domain[0])) ? valueType(spec.domain[0]) : 'json');
  if (!TYPES.includes(input)) fail('type', 'UNKNOWN_TYPE', 'Unknown finite-domain input type');
  spec.domain.forEach(state => assertType(state, input));
  const projectionPlan = program(spec.projection, input);
  const projected = spec.domain.map(state => execute(projectionPlan, state).value);
  const projectedKeys = projected.map(canonical);
  const fibers = new Map();
  projectedKeys.forEach((key, i) => { if (!fibers.has(key)) fibers.set(key, []); fibers.get(key).push(i); });
  const names = new Set();
  const operationRows = [];
  for (const operation of spec.operations) {
    exactKeys(operation, ['name', 'operator', 'transitions']);
    if (typeof operation.name !== 'string' || !operation.name || names.has(operation.name)) fail('projection', 'OPERATION_NAME', 'Each operation requires a unique name');
    names.add(operation.name);
    if (Boolean(operation.operator) === Boolean(operation.transitions)) fail('projection', 'OPERATION_SOURCE', 'Each operation needs one known typed operator or a complete transition table');
    let rows;
    if (operation.operator) {
      const operatorPlan = program(operation.operator, input);
      rows = spec.domain.map((state, i) => {
        try { return { from: state, enabled: true, to: execute(operatorPlan, state).value, effects: [], from_index: i }; }
        catch (error) {
          // These explicitly model a primitive's partial domain, never worker/quotas failures.
          if (!['STATE_DOMAIN', 'DIVISION_BY_ZERO', 'MISSING_PATH', 'GRAPH_START', 'GRAPH_CYCLE', 'EMPTY_ARRAY', 'NUMBER_SYNTAX', 'JSON_SYNTAX', 'BITS_DOMAIN', 'BITS_WIDTH'].includes(error.code)) throw error;
          return { from: state, enabled: false, effects: [], from_index: i };
        }
      });
    } else {
      if (!Array.isArray(operation.transitions) || operation.transitions.length !== spec.domain.length) fail('projection', 'INCOMPLETE_TRANSITIONS', 'Transition tables require exactly one row for every domain state (including disabled rows)');
      const byKey = new Map();
      for (const transition of operation.transitions) {
        exactKeys(transition, ['from', 'to', 'enabled', 'effects']);
        if (!Object.hasOwn(transition, 'from') || !keySet.has(canonical(transition.from)) || byKey.has(canonical(transition.from))) fail('projection', 'TRANSITION_SOURCE', 'Transition sources must uniquely cover the domain');
        if (transition.enabled !== undefined && typeof transition.enabled !== 'boolean') fail('projection', 'ENABLEDNESS', 'Enabledness must be an explicit boolean');
        const enabled = transition.enabled !== false;
        if (enabled && !Object.hasOwn(transition, 'to')) fail('projection', 'TRANSITION_TARGET', 'Enabled transitions require a successor');
        if (enabled && !Object.hasOwn(transition, 'effects')) fail('effect', 'EFFECT_COVERAGE', 'Enabled table transitions require explicit effects');
        if (!enabled && Object.hasOwn(transition, 'to')) fail('projection', 'DISABLED_SUCCESSOR', 'Disabled transitions cannot declare a successor');
        const effects = sortedEffects(transition.effects || []);
        if (!enabled && effects.length) fail('effect', 'DISABLED_EFFECT', 'A disabled operation has no observed effects');
        byKey.set(canonical(transition.from), { ...clone(transition), enabled, effects });
      }
      rows = keys.map(key => byKey.get(key));
    }
    for (const row of rows) {
      if (row.enabled && !keySet.has(canonical(row.to))) fail('projection', 'DOMAIN_CLOSURE', 'Every enabled successor must remain in the declared complete finite domain');
      if (row.enabled) row.projected_to = projected[keys.indexOf(canonical(row.to))];
    }
    operationRows.push({ name: operation.name, rows });
  }
  for (const { name, rows } of operationRows) {
    for (const indices of fibers.values()) {
      const leftIndex = indices[0], left = rows[leftIndex];
      for (const rightIndex of indices.slice(1)) {
        const right = rows[rightIndex];
        const reason = left.enabled !== right.enabled ? 'enabledness'
          : canonical(left.effects) !== canonical(right.effects) ? 'effects'
            : left.enabled && canonical(left.projected_to) !== canonical(right.projected_to) ? 'successor' : null;
        if (reason) return {
          ok: false, complete: true, diagnostics: [{ stage: 'projection', code: 'NONCONGRUENT', message: `Projection loses ${reason} information for operation ${name}`, path: '$.operations' }],
          witness: { reason, operation: name, left: clone(spec.domain[leftIndex]), right: clone(spec.domain[rightIndex]), observed: clone(projected[leftIndex]), left_enabled: left.enabled, right_enabled: right.enabled, left_effects: left.effects, right_effects: right.effects, ...(left.enabled ? { left_successor: clone(left.projected_to) } : {}), ...(right.enabled ? { right_successor: clone(right.projected_to) } : {}) },
        };
      }
    }
  }
  const quotient = operationRows.map(({ name, rows }) => ({
    name, transitions: [...fibers.values()].map(indices => rows[indices[0]]).filter(row => row.enabled).map(row => ({ from: clone(projected[row.from_index ?? keys.indexOf(canonical(row.from))]), to: clone(row.projected_to), effects: clone(row.effects) })),
  }));
  return { ok: true, complete: true, diagnostics: [], witness: null, states: spec.domain.length, fibers: fibers.size, checked_pairs: operationRows.length * [...fibers.values()].reduce((count, fiber) => count + fiber.length - 1, 0), quotient, projection_type: projectionPlan.output_type, operationRows, projected };
}

export function checkProjection(spec) {
  try {
    const { operationRows, projected, ...result } = admission(spec);
    return result;
  } catch (error) { return errorResult(error); }
}

export function compileTrace(spec) {
  try {
    validateValue(spec);
    if (!isRecord(spec) || !Array.isArray(spec.trace) || !spec.trace.length || spec.trace.length > 1001) fail('projection', 'TRACE', 'A trace must contain 1..1001 fully observed states');
    if (spec.operator) {
      if (spec.domain || spec.operations || spec.projection) fail('projection', 'TRACE_MODE', 'Choose known-operator replay or complete-domain projection explicitly');
      const term = typeof spec.operator === 'string' ? { op: spec.operator } : spec.operator;
      const op = lookup(term?.op);
      if (!op || op.effects.length) fail('projection', 'UNKNOWN_TRACE_SEMANTICS', 'Replay requires an existing versioned typed pure operator; sampled traces cannot infer semantics or effects');
      const input = spec.input_type || (op.input === 'json' ? valueType(spec.trace[0]) : op.input);
      const one = program(term, input);
      for (let i = 0; i < spec.trace.length - 1; i++) if (canonical(execute(one, spec.trace[i]).value) !== canonical(spec.trace[i + 1])) fail('projection', 'TRACE_MISMATCH', `Trace transition ${i} is invalid for ${op.name}`);
      const count = spec.trace.length - 1;
      const steps = one.input_type === one.output_type ? [{ repeat: { count, steps: one.steps } }] : Array.from({ length: count }, () => term);
      const compiled = compile({ language: 'purl/1', input, steps });
      return { ...compiled, evidence: { class: 'known-operator-replay', scope: 'The named operator defines semantics outside this observed trace; no rule was inferred.', transitions: count, operator: { name: op.name, version: op.version, digest: op.digest } } };
    }
    if (!spec.domain) fail('projection', 'UNDERDETERMINED_TRACE', 'Observed samples alone cannot infer a reusable transition. Supply a known pure operator or an explicit complete finite model.');
    const checked = admission(spec);
    if (!checked.ok) return checked;
    if (checked.quotient.some(op => op.transitions.some(row => row.effects.length))) fail('effect', 'EFFECTFUL_TRACE', 'A trace table does not implement effects; effectful quotient execution is unavailable');
    const labels = spec.labels || (spec.operations.length === 1 ? Array.from({ length: spec.trace.length - 1 }, () => spec.operations[0].name) : null);
    if (!Array.isArray(labels) || labels.length !== spec.trace.length - 1) fail('projection', 'TRACE_LABELS', 'Trace labels must identify one operation for every adjacent pair');
    const keys = spec.domain.map(canonical);
    for (const state of spec.trace) if (!keys.includes(canonical(state))) fail('projection', 'TRACE_DOMAIN', 'Trace state is outside the complete finite domain');
    const steps = labels.map((label, i) => {
      const operation = checked.operationRows.find(op => op.name === label);
      if (!operation) fail('projection', 'TRACE_LABEL', `Unknown trace operation: ${label}`);
      const row = operation.rows[keys.indexOf(canonical(spec.trace[i]))];
      if (!row.enabled || canonical(row.to) !== canonical(spec.trace[i + 1])) fail('projection', 'TRACE_MISMATCH', `Trace transition ${i} is not an enabled successor for ${label}`);
      const quotient = checked.quotient.find(op => op.name === label);
      return { op: 'state.transition', args: { transitions: quotient.transitions.map(({ from, to }) => ({ from, to })), type: checked.projection_type } };
    });
    const compiled = compile({ language: 'purl/1', input: checked.projection_type, steps });
    return { ...compiled, evidence: { class: 'complete-finite-domain', scope: 'Exhaustive for the explicitly declared closed finite model only.', states: checked.states, fibers: checked.fibers, checked_pairs: checked.checked_pairs, transitions: labels.length }, quotient: checked.quotient };
  } catch (error) { return { ...errorResult(error), plan: null, derivation_id: null }; }
}
