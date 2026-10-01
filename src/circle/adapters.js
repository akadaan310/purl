// Adapters: the only way the circle reaches another system. Each one is an HTTP
// boundary with a declared contract. None imports another system's code.
// When a system is not reachable the adapter says so ("unavailable_here");
// it never substitutes a result.

import { createHash } from 'node:crypto';
import { canonicalize } from '../core/canonical.js';

export const DESCRIPTOR = {
  module: 'src/circle/adapters.js',
  claims: ['one adapter per neighbour system; each reports unavailability instead of inventing data', 'adapters carry no credentials of their own: a capability is passed in by the caller and never logged'],
  requires: { modules: ['../core/canonical.js'], services: ['substrate HTTP', 'ACSP HTTP', 'Golden Surface relay (optional)'], files: [] },
  produces: ['DESCRIPTOR', 'ADAPTER_VERSION', 'sha256', 'unavailable', 'SubstrateAdapter', 'AcspAdapter', 'GoldenAdapter'],
  changes: ['substrate executions/observations (record, observe: only when called)', 'ACSP proposals (submit: only when called)', 'Golden Surface tab state (cmd: only when called)'],
};

export const ADAPTER_VERSION = 'circle-adapters/0';

async function call(base, method, path, { body, headers = {}, timeoutMs = 15000 } = {}) {
  if (!base) return { available: false, reason: 'not configured' };
  const url = base.replace(/\/$/, '') + path;
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { available: true, status: res.status, ok: res.ok, json, url };
  } catch (e) {
    return { available: false, reason: `${e.name}: ${e.message}`, url };
  }
}

export const sha256 = (obj) => 'sha256:' + createHash('sha256').update(typeof obj === 'string' ? obj : canonicalize(obj)).digest('hex');

export function unavailable(adapter, r) {
  return { status: 503, code: 'unavailable_here', adapter, reason: r.reason, note: 'The system is KNOWN and described but not reachable from this circle. No result was substituted.' };
}

// ---------------------------------------------------------------------------
// SubstrateIO value engine (tools/purl_server.py): pure values, typed terms, records.
// ---------------------------------------------------------------------------
export class SubstrateAdapter {
  constructor(base) { this.base = base; }
  describe() {
    return {
      id: 'adapter.substrate', version: ADAPTER_VERSION, base: this.base ?? null,
      requires: ['substrateIO tools/purl_server.py (python3, stdlib)'],
      inputs: 'value address (derivation path)', outputs: 'typed term; value envelope; execution record; observation',
      effect_class: { term: 'pure', resolve: 'pure', record: 'append-only record in the substrate store', observe: 'append-only record in the substrate store' },
      environment: 'GET /environment (environment_id)', provenance: 'execution records carry derivation_id, value_id, environment_id, code_hash, git',
    };
  }
  term(address) { return call(this.base, 'GET', '/term' + address); }
  resolve(address) { return call(this.base, 'GET', address); }
  record(address) { return call(this.base, 'POST', address); }
  environment() { return call(this.base, 'GET', '/environment'); }
  operations() { return call(this.base, 'GET', '/operations'); }
  projections() { return call(this.base, 'GET', '/projections'); }
  observe(projection, origin, document) { return call(this.base, 'POST', '/observations', { body: { projection, origin, document } }); }
}

