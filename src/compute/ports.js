// Substrate ports. The composition layer talks to PURL only through the
// public operations (create, link, update) and projections (state, verify,
// lineage, events). Two ports make the same protocol calls:
//
//   StorePort — calls a Store instance in-process (store.create / store.invoke,
//               exactly what Layer 0 calls for POST /r and POST /r/{id}/ops/{op})
//   HttpPort  — speaks HTTP to any PURL/0.1 server
//
// Neither port imports Layer 1: the store is injected. Every read method is
// counted in `counters.reads` so experiments can report persistent reads.
import { hashOf } from '../core/canonical.js';

export const NODE_TYPES = { literal: 'compute-literal', application: 'compute-application' };

function newCounters() {
  return { reads: 0, writes: 0, byMethod: {} };
}

function count(c, method, kind) {
  c[kind] += 1;
  c.byMethod[method] = (c.byMethod[method] ?? 0) + 1;
}

export class StorePort {
  constructor(store, principal) {
    this.store = store;
    this.principal = principal;
    this.counters = newCounters();
  }

  create(type, state) {
    count(this.counters, 'create', 'writes');
    const out = this.store.create(this.principal, { type, state, public: 'reader' });
    return { id: out.resource.id, version: out.resource.version };
  }

  invoke(id, op, input) {
    count(this.counters, op, 'writes');
    const r = this.store.get(id);
    const out = this.store.invoke(this.principal, id, op, { expected_version: r.version, input });
    return { id, version: out.resource.version };
  }

  /** The resource record at its current version, and its PURL state hash. */
  head(id) {
    count(this.counters, 'head', 'reads');
    const record = this.store.require(id, this.principal, 'read');
    return { record, version: record.version, state_hash: hashOf(record) };
  }

  /** The record at `version`, reconstructed by replay (GET /r/{id}/state?at=). */
  at(id, version) {
    count(this.counters, 'at', 'reads');
    this.store.require(id, this.principal, 'read');
    const record = this.store.stateAt(id, version);
    return { record, version, state_hash: hashOf(record) };
  }

  verify(id) {
    count(this.counters, 'verify', 'reads');
    this.store.require(id, this.principal, 'observe');
    return this.store.verify(id);
  }

  /** Inbound relations: resources that declared a link to `id` (GET /r/{id}/lineage → inbound). */
  inbound(id) {
    count(this.counters, 'inbound', 'reads');
    this.store.require(id, this.principal, 'observe');
    return this.store.inboundRelations(id);
  }

  /** Every resource visible to the principal (GET /r) — a scan, used only as a baseline. */
  list(filter = {}) {
    count(this.counters, 'list', 'reads');
    return this.store.list(this.principal, filter).map((r) => ({ id: r.id, type: r.type, version: r.version, state: r.state }));
  }
}

export class HttpPort {
  constructor(base, token, { fetch: f = fetch } = {}) {
    this.base = base.replace(/\/$/, '');
    this.token = token;
    this.fetch = f;
    this.counters = newCounters();
  }

  async #req(method, path, body) {
    const res = await this.fetch(this.base + path, {
      method,
      headers: { Accept: 'application/purl+json', Authorization: `Bearer ${this.token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status} ${json?.detail ?? ''}`), { status: res.status, problem: json });
    return json;
  }

  /** `rawBody` lets an experiment submit a specific serialisation of the same JSON. */
  async create(type, state, { rawBody } = {}) {
    count(this.counters, 'create', 'writes');
    const out = await this.#req('POST', '/r', rawBody ?? { type, state, public: 'reader' });
    return { id: out.resource.id, version: out.resource.version };
  }

  async invoke(id, op, input) {
    count(this.counters, op, 'writes');
    const { version } = await this.#req('GET', `/r/${id}/status`);
    const out = await this.#req('POST', `/r/${id}/ops/${op}`, { expected_version: version, input });
    return { id, version: out.resource.version };
  }

  async head(id) {
    count(this.counters, 'head', 'reads');
    const s = await this.#req('GET', `/r/${id}/state`);
    return { record: s.state, version: s.version, state_hash: hashOf(s.state) };
  }

  async at(id, version) {
    count(this.counters, 'at', 'reads');
    const s = await this.#req('GET', `/r/${id}/state?at=${version}`);
    return { record: s.state, version, state_hash: hashOf(s.state) };
  }

  async verify(id) {
    count(this.counters, 'verify', 'reads');
    return this.#req('GET', `/r/${id}/verify`);
  }

  async inbound(id) {
    count(this.counters, 'inbound', 'reads');
    return (await this.#req('GET', `/r/${id}/lineage`)).inbound;
  }

  async list(filter = {}) {
    count(this.counters, 'list', 'reads');
    const q = new URLSearchParams(filter).toString();
    const items = (await this.#req('GET', `/r${q ? `?${q}` : ''}`)).items;
    return Promise.all(items.map(async (i) => ({ id: i.id, type: i.type, version: i.version, state: (await this.head(i.id)).record.state })));
  }

  href(id) {
    return `${this.base}/r/${id}`;
  }
}
