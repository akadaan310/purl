// Differential test (STASIS-3 phase 7 finding, EXP-PROGRAM-MODEL-1 record-3): when ACSP refuses a
// submitted proposal (here 429 rate_limited), the circle recorded the TALK as stage 'prepared'.
// A submission that was attempted and refused is 'refused' (K-08: prepared ≠ submitted).
// Needs ../substrateIO (COMMIT types the program); ACSP is a stub that refuses every submission.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCircle } from '../scripts/circle-lib.js';
import { RateLimiter } from '../src/transport/http.js';

const SUB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'substrateIO');
const RID = 'Z5YMYNF8NQ34';

test('a refused ACSP submission is recorded as refused, not prepared', { skip: existsSync(SUB) ? false : 'needs ../substrateIO' }, async () => {
  const stub = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (req.method === 'GET' && u.pathname === `/r/${RID}` && u.searchParams.get('action') === 'prepare_propose') {
      return json(200, { validation: { valid: true }, request: { operation: 'propose', payload: {} }, execution: { method: 'POST', href: `/r/${RID}/operations` } });
    }
    if (req.method === 'POST' && u.pathname === `/r/${RID}/operations`) return json(429, { error: { code: 'rate_limited', message: 'stub: too many requests' } });
    if (u.pathname === '/.well-known/acsp') return json(200, { protocol: 'ACSP/0.1' });
    return json(404, { error: { code: 'not_found' } });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const c = await startCircle({ substrateDir: SUB, substratePort: 42165, acspBase: `http://127.0.0.1:${stub.address().port}`, purlDataDir: mkdtempSync(join(tmpdir(), 'talk-ref-')) });
  try {
    const r = await fetch(`${c.base}/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/TALK/acsp/${RID}?session=talk-refused-test`, { method: 'POST' });
    const doc = await r.json();
    const talk = doc.steps?.find((s) => s.verb === 'TALK');
    assert.ok(talk, JSON.stringify(doc).slice(0, 400));
    assert.equal(talk.stage, 'refused');
    assert.equal(talk.refusal?.status, 429);
    assert.equal(talk.refusal?.code, 'rate_limited');
  } finally { await c.close(); stub.close(); }
});

// EXP-PROGRAM-MODEL-1 record-4: a POST that fails mid-program (PURL limit after ACSP accepted the
// proposal) answered with a bare error, so the participant could not see that a scroll was committed
// and a proposal submitted; resending duplicated both. Now the error lists what was performed.
test('a multi-step POST that fails part-way reports the steps and effects already performed', { skip: existsSync(SUB) ? false : 'needs ../substrateIO' }, async () => {
  const stub = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (req.method === 'GET' && u.searchParams.get('action') === 'prepare_propose') return json(200, { validation: { valid: true }, request: { operation: 'propose', payload: {} }, execution: { method: 'POST', href: `/r/${RID}/operations` } });
    if (req.method === 'POST' && u.pathname === `/r/${RID}/operations`) return json(200, { result: { proposal: { id: 'P-001' } } });
    if (u.pathname.endsWith('/events')) return json(200, { events: [] });
    return json(200, { protocol: 'ACSP/0.1' });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const outcomes = [];
  try {
    for (const capacity of [1, 2, 3, 4]) {
      const c = await startCircle({ substrateDir: SUB, substratePort: 42265 + capacity, acspBase: `http://127.0.0.1:${stub.address().port}`, purlDataDir: mkdtempSync(join(tmpdir(), 'talk-partial-')),
        purlLimiter: new RateLimiter({ capacity, refillPerSecond: 0.0001 }) });
      try {
        const r = await fetch(`${c.base}/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/TALK/acsp/${RID}?session=partial-test`, { method: 'POST' });
        const doc = await r.json();
        outcomes.push({ capacity, status: r.status, error: doc.error ?? null });
      } finally { await c.close(); }
    }
  } finally { stub.close(); }
  const talkFail = outcomes.find((o) => o.error?.failed_step === 'TALK');
  assert.ok(talkFail, JSON.stringify(outcomes.map((o) => [o.capacity, o.status, o.error?.failed_step])));
  assert.equal(talkFail.status, 429);
  assert.equal(talkFail.error.partial, true);
  assert.deepEqual(talkFail.error.performed_steps.map((s) => s.verb), ['COMMIT']);
  assert.equal(talkFail.error.step_effects?.acsp?.stage, 'submitted');
  assert.match(talkFail.error.retry_note, /Do not resend/);
  for (const o of outcomes.filter((x) => x.error && x.error.failed_step === 'COMMIT')) assert.match(o.error.retry_note, /Nothing was performed/);
});

// EXP-PROGRAM-MODEL-1 post-hoc observation (records 2-8: TOK cites v3, scroll at v6 after TALK). The TOK
// cited the version written at COMMIT, which holds no build, while describing the build. (A first reading
// of this test looked at the wrong field and briefly 'refuted' the defect; recorded in PROGRAM-MODEL.md.)
test('a TOK cites a scroll version that contains the build it describes', { skip: existsSync(SUB) ? false : 'needs ../substrateIO' }, async () => {
  let tokContent = null;
  const stub = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (req.method === 'GET' && u.searchParams.get('action') === 'prepare_propose') {
      try { tokContent = JSON.parse(u.searchParams.get('payload')).payload.content; } catch { /* asserted below */ }
      return json(200, { validation: { valid: true }, request: { operation: 'propose', payload: {} }, execution: { method: 'POST', href: `/r/${RID}/operations` } });
    }
    if (req.method === 'POST' && u.pathname === `/r/${RID}/operations`) return json(200, { result: { proposal: { id: 'P-001' } } });
    if (u.pathname.endsWith('/events')) return json(200, { events: [] });
    return json(200, { protocol: 'ACSP/0.1' });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const c = await startCircle({ substrateDir: SUB, substratePort: 42365, acspBase: `http://127.0.0.1:${stub.address().port}`, purlDataDir: mkdtempSync(join(tmpdir(), 'talk-ver-')) });
  try {
    const r = await (await fetch(`${c.base}/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD/TALK/acsp/${RID}?session=talk-version-test`, { method: 'POST' })).json();
    const id = r.steps.find((s) => s.verb === 'COMMIT').scroll.id;
    assert.ok(tokContent, 'the stub received the TOK');
    const cited = Number(tokContent.match(/\(v(\d+)\)/)[1]);
    const at = await (await fetch(`${c.purlBase}/r/${id}/state?at=${cited}`)).json();
    const builds = at.state?.collections?.builds ?? [];
    assert.ok(builds.length > 0, `version ${cited} cited by the TOK holds no build`);
  } finally { await c.close(); stub.close(); }
});
