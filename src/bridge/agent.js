// A generic computation agent. It is given only: an ACSP resource URL, a
// capability for it, and its own session id. Everything else — the PURL
// instance, the operands, the step to perform, earlier agents' results — it
// discovers from the ACSP resource and verifies against PURL itself.
//
// One run = one turn of responsibility:
//   accept the handoff addressed to me → read the task → verify every earlier
//   result (ACSP checkpoint hashes; PURL replay + re-evaluation) → annotate
//   validation or dispute → if everything verified, perform my steps as new
//   PURL nodes → record findings → checkpoint → hand the task on.
import { AcspSession, tokJson } from './acsp.js';
import { HttpPort } from '../compute/ports.js';
import { Composer } from '../compute/composer.js';
import { loadProtocolSchemas } from '../core/schema.js';

const schemas = loadProtocolSchemas();

export const TASK_SCHEMA = 'purl.compute.task/0.1';
export const RESULT_SCHEMA = 'purl.compute.result/0.1';

const resourceIdOf = (href) => /\/r\/([A-Za-z0-9_-]+)$/.exec(new URL(href).pathname)?.[1] ?? null;

/**
 * @param o.acspResource  e.g. http://127.0.0.1:4000/r/7B8YD9Q614M0
 * @param o.capability    ACSP capability token for that resource
 * @param o.session       own ACSP session id; o.agent: agent id
 * @param o.next          session to hand the task to afterwards
 * @param o.fault         negative controls only: 'misreport' | 'wrong-node'
 */
