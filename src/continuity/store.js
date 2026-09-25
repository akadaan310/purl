// The continuity store: principals, resources as hash-chained event logs, and
// the invocation pipeline that turns an operation request into events.
// No HTTP here — Layer 0 calls these methods.
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashOf, sha256, clone, canonicalize } from '../core/canonical.js';
import { randomId } from '../core/ids.js';
import { err, PurlError } from '../core/errors.js';
import { loadProtocolSchemas } from '../core/schema.js';
import { apply, replay, PROTOCOL } from './reducer.js';
import { OPERATIONS, isMutation, requiredRights, ALL_STATUSES } from './operations.js';
import { authorize, authorityRecord, visibleRights, mayRevoke } from './authority.js';
import { PUBLIC, PUBLIC_MAX_RIGHTS, isSubset } from './rights.js';

export const INSTANCE = 'p_instance';

export const DEFAULT_LIMITS = Object.freeze({
  maxResources: 10_000,
  maxPrincipals: 10_000,
  maxEventsPerResource: 5_000,
  maxEntriesPerCollection: 1_000,
  maxStateBytes: 256 * 1024,
});

const eventHash = (e) => {
  const { hash, ...rest } = e;
  return hashOf(rest);
};
export const stateHash = (r) => hashOf(r);

export class Store {
  constructor({ now = () => new Date().toISOString(), newId = randomId, dataDir = null, limits = {}, schemas = loadProtocolSchemas(), token = () => 'purl_' + randomBytes(24).toString('base64url') } = {}) {
    this.now = now;
    this.newId = newId;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.schemas = schemas;
    this.makeToken = token;
    this.principals = new Map();
    this.tokens = new Map();
    this.resources = new Map(); // id → { state, events }
    this.children = new Map(); // source id → Set(fork ids)
    this.inbound = new Map(); // target id → [{ from, rel, version }]
    this.idempotency = new Map();
    this.subscribers = new Map();
    this.dataDir = dataDir;
    this.principals.set(INSTANCE, { id: INSTANCE, kind: 'instance', label: 'this PURL instance', created_at: now(), admin: false });
    if (dataDir) this.#load();
  }

  // ---- principals ------------------------------------------------------------------------
  registerPrincipal({ kind = 'agent', label = '', admin = false } = {}) {
    if (this.principals.size >= this.limits.maxPrincipals) throw err.limit('principal limit reached');
    if (!['human', 'agent', 'service'].includes(kind)) throw err.invalidInput('kind must be human, agent or service');
    if (typeof label !== 'string' || label.length > 200) throw err.invalidInput('label must be a string of at most 200 characters');
    const token = this.makeToken();
    const principal = { id: this.newId('p'), kind, label, created_at: this.now(), admin: Boolean(admin) };
    const record = { ...principal, token_hash: sha256(token) };
    this.#addPrincipal(record);
    this.#persist({ type: 'principal', principal: record });
    return { principal, token };
  }

