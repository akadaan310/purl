// The reducer: apply(state, event) → state′. Pure, deterministic, total over
// valid events; throws on events that would violate a protocol invariant.
// Every resource state is `events.reduce(apply, null)`.
import { clone } from '../core/canonical.js';
import { err } from '../core/errors.js';

export const PROTOCOL = 'PURL/0.1';

/** The primitive event kinds. Every operation compiles to a sequence of these. */
export const PRIMITIVES = Object.freeze({
  genesis: { right: null, mutates: ['*'], properties: ['exactly-once'] },
  patch: { right: 'update', mutates: ['state'], properties: ['idempotent', 'last-writer-wins'] },
  append: { right: 'append', mutates: ['collections'], properties: ['monotone', 'commutative (as a set keyed by entry id)', 'idempotent (by entry id)'] },
  grant: { right: 'grant', mutates: ['grants'], properties: ['monotone in authority', 'idempotent (by grant id)'] },
  revoke: { right: 'grant', mutates: ['grants'], properties: ['idempotent', 'anti-monotone', 'does not commute with grant'] },
  assign: { right: 'assign', mutates: ['assignee'], properties: ['idempotent', 'last-writer-wins'] },
  link: { right: 'link', mutates: ['relations'], properties: ['monotone', 'idempotent (by rel+target)'] },
  transition: { right: 'lifecycle', mutates: ['lifecycle'], properties: ['governed by lifecycle state machine'] },
  transfer: { right: 'own', mutates: ['owner'], properties: ['owner-only', 'not grantable'] },
});

/** Lifecycle state machine: status → action → next status ('@previous' = status before archive). */
export const LIFECYCLE = Object.freeze({
  active: { close: 'closed', complete: 'completed', cancel: 'cancelled', archive: 'archived' },
  closed: { reopen: 'active', archive: 'archived' },
  completed: { reopen: 'active', archive: 'archived' },
  cancelled: { reopen: 'active', archive: 'archived' },
  archived: { restore: '@previous' },
});

export function nextLifecycle(lifecycle, action) {
  const target = LIFECYCLE[lifecycle.status]?.[action];
  if (!target) return null;
  return target === '@previous' ? lifecycle.previous ?? 'active' : target;
}

export function apply(resource, event) {
  if (event.kind === 'genesis') {
    if (resource) throw err.invariant('genesis may only be the first event');
    const p = event.payload;
    return {
      protocol: PROTOCOL,
      id: event.resource,
      type: p.type,
      version: event.version,
      created_at: event.at,
      created_by: event.actor,
      updated_at: event.at,
      owner: p.owner,
      assignee: null,
      lifecycle: { status: 'active', previous: null },
      state: clone(p.state ?? {}),
      collections: clone(p.collections ?? {}),
      grants: {},
      relations: [],
      derived_from: p.derived_from ?? null,
    };
  }
  if (!resource) throw err.invariant('first event must be genesis');
  if (event.version !== resource.version + 1) {
    throw err.invariant(`event version ${event.version} does not follow ${resource.version}`);
  }
  const r = clone(resource);
  const p = event.payload;
  switch (event.kind) {
    case 'patch':
      r.state = mergePatch(r.state, p.merge_patch);
      if (!isObject(r.state)) throw err.invariant('state must remain a JSON object');
      break;
    case 'append': {
      const list = (r.collections[p.collection] ??= []);
      if (list.some((e) => e.id === p.entry.id)) throw err.invariant(`entry ${p.entry.id} already exists`);
      if (p.entry.supersedes && !list.some((e) => e.id === p.entry.supersedes)) {
        throw err.invariant(`superseded entry ${p.entry.supersedes} not found in ${p.collection}`);
      }
      list.push({
        id: p.entry.id,
        author: p.entry.author ?? event.actor,
        at: p.entry.at ?? event.at,
        version: event.version,
        body: clone(p.entry.body),
        supersedes: p.entry.supersedes ?? null,
        about: p.entry.about ?? null,
        origin: p.entry.origin ?? null,
      });
      break;
    }
    case 'grant':
      if (r.grants[p.grant.id]) throw err.invariant(`grant ${p.grant.id} already exists`);
      r.grants[p.grant.id] = {
        ...clone(p.grant),
        granted_by: event.actor,
        granted_at: event.at,
        version: event.version,
        revoked: null,
      };
      break;
    case 'revoke': {
      const g = r.grants[p.grant];
      if (!g) throw err.invariant(`grant ${p.grant} not found`);
      if (!g.revoked) g.revoked = { by: event.actor, at: event.at, version: event.version, reason: p.reason ?? null };
      break;
    }
    case 'assign':
      r.assignee = p.assignee;
      break;
    case 'link':
      if (!r.relations.some((l) => l.rel === p.rel && l.target.resource === p.target.resource)) {
        r.relations.push({ rel: p.rel, target: clone(p.target), note: p.note ?? null, by: event.actor, at: event.at, version: event.version });
      }
      break;
    case 'transition': {
      const next = nextLifecycle(r.lifecycle, p.action);
      if (!next || next !== p.to) throw err.invariant(`lifecycle cannot go ${r.lifecycle.status} --${p.action}--> ${p.to}`);
      r.lifecycle = { status: next, previous: p.action === 'archive' ? r.lifecycle.status : null };
      break;
    }
    case 'transfer':
      if (p.from !== r.owner) throw err.invariant('transfer must name the current owner');
      r.owner = p.to;
      break;
    default:
      throw err.invariant(`unknown event kind ${event.kind}`);
  }
  r.version = event.version;
  r.updated_at = event.at;
  return r;
}

export function replay(events, uptoVersion = Infinity) {
  let r = null;
  for (const e of events) {
    if (e.version > uptoVersion) break;
    r = apply(r, e);
  }
  return r;
}

/** RFC 7396 JSON Merge Patch. */
export function mergePatch(target, patch) {
  if (!isObject(patch)) return clone(patch);
  const out = isObject(target) ? clone(target) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