export async function runAgent(o) {
  const log = [];
  const note = (step, data) => log.push({ step, ...data });
  const url = new URL(o.acspResource);
  const rid = resourceIdOf(o.acspResource);
  const acsp = new AcspSession(url.origin, { session_id: o.session, agent_id: o.agent, keyPrefix: `${o.session}-${o.runId ?? 'run'}` });
  acsp.receive(rid, o.capability);

  // 1. Discover the resource and my authority.
  let doc = await acsp.document(rid);
  note('discover', { protocol: doc.protocol.version, owner: doc.ownership.owner.session_id, viewer: { session_id: doc.viewer.session_id, is_owner: doc.viewer.is_owner, scopes: doc.viewer.scopes }, permitted: doc.operations.filter((op) => op.permitted_for_viewer).map((op) => op.name) });

  // 2. Accept the handoff addressed to me.
  const mine = doc.handoffs.find((h) => h.status === 'pending' && h.to.session_id === o.session);
  if (!mine) throw new Error(`no pending handoff addressed to ${o.session}`);
  const ack = await acsp.op(rid, 'acknowledge', { handoff_id: mine.id, decision: 'accept', note: 'accepted by the receiving session' });
  note('acknowledge', { handoff: mine.id, status: ack.status, version: ack.body?.version });
  const instruction = JSON.parse(mine.note || '{}');

  doc = await acsp.document(rid);
  const task = doc.knowledge.items.find((k) => k.id === mine.tok_id);
  const spec = tokJson(task);
  const specErrors = spec ? schemas.validate('urn:purl:schema:compute-task', spec) : ['not JSON'];
  if (specErrors.length) throw new Error(`task ${mine.tok_id} does not carry a valid ${TASK_SCHEMA} specification: ${JSON.stringify(specErrors).slice(0, 300)}`);
  note('task', { tok: task.id, author: task.source.session_id, responsible: task.task.responsible_session_id, perform: instruction.perform ?? [] });

  // 3. Independent PURL identity on the PURL instance named by the task.
  const purlBase = new URL(spec.purl_instance).origin;
  const manifest = await (await fetch(spec.purl_instance, { headers: { Accept: 'application/purl+json' } })).json();
  const reg = await (await fetch(purlBase + manifest.authentication.obtain.href, { method: manifest.authentication.obtain.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'agent', label: o.agent ?? o.session }) })).json();
  const port = new HttpPort(purlBase, reg.token);
  const composer = new Composer(port);
  note('purl-identity', { instance: purlBase, protocol: manifest.protocol, principal: reg.principal.id });

  // 4. Verify every earlier result: checkpoint hashes, then the PURL computation behind each claim.
  const checkpoints = [];
  for (const c of doc.checkpoints) checkpoints.push(await acsp.verifyCheckpoint(rid, c.number));
  note('verify-checkpoints', { results: checkpoints.map(({ snapshot, ...c }) => c) });

  const names = { ...spec.inputs };
  const verifications = [];
  for (const k of doc.knowledge.items) {
    const claim = tokJson(k);
    if (claim?.schema !== RESULT_SCHEMA || k.status !== 'active') continue;
    const claimErrors = schemas.validate('urn:purl:schema:compute-result', claim);
    if (claimErrors.length) {
      verifications.push({ tok: k.id, source: k.source.session_id, step: claim.step ?? null, ok: false, checks: { schema_valid: false }, problems: claimErrors });
      await acsp.op(rid, 'annotate', { tok_id: k.id, kind: 'dispute', content: `Result claim does not validate against ${RESULT_SCHEMA}.` });
      continue;
    }
    const id = resourceIdOf(claim.purl.href);
    const at = await port.at(id, claim.purl.version);
    const v = await composer.verify(id, { version: claim.purl.version });
    const checks = {
      schema_valid: true,
      same_instance: new URL(claim.purl.href).origin === purlBase,
      pin_state_hash_matches: at.state_hash === claim.purl.state_hash,
      acsp_claim_equals_purl_value: at.record.state.value === claim.value,
      purl_cone_verifies: v.valid,
      operation_matches: at.record.state.operation === claim.operation,
    };
    const ok = Object.values(checks).every(Boolean);
    verifications.push({ tok: k.id, source: k.source.session_id, step: claim.step, ok, checks, problems: v.problems, nodes_visited: v.nodes_visited });
    const ann = await acsp.op(rid, 'annotate', {
      tok_id: k.id,
      kind: ok ? 'validation' : 'dispute',
      content: ok ? `Independently re-verified by ${o.session}.` : `Verification by ${o.session} FAILED: ${Object.entries(checks).filter(([, x]) => !x).map(([n]) => n).join(', ')}.`,
      ...(ok ? { evidence: { method: 'purl.compute/0.1: replay of every node in the cone at its pinned version, state-hash comparison, re-evaluation', reference: claim.purl.href, result: `value ${at.record.state.value} reproduced; ${v.distinct_nodes} nodes verified` } } : {}),
    });
    note('annotate', { tok: k.id, kind: ok ? 'validation' : 'dispute', status: ann.status });
    if (ok) names[claim.step] = `${purlBase}/r/${id}`;
  }
  note('verify-results', { verifications });
  const allVerified = checkpoints.every((c) => c.ok) && verifications.every((x) => x.ok);

  // 5. Perform my steps — only on verified inputs.
  const performed = [];
  if (allVerified) {
    for (const stepId of instruction.perform ?? []) {
      const step = spec.steps.find((s) => s.id === stepId);
      const operandIds = step.operands.map((n) => {
        if (!names[n]) throw new Error(`operand ${n} of step ${stepId} is not available as a verified result`);
        return resourceIdOf(names[n]);
      });
      const node = await composer.apply(step.operation, operandIds, o.fault === 'wrong-node' ? { claim: flip(await composer.evaluateOnly(step.operation, operandIds)) } : {});
      const head = await port.head(node.id);
      const value = o.fault === 'misreport' ? flip(node.value) : node.value;
      const result = { schema: RESULT_SCHEMA, step: stepId, operation: step.operation, value, operands: step.operands.map((n, i) => ({ name: n, href: names[n], resource: operandIds[i] })), purl: { href: port.href(node.id), resource: node.id, version: head.version, state_hash: head.state_hash } };
      const res = await acsp.op(rid, 'append', {
        type: 'finding',
        title: `${stepId} = ${step.operation}(${step.operands.join(', ')}) = ${value}`,
        content: JSON.stringify(result),
        stated_confidence: 'high',
        refs: [{ url: result.purl.href }, { tok: task.id }],
      });
      names[stepId] = result.purl.href;
      performed.push({ step: stepId, value, purl: result.purl, tok: res.body?.result?.tok?.id ?? null, status: res.status });
    }
  }
  note('perform', { performed, skipped_because_unverified: !allVerified });

  // 6. Checkpoint and hand on.
  const cp = await acsp.op(rid, 'checkpoint', { label: `${o.session}: ${performed.map((p) => p.step).join(', ') || 'no steps'}${allVerified ? '' : ' (verification failed)'}` });
  note('checkpoint', { status: cp.status, number: cp.body?.result?.checkpoint?.number, sha256: cp.body?.result?.checkpoint?.sha256 });
  const done = new Set(Object.keys(names));
  const remaining = spec.steps.filter((s) => !done.has(s.id)).map((s) => s.id);
  const to = o.next;
  const ho = await acsp.op(rid, 'handoff', { tok_id: task.id, to: { session_id: to }, note: JSON.stringify(allVerified ? { perform: remaining.slice(0, 1), remaining } : { perform: [], halted: 'verification failed', by: o.session }) });
  note('handoff', { to, status: ho.status, handoff: ho.body?.result?.handoff?.id });

  // 7. Negative control on identity: try to act as someone else with my capability.
  const spoof = await acsp.op(rid, 'append', { type: 'observation', title: 'impersonation attempt' }, { actor: { session_id: o.impersonate ?? 'session-owner' } });
  note('impersonation-attempt', { as: o.impersonate ?? 'session-owner', status: spoof.status, code: spoof.body?.error?.code });

  return { session: o.session, verified: allVerified, verifications, checkpoints: checkpoints.map(({ snapshot, ...c }) => c), performed, purl_reads: port.counters, log };
}

const flip = (v) => [...v].map((c) => (c === '1' ? '0' : '1')).join('');
