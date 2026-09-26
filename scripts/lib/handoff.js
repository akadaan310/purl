// The ACSP × PURL handoff experiment, run by the owner (a human stand-in).
//
//   PURL instance    this process (createPurlServer on an ephemeral port)
//   ACSP instance    a child process: `tsx harness/serve.ts` in the ACSP checkout
//   Agent A, B       two further child processes running scripts/agents/compute-agent.js;
//                    each receives ONLY the ACSP resource URL, its own capability and session id
//
// The owner publishes literals A=0, B=1 on PURL and a task on ACSP
// (C = XOR(A,B), then D = XOR(C,B)), hands step C to A; A hands step D to B;
// B hands the task back. The owner then verifies everything independently.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createPurlServer } from '../../src/transport/server.js';
import { Store } from '../../src/continuity/store.js';
import { HttpPort } from '../../src/compute/ports.js';
import { Composer } from '../../src/compute/composer.js';
import { AcspSession, tokJson } from '../../src/bridge/acsp.js';
import { TASK_SCHEMA } from '../../src/bridge/agent.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_ACSP_DIR = resolve(ROOT, '..', 'NetGovComEduGovOrgEduGovComNet');

export function acspAvailable(dir = process.env.ACSP_DIR ?? DEFAULT_ACSP_DIR) {
  return existsSync(join(dir, 'harness', 'serve.ts')) && existsSync(join(dir, 'node_modules', '.bin', 'tsx'));
}

export async function startAcsp(dir = process.env.ACSP_DIR ?? DEFAULT_ACSP_DIR) {
  const child = spawn(join(dir, 'node_modules', '.bin', 'tsx'), ['harness/serve.ts'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const base = await new Promise((res, rej) => {
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      const line = buf.split('\n')[0];
      if (buf.includes('\n')) res(JSON.parse(line).acsp);
    });
    child.on('exit', (code) => rej(new Error(`ACSP server exited (${code}): ${stderr}`)));
  });
  return { base, stop: () => { child.kill('SIGTERM'); return once(child, 'exit'); } };
}

function runAgentProcess(config) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'agents', 'compute-agent.js')], { env: { ...process.env, AGENT_CONFIG: JSON.stringify(config) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => {
      try {
        res({ exit_code: code, ...JSON.parse(out.trim().split('\n').at(-1)) });
      } catch {
        rej(new Error(`agent ${config.session} produced no report (exit ${code}): ${err}`));
      }
    });
  });
}

