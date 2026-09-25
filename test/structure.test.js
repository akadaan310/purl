import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStore } from './helpers.js';
import { collectionsView } from '../src/continuity/views.js';
import { threeWayMerge, diff } from '../src/continuity/diff.js';

test('fork preserves lineage, copies no authority, and leaves the source untouched (I9)', () => {
  const { store, invoke, A, B } = makeStore();
  const id = store.create(A, { type: 'x', state: { a: 1 } }).resource.id;
  invoke(A, id, 'append', { collection: 'findings', body: 'f1' });
  invoke(A, id, 'grant', { grantee: B.id, rights: 'reader' });
  const before = store.verify(id).head;
  const f = invoke(B, id, 'fork', { note: 'try another approach' }).resource;
  assert.equal(store.verify(id).head, before, 'source log unchanged');
  assert.equal(f.owner, B.id);
  assert.deepEqual(f.grants, {});
  assert.deepEqual(f.derived_from, { resource: id, version: 3, state_hash: store.events(id)[2].state_after });
  assert.equal(f.collections.findings[0].origin.resource, id);
  assert.equal(f.collections.findings[0].author, A.id, 'authorship survives the fork');
  assert.deepEqual(store.childrenOf(id), [f.id]);
  assert.equal(store.events(f.id)[0].payload.fork_authority.via, 'grant');
  // A has no authority over B's fork merely because A owns the source.
  assert.throws(() => store.require(f.id, A, 'observe'), (e) => e.status === 404);
});

test('supersede keeps the original (I10)', () => {
  const { store, invoke, A } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  const f1 = invoke(A, id, 'append', { collection: 'findings', body: { claim: 'period is 4' } }).result.entry;
  const f2 = invoke(A, id, 'supersede', { collection: 'findings', supersedes: f1, body: { claim: 'period is 8; 4 was an aliasing artefact' } }).result.entry;
  const view = collectionsView(store.get(id)).findings;
  assert.equal(view.length, 2);
  assert.deepEqual(view[0].body, { claim: 'period is 4' });
  assert.deepEqual(view[0].superseded_by, [f2]);
  assert.equal(view[0].current, false);
  assert.equal(view[1].supersedes, f1);
  assert.throws(() => invoke(A, id, 'supersede', { collection: 'findings', supersedes: 'n_999999', body: 1 }), /no entry/);
});

test('linking to a resource grants nothing and does not mutate the target (I2)', () => {
  const { store, invoke, A, B } = makeStore();
  const target = store.create(A, { type: 'x', public: 'observer' }).resource.id;
  const mine = store.create(B, { type: 'x' }).resource.id;
  const head = store.verify(target).head;
  invoke(B, mine, 'link', { rel: 'supersedes', target, note: 'B claims to supersede A' });
  assert.equal(store.verify(target).head, head);
  assert.throws(() => store.require(target, B, 'read'), (e) => e.status === 403);
  assert.deepEqual(store.inboundRelations(target).map((r) => [r.from, r.rel, r.declared_by]), [[mine, 'supersedes', B.id]]);
  // Cannot link to what you cannot observe (no existence probing).
  const hidden = store.create(A, { type: 'x' }).resource.id;
  assert.throws(() => invoke(B, mine, 'link', { rel: 'references', target: hidden }), (e) => e.status === 404);
});

test('merge: three-way over state, union over entries, provenance kept, conflicts explicit', () => {
  const { store, invoke, A } = makeStore();
  const id = store.create(A, { type: 'x', state: { shared: 1, mine: 'a', theirs: 'a' } }).resource.id;
  invoke(A, id, 'append', { collection: 'findings', body: 'base' });
  const fork = invoke(A, id, 'fork', {}).resource.id;
  invoke(A, fork, 'update', { merge_patch: { theirs: 'b', shared: 2 } });
  const fe = invoke(A, fork, 'append', { collection: 'findings', body: 'from fork' }).result.entry;
  invoke(A, id, 'update', { merge_patch: { mine: 'b', shared: 3 } });

  assert.throws(() => invoke(A, id, 'merge', { source: fork }), (e) => e.type === 'merge-conflict' && e.extra.conflicts[0].path === '/shared');
  const r = invoke(A, id, 'merge', { source: fork, resolutions: { '/shared': 23 } });
  assert.deepEqual(store.get(id).state, { shared: 23, mine: 'b', theirs: 'b' });
  const merged = store.get(id).collections.findings.find((e) => e.id === fe);
  assert.equal(merged.origin.resource, fork);
  assert.deepEqual(r.events.map((e) => e.kind), ['patch', 'append', 'link']);
  assert.equal(store.get(id).relations.at(-1).rel, 'merged_from');
  assert.equal(store.get(fork).version, 3, 'source not modified by merge');
});

test('merge requires a recorded fork relationship', () => {
  const { store, invoke, A } = makeStore();
  const a = store.create(A, { type: 'x' }).resource.id;
  const b = store.create(A, { type: 'x' }).resource.id;
  assert.throws(() => invoke(A, a, 'merge', { source: b }), /direct fork relationship/);
});

test('threeWayMerge and diff unit cases', () => {
  const m = threeWayMerge({ a: 1, n: { x: 1 } }, { a: 1, n: { x: 1 }, o: 1 }, { n: { x: 2 } });
  assert.deepEqual(m.conflicts, []);
  assert.deepEqual(m.mergePatch, { a: null, n: { x: 2 } });
  assert.deepEqual(diff({ a: 1, b: { c: 2 } }, { b: { c: 3 }, d: 4 }), [
    { op: 'remove', path: '/a', old: 1 },
    { op: 'replace', path: '/b/c', old: 2, value: 3 },
    { op: 'add', path: '/d', value: 4 },
  ]);
});

test('append with a client-chosen entry id is idempotent; entries are immutable', () => {
  const { store, invoke, A } = makeStore();
  const id = store.create(A, { type: 'x' }).resource.id;
  invoke(A, id, 'append', { collection: 'notes', id: 'n_CLIENT01', body: { v: 1 } });
  const again = invoke(A, id, 'append', { collection: 'notes', id: 'n_CLIENT01', body: { v: 1 } });
  assert.deepEqual(again.events, []);
  assert.throws(() => invoke(A, id, 'append', { collection: 'notes', id: 'n_CLIENT01', body: { v: 2 } }), /immutable/);
  assert.throws(() => invoke(A, id, 'append', { collection: 'checkpoints', body: {} }), /written only by its own operation/);
});
