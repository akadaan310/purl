// A minimal ACSP/0.1 client for the composition bridge. It speaks HTTP only:
// no ACSP code is imported, and nothing here is specific to the reference
// ACSP implementation beyond what ACSP/0.1 publishes (the operation envelope,
// the resource document, checkpoint documents).
//
// One AcspSession is one participant: a session id, an optional agent id and
// at most the capability tokens explicitly handed to it.
import { canonicalize, sha256 } from '../core/canonical.js';

export const ACSP_PROTOCOL = 'ACSP/0.1';

export class AcspSession {
  constructor(base, { session_id, agent_id = null, kind = 'agent', fetch: f = fetch, keyPrefix = null } = {}) {
    this.base = base.replace(/\/$/, '');
    this.actor = { session_id, ...(agent_id ? { agent_id } : {}), kind };
    this.fetch = f;
    this.tokens = new Map();
    this.seq = 0;
    this.keyPrefix = keyPrefix ?? session_id;
  }

  /** Receive a capability out of band (as a human would hand it over). */
  receive(resourceId, token) {
    this.tokens.set(resourceId, token);
  }

  async #req(method, path, { body, token } = {}) {
    const url = path.startsWith('http') ? path : this.base + path;
    const res = await this.fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body: json };
  }

  get(path, rid = null) {
    return this.#req('GET', path, { token: rid ? this.tokens.get(rid) : undefined });
  }

  async document(rid) {
    const r = await this.get(`/r/${rid}.json`, rid);
    if (!r.ok) throw Object.assign(new Error(`GET /r/${rid}.json → ${r.status}`), { response: r });
    return r.body;
  }

  /** Perform a mutating operation. Returns the raw HTTP result; never throws on protocol errors. */
  async op(rid, operation, payload, { expected_version, actor, token } = {}) {
    const envelope = {
      protocol: ACSP_PROTOCOL,
      operation,
      actor: actor ?? this.actor,
      ...(expected_version !== undefined ? { expected_version } : {}),
      idempotency_key: `${this.keyPrefix}-k${String(++this.seq).padStart(4, '0')}`,
      payload,
    };
    const r = await this.#req('POST', rid ? `/r/${rid}/operations` : '/r', { body: envelope, token: token !== undefined ? token : rid ? this.tokens.get(rid) : undefined });
    const oc = r.body?.result?.owner_capability;
    if (r.status === 201 && oc?.token) this.receive(r.body.resource_id, oc.token);
    return r;
  }

  /**
   * Fetch checkpoint `n` and recompute its hash from the snapshot with PURL's
   * canonicaliser — an implementation independent of the one that wrote it.
   */
  async verifyCheckpoint(rid, n) {
    const r = await this.get(`/r/${rid}/checkpoints/${n}`, rid);
    if (!r.ok) return { ok: false, status: r.status };
    const cp = r.body.checkpoint;
    const recomputed = 'sha256:' + sha256(canonicalize(cp.snapshot));
    return { ok: recomputed === cp.sha256, number: cp.number, version: cp.version, recorded: cp.sha256, recomputed, snapshot: cp.snapshot };
  }
}

/** Parse a TOK's `content` as JSON; ACSP stores it as text and never interprets it. */
export function tokJson(tok) {
  try {
    return JSON.parse(tok.content);
  } catch {
    return null;
  }
}
