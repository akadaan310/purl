// A generic PURL client. It knows only: the instance entry point
// (/.well-known/purl), the document envelope (protocol, kind, links) and the
// manifest format. Every operation URL, method and body shape is discovered
// from manifests at run time — nothing about specific operations is hard-coded.
import { replay } from '../continuity/reducer.js';
import { hashOf } from '../core/canonical.js';

export class PurlClient {
  constructor(base, { token = null, label = 'client', log = () => {} } = {}) {
    this.base = base.replace(/\/$/, '');
    this.token = token;
    this.label = label;
    this.log = log;
  }

  async request(method, path, body, headers = {}) {
    const res = await fetch(new URL(path, this.base + '/'), {
      method,
      redirect: 'follow',
      headers: { Accept: 'application/purl+json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json, headers: res.headers };
  }

  async get(path) {
    const r = await this.request('GET', path);
    if (!r.ok) throw Object.assign(new Error(`${r.status} ${r.json?.detail ?? ''}`), { response: r });
    return r.json;
  }

  /** Learn the instance: endpoints and vocabulary. */
  async discoverInstance() {
    this.instance = await this.get('/.well-known/purl');
    return this.instance;
  }

  async register(kind = 'agent') {
    const inst = this.instance ?? (await this.discoverInstance());
    const { method, href } = inst.authentication.obtain;
    const r = await this.request(method, href, { kind, label: this.label });
    this.token = r.json.token;
    this.principal = r.json.principal;
    return this.principal;
  }

  async create(input) {
    const inst = this.instance ?? (await this.discoverInstance());
    const op = inst.vocabulary.operations.find((o) => o.name === 'create');
    const r = await this.request(op.method, op.href, input);
    if (!r.ok) throw Object.assign(new Error(r.json.detail), { response: r });
    return r.json.resource.href;
  }

  /** Open a URL, as an agent that has only been handed the URL would. */
  async open(url) {
    const doc = await this.get(url);
    if (doc.protocol !== 'PURL/0.1' || doc.kind !== 'resource') throw new Error(`${url} is not a PURL resource`);
    return doc;
  }

  async manifest(resourceUrl) {
    const doc = await this.open(resourceUrl);
    return this.get(doc.links.manifest);
  }

  /** Invoke an operation by NAME, using only what the manifest says. */
  async invoke(resourceUrl, name, input, { idempotencyKey } = {}) {
    const m = await this.manifest(resourceUrl);
    const op = m.operations.find((o) => o.name === name);
    if (!op) throw new Error(`manifest has no operation ${name}`);
    if (op.safe) throw new Error(`${name} is a safe projection; GET ${op.href}`);
    const r = await this.request(op.method, op.href, { expected_version: m.resource.version, input }, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {});
    return { ...r, advertised: { available: op.available, reason: op.reason ?? null } };
  }

  /** Fetch the full log and fold it with the reducer: independent reconstruction of every state. */
  async reconstruct(resourceUrl) {
    const doc = await this.open(resourceUrl);
    const events = [];
    let next = doc.links.events;
    while (next) {
      const page = await this.get(next);
      events.push(...page.events);
      next = page.links.next ?? null;
    }
    const checks = events.map((e, i) => {
      const s = replay(events, e.version);
      const { hash, ...rest } = e;
      return { version: e.version, kind: e.kind, op: e.op, actor: e.actor, via: e.authority.via, chain: e.authority.chain, state_hash_ok: hashOf(s) === e.state_after, event_hash_ok: hashOf(rest) === hash, chain_ok: e.prev === (i ? events[i - 1].hash : null) };
    });
    return { events, checks, final: replay(events), all_ok: checks.every((c) => c.state_hash_ok && c.event_hash_ok && c.chain_ok) };
  }
}
