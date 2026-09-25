import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStore, pkg } from './helpers.js';
import { replay, apply, mergePatch } from '../src/continuity/reducer.js';
import { stateHash } from '../src/continuity/store.js';
import { buildProfile, measure, DISCLAIMER } from '../src/continuity/profile.js';
import { loadProtocolSchemas } from '../src/core/schema.js';

const schemas = loadProtocolSchemas();

test('replay reconstructs every version and matches recorded state hashes', () => {
  const { store, invoke, A } = makeStore();
  const id = store.create(A, { type: 'note', state: { a: 1 } }).resource.id;
  invoke(A, id, 'update', { merge_patch: { b: { c: 2 } } });
  invoke(A, id, 'append', { collection: 'findings', body: 'f1' });
  invoke(A, id, 'update', { merge_patch: { a: null } });
  const events = store.events(id);
  for (const e of events) {
    const s = replay(events, e.version);
    assert.equal(s.version, e.version);
    assert.equal(stateHash(s), e.state_after);
  }
  assert.deepEqual(store.get(id).state, { b: { c: 2 } });
  assert.deepEqual(store.stateAt(id, 2).state, { a: 1, b: { c: 2 } });
  assert.equal(store.verify(id).valid, true);
});

test('every event and resource state validates against the published schemas', () => {
  const { store, invoke, A, B } = makeStore();
  const id = store.create(A, { type: 'note', public: 'reader' }).resource.id;
  invoke(A, id, 'handoff', { to: B.id, package: pkg(), grant: { rights: 'contributor', purpose: 'p' } });
  invoke(B, id, 'append', { collection: 'findings', body: { x: 1 } });
  invoke(A, id, 'complete', { reason: 'done' });
  for (const e of store.events(id)) assert.deepEqual(schemas.validate('urn:purl:schema:event', e), [], `event v${e.version}`);
  assert.deepEqual(schemas.validate('urn:purl:schema:resource', store.get(id)), []);
});

test('tampering with an event is detected by verify', () => {
  const { store, invoke, A } = makeStore();
  const id = store.create(A, { type: 'note' }).resource.id;
  invoke(A, id, 'update', { merge_patch: { a: 1 } });
  store.events(id)[1].payload.merge_patch.a = 2; // events() returns the stored objects
  const v = store.verify(id);
  assert.equal(v.valid, false);
  assert.ok(v.problems.some((p) => p.problem === 'event hash mismatch'));
});

test('handoff does not change identity or ownership (I1, I5)', () => {
  const { store, invoke, A, B } = makeStore();
  const id = store.create(A, { type: 'research-session' }).resource.id;
  const r = invoke(A, id, 'handoff', { to: B.id, package: pkg({ open_questions: ['q1'] }), grant: { rights: 'contributor', purpose: 'continue' } });
  assert.deepEqual(r.events.map((e) => e.kind), ['append', 'grant', 'assign']);
  assert.equal(new Set(r.events.map((e) => e.invocation)).size, 1, 'one invocation');
  const s = store.get(id);
  assert.equal(s.owner, A.id);
  assert.equal(s.assignee, B.id);
  const cp = s.collections.checkpoints[0].body;
  assert.equal(cp.for, B.id);
  assert.equal(cp.prepared_by, A.id);
  assert.equal(cp.checkpoint.version, 1);
  assert.equal(cp.checkpoint.state_hash, store.events(id)[0].state_after, 'checkpoint binds the verified pre-handoff state');
  assert.notEqual(A.id, B.id);
});

test('handoff is atomic: a failing component aborts every event', () => {
  const { store, invoke, A } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  assert.throws(() => invoke(A, id, 'handoff', { to: 'p_999999', package: pkg() }), /no principal/);
  assert.equal(store.get(id).version, 1);
});

test('expected_version is required and enforced (optimistic concurrency, replay defence)', () => {
  const { store, A } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  const body = { expected_version: 1, input: { merge_patch: { a: 1 } } };
  store.invoke(A, id, 'update', body);
  assert.throws(() => store.invoke(A, id, 'update', body), (e) => e.status === 409 && e.extra.current_version === 2);
  assert.throws(() => store.invoke(A, id, 'update', { input: {} }), (e) => e.status === 400);
});