// ---------------------------------------------------------------------------
// ACSP/0.1 continuity. Prepared (GET intent) != submitted (POST propose) != committed
// (owner resolves). The adapter can reach the first two; the third is never its to do.
// It holds no capability and never accepts one in a URL.
// ---------------------------------------------------------------------------
export class AcspAdapter {
  constructor(base) { this.base = base; }
  describe() {
    return {
      id: 'adapter.acsp', version: ADAPTER_VERSION, base: this.base ?? null,
      requires: ['an ACSP/0.1 service (live deployment or scripts/serve-local.ts)'],
      inputs: 'resource id; TOK content projected from a circle artifact', outputs: 'operation intent; proposal id; event list',
      effect_class: { prepare: 'pure (GET; ACSP guarantees no side effects)', propose: 'append-only record on the ACSP resource, pending the owner', events: 'pure' },
      authority: 'none held. propose is the only mutation open without a capability; commitment is the resource owner\'s decision.',
      stages: ['prepared', 'submitted', 'committed'],
    };
  }
  discovery() { return call(this.base, 'GET', '/.well-known/acsp'); }
  status(id) { return call(this.base, 'GET', `/r/${encodeURIComponent(id)}?action=status&format=json`); }
  resource(id) { return call(this.base, 'GET', `/r/${encodeURIComponent(id)}?format=json`); }
  events(id, after = 0) { return call(this.base, 'GET', `/r/${encodeURIComponent(id)}/events?format=json&after=${after}&limit=200`); }
  checkpoint(id, n) { return call(this.base, 'GET', `/r/${encodeURIComponent(id)}/checkpoints/${n}?format=json`); }

  /** GET prepare_propose: the intent document, with validation. Pure. */
  async prepare(id, { session_id, agent_id, tok, rationale }) {
    const q = new URLSearchParams({ action: 'prepare_propose', format: 'json', session_id, proposed_operation: 'append', rationale: rationale ?? '' });
    if (agent_id) q.set('agent_id', agent_id);
    q.set('payload', JSON.stringify({ operation: 'append', payload: tok, rationale: rationale ?? '' }));
    const prepareUrl = `/r/${encodeURIComponent(id)}?${q}`;
    const r = await call(this.base, 'GET', prepareUrl);
    return { ...r, prepare_url: (this.base ?? '') + prepareUrl, stage: r.ok ? 'prepared' : null };
  }

  /** POST the prepared envelope unchanged. Returns stage 'submitted' (a pending proposal), never 'committed'. */
  async submit(intent) {
    const href = intent?.execution?.href;
    const request = intent?.request;
    if (!href || !request) return { available: true, ok: false, status: 422, json: { error: 'not an ACSP operation intent (no request/href)' } };
    if (request.operation !== 'propose') return { available: true, ok: false, status: 403, json: { error: 'the circle submits only propose; other operations need a capability it does not hold' } };
    const path = href.startsWith('http') ? new URL(href).pathname : href;
    const r = await call(this.base, 'POST', path, { body: request });
    return { ...r, stage: r.ok ? 'submitted' : null, proposal_id: r.json?.result?.proposal?.id ?? null };
  }
}

// ---------------------------------------------------------------------------
// Golden Surface relay (golden-surface relay/relay.py). The circle never builds
// behind Golden Surface's scheme seam (owner's spec). It can ask the relay to open
// a circle URL in a tab it owns and read it back. Seat token from the environment
// only; never logged, never put in a URL by this adapter.
// ---------------------------------------------------------------------------
export class GoldenAdapter {
  constructor(base, token) { this.base = base; this.token = token; }
  describe() {
    return {
      id: 'adapter.golden-surface', version: ADAPTER_VERSION, base: this.base ?? null, configured: Boolean(this.base && this.token),
      requires: ['golden-surface relay (aiohttp) on its port', 'a seat token (GOLDEN_TOKEN_R) in the environment', 'a connected phone or FakePhone to execute commands'],
      inputs: 'circle URL (http)', outputs: 'tab id; read {url,title,text}', effect_class: { newtab: 'creates a tab owned by the seat', open: 'navigates an owned tab', read: 'pure' },
      authority: 'seat token: per seat, not per resource. Ownership checks are the relay\'s (403 on another seat\'s tab).',
      limits: ['read returns text, not NAI-CI structures', 'http/https only: seurl:// and purl:// are explained, not opened (routing.ts seam)'],
    };
  }
  async cmd(cmd, params = {}) {
    if (!this.token) return { available: false, reason: 'no seat token configured' };
    return call(this.base, 'POST', '/cmd', { body: { cmd, ...params }, headers: { Authorization: `Bearer ${this.token}` }, timeoutMs: 35000 });
  }
  health() { return call(this.base, 'GET', '/health'); }
}
