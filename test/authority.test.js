import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStore, pkg } from './helpers.js';

test('reader cannot mutate; observer cannot read content (I3)', () => {
  const { store, invoke, A, B, C } = makeStore();
  const id = store.create(A, { type: 'x', state: { secret: 1 } }).resource.id;
  invoke(A, id, 'grant', { grantee: B.id, rights: 'reader' });
  invoke(A, id, 'grant', { grantee: C.id, rights: 'observer' });
  for (const op of ['update', 'append', 'acknowledge']) {
    const input = op === 'update' ? { merge_patch: { a: 1 } } : op === 'append' ? { collection: 'notes', body: 1 } : {};
    assert.throws(() => invoke(B, id, op, input), (e) => e.status === 403, op);
  }
  assert.throws(() => store.require(id, C, 'read'), (e) => e.status === 403);
  assert.ok(store.require(id, B, 'read'));
});

test('no observe right → not found (existence is not leaked)', () => {
  const { store, invoke, A, B } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  assert.throws(() => invoke(B, id, 'update', { merge_patch: { a: 1 } }), (e) => e.status === 404);
  assert.throws(() => invoke(B, 'r_999999', 'update', { merge_patch: { a: 1 } }), (e) => e.status === 404);
  assert.deepEqual(store.list(B), []);
});

test('the §10 scenario: owner A, observer B, delegated operator C', () => {
  const { store, invoke, A, B, C } = makeStore();
  const id = store.create(A, { type: 'research-session' }).resource.id;
  invoke(A, id, 'grant', { grantee: B.id, rights: 'observer' });
  const g = invoke(A, id, 'delegate', { grantee: C.id, rights: 'operator', purpose: 'run the analysis', operations: ['update', 'append'] }).result.grant;

  // B does not become owner by being able to see the resource.
  assert.equal(store.get(id).owner, A.id);
  assert.throws(() => invoke(B, id, 'transfer', { to: B.id }), (e) => e.status === 403);

  // C can do what was delegated, and only that.
  invoke(C, id, 'update', { merge_patch: { progress: 0.5 } });
  assert.throws(() => invoke(C, id, 'assign', { assignee: C.id }), (e) => e.status === 403 && /no single authority source permits operation "assign"/.test(e.message));
  assert.throws(() => invoke(C, id, 'grant', { grantee: B.id, rights: 'reader' }), (e) => e.status === 403);
  assert.throws(() => invoke(C, id, 'close', {}), (e) => e.status === 403);
  assert.throws(() => invoke(C, id, 'transfer', { to: C.id }), (e) => e.status === 403);

  // Provenance of C's authority is on the event.
  const last = store.events(id).at(-1);
  assert.equal(last.actor, C.id);
  assert.deepEqual(last.authority, { via: 'grant', grant: g, chain: [g], rights: ['append', 'assign', 'link', 'observe', 'read', 'update'] });
});

test('delegation chain is recorded, attenuated, and revocation cascades (I8)', () => {
  const { store, invoke, A, B, C, D } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  const g1 = invoke(A, id, 'grant', { grantee: B.id, rights: ['observe', 'read', 'append', 'grant'], expires_at: '2027-01-01T00:00:00.000Z' }).result.grant;
  const g2 = invoke(B, id, 'delegate', { grantee: C.id, rights: ['observe', 'read', 'append'], purpose: 'sub-task' }).result.grant;
  const s = store.get(id);
  assert.equal(s.grants[g2].parent, g1);
  assert.equal(s.grants[g2].expires_at, '2027-01-01T00:00:00.000Z', 'child expiry clamped to parent');

  // Attenuation: B cannot give what B does not have.
  assert.throws(() => invoke(B, id, 'grant', { grantee: D.id, rights: ['update'] }), /attenuation/);
  // C (no grant right) cannot delegate at all.
  assert.throws(() => invoke(C, id, 'grant', { grantee: D.id, rights: ['read'] }), (e) => e.status === 403);

  invoke(C, id, 'append', { collection: 'notes', body: 'by C' });
  assert.deepEqual(store.events(id).at(-1).authority.chain, [g2, g1]);

  // Revoking B's grant removes C's authority too, without touching g2's record.
  invoke(A, id, 'revoke', { grant: g1, reason: 'task finished' });
  assert.throws(() => invoke(C, id, 'append', { collection: 'notes', body: 'x' }), (e) => e.status === 404);
  assert.equal(store.get(id).grants[g2].revoked, null);
});

