// Differential test (EXP-R9 participant finding): the origin of ACSP events sets an observation's
// epistemic status (harness -> SIMULATED, service -> UNRESOLVED). It is a fact configured by the
// operator; before, any participant could declare ?origin=service and relabel harness events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCircle } from '../src/circle/server.js';

test('a participant cannot declare the origin of the configured ACSP', async () => {
  const circle = createCircle({ purlBase: 'http://127.0.0.1:9', substrateBase: 'http://127.0.0.1:9', acspBase: 'http://127.0.0.1:9', acspOrigin: 'harness' });
  const r = await circle.handle('POST', '/acsp/r/Z5YMYNF8NQ34/observe?session=origin-test&origin=service', null);
  assert.equal(r.status, 422);
  assert.equal(r.doc.error.code, 'origin_mismatch');
  assert.equal(r.doc.error.configured_origin, 'harness');
});
