import { parse } from './language/parser.js';
import { lookup, operators, validateArgs, outputType } from './language/registry.js';
import { LIMITS, EFFECTS, TYPES, fail, diagnostic, isRecord, exactKeys, validateValue, assertType, compatible, clone, canonical, identity } from './language/values.js';

export { identity, operators };
export { checkProjection, compileTrace } from './language/projection.js';
export { mapSeurl } from './language/seurl.js';

const union = (...rows) => [...new Set(rows.flat())].sort();
const registryId = () => identity('content', operators().map(({ name, version, digest }) => ({ name, version, digest })));

export function compile(source, { capabilities = [] } = {}) {
  try {
    if (!Array.isArray(capabilities) || capabilities.some(right => typeof right !== 'string')) fail('capability', 'CAPABILITIES', 'Capabilities must be an array of explicit right names');
    const ast = parse(source);
    let nodes = 0;
    const used = new Map();
    function check(steps, input, path = '$.steps', depth = 0) {
      if (depth > 24) fail('normalize', 'DEPTH', 'Program nesting limit exceeded', path);
      if (!Array.isArray(steps)) fail('parse', 'SHAPE', 'Composition requires an array of steps', path);
      let type = input, effects = [], requires = [], cost = 0;
      const normalized = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i], at = `${path}[${i}]`;
        if (++nodes > LIMITS.nodes) fail('normalize', 'NODE_QUOTA', 'Program node quota exceeded', at);
        if (!isRecord(step)) fail('parse', 'SHAPE', 'Each step must be an operator, branch, repeat or composition object', at);
        if (Object.hasOwn(step, 'compose')) {
          exactKeys(step, ['compose'], 'parse', at);
          const inner = check(step.compose, type, `${at}.compose`, depth + 1);
          normalized.push(...inner.steps); type = inner.type; effects = union(effects, inner.effects); requires = union(requires, inner.requires); cost += inner.cost;
        } else if (Object.hasOwn(step, 'repeat')) {
          exactKeys(step, ['repeat'], 'parse', at);
          exactKeys(step.repeat, ['count', 'steps'], 'parse', `${at}.repeat`);
          const { count } = step.repeat;
          if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.repeat) fail('normalize', 'REPEAT_BOUND', `Repeat count must be an integer from 0 to ${LIMITS.repeat}`, at);
          const body = check(step.repeat.steps, type, `${at}.repeat.steps`, depth + 1);
          if (body.type !== type) fail('type', 'REPEAT_TYPE', `Repeated body must preserve ${type}, received ${body.type}`, at);
          normalized.push({ repeat: { count, steps: body.steps } });
          effects = union(effects, body.effects); requires = union(requires, body.requires); cost += count * body.cost + 1;
        } else if (Object.hasOwn(step, 'branch')) {
          exactKeys(step, ['branch'], 'parse', at);
          exactKeys(step.branch, ['when', 'then', 'else'], 'parse', `${at}.branch`);
          const condition = check(Array.isArray(step.branch.when) ? step.branch.when : [step.branch.when], type, `${at}.branch.when`, depth + 1);
          if (condition.type !== 'boolean') fail('type', 'BRANCH_CONDITION', 'Branch condition must return boolean', at);
          const yes = check(step.branch.then, type, `${at}.branch.then`, depth + 1);
          const no = check(step.branch.else, type, `${at}.branch.else`, depth + 1);
          if (yes.type !== no.type) fail('type', 'BRANCH_TYPE', `Branch output types differ: ${yes.type} and ${no.type}`, at);
          type = yes.type;
          normalized.push({ branch: { when: condition.steps, then: yes.steps, else: no.steps } });
          effects = union(effects, condition.effects, yes.effects, no.effects); requires = union(requires, condition.requires, yes.requires, no.requires);
          cost += condition.cost + Math.max(yes.cost, no.cost) + 1;
        } else {
          exactKeys(step, ['op', 'args', 'version'], 'parse', at);
          if (typeof step.op !== 'string') fail('parse', 'OPERATOR', 'Step requires an operator name', at);
          const op = lookup(step.op);
          if (!op) fail('type', 'UNKNOWN_OPERATOR', `Unknown operator: ${step.op}. Discover trusted operators at /api/operators`, at);
          if (step.version !== undefined && step.version !== op.version) fail('type', 'OPERATOR_VERSION', `Unsupported ${op.name} version; expected ${op.version}`, at);
          if (!compatible(type, op.input)) fail('type', 'TYPE_MISMATCH', `${op.name} expects ${op.input}; previous stage produces ${type}`, at);
          const args = validateArgs(op, step.args ?? {}, `${at}.args`);
          type = outputType(op, type, args);
          normalized.push({ op: op.name, version: op.version, args });
          effects = union(effects, op.effects); requires = union(requires, op.requires); cost++;
          used.set(op.name, { name: op.name, version: op.version, digest: op.digest });
        }
        if (cost > LIMITS.steps) fail('normalize', 'STEP_QUOTA', `Expanded execution exceeds ${LIMITS.steps} steps`, at);
      }
      return { steps: normalized, type, effects, requires, cost };
    }
    const checked = check(ast.steps, ast.input);
    if (checked.effects.some(effect => !EFFECTS.includes(effect))) fail('effect', 'UNKNOWN_EFFECT', 'Operator declares an unsupported effect');
    const missing = checked.requires.filter(right => !capabilities.includes(right));
    if (missing.length) fail('capability', 'MISSING_CAPABILITY', `Missing required capabilities: ${missing.join(', ')}`);
    const plan = { language: 'purl/1', ir_version: 'purl-ir/1', registry_id: registryId(), input_type: ast.input, output_type: checked.type, effects: checked.effects, requires: checked.requires, steps: checked.steps, operators: [...used.values()].sort((a, b) => a.name < b.name ? -1 : 1), cost: checked.cost, limits: { ...LIMITS } };
    const derivation_id = identity('derivation', plan);
    plan.derivation_id = derivation_id;
    return { ok: true, diagnostics: [], plan, derivation_id };
  } catch (error) {
    return { ok: false, diagnostics: [diagnostic(error)], plan: null, derivation_id: null };
  }
}

