// Differential test (STASIS-3 phase 7 finding): a PURL limit reached through the circle.
// Before: writes became 502 purl_refused, losing the limit and its retry_after (and list
// reads substituted an empty list on any PURL error). After: 429 purl_limited with retry_after_seconds (K-10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPurlServer } from '../src/transport/server.js';
import { RateLimiter } from '../src/transport/http.js';
import { Store } from '../src/continuity/store.js';
import { createCircle } from '../src/circle/server.js';

test('a PURL rate limit is reported as a limit, never as an empty result', async () => {
  const server = createPurlServer({ store: new Store(), limiter: new RateLimiter({ capacity: 3, refillPerSecond: 0.001 }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const purlBase = `http://127.0.0.1:${server.address().port}`;
  try {
    const circle = createCircle({ purlBase, substrateBase: 'http://127.0.0.1:9', acspBase: 'http://127.0.0.1:9' });
    let last;
    // PURL limits writes (per principal); a checkpoint is one PURL create
    for (let i = 0; i < 8; i++) { last = await circle.handle('POST', '/checkpoints?session=limit-test', { next: 'probe' }); if (last.status >= 400) break; }
    assert.equal(last.status, 429, `expected 429 once the bucket is empty, got ${last.status}`);
    assert.equal(last.doc.error.code, 'purl_limited');
    assert.ok(last.doc.error.retry_after_seconds > 0);
  } finally { server.close(); }
});
