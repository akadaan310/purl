import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPurlServer } from '../src/transport/server.js';
import { Store } from '../src/continuity/store.js';
import { loadProtocolSchemas } from '../src/core/schema.js';

const schemas = loadProtocolSchemas();
let server, base;

before(async () => {
  server = createPurlServer({ store: new Store() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const J = { Accept: 'application/purl+json' };
async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { ...J, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, headers: res.headers, json, text };
}
const register = async (label) => (await call('POST', '/principals', { body: { kind: 'agent', label } })).json;

test('instance manifest validates and describes the protocol', async () => {
  const r = await call('GET', '/.well-known/purl');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/purl\+json/);
  assert.deepEqual(schemas.validate('urn:purl:schema:instance-manifest', r.json), []);
  assert.equal(r.json.vocabulary.invariants.length, 10);
  const handoff = r.json.vocabulary.operations.find((o) => o.name === 'handoff');
  assert.equal(handoff.classification, 'composition');
  assert.deepEqual(handoff.composed_of, ['append', 'grant?', 'assign']);
});

test('the protocol describes itself as a public PURL resource', async () => {
  const r = await call('GET', '/r/purl-protocol');
  assert.equal(r.status, 200);
  assert.equal(r.json.kind, 'resource');
  assert.equal(r.json.type, 'protocol');
  assert.ok(r.json.state.description.operations.length > 20);
  const m = await call('GET', '/r/purl-protocol/manifest');
  assert.equal(m.json.operations.find((o) => o.name === 'update').available, false);
});

test('GET is safe: ?action=<mutation> and GET on an operation URL never mutate (I4)', async () => {
  const a = await register('A');
  const c = await call('POST', '/r', { token: a.token, body: { type: 'note', public: 'reader' } });
  const id = c.json.resource.id;
  const g1 = await call('GET', `/r/${id}?action=update`, { token: a.token });
  assert.equal(g1.status, 405);
  assert.equal(g1.headers.get('allow'), 'POST');
  assert.equal(g1.json.operation.name, 'update');
  const g2 = await call('GET', `/r/${id}/ops/handoff`, { token: a.token });
  assert.equal(g2.status, 405);
  const s = await call('GET', `/r/${id}/status`);
  assert.equal(s.json.version, 2, 'still genesis + public grant');
  const alias = await call('GET', `/r/${id}?action=manifest`);
  assert.equal(alias.status, 303);
  assert.equal(alias.headers.get('location'), `/r/${id}/manifest`);
});

test('credentials in the URL are rejected; mutations need JSON and a token', async () => {
  const a = await register('A');
  const r = await call('GET', `/r/purl-protocol?access_token=${a.token}`);
  assert.equal(r.status, 400);
  assert.equal(r.json.type, 'urn:purl:problem:token-in-url');
  const noAuth = await call('POST', '/r', { body: { type: 'x' } });
  assert.equal(noAuth.status, 401);
  assert.match(noAuth.headers.get('www-authenticate'), /Bearer/);
  const form = await fetch(`${base}/r`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'type=x' });
  assert.equal(form.status, 415);
});

test('content negotiation: HTML embeds the machine document and links to the manifest', async () => {
  const a = await register('A');
  const id = (await call('POST', '/r', { token: a.token, body: { type: 'note', public: 'reader', state: { t: '<script>alert(1)</script>' } } })).json.resource.id;
  const res = await fetch(`${base}/r/${id}`, { headers: { Accept: 'text/html' } });
  const html = await res.text();
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(res.headers.get('link'), /rel="describedby"/);
  assert.ok(html.includes(`<link rel="describedby" type="application/purl+json" href="/r/${id}/manifest">`));
  const embedded = /<script type="application\/purl\+json" id="purl-document">(.*?)<\/script>/s.exec(html)[1];
  assert.equal(JSON.parse(embedded).resource.id, id);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'content is escaped');
  const j = await fetch(`${base}/r/${id}`, { headers: { Accept: '*/*' } });
  assert.match(j.headers.get('content-type'), /application\/purl\+json/, 'agents sending */* get JSON');
});

test('resource manifest validates, is evaluated for the requester, and hides private resources', async () => {
  const a = await register('A');
  const b = await register('B');
  const id = (await call('POST', '/r', { token: a.token, body: { type: 'note' } })).json.resource.id;
  const ma = await call('GET', `/r/${id}/manifest`, { token: a.token });
  assert.deepEqual(schemas.validate('urn:purl:schema:resource-manifest', ma.json), []);
  assert.equal(ma.json.operations.find((o) => o.name === 'transfer').available, true);
  assert.equal((await call('GET', `/r/${id}/manifest`, { token: b.token })).status, 404);
  assert.equal((await call('GET', `/r/${id}`)).status, 404);
});