test('grant holders may revoke only grants descending from their own', () => {
  const { store, invoke, A, B, C, D } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  invoke(A, id, 'grant', { grantee: B.id, rights: ['observe', 'grant', 'read'] });
  const gc = invoke(B, id, 'grant', { grantee: C.id, rights: ['observe'] }).result.grant;
  const gd = invoke(A, id, 'grant', { grantee: D.id, rights: ['observe'] }).result.grant;
  assert.throws(() => invoke(B, id, 'revoke', { grant: gd }), /descend/);
  invoke(B, id, 'revoke', { grant: gc });
});

test('grants expire', () => {
  const { store, invoke, clock, A, B } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  invoke(A, id, 'grant', { grantee: B.id, rights: 'reader', expires_at: new Date(Date.UTC(2026, 0, 1, 1)).toISOString() });
  assert.ok(store.require(id, B, 'read'));
  clock.advance(2 * 3600 * 1000);
  assert.throws(() => store.require(id, B, 'read'), (e) => e.status === 404);
});

test('public grants are limited to observe/read and apply to anonymous requesters', () => {
  const { store, invoke, A } = makeStore();
  const id = store.create(A, { type: 'x', public: 'reader' }).resource.id;
  assert.ok(store.require(id, null, 'read'));
  assert.throws(() => invoke(A, id, 'grant', { grantee: '*', rights: ['append'] }), /public grants/);
});

test('ownership transfer is owner-only and not delegable', () => {
  const { store, invoke, A, B } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  // No role or right list can include ownership: 'own' is not a grantable right.
  assert.throws(() => invoke(A, id, 'grant', { grantee: B.id, rights: ['own'] }), (e) => e.status === 422);
  invoke(A, id, 'transfer', { to: B.id });
  assert.equal(store.get(id).owner, B.id);
  assert.throws(() => invoke(A, id, 'update', { merge_patch: { a: 1 } }), (e) => e.status === 404, 'former owner holds nothing implicitly');
});

test('administrators can archive and revoke but cannot read or edit content', () => {
  const { store, invoke, A, B } = makeStore();
  const admin = store.registerPrincipal({ kind: 'human', label: 'admin', admin: true }).principal;
  const id = store.create(A, { type: 'x', state: { private: true } }).resource.id;
  const g = invoke(A, id, 'grant', { grantee: B.id, rights: 'reader' }).result.grant;
  assert.throws(() => store.require(id, admin, 'read'), (e) => e.status === 403);
  assert.throws(() => invoke(admin, id, 'update', { merge_patch: { a: 1 } }), (e) => e.status === 403);
  assert.throws(() => invoke(admin, id, 'grant', { grantee: B.id, rights: ['observe'] }), (e) => e.status === 403);
  invoke(admin, id, 'revoke', { grant: g, reason: 'abuse report' });
  invoke(admin, id, 'archive', { reason: 'moderation' });
  assert.equal(store.events(id).at(-1).authority.via, 'admin');
});

test('forward is available only to the current assignee', () => {
  const { store, invoke, A, B, C } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  invoke(A, id, 'handoff', { to: B.id, package: pkg(), grant: { rights: ['observe', 'read', 'append', 'assign', 'grant'] } });
  assert.throws(() => invoke(A, id, 'forward', { to: C.id, package: pkg() }), /current assignee/);
  const r = invoke(B, id, 'forward', { to: C.id, package: pkg(), grant: { rights: 'contributor' } });
  const g = store.get(id).grants[r.result.grant];
  assert.notEqual(g.parent, null, "C's grant descends from B's");
  assert.equal(store.get(id).assignee, C.id);
  assert.equal(store.get(id).owner, A.id);
});
