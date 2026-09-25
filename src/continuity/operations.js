// The operation vocabulary. Every operation is classified as one of:
//
//   primitive    — emits exactly one primitive event of its own kind
//   composition  — emits a fixed pattern of several primitives, atomically
//   alias        — another operation under a different name, possibly with an
//                  extra precondition; emits exactly what its target emits
//   projection   — safe read; emits nothing (served over GET)
//
// See docs/operations.md for the algebra and the argument for minimality.
import { err } from '../core/errors.js';
import { clone, canonicalize } from '../core/canonical.js';
import { expandRights, PUBLIC } from './rights.js';
import { nextLifecycle, PRIMITIVES } from './reducer.js';
import { threeWayMerge } from './diff.js';

export const ALL_STATUSES = ['active', 'closed', 'completed', 'cancelled', 'archived'];
const ACTIVE = ['active'];
const NOT_ARCHIVED = ['active', 'closed', 'completed', 'cancelled'];
export const RESERVED_COLLECTIONS = ['checkpoints', 'acks'];

// ---- shared input schema fragments ------------------------------------------------------
const principalRef = { type: 'string', pattern: '^p_[0-9A-Z]{4,16}$' };
const collectionName = { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,31}$' };
const entryId = { type: 'string', pattern: '^n_[0-9A-Z]{4,16}$' };
const reason = { type: 'string', maxLength: 1000 };
const rightsSpec = {
  anyOf: [
    { enum: ['observer', 'reader', 'contributor', 'operator'] },
    { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['observe', 'read', 'append', 'update', 'assign', 'link', 'lifecycle', 'grant'] } },
  ],
  description: 'A role name (bundle of rights) or an explicit list of rights.',
};
const grantSpec = {
  type: 'object',
  required: ['rights'],
  additionalProperties: false,
  properties: {
    rights: rightsSpec,
    operations: { type: 'array', items: { type: 'string', maxLength: 64 }, uniqueItems: true, maxItems: 64, description: 'Restrict the grant to these operation names.' },
    expires_at: { type: 'string', format: 'date-time' },
    purpose: { type: 'string', maxLength: 500 },
  },
};
const packageRef = { $ref: 'urn:purl:schema:continuity-package' };
const obj = (properties, required = [], extra = {}) => ({ type: 'object', additionalProperties: false, properties, required, ...extra });

// ---- helpers ----------------------------------------------------------------------------
function findEntry(resource, collection, id) {
  return (resource.collections[collection] ?? []).find((e) => e.id === id);
}

function appendEvent(ctx, collection, body, extra = {}) {
  return { kind: 'append', payload: { collection, entry: { id: extra.id ?? ctx.newId('n'), body, supersedes: extra.supersedes ?? null, about: extra.about ?? null, ...(extra.origin ? { origin: extra.origin, author: extra.author, at: extra.at } : {}) } } };
}

function grantEvent(ctx, grantee, spec) {
  return {
    kind: 'grant',
    payload: {
      grant: {
        id: ctx.newId('g'),
        grantee,
        rights: expandRights(spec.rights),
        operations: spec.operations ?? null,
        parent: null, // filled in by the store from the authorising source (attenuation)
        purpose: spec.purpose ?? null,
        expires_at: spec.expires_at ?? null,
      },
    },
  };
}

function transition(action) {
  return (ctx) => {
    const to = nextLifecycle(ctx.resource.lifecycle, action);
    if (!to) throw err.lifecycleConflict(`cannot ${action} a resource whose lifecycle status is ${ctx.resource.lifecycle.status}`);
    return { events: [{ kind: 'transition', payload: { action, from: ctx.resource.lifecycle.status, to, reason: ctx.input.reason ?? null } }] };
  };
}

function checkpointBody(ctx, pkg, extra = {}) {
  return {
    label: ctx.input.label ?? null,
    package: clone(pkg),
    // Server-verified facts, kept apart from the preparer's claims in `package`:
    checkpoint: { resource: ctx.resource.id, version: ctx.resource.version, state_hash: ctx.stateHash(ctx.resource) },
    prepared_by: ctx.actor.id,
    ...extra,
  };
}