test('invoke over HTTP: expected_version, If-Match, idempotency, problem details', async () => {
  const a = await register('A');
  const id = (await call('POST', '/r', { token: a.token, body: { type: 'note' } })).json.resource.id;
  const ok = await call('POST', `/r/${id}/ops/update`, { token: a.token, body: { expected_version: 1, input: { merge_patch: { x: 1 } } } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.kind, 'operation-result');
  assert.equal(ok.headers.get('etag'), '"2"');
  const stale = await call('POST', `/r/${id}/ops/update`, { token: a.token, body: { expected_version: 1, input: { merge_patch: { x: 2 } } } });
  assert.equal(stale.status, 409);
  assert.match(stale.headers.get('content-type'), /application\/problem\+json/);
  assert.equal(stale.json.current_version, 2);
  const im = await call('POST', `/r/${id}/ops/update`, { token: a.token, headers: { 'If-Match': '"2"' }, body: { input: { merge_patch: { x: 3 } } } });
  assert.equal(im.status, 200);
  const bad = await call('POST', `/r/${id}/ops/update`, { token: a.token, body: { expected_version: 3, input: { merge_patch: 'nope' } } });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.errors.length);
  const unknown = await call('POST', `/r/${id}/ops/rm_rf`, { token: a.token, body: { expected_version: 3, input: {} } });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.json.type, 'urn:purl:problem:unknown-operation');
  const k1 = await call('POST', `/r/${id}/ops/append`, { token: a.token, headers: { 'Idempotency-Key': 'abc' }, body: { expected_version: 3, input: { collection: 'notes', body: 'n' } } });
  const k2 = await call('POST', `/r/${id}/ops/append`, { token: a.token, headers: { 'Idempotency-Key': 'abc' }, body: { expected_version: 3, input: { collection: 'notes', body: 'n' } } });
  assert.equal(k2.json.idempotent_replay, true);
  assert.equal(k1.json.resource.version, k2.json.resource.version);
});

test('projections: events (observer sees headers only), state?at, diff, verify, lineage, transitions', async () => {
  const a = await register('A');
  const b = await register('B');
  const id = (await call('POST', '/r', { token: a.token, body: { type: 'note', state: { v: 1 } } })).json.resource.id;
  await call('POST', `/r/${id}/ops/grant`, { token: a.token, body: { expected_version: 1, input: { grantee: b.principal.id, rights: 'observer' } } });
  await call('POST', `/r/${id}/ops/update`, { token: a.token, body: { expected_version: 2, input: { merge_patch: { v: 2 } } } });
  const eb = await call('GET', `/r/${id}/events`, { token: b.token });
  assert.equal(eb.json.events[0].payload, null);
  assert.equal(eb.json.events[0].payload_redacted, true);
  const ea = await call('GET', `/r/${id}/events?since=1`, { token: a.token });
  assert.equal(ea.json.events.length, 2);
  for (const e of ea.json.events) assert.deepEqual(schemas.validate('urn:purl:schema:event', e), []);
  assert.equal((await call('GET', `/r/${id}/state?at=1`, { token: b.token })).status, 403);
  assert.deepEqual((await call('GET', `/r/${id}/state?at=1`, { token: a.token })).json.state.state, { v: 1 });
  const d = await call('GET', `/r/${id}/diff?from=2&to=3`, { token: a.token });
  assert.ok(d.json.changes.some((c) => c.path === '/state/v' && c.value === 2));
  assert.equal((await call('GET', `/r/${id}/verify`, { token: b.token })).json.valid, true);
  const t = await call('GET', `/r/${id}/transitions`, { token: b.token });
  assert.equal(t.json.category, 'transformation');
  assert.deepEqual(t.json.sequence.symbols, [0, 3, 1]);
  const doc = await call('GET', `/r/${id}`, { token: b.token });
  assert.deepEqual(doc.json.redacted, ['state', 'collections', 'grants', 'relations']);
});

test('subscribe: SSE stream delivers new events', async () => {
  const a = await register('A');
  const id = (await call('POST', '/r', { token: a.token, body: { type: 'note' } })).json.resource.id;
  const ctrl = new AbortController();
  const res = await fetch(`${base}/r/${id}/events?since=1`, { headers: { Accept: 'text/event-stream', Authorization: `Bearer ${a.token}` }, signal: ctrl.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  await call('POST', `/r/${id}/ops/update`, { token: a.token, body: { expected_version: 1, input: { merge_patch: { live: true } } } });
  let buf = '';
  while (!/data: .*\n\n/.test(buf)) buf += new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  assert.match(buf, /^: PURL\/0\.1 event stream/);
  assert.match(buf, /\nid: 2\nevent: purl-event\ndata: /);
});

test('unknown routes and schemas are problems; schemas are served', async () => {
  assert.equal((await call('GET', '/nope')).status, 404);
  const s = await call('GET', '/schemas/event');
  assert.equal(s.json.$id, 'urn:purl:schema:event');
  const h = await fetch(`${base}/nope`, { headers: { Accept: 'text/html' } });
  assert.match(await h.text(), /<h1>No such resource/);
});