test('Idempotency-Key returns the original result and rejects a different body', () => {
  const { store, A } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  const body = { expected_version: 1, input: { collection: 'notes', body: 'n' } };
  const first = store.invoke(A, id, 'append', body, { idempotencyKey: 'k1' });
  const again = store.invoke(A, id, 'append', body, { idempotencyKey: 'k1' });
  assert.equal(again.idempotent_replay, true);
  assert.equal(again.result.entry, first.result.entry);
  assert.equal(store.get(id).version, 2);
  assert.throws(() => store.invoke(A, id, 'append', { ...body, input: { collection: 'notes', body: 'other' } }, { idempotencyKey: 'k1' }), /reused/);
});

test('lifecycle state machine gates operations; revoke is always available', () => {
  const { store, invoke, A, B } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  const g = invoke(A, id, 'grant', { grantee: B.id, rights: 'reader' }).result.grant;
  invoke(A, id, 'complete', {});
  assert.throws(() => invoke(A, id, 'update', { merge_patch: { a: 1 } }), (e) => e.type === 'lifecycle-conflict');
  invoke(A, id, 'annotate', { about: '/', body: 'post-mortem note' });
  invoke(A, id, 'archive', {});
  assert.throws(() => invoke(A, id, 'annotate', { about: '/', body: 'x' }), (e) => e.type === 'lifecycle-conflict');
  invoke(A, id, 'revoke', { grant: g });
  invoke(A, id, 'restore', {});
  assert.equal(store.get(id).lifecycle.status, 'completed', 'restore returns to pre-archive status');
  invoke(A, id, 'reopen', {});
  assert.equal(store.get(id).lifecycle.status, 'active');
});

test('checkpoint packages are validated; server-verified facts are kept apart from claims', () => {
  const { store, invoke, A } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  assert.throws(() => invoke(A, id, 'checkpoint', { package: { task: 't' } }), (e) => e.status === 422);
  const profile = buildProfile({ declared: { technical_density: 'high', response_compression: 'terse' }, sample: 'Short. Precise.\n\n- one\n- two' });
  invoke(A, id, 'checkpoint', { package: pkg({ profile }), label: 'before refactor' });
  const body = store.get(id).collections.checkpoints[0].body;
  assert.deepEqual(Object.keys(body).sort(), ['checkpoint', 'for', 'label', 'package', 'prepared_by']);
  assert.equal(body.package.profile.disclaimer, DISCLAIMER);
});

test('communication profile: declared vs measured is explicit and the disclaimer is mandatory', () => {
  const p = buildProfile({ sample: 'Is this terse? Yes. Very!\n\n## Heading\n- item' });
  assert.equal(p.source, 'measured');
  assert.equal(p.measured.question_ratio > 0, true);
  assert.deepEqual(schemas.validate('urn:purl:schema:communication-profile', p), []);
  const forged = { ...p, disclaimer: 'This profile transfers my mind.' };
  assert.notDeepEqual(schemas.validate('urn:purl:schema:communication-profile', forged), []);
  assert.equal(measure('').words, 0);
});

test('JSON Merge Patch follows RFC 7396 examples', () => {
  assert.deepEqual(mergePatch({ a: 'b' }, { a: 'c' }), { a: 'c' });
  assert.deepEqual(mergePatch({ a: 'b' }, { b: 'c' }), { a: 'b', b: 'c' });
  assert.deepEqual(mergePatch({ a: 'b' }, { a: null }), {});
  assert.deepEqual(mergePatch({ a: ['b'] }, { a: 'c' }), { a: 'c' });
  assert.deepEqual(mergePatch({ a: { b: 'c' } }, { a: { b: 'd', c: null } }), { a: { b: 'd' } });
  assert.deepEqual(mergePatch({ e: null }, { a: 1 }), { e: null, a: 1 });
});

test('reducer rejects non-genesis first events and out-of-order versions', () => {
  assert.throws(() => apply(null, { kind: 'patch', version: 1, payload: {} }), /genesis/);
  const { store, A } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  assert.throws(() => apply(store.get(id), { kind: 'patch', version: 5, payload: { merge_patch: {} } }), /does not follow/);
});

test('persistence: a reloaded store replays and verifies the log', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'purl-'));
  const a = makeStore({ dataDir: dir });
  const id = a.store.create(a.A, { type: 'x' }).resource.id;
  a.invoke(a.A, id, 'update', { merge_patch: { k: 'v' } });
  const { Store } = await import('../src/continuity/store.js');
  const b = new Store({ dataDir: dir });
  assert.deepEqual(b.get(id), a.store.get(id));
  assert.equal(b.authenticate('test-token-1').id, a.A.id);
});