async function register(base, label) {
  const r = await fetch(`${base}/principals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'human', label }) });
  return (await r.json()).token;
}

/**
 * @param fault  undefined | 'misreport' | 'wrong-node' — applied to Agent A only
 */
export async function runHandoff({ fault, acsp, purlBase, runId = 'run' }) {
  const S = { owner: 'session-owner', a: 'session-a', b: 'session-b' };
  const owner = new AcspSession(acsp, { session_id: S.owner, kind: 'human', keyPrefix: `${S.owner}-${runId}` });
  const port = new HttpPort(purlBase, await register(purlBase, 'owner'));
  const composer = new Composer(port);

  // PURL: the operands.
  const A = await composer.literal('0');
  const B = await composer.literal('1');
  const spec = {
    schema: TASK_SCHEMA,
    purl_instance: `${purlBase}/.well-known/purl`,
    inputs: { A: port.href(A.id), B: port.href(B.id) },
    steps: [
      { id: 'C', operation: 'XOR', operands: ['A', 'B'] },
      { id: 'D', operation: 'XOR', operands: ['C', 'B'] },
    ],
  };

  // ACSP: the envelope.
  const created = await owner.op(null, 'create', { title: `Computational task (${runId}): C = XOR(A,B); D = XOR(C,B)`, focus: 'Evaluate the steps on PURL; verify every earlier result before continuing.' });
  const rid = created.body.resource_id;
  await owner.op(rid, 'append', { type: 'task', title: 'Evaluate the PURL computation steps', content: JSON.stringify(spec), refs: Object.values(spec.inputs).map((url) => ({ url })) });
  const scopes = ['append', 'annotate', 'checkpoint', 'handoff'];
  const capA = (await owner.op(rid, 'delegate', { to: { session_id: S.a, agent_id: 'agent-a' }, scopes, label: 'step C' })).body.result.capability;
  await owner.op(rid, 'handoff', { tok_id: 'TOK-001', to: { session_id: S.a }, note: JSON.stringify({ perform: ['C'] }) });
  const resourceUrl = `${acsp}/r/${rid}`;

  const reportA = await runAgentProcess({ acspResource: resourceUrl, capability: capA.token, session: S.a, agent: 'agent-a', next: S.b, fault, runId, impersonate: S.owner });
  const capB = (await owner.op(rid, 'delegate', { to: { session_id: S.b, agent_id: 'agent-b' }, scopes, label: 'step D' })).body.result.capability;
  const reportB = await runAgentProcess({ acspResource: resourceUrl, capability: capB.token, session: S.b, agent: 'agent-b', next: S.owner, runId, impersonate: S.a });

  // The owner takes the task back and checks everything itself.
  let doc = await owner.document(rid);
  const back = doc.handoffs.find((h) => h.status === 'pending' && h.to.session_id === S.owner);
  const ack = back ? await owner.op(rid, 'acknowledge', { handoff_id: back.id, decision: 'accept' }) : null;
  doc = await owner.document(rid);
  const events = (await owner.get(`/r/${rid}/events`, rid)).body.events;
  const checkpoints = [];
  for (const c of doc.checkpoints) {
    const { snapshot, ...v } = await owner.verifyCheckpoint(rid, c.number);
    checkpoints.push(v);
  }
  const results = doc.knowledge.items.filter((k) => tokJson(k)?.schema === 'purl.compute.result/0.1');
  const finalChecks = [];
  for (const k of results) {
    const claim = tokJson(k);
    const id = claim.purl.resource;
    const v = await composer.verify(id, { version: claim.purl.version });
    const at = await port.at(id, claim.purl.version);
    finalChecks.push({ tok: k.id, step: claim.step, source: k.source.session_id, claimed: claim.value, purl_value: at.record.state.value, cone_valid: v.valid, claim_matches: claim.value === at.record.state.value, annotations: k.annotations.map((a) => ({ kind: a.kind, by: a.source.session_id, assurance: a.source.identity_assurance })) });
  }
  const bySession = (s) => events.filter((e) => e.actor.session_id === s);
  return {
    run: runId,
    fault: fault ?? null,
    acsp_resource: resourceUrl,
    purl_instance: purlBase,
    literals: { A: spec.inputs.A, B: spec.inputs.B },
    agents: { A: reportA, B: reportB },
    owner: {
      final_acknowledge: ack ? { status: ack.status, handoff: back.id } : null,
      ownership: doc.ownership.owner,
      task_responsible: doc.authority.task_responsibility.map((t) => ({ tok: t.tok_id, responsible: t.responsible_session_id })),
      checkpoints,
      results: finalChecks,
      events: { total: events.length, by_session: Object.fromEntries(Object.values(S).map((s) => [s, bySession(s).length])), assurance_by_session: Object.fromEntries(Object.values(S).map((s) => [s, [...new Set(bySession(s).map((e) => e.identity_assurance))]])), operations: events.map((e) => `${e.version}:${e.operation}:${e.actor.session_id}`) },
    },
  };
}

/** Full experiment: an honest run and the two fault-injected controls. */
export async function handoffExperiment({ acspDir } = {}) {
  const acsp = await startAcsp(acspDir);
  const server = createPurlServer({ store: new Store() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const purlBase = `http://127.0.0.1:${server.address().port}`;
  try {
    const runs = [];
    for (const [runId, fault] of [['honest', undefined], ['fault-misreport', 'misreport'], ['fault-wrong-node', 'wrong-node']]) runs.push(await runHandoff({ fault, acsp: acsp.base, purlBase, runId }));
    return runs;
  } finally {
    server.closeAllConnections();
    server.close();
    await acsp.stop();
  }
}

/** Normalise the handoff runs to their deterministic outcomes (no ids, ports, times). */
export function handoffOutcomes(runs) {
  return runs.map((r) => ({
    run: r.run,
    fault: r.fault,
    agents: Object.fromEntries(Object.entries(r.agents).map(([k, a]) => [k, a.error ? { error: a.error } : {
      separate_process: typeof a.pid === 'number',
      acknowledge_status: a.log.find((l) => l.step === 'acknowledge')?.status,
      viewer_scopes: a.log.find((l) => l.step === 'discover')?.viewer.scopes,
      viewer_is_owner: a.log.find((l) => l.step === 'discover')?.viewer.is_owner,
      checkpoints_recomputed: a.checkpoints.map((c) => c.ok),
      verifications: a.verifications.map((v) => ({ step: v.step, source: v.source, ok: v.ok, checks: v.checks })),
      verified: a.verified,
      performed: a.performed.map((p) => ({ step: p.step, value: p.value, status: p.status })),
      handoff_status: a.log.find((l) => l.step === 'handoff')?.status,
      impersonation: (({ status, code, as }) => ({ as, status, code }))(a.log.find((l) => l.step === 'impersonation-attempt')),
    }])),
    owner: {
      final_acknowledge: r.owner.final_acknowledge?.status ?? null,
      owner_session: r.owner.ownership.session_id,
      task_responsible_at_end: r.owner.task_responsible,
      checkpoints_recomputed: r.owner.checkpoints.map((c) => c.ok),
      results: r.owner.results.map(({ tok, ...x }) => x),
      events_by_session: r.owner.events.by_session,
      assurance_by_session: r.owner.events.assurance_by_session,
    },
  }));
}
