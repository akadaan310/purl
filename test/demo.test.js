import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPurlServer } from '../src/transport/server.js';
import { runDemo } from '../scripts/demo.js';

test('the §23 end-to-end demonstration runs over HTTP and every invariant holds', async () => {
  const server = createPurlServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const out = await runDemo(`http://127.0.0.1:${server.address().port}`, { print: () => {} });
    const facts = Object.fromEntries(out.steps.map((s) => [s.title, s.facts]));
    assert.equal(out.reconstruction_ok, true);
    assert.equal(facts['Agent A appends a finding (allowed) and attempts update (not delegated)'].update_status, 403);
    const b = facts['Agent B performs the delegated operation; escalation is refused'];
    assert.equal(b.transfer_status, 403);
    assert.equal(b.grant_status, 403);
    assert.equal(b.owner, out.principals.human);
    assert.equal(b.assignee, out.principals.B);
    assert.equal(b.authority_on_event.chain.length, 2, "B's authority chains back through A's grant");
    assert.equal(facts['Agent B forks the resource'].grants_copied, 0);
    assert.equal(facts['Agent A supersedes its first finding'].original_still_present, true);
    assert.equal(facts['Final verification'].owner_changed_ever, false);
  } finally {
    server.close();
  }
});
