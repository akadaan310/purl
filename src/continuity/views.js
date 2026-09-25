// Views: projections of resource state for a given set of rights. Redaction is
// explicit — a view always lists what it withheld, so a client never mistakes
// a partial view for the whole resource.
import { clone } from '../core/canonical.js';
import { grantStatus } from './authority.js';
import { describeRights } from './rights.js';

/** Collections with computed `superseded_by` (supersession is a view, never a mutation). */
export function collectionsView(resource) {
  const out = {};
  for (const [name, entries] of Object.entries(resource.collections)) {
    const by = new Map();
    for (const e of entries) if (e.supersedes) by.set(e.supersedes, [...(by.get(e.supersedes) ?? []), e.id]);
    out[name] = entries.map((e) => ({ ...clone(e), superseded_by: by.get(e.id) ?? [], current: !by.has(e.id) }));
  }
  return out;
}

export function grantsView(resource, now) {
  return Object.values(resource.grants).map((g) => {
    const s = grantStatus(resource, g.id, now);
    return { ...clone(g), role: describeRights(g.rights), effective: s.active, ineffective_reason: s.reason };
  });
}

export function resourceView(resource, rights, now) {
  const canRead = rights.includes('read');
  const view = {
    id: resource.id,
    type: resource.type,
    version: resource.version,
    lifecycle: clone(resource.lifecycle),
    owner: resource.owner,
    assignee: resource.assignee,
    created_at: resource.created_at,
    created_by: resource.created_by,
    updated_at: resource.updated_at,
    derived_from: clone(resource.derived_from),
  };
  const redacted = [];
  if (canRead) {
    view.state = clone(resource.state);
    view.collections = collectionsView(resource);
    view.grants = grantsView(resource, now);
    view.relations = clone(resource.relations);
  } else {
    redacted.push('state', 'collections', 'grants', 'relations');
    view.counts = {
      collections: Object.fromEntries(Object.entries(resource.collections).map(([k, v]) => [k, v.length])),
      grants: Object.keys(resource.grants).length,
      relations: resource.relations.length,
    };
  }
  return { view, redacted };
}

/** Event as seen by someone who may only observe: header without payload. */
export function eventHeader(e) {
  const { payload, ...header } = e;
  return { ...header, payload: null, payload_redacted: true };
}