  #addPrincipal(record) {
    const { token_hash, ...principal } = record;
    this.principals.set(principal.id, principal);
    if (token_hash) this.tokens.set(token_hash, principal.id);
  }

  authenticate(token) {
    if (!token) return null;
    const id = this.tokens.get(sha256(token));
    return id ? this.principals.get(id) : null;
  }

  principal(id) {
    return this.principals.get(id) ?? null;
  }

  // ---- reads ------------------------------------------------------------------------------
  #entry(id) {
    const e = this.resources.get(id);
    if (!e) throw err.notFound(`no resource ${id}`);
    return e;
  }

  has(id) {
    return this.resources.has(id);
  }

  get(id) {
    return this.#entry(id).state;
  }

  events(id, since = 0) {
    return this.#entry(id).events.filter((e) => e.version > since);
  }

  stateAt(id, version) {
    const { events, state } = this.#entry(id);
    if (!Number.isInteger(version) || version < 1 || version > state.version) throw err.badRequest(`version must be an integer in 1..${state.version}`);
    return replay(events, version);
  }

  rightsOf(id, principal) {
    return visibleRights(this.get(id), principal, this.now());
  }

  /** Throw not-found (no observe) or forbidden (observe but not `right`). */
  require(id, principal, right) {
    const r = this.resources.get(id);
    const rights = r ? visibleRights(r.state, principal, this.now()) : [];
    if (!rights.includes('observe')) throw err.notFound(`no resource ${id}`);
    if (!rights.includes(right)) throw err.forbidden(`"${right}" right required`, { missing: [right] });
    return r.state;
  }

  list(principal, filter = {}) {
    const out = [];
    for (const { state } of this.resources.values()) {
      if (!visibleRights(state, principal, this.now()).includes('observe')) continue;
      if (filter.type && state.type !== filter.type) continue;
      if (filter.owner && state.owner !== filter.owner) continue;
      if (filter.assignee && state.assignee !== filter.assignee) continue;
      if (filter.status && state.lifecycle.status !== filter.status) continue;
      out.push(state);
    }
    return out;
  }

  childrenOf(id) {
    return [...(this.children.get(id) ?? [])];
  }

  inboundRelations(id) {
    return [...(this.inbound.get(id) ?? [])];
  }

  /** Replay the log and check hash chain, event hashes and state hashes. */
  verify(id) {
    const { events, state } = this.#entry(id);
    const problems = [];
    let r = null;
    let prev = null;
    for (const e of events) {
      if (e.prev !== prev) problems.push({ version: e.version, problem: 'prev hash does not match previous event' });
      if (eventHash(e) !== e.hash) problems.push({ version: e.version, problem: 'event hash mismatch' });
      const before = r ? stateHash(r) : null;
      if (e.state_before !== before) problems.push({ version: e.version, problem: 'state_before mismatch' });
      try {
        r = apply(r, e);
      } catch (x) {
        problems.push({ version: e.version, problem: `replay failed: ${x.message}` });
        break;
      }
      if (e.state_after !== stateHash(r)) problems.push({ version: e.version, problem: 'state_after mismatch' });
      prev = e.hash;
    }
    if (r && stateHash(r) !== stateHash(state)) problems.push({ version: state.version, problem: 'cached state differs from replay' });
    return { resource: id, events: events.length, head: events.at(-1)?.hash ?? null, valid: problems.length === 0, problems };
  }

  subscribe(id, fn) {
    this.#entry(id);
    if (!this.subscribers.has(id)) this.subscribers.set(id, new Set());
    this.subscribers.get(id).add(fn);
    return () => this.subscribers.get(id)?.delete(fn);
  }

  // ---- writes -----------------------------------------------------------------------------
  /**
   * Create a resource. input: { type, state?, public?: 'observer'|'reader' }.
   * Options (instance-internal): id, derived_from, collections, fork_authority, op.
   */
  create(actor, input, opts = {}) {
    if (!actor) throw err.unauthenticated('creating a resource requires an authenticated principal');
    const errors = this.schemas.validate(CREATE_INPUT, input ?? null);
    if (errors.length) throw err.invalidInput('invalid create input', { errors });
    if (this.resources.size >= this.limits.maxResources) throw err.limit('resource limit reached');
    const id = opts.id ?? this.newId('r');
    if (this.resources.has(id)) throw err.invariant(`resource ${id} exists`);
    const invocation = this.newId('i');
    const planned = [
      {
        kind: 'genesis',
        payload: {
          type: input.type,
          owner: actor.id,
          state: input.state ?? {},
          ...(opts.collections ? { collections: opts.collections } : {}),
          derived_from: opts.derived_from ?? null,
          ...(opts.fork_authority ? { fork_authority: opts.fork_authority, note: opts.note ?? null } : {}),
        },
      },
    ];
    if (input.public) {
      planned.push({ kind: 'grant', payload: { grant: { id: this.newId('g'), grantee: PUBLIC, rights: input.public === 'reader' ? ['observe', 'read'] : ['observe'], operations: null, parent: null, purpose: 'public visibility', expires_at: null } } });
    }
    const authority = { via: actor.id === INSTANCE ? 'instance' : 'creator', grant: null, chain: [], rights: [] };
    const { state, events } = this.#build(null, id, planned, { op: opts.op ?? 'create', invocation, actor, authority });
    this.#commit(id, state, events);
    return { resource: state, events, invocation, result: { resource: id } };
  }

  invoke(actor, id, opName, body = {}, { idempotencyKey } = {}) {
    const op = OPERATIONS.get(opName);
    if (!op) throw err.unknownOperation(`"${opName}" is not in the operation vocabulary`, { known: [...OPERATIONS.keys()].filter((n) => isMutation(OPERATIONS.get(n))) });
    if (!isMutation(op)) throw new PurlError(405, 'method-not-allowed', `"${opName}" is a safe projection; use ${op.method} ${op.path}`);
    if (!actor) throw err.unauthenticated('operations require an authenticated principal');
    const entry = this.resources.get(id);
    if (!entry || !visibleRights(entry.state, actor, this.now()).includes('observe')) throw err.notFound(`no resource ${id}`);

    const bodyErrors = this.schemas.validate(INVOCATION, body ?? null);
    if (bodyErrors.length) throw err.badRequest('body must be {"expected_version": <int>, "input": {...}}', { errors: bodyErrors });
    const input = body.input ?? {};
    const inputErrors = this.schemas.validate(op.input ?? { type: 'object' }, input);
    if (inputErrors.length) throw err.invalidInput(`input does not match the schema of "${opName}"`, { errors: inputErrors });

    const idemKey = idempotencyKey ? `${actor.id}\u0000${id}\u0000${idempotencyKey}` : null;
    if (idemKey && this.idempotency.has(idemKey)) {
      const prior = this.idempotency.get(idemKey);
      if (prior.fingerprint !== canonicalize([opName, body])) throw err.badRequest('Idempotency-Key reused with a different request');
      return { ...prior.response, idempotent_replay: true };
    }

    const resource = entry.state;
    if (body.expected_version !== resource.version) {
      throw err.versionConflict(`expected version ${body.expected_version}, current is ${resource.version}`, { current_version: resource.version });
    }
    const allowed = op.lifecycle ?? ['active'];
    if (!allowed.includes(resource.lifecycle.status)) {
      throw err.lifecycleConflict(`"${opName}" is not permitted while the resource is ${resource.lifecycle.status}`, { allowed_in: allowed });
    }

    const now = this.now();
    const ctx = {
      resource,
      input,
      actor,
      now,
      newId: this.newId,
      stateHash,
      stateAt: (rid, v) => this.stateAt(rid, v),
      load: (rid, right) => this.require(rid, actor, right),
      requirePrincipal: (pid) => {
        if (!this.principals.has(pid) || pid === INSTANCE) throw err.invalidInput(`no principal ${pid}`);
      },
    };

    // Authorisation happens before planning for operations whose rights do not
    // depend on input, so that unauthorised callers learn nothing from plan errors.
    const pre = authorize(resource, actor, opName, op.rights ?? [], now);
    if (!pre.ok) throw err.forbidden(pre.reason, { missing: pre.missing, operation: opName });

    const plan = op.plan(ctx);
    let response;
    if (plan.create) {
      response = this.#fork(actor, resource, opName, plan.create, pre.source);
    } else {
      const rights = requiredRights(op, plan.events);
      const auth = authorize(resource, actor, opName, rights, now);
      if (!auth.ok) throw err.forbidden(auth.reason, { missing: auth.missing, operation: opName });
      this.#checkAuthorityEvents(resource, actor, auth.source, plan.events, now);
      const invocation = this.newId('i');
      const { state, events } = this.#build(resource, id, plan.events, { op: opName, invocation, actor, authority: authorityRecord(auth.source) });
      if (events.length) this.#commit(id, state, events);
      response = { resource: state, events, invocation, result: plan.result ?? null };
    }
    if (idemKey) this.idempotency.set(idemKey, { fingerprint: canonicalize([opName, body]), response });
    return response;
  }

  #fork(actor, source, opName, spec, sourceAuthority) {
    return this.create(actor, { type: spec.type, state: spec.state }, {
      op: opName,
      collections: spec.collections,
      derived_from: spec.derived_from,
      fork_authority: authorityRecord(sourceAuthority),
      note: spec.note,
    });
  }

  /** Attenuation and revocation rules that depend on which source authorised the call. */
  #checkAuthorityEvents(resource, actor, source, events, now) {
    for (const e of events) {
      if (e.kind === 'grant') {
        const g = e.payload.grant;
        if (g.grantee === actor.id) throw err.invalidInput('cannot grant to yourself');
        if (g.grantee === PUBLIC) {
          if (!isSubset(g.rights, PUBLIC_MAX_RIGHTS)) throw err.invariant('public grants are limited to observe and read');
        } else if (!this.principals.has(g.grantee) || g.grantee === INSTANCE) {
          throw err.invalidInput(`no principal ${g.grantee}`);
        }
        if (g.expires_at && Date.parse(g.expires_at) <= Date.parse(now)) throw err.invalidInput('expires_at is in the past');
        if (source.via === 'grant') {
          const excess = g.rights.filter((r) => !source.rights.includes(r));
          if (excess.length) throw err.forbidden(`attenuation: cannot delegate rights you do not hold: ${excess.join(', ')}`, { missing: excess });
          if (source.operations) {
            if (!g.operations) g.operations = [...source.operations];
            else if (!isSubset(g.operations, source.operations)) throw err.forbidden('attenuation: cannot widen the operation allow-list of your own grant');
          }
          if (source.expires_at && (!g.expires_at || Date.parse(g.expires_at) > Date.parse(source.expires_at))) g.expires_at = source.expires_at;
          g.parent = source.grant;
        } else if (source.via !== 'owner') {
          throw err.forbidden(`grants cannot be issued via ${source.via} authority`);
        }
      }
      if (e.kind === 'revoke' && !mayRevoke(resource, source, e.payload.grant)) {
        throw err.forbidden('you may only revoke grants that descend from your own');
      }
    }
  }

  /** Apply planned primitives to a working copy, producing hash-chained events. Atomic. */
  #build(resource, id, planned, { op, invocation, actor, authority }) {
    const prior = resource ? this.resources.get(id).events : [];
    if (prior.length + planned.length > this.limits.maxEventsPerResource) throw err.limit('event limit for this resource reached');
    const at = this.now();
    let state = resource;
    let prev = prior.at(-1)?.hash ?? null;
    const events = [];
    for (const p of planned) {
      const e = {
        protocol: PROTOCOL,
        id: this.newId('e'),
        resource: id,
        version: (state?.version ?? 0) + 1,
        kind: p.kind,
        op,
        invocation,
        actor: actor.id,
        authority,
        at,
        payload: clone(p.payload),
        prev,
        state_before: state ? stateHash(state) : null,
      };
      const next = apply(state, e);
      this.#checkLimits(next);
      e.state_after = stateHash(next);
      e.hash = eventHash(e);
      events.push(e);
      state = next;
      prev = e.hash;
    }
    return { state, events };
  }

  #checkLimits(r) {
    if (canonicalize(r.state).length > this.limits.maxStateBytes) throw err.limit('state exceeds size limit');
    for (const [name, list] of Object.entries(r.collections)) {
      if (list.length > this.limits.maxEntriesPerCollection) throw err.limit(`collection ${name} is full`);
    }
  }

  #commit(id, state, events, persist = true) {
    if (!this.resources.has(id)) this.resources.set(id, { state: null, events: [] });
    const entry = this.resources.get(id);
    entry.events.push(...events);
    entry.state = state;
    for (const e of events) {
      if (e.kind === 'genesis' && e.payload.derived_from) {
        const src = e.payload.derived_from.resource;
        if (!this.children.has(src)) this.children.set(src, new Set());
        this.children.get(src).add(id);
      }
      if (e.kind === 'link') {
        const t = e.payload.target.resource;
        if (!this.inbound.has(t)) this.inbound.set(t, []);
        this.inbound.get(t).push({ from: id, rel: e.payload.rel, version: e.payload.target.version, declared_by: e.actor, at: e.at });
      }
      if (persist) this.#persist({ type: 'event', event: e });
    }
    for (const fn of this.subscribers.get(id) ?? []) {
      try {
        fn(events, state);
      } catch {
        /* a failing subscriber must not affect the write */
      }
    }
  }

  // ---- persistence ------------------------------------------------------------------------
  #persist(record) {
    if (!this.dataDir) return;
    appendFileSync(join(this.dataDir, 'log.jsonl'), JSON.stringify(record) + '\n');
  }

  #load() {
    mkdirSync(this.dataDir, { recursive: true });
    const file = join(this.dataDir, 'log.jsonl');
    if (!existsSync(file)) return;
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (const [i, line] of lines.entries()) {
      const rec = JSON.parse(line);
      if (rec.type === 'principal') this.#addPrincipal(rec.principal);
      else if (rec.type === 'event') {
        const e = rec.event;
        const entry = this.resources.get(e.resource);
        const prevHash = entry?.events.at(-1)?.hash ?? null;
        if (e.prev !== prevHash || eventHash(e) !== e.hash) throw new Error(`log.jsonl line ${i + 1}: hash chain broken for ${e.resource}`);
        const next = apply(entry?.state ?? null, e);
        if (stateHash(next) !== e.state_after) throw new Error(`log.jsonl line ${i + 1}: state hash mismatch for ${e.resource}`);
        this.#commit(e.resource, next, [e], false);
      }
    }
  }
}

const CREATE_INPUT = {
  type: 'object',
  required: ['type'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
    state: { type: 'object' },
    public: { enum: ['observer', 'reader'] },
  },
};

const INVOCATION = {
  type: 'object',
  required: ['expected_version'],
  additionalProperties: false,
  properties: {
    expected_version: { type: 'integer', minimum: 1 },
    input: { type: 'object' },
  },
};

export { CREATE_INPUT, INVOCATION, ALL_STATUSES };
