// Historical labels are context-sensitive migration hints, never new authority.
export function mapSeurl(verb, context = {}) {
  verb = typeof verb === 'string' ? verb.toUpperCase() : '';
  const decisions = {
    START: ['derived-macro', ['create', 'reopen'], 'Creating a resource and reopening an existing one have different preconditions.'],
    SWITCH: ['split', ['assign', 'handoff', 'client-focus'], 'Client focus does not imply resource mutation or authority transfer.'],
    WRITE: ['typed-overload', ['append', 'update'], 'Append preserves immutable history; update changes a versioned document.'],
    COMMIT: ['disambiguate', ['checkpoint', 'commit'], 'An evidence checkpoint and an atomic mutation transaction differ.'],
    BUILD: ['adapter-required', ['build'], 'Execution needs a configured isolated builder and live authorization.'],
    TALK: ['keep-separate', ['append', 'external-communication'], 'Recording a message does not authorize sending it externally.'],
    PERTURB: ['research-only', ['math.add', 'external-action'], 'A pure mathematical perturbation conveys no permission for external action.'],
  };
  if (!decisions[verb]) return { ok: false, verb, decision: 'reject', lossless: false, operation: null, caveats: ['Unknown historical verb.'] };
  const [decision, candidates, caveat] = decisions[verb];
  const modes = {
    START: { create: 'create', reopen: 'reopen' }, SWITCH: { assign: 'assign', handoff: 'handoff', focus: 'client-focus' },
    WRITE: { append: 'append', update: 'update' }, COMMIT: { checkpoint: 'checkpoint', transaction: 'commit' },
    BUILD: { isolated: 'build' }, TALK: { annotation: 'append' }, PERTURB: { pure: 'math.add' },
  };
  const operation = modes[verb][context?.mode] || null;
  const admitted = Boolean(operation) && (verb !== 'PERTURB' || (Number.isFinite(context.amount) && (!Number.isInteger(context.amount) || Number.isSafeInteger(context.amount))));
  return {
    ok: admitted, verb, decision, lossless: false, operation: admitted ? operation : null, candidates,
    caveats: [caveat, 'This migration result does not grant rights, mutate a resource, or prove protocol equivalence.'],
    ...(admitted && verb === 'PERTURB' ? { term: { op: 'math.add', args: { value: context.amount } } } : {}),
  };
}