// ---- the vocabulary ---------------------------------------------------------------------
const OPS = [
  // READ — projections; served by Layer 0 over GET, listed here so the manifest is complete.
  { name: 'inspect', category: 'read', classification: 'projection', method: 'GET', path: '/r/{id}', rights: ['observe'], description: 'Current representation. Content is redacted to what your rights allow; the representation says what was redacted.' },
  { name: 'retrieve', category: 'read', classification: 'alias', alias_of: 'inspect', method: 'GET', path: '/r/{id}', rights: ['observe'], description: 'Alias of inspect.' },
  { name: 'status', category: 'read', classification: 'projection', method: 'GET', path: '/r/{id}/status', rights: ['observe'], description: 'Metadata only: type, version, lifecycle, owner, assignee, head hash.' },
  { name: 'search', category: 'read', classification: 'projection', method: 'GET', path: '/r{?type,owner,assignee,status}', rights: ['observe'], scope: 'instance', description: 'List resources you can observe, filtered.' },
  { name: 'diff', category: 'read', classification: 'projection', method: 'GET', path: '/r/{id}/diff{?from,to}', rights: ['read'], description: 'Structural differences between two versions (JSON Pointer paths).' },
  { name: 'history', category: 'read', classification: 'projection', method: 'GET', path: '/r/{id}/events{?since}', rights: ['observe'], description: 'Event log. Observers see headers; readers see payloads.' },
  { name: 'state_at', category: 'read', classification: 'projection', method: 'GET', path: '/r/{id}/state{?at}', rights: ['read'], description: 'State reconstructed by replaying the log to a version.' },
  { name: 'lineage', category: 'read', classification: 'projection', method: 'GET', path: '/r/{id}/lineage', rights: ['observe'], description: 'Ancestors, descendants, supersession and merge relations.' },
  { name: 'verify', category: 'read', classification: 'projection', method: 'GET', path: '/r/{id}/verify', rights: ['observe'], description: 'Replay the log and check the hash chain and every state hash.' },
  { name: 'continuity', category: 'synchronization', classification: 'projection', method: 'GET', path: '/r/{id}/continuity', rights: ['read'], description: 'Latest checkpoint package plus everything that changed since it.' },
  { name: 'synchronize', category: 'synchronization', classification: 'alias', alias_of: 'history', method: 'GET', path: '/r/{id}/events{?since}', rights: ['observe'], description: 'Fetch events after the version you hold; apply them with the reducer to catch up.' },
  { name: 'subscribe', category: 'synchronization', classification: 'projection', method: 'GET', path: '/r/{id}/events', accept: 'text/event-stream', rights: ['observe'], description: 'Server-Sent Events stream of new events (Last-Event-ID = version).' },

  // WRITE
  { name: 'create', category: 'write', classification: 'primitive', primitive: 'genesis', method: 'POST', path: '/r', scope: 'instance', rights: [], description: 'Create a resource; the caller becomes its owner.' },
  {
    name: 'update', category: 'write', classification: 'primitive', primitive: 'patch', rights: ['update'], lifecycle: ACTIVE, idempotent: true,
    description: 'Apply a JSON Merge Patch (RFC 7396) to state. null deletes a key.',
    effects: ['state'],
    input: obj({ merge_patch: { type: 'object', minProperties: 1 } }, ['merge_patch']),
    plan: (ctx) => ({ events: [{ kind: 'patch', payload: { merge_patch: ctx.input.merge_patch } }] }),
  },
  {
    name: 'append', category: 'write', classification: 'primitive', primitive: 'append', rights: ['append'], lifecycle: ACTIVE, idempotent: 'by entry id',
    description: 'Add an entry to a collection. Supplying your own entry id makes retries idempotent.',
    effects: ['collections'],
    input: obj({ collection: collectionName, body: {}, id: entryId, about: { type: 'string', maxLength: 200 } }, ['collection', 'body']),
    plan: (ctx) => {
      const { collection, body, id, about } = ctx.input;
      if (RESERVED_COLLECTIONS.includes(collection)) throw err.invalidInput(`collection "${collection}" is written only by its own operation`);
      if (id) {
        const existing = findEntry(ctx.resource, collection, id);
        if (existing) {
          if (canonicalize(existing.body) === canonicalize(body)) return { events: [], result: { entry: id, no_op: 'entry already present' } };
          throw err.invariant(`entry ${id} exists with a different body; entries are immutable`);
        }
      }
      const e = appendEvent(ctx, collection, body, { id, about });
      return { events: [e], result: { entry: e.payload.entry.id } };
    },
  },
  {
    name: 'annotate', category: 'write', classification: 'composition', composed_of: ['append'], rights: ['append'], lifecycle: NOT_ARCHIVED,
    description: 'Attach a note about an entry or a state path. = append(annotations, {about, body}). Allowed after completion.',
    effects: ['collections.annotations'],
    input: obj({ about: { type: 'string', minLength: 1, maxLength: 200, description: 'An entry id or a JSON Pointer into state.' }, body: {} }, ['about', 'body']),
    plan: (ctx) => {
      const e = appendEvent(ctx, 'annotations', ctx.input.body, { about: ctx.input.about });
      return { events: [e], result: { entry: e.payload.entry.id } };
    },
  },

  // SYNCHRONIZATION
  {
    name: 'checkpoint', category: 'synchronization', classification: 'composition', composed_of: ['append'], rights: ['append'], lifecycle: ACTIVE,
    description: 'Record a continuity package bound to the current version and state hash. = append(checkpoints, …).',
    effects: ['collections.checkpoints'],
    input: obj({ package: packageRef, label: { type: 'string', maxLength: 200 } }, ['package']),
    plan: (ctx) => {
      const e = appendEvent(ctx, 'checkpoints', checkpointBody(ctx, ctx.input.package, { for: null }));
      return { events: [e], result: { checkpoint: e.payload.entry.id } };
    },
  },
  {
    name: 'acknowledge', category: 'synchronization', classification: 'composition', composed_of: ['append'], rights: ['append'], lifecycle: NOT_ARCHIVED,
    description: 'Declare that you have observed the resource at its current version (optionally a specific checkpoint). A declaration of awareness; it confers nothing.',
    effects: ['collections.acks'],
    input: obj({ checkpoint: entryId, note: reason }),
    plan: (ctx) => {
      if (ctx.input.checkpoint && !findEntry(ctx.resource, 'checkpoints', ctx.input.checkpoint)) throw err.invalidInput(`no checkpoint ${ctx.input.checkpoint}`);
      const body = { observed: { version: ctx.resource.version, state_hash: ctx.stateHash(ctx.resource) }, checkpoint: ctx.input.checkpoint ?? null, note: ctx.input.note ?? null };
      const e = appendEvent(ctx, 'acks', body);
      return { events: [e], result: { entry: e.payload.entry.id } };
    },
  },
  { name: 'reconcile', category: 'synchronization', classification: 'alias', alias_of: 'merge', description: 'Alias of merge.' },

  // TRANSFER
  {
    name: 'grant', category: 'transfer', classification: 'primitive', primitive: 'grant', rights: ['grant'], lifecycle: NOT_ARCHIVED,
    description: 'Give another principal (or "*" for public observe/read) a subset of your own rights. The new grant records your grant as its parent.',
    effects: ['grants'],
    input: obj({ grantee: { anyOf: [principalRef, { const: PUBLIC }] }, ...grantSpec.properties }, ['grantee', 'rights']),
    plan: (ctx) => {
      const e = grantEvent(ctx, ctx.input.grantee, ctx.input);
      return { events: [e], result: { grant: e.payload.grant.id } };
    },
  },
  {
    name: 'delegate', category: 'transfer', classification: 'alias', alias_of: 'grant', primitive: 'grant', rights: ['grant'], lifecycle: NOT_ARCHIVED,
    description: 'Alias of grant for task-scoped authority: requires a purpose and a named principal (not public).',
    effects: ['grants'],
    input: obj({ grantee: principalRef, ...grantSpec.properties }, ['grantee', 'rights', 'purpose']),
    plan: (ctx) => {
      const e = grantEvent(ctx, ctx.input.grantee, ctx.input);
      return { events: [e], result: { grant: e.payload.grant.id } };
    },
  },
  {
    name: 'assign', category: 'transfer', classification: 'primitive', primitive: 'assign', rights: ['assign'], lifecycle: ACTIVE, idempotent: true,
    description: 'Set (or clear) who is responsible for continuing the work. Does not change owner or grant anything.',
    effects: ['assignee'],
    input: obj({ assignee: { anyOf: [principalRef, { type: 'null' }] } }, ['assignee']),
    plan: (ctx) => ({ events: ctx.resource.assignee === ctx.input.assignee ? [] : [{ kind: 'assign', payload: { assignee: ctx.input.assignee } }] }),
  },
  {
    name: 'handoff', category: 'transfer', classification: 'composition', composed_of: ['append', 'grant?', 'assign'], rights: ['append', 'assign'], conditional_rights: { grant: 'when input.grant is present' }, lifecycle: ACTIVE,
    description: 'Hand the work to another principal: checkpoint a continuity package addressed to them, optionally delegate rights, and make them the assignee. Ownership is unchanged; the principals remain distinct.',
    effects: ['collections.checkpoints', 'grants (optional)', 'assignee'],
    input: obj({ to: principalRef, package: packageRef, grant: grantSpec, label: { type: 'string', maxLength: 200 } }, ['to', 'package']),
    plan: (ctx) => handoffPlan(ctx),
  },
  {
    name: 'forward', category: 'transfer', classification: 'alias', alias_of: 'handoff', composed_of: ['append', 'grant?', 'assign'], rights: ['append', 'assign'], conditional_rights: { grant: 'when input.grant is present' }, lifecycle: ACTIVE,
    precondition: 'caller is the current assignee',
    description: 'Alias of handoff, available only to the current assignee: pass the work on.',
    effects: ['collections.checkpoints', 'grants (optional)', 'assignee'],
    input: obj({ to: principalRef, package: packageRef, grant: grantSpec, label: { type: 'string', maxLength: 200 } }, ['to', 'package']),
    plan: (ctx) => {
      if (ctx.resource.assignee !== ctx.actor.id) throw err.forbidden('forward is only available to the current assignee');
      return handoffPlan(ctx);
    },
  },
  {
    name: 'transfer', category: 'transfer', classification: 'primitive', primitive: 'transfer', rights: ['own'], lifecycle: ALL_STATUSES,
    description: 'Transfer ownership. Only the owner can do this; it cannot be delegated.',
    effects: ['owner'],
    input: obj({ to: principalRef }, ['to']),
    plan: (ctx) => {
      if (ctx.input.to === ctx.resource.owner) throw err.invalidInput('already the owner');
      return { events: [{ kind: 'transfer', payload: { from: ctx.resource.owner, to: ctx.input.to } }] };
    },
  },

  // STRUCTURAL
  {
    name: 'fork', category: 'structural', classification: 'composition', composed_of: ['genesis'], rights: ['read'], lifecycle: ALL_STATUSES, creates: true,
    description: 'Create a new resource you own, initialised from this one\'s state and collections at the current version. The source is not modified and no grants are copied.',
    effects: ['(new resource)'],
    input: obj({ type: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' }, note: reason }),
    plan: (ctx) => {
      const src = ctx.resource;
      const collections = {};
      for (const [name, entries] of Object.entries(src.collections)) {
        if (name === 'acks') continue; // acknowledgements describe the source, not the fork
        collections[name] = entries.map((e) => ({ ...clone(e), version: 1, origin: e.origin ?? { resource: src.id, version: e.version } }));
      }
      return {
        create: {
          type: ctx.input.type ?? src.type,
          state: clone(src.state),
          collections,
          derived_from: { resource: src.id, version: src.version, state_hash: ctx.stateHash(src) },
          note: ctx.input.note ?? null,
        },
      };
    },
  },
  { name: 'branch', category: 'structural', classification: 'alias', alias_of: 'fork', description: 'Alias of fork.' },
  {
    name: 'merge', category: 'structural', classification: 'composition', composed_of: ['patch?', 'append*', 'link'], rights: ['link'], conditional_rights: { update: 'when state changes are merged', append: 'when entries are merged' }, lifecycle: ACTIVE,
    description: 'Bring changes from a directly related fork (or its parent) into this resource: three-way merge of state, union of collection entries by id, and a merged_from link. The source is not modified. Conflicts must be resolved explicitly.',
    effects: ['state', 'collections', 'relations'],
    input: obj({ source: { type: 'string' }, resolutions: { type: 'object', description: 'JSON Pointer → value, for conflicting paths.' } }, ['source']),
    plan: (ctx) => mergePlan(ctx),
  },
  {
    name: 'supersede', category: 'structural', classification: 'composition', composed_of: ['append'], rights: ['append'], lifecycle: ACTIVE,
    description: 'Append a new entry that supersedes an existing one. The original remains, unchanged and readable; superseded_by is computed.',
    effects: ['collections'],
    input: obj({ collection: collectionName, supersedes: entryId, body: {} }, ['collection', 'supersedes', 'body']),
    plan: (ctx) => {
      const { collection, supersedes, body } = ctx.input;
      if (RESERVED_COLLECTIONS.includes(collection)) throw err.invalidInput(`collection "${collection}" cannot be superseded`);
      if (!findEntry(ctx.resource, collection, supersedes)) throw err.invalidInput(`no entry ${supersedes} in ${collection}`);
      const e = appendEvent(ctx, collection, body, { supersedes });
      return { events: [e], result: { entry: e.payload.entry.id, supersedes } };
    },
  },
  {
    name: 'link', category: 'structural', classification: 'primitive', primitive: 'link', rights: ['link'], lifecycle: NOT_ARCHIVED, idempotent: true,
    description: 'Record a typed relation from this resource to another you can observe. The target is not modified and gains or loses nothing.',
    effects: ['relations'],
    input: obj({ rel: { enum: ['references', 'supersedes', 'parent'] }, target: { type: 'string' }, version: { type: 'integer', minimum: 1 }, note: reason }, ['rel', 'target']),
    plan: (ctx) => {
      if (ctx.input.target === ctx.resource.id) throw err.invalidInput('a resource cannot link to itself');
      const target = ctx.load(ctx.input.target, 'observe');
      const version = ctx.input.version ?? target.version;
      if (version > target.version) throw err.invalidInput(`target has no version ${version}`);
      return { events: [{ kind: 'link', payload: { rel: ctx.input.rel, target: { resource: target.id, version }, note: ctx.input.note ?? null } }] };
    },
  },
  { name: 'archive', category: 'structural', classification: 'primitive', primitive: 'transition', rights: ['lifecycle'], lifecycle: NOT_ARCHIVED, input: obj({ reason }), effects: ['lifecycle'], description: 'Freeze the resource: reads and forks only. Nothing is deleted.', plan: transition('archive') },
  { name: 'restore', category: 'structural', classification: 'primitive', primitive: 'transition', rights: ['lifecycle'], lifecycle: ['archived'], input: obj({ reason }), effects: ['lifecycle'], description: 'Return an archived resource to the status it had before archiving.', plan: transition('restore') },

  // TERMINATION
  { name: 'close', category: 'termination', classification: 'primitive', primitive: 'transition', rights: ['lifecycle'], lifecycle: ACTIVE, input: obj({ reason }), effects: ['lifecycle'], description: 'End work without a judgement about success.', plan: transition('close') },
  { name: 'complete', category: 'termination', classification: 'primitive', primitive: 'transition', rights: ['lifecycle'], lifecycle: ACTIVE, input: obj({ reason }), effects: ['lifecycle'], description: 'End work: objective met.', plan: transition('complete') },
  { name: 'cancel', category: 'termination', classification: 'primitive', primitive: 'transition', rights: ['lifecycle'], lifecycle: ACTIVE, input: obj({ reason }), effects: ['lifecycle'], description: 'End work: abandoned.', plan: transition('cancel') },
  { name: 'reopen', category: 'termination', classification: 'primitive', primitive: 'transition', rights: ['lifecycle'], lifecycle: ['closed', 'completed', 'cancelled'], input: obj({ reason }), effects: ['lifecycle'], description: 'Return a closed/completed/cancelled resource to active.', plan: transition('reopen') },
  {
    name: 'revoke', category: 'termination', classification: 'primitive', primitive: 'revoke', rights: ['grant'], lifecycle: ALL_STATUSES, idempotent: true,
    description: 'Revoke a grant. Every grant delegated from it stops being effective too. Always available, in every lifecycle state.',
    effects: ['grants'],
    input: obj({ grant: { type: 'string', pattern: '^g_[0-9A-Z]{4,16}$' }, reason }, ['grant']),
    plan: (ctx) => {
      const g = ctx.resource.grants[ctx.input.grant];
      if (!g) throw err.invalidInput(`no grant ${ctx.input.grant}`);
      if (g.revoked) return { events: [], result: { no_op: 'already revoked' } };
      return { events: [{ kind: 'revoke', payload: { grant: g.id, reason: ctx.input.reason ?? null } }] };
    },
  },
];

function handoffPlan(ctx) {
  const { to, package: pkg, grant } = ctx.input;
  if (to === ctx.actor.id) throw err.invalidInput('cannot hand off to yourself');
  ctx.requirePrincipal(to);
  const events = [appendEvent(ctx, 'checkpoints', checkpointBody(ctx, pkg, { for: to }))];
  if (grant) events.push(grantEvent(ctx, to, grant));
  events.push({ kind: 'assign', payload: { assignee: to } });
  return { events, result: { checkpoint: events[0].payload.entry.id, grant: grant ? events[1].payload.grant.id : null, assignee: to } };
}

function mergePlan(ctx) {
  const ours = ctx.resource;
  const theirs = ctx.load(ctx.input.source, 'read');
  let base;
  if (theirs.derived_from?.resource === ours.id) base = ctx.stateAt(ours.id, theirs.derived_from.version);
  else if (ours.derived_from?.resource === theirs.id) base = ctx.stateAt(theirs.id, ours.derived_from.version);
  else throw err.invalidInput('merge requires a direct fork relationship (one resource derived_from the other)');

  const { mergePatch, changes, conflicts } = threeWayMerge(base.state, ours.state, theirs.state, ctx.input.resolutions ?? {});
  if (conflicts.length) throw err.mergeConflict(`${conflicts.length} conflicting path(s); supply input.resolutions`, { conflicts });

  const events = [];
  if (changes.length) events.push({ kind: 'patch', payload: { merge_patch: mergePatch } });
  const merged = [];
  for (const [name, entries] of Object.entries(theirs.collections)) {
    if (name === 'acks') continue;
    const have = new Set((ours.collections[name] ?? []).map((e) => e.id));
    for (const e of entries) {
      if (have.has(e.id)) continue;
      events.push(appendEvent(ctx, name, e.body, { id: e.id, supersedes: e.supersedes, about: e.about, origin: e.origin ?? { resource: theirs.id, version: e.version }, author: e.author, at: e.at }));
      merged.push(e.id);
    }
  }
  events.push({ kind: 'link', payload: { rel: 'merged_from', target: { resource: theirs.id, version: theirs.version, state_hash: ctx.stateHash(theirs) }, note: null } });
  return { events, result: { state_changes: changes, entries_merged: merged } };
}

// ---- registry ----------------------------------------------------------------------------
export const OPERATIONS = new Map();
for (const op of OPS) OPERATIONS.set(op.name, op);
// Resolve simple aliases (those that declared nothing but alias_of) to their target's behaviour.
for (const op of OPS) {
  if (op.classification === 'alias' && !op.plan && !op.method) {
    const target = OPERATIONS.get(op.alias_of);
    OPERATIONS.set(op.name, { ...target, ...op, plan: target.plan, input: target.input, rights: target.rights, conditional_rights: target.conditional_rights, lifecycle: target.lifecycle, effects: target.effects, composed_of: target.composed_of, primitive: target.primitive, creates: target.creates });
  }
}

export const isMutation = (op) => typeof op.plan === 'function';

/** Rights required by a concrete plan: union over its primitives, never less than op.rights. */
export function requiredRights(op, events) {
  const set = new Set(op.rights ?? []);
  for (const e of events ?? []) {
    const r = PRIMITIVES[e.kind].right;
    if (r) set.add(r);
  }
  return [...set];
}
