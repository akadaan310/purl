// Authority evaluation. A principal's authority over a resource comes from
// *sources*: ownership, grants (each with a provenance chain back to the
// owner), public grants, or instance administration. An operation must be
// covered entirely by ONE source — authority from different sources is never
// combined, so every event can name exactly what authorised it.
import { RIGHT_NAMES, ADMIN_RIGHTS, ADMIN_OPERATIONS, PUBLIC, isSubset } from './rights.js';

export const OWNER_RIGHTS = [...RIGHT_NAMES, 'own'];

/** Grant ids from `grantId` up to its root (a grant issued by the owner). */
export function grantChain(resource, grantId) {
  const chain = [];
  const seen = new Set();
  let g = resource.grants[grantId];
  while (g) {
    if (seen.has(g.id)) throw new Error(`grant cycle at ${g.id}`);
    seen.add(g.id);
    chain.push(g.id);
    g = g.parent ? resource.grants[g.parent] : null;
  }
  return chain;
}

/** A grant is effective iff it and every ancestor are unrevoked and unexpired. */
export function grantStatus(resource, grantId, now) {
  for (const id of grantChain(resource, grantId)) {
    const g = resource.grants[id];
    if (g.revoked) return { active: false, reason: id === grantId ? 'revoked' : `ancestor ${id} revoked` };
    if (g.expires_at && Date.parse(g.expires_at) <= Date.parse(now)) {
      return { active: false, reason: id === grantId ? 'expired' : `ancestor ${id} expired` };
    }
  }
  return { active: true, reason: null };
}

export function authoritySources(resource, principal, now) {
  const sources = [];
  const pid = principal?.id ?? null;
  if (pid && resource.owner === pid) {
    sources.push({ via: 'owner', grant: null, rights: OWNER_RIGHTS, operations: null, chain: [] });
  }
  for (const g of Object.values(resource.grants)) {
    if (g.grantee !== pid && g.grantee !== PUBLIC) continue;
    if (!grantStatus(resource, g.id, now).active) continue;
    sources.push({
      via: g.grantee === PUBLIC ? 'public' : 'grant',
      grant: g.id,
      rights: g.rights,
      operations: g.operations ?? null,
      chain: grantChain(resource, g.id),
      purpose: g.purpose ?? null,
      expires_at: g.expires_at ?? null,
    });
  }
  if (principal?.admin) {
    sources.push({ via: 'admin', grant: null, rights: ADMIN_RIGHTS, operations: ADMIN_OPERATIONS, chain: [] });
  }
  return sources;
}

/** Union of rights over all sources — used only for deciding what a representation may show. */
export function visibleRights(resource, principal, now) {
  return [...new Set(authoritySources(resource, principal, now).flatMap((s) => s.rights))];
}

/**
 * Find one source that covers `required` rights and permits `operation`.
 * Returns { ok: true, source } or { ok: false, reason, missing }.
 */
export function authorize(resource, principal, operation, required, now) {
  const sources = authoritySources(resource, principal, now);
  for (const s of sources) {
    if (!isSubset(required, s.rights)) continue;
    if (s.operations && !s.operations.includes(operation)) continue;
    return { ok: true, source: s };
  }
  const union = [...new Set(sources.flatMap((s) => s.rights))];
  const missing = required.filter((r) => !union.includes(r));
  let reason;
  if (!sources.length) reason = 'no authority over this resource';
  else if (missing.length) reason = `missing right(s): ${missing.join(', ')}`;
  else reason = `no single authority source permits operation "${operation}" with rights ${required.join(', ')}`;
  return { ok: false, reason, missing };
}

/** Provenance record stored on every event. */
export function authorityRecord(source) {
  return {
    via: source.via,
    grant: source.grant,
    chain: source.chain,
    rights: [...source.rights],
  };
}

/**
 * May `source` revoke grant `target`? Owners and admins may revoke any grant;
 * a grant holder may revoke grants that descend from one of their grants.
 */
export function mayRevoke(resource, source, targetId) {
  if (source.via === 'owner' || source.via === 'admin') return true;
  if (!source.grant) return false;
  return grantChain(resource, targetId).slice(1).includes(source.grant);
}