export function execute(plan, input, { seed = 0 } = {}) {
  validateValue(plan);
  if (!isRecord(plan) || plan.ir_version !== 'purl-ir/1' || !Array.isArray(plan.steps)) fail('runtime', 'INVALID_PLAN', 'Invalid or unsupported execution plan');
  // Plans are data, never trusted code. Recheck the closed AST and every metadata field.
  const checked = compile({ language: plan.language, input: plan.input_type, steps: plan.steps }, { capabilities: plan.requires });
  if (!checked.ok || canonical(checked.plan) !== canonical(plan)) fail('runtime', 'PLAN_INTEGRITY', 'Plan integrity/type/operator verification failed');
  if (!Number.isSafeInteger(seed)) fail('runtime', 'SEED', 'Replay seed must be a safe integer');
  assertType(input, plan.input_type);
  const environment = { interpreter: 'purl-ir/1', runtime: 'node', runtime_version: process.version, architecture: process.arch, platform: process.platform, registry_id: plan.registry_id, limits: plan.limits, dependencies: plan.operators };
  const trace = { protocol: 'purl-replay/1', derivation_id: plan.derivation_id, environment, environment_id: identity('environment', environment), input: clone(input), seed, operators: clone(plan.operators), declared_effects: clone(plan.effects), observed_effects: [], determinism: plan.effects.length ? 'environment-dependent' : 'deterministic', steps: [] };
  let remaining = LIMITS.steps, traceBytes = 0, workBytes = 0;
  function tick() { if (--remaining < 0) fail('runtime', 'STEP_QUOTA', 'Runtime step quota exceeded'); }
  function evaluate(steps, value, path = '$.steps') {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i], at = `${path}[${i}]`;
      tick();
      if (step.repeat) {
        for (let n = 0; n < step.repeat.count; n++) value = evaluate(step.repeat.steps, value, `${at}.repeat[${n}]`);
      } else if (step.branch) {
        const condition = evaluate(step.branch.when, value, `${at}.when`);
        assertType(condition, 'boolean');
        value = evaluate(condition ? step.branch.then : step.branch.else, value, `${at}.${condition ? 'then' : 'else'}`);
      } else {
        const op = lookup(step.op);
        assertType(value, op.input);
        workBytes += Buffer.byteLength(canonical(value)) + Buffer.byteLength(canonical(step.args));
        if (workBytes > LIMITS.workBytes) fail('runtime', 'WORK_QUOTA', 'Cumulative interpreter work byte quota exceeded');
        const before = identity('value', value);
        value = op.execute(clone(value), clone(step.args));
        validateValue(value);
        const outType = outputType(op, plan.input_type, step.args);
        if (op.output !== 'same') assertType(value, outType);
        const record = { index: trace.steps.length, path: at, op: op.name, version: op.version, digest: op.digest, args: clone(step.args), input_id: before, output_id: identity('value', value), effects: clone(op.effects) };
        traceBytes += Buffer.byteLength(JSON.stringify(record));
        if (traceBytes > 4 * LIMITS.valueBytes) fail('runtime', 'TRACE_QUOTA', 'Replay trace byte quota exceeded');
        trace.steps.push(record);
        trace.observed_effects = union(trace.observed_effects, op.effects);
      }
    }
    return value;
  }
  const value = evaluate(plan.steps, clone(input));
  assertType(value, plan.output_type);
  const value_id = identity('value', value);
  trace.value_id = value_id;
  trace.receipt_id = identity('execution', { derivation_id: plan.derivation_id, input: trace.input, seed, environment_id: trace.environment_id, steps: trace.steps, value_id });
  return { value, trace, value_id };
}
