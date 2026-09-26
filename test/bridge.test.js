// ACSP × PURL bridge, end to end: two agent processes, one ACSP instance (the
// sibling ACSP checkout's harness/serve.ts), one PURL instance. Skipped, with a
// reason, when the ACSP checkout is not available (set ACSP_DIR).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { acspAvailable, startAcsp, runHandoff, handoffOutcomes } from '../scripts/lib/handoff.js';
import { createPurlServer } from '../src/transport/server.js';
import { Store } from '../src/continuity/store.js';

const skip = acspAvailable() ? false : 'ACSP checkout with installed dependencies not found (ACSP_DIR)';

test('bridge: A computes, B independently verifies and continues, the owner gets it back', { skip, timeout: 120_000 }, async () => {
  const acsp = await startAcsp();
  const server = createPurlServer({ store: new Store() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const purlBase = `http://127.0.0.1:${server.address().port}`;
    const [honest, faulty] = [await runHandoff({ acsp: acsp.base, purlBase, runId: 't-honest' }), await runHandoff({ acsp: acsp.base, purlBase, runId: 't-fault', fault: 'wrong-node' })];
    const [h, f] = handoffOutcomes([honest, faulty]);
    assert.notEqual(honest.agents.A.pid, honest.agents.B.pid, 'separate processes');
    assert.equal(h.agents.A.viewer_is_owner, false);
    assert.equal(h.agents.B.verified, true);
    assert.deepEqual(h.agents.B.checkpoints_recomputed.every(Boolean), true, 'B re-derives every ACSP checkpoint hash with PURL\'s canonicaliser');
    assert.deepEqual(h.agents.A.performed.map((p) => [p.step, p.value]), [['C', '1']]);
    assert.deepEqual(h.agents.B.performed.map((p) => [p.step, p.value]), [['D', '0']]);
    assert.equal(h.agents.B.impersonation.status, 403);
    assert.equal(h.owner.owner_session, 'session-owner');
    assert.deepEqual(h.owner.assurance_by_session['session-b'], ['capability']);
    assert.ok(h.owner.results.every((r) => r.cone_valid && r.claim_matches));
    assert.deepEqual(h.owner.task_responsible_at_end, [{ tok: 'TOK-001', responsible: 'session-owner' }]);
    assert.equal(f.agents.B.verified, false, 'a wrong value in the PURL node is detected');
    assert.equal(f.agents.B.performed.length, 0, 'B does not build on an unverified result');
    assert.ok(f.owner.results[0].annotations.some((a) => a.kind === 'dispute' && a.by === 'session-b'));
  } finally {
    server.closeAllConnections();
    server.close();
    await acsp.stop();
  }
});
