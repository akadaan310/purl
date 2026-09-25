// HTTP plumbing: bodies, negotiation, problem responses, rate limiting.
import { PurlError, err } from '../core/errors.js';

export const MEDIA = {
  purl: 'application/purl+json',
  json: 'application/json',
  html: 'text/html',
  sse: 'text/event-stream',
  problem: 'application/problem+json',
};

export const MAX_BODY_BYTES = 64 * 1024;
const CREDENTIAL_PARAMS = ['token', 'access_token', 'auth', 'key', 'api_key', 'apikey', 'bearer', 'password'];

export function readJson(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const ct = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (ct !== 'application/json' && ct !== MEDIA.purl) {
      req.resume();
      return reject(new PurlError(415, 'unsupported-media-type', 'request bodies must be application/json'));
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(err.limit(`request body exceeds ${limit} bytes`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (size > limit) return;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(err.badRequest('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** Choose a media type from `available` according to the Accept header (q-values honoured). */
export function negotiate(accept, available) {
  if (!accept) return available[0];
  const ranges = accept.split(',').map((part, i) => {
    const [range, ...params] = part.trim().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return { range: range.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
  }).filter((r) => r.q > 0);
  let best = null;
  for (const type of available) {
    for (const r of ranges) {
      const [rt, rs] = r.range.split('/');
      const [tt, ts] = type.split('/');
      const specificity = r.range === type ? 3 : rs === '*' && rt === tt ? 2 : r.range === '*/*' ? 1 : 0;
      if (!specificity) continue;
      const score = [r.q, specificity, -available.indexOf(type)];
      if (!best || cmp(score, best.score) > 0) best = { type, score };
    }
  }
  return best?.type ?? null;
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function bearer(req, url) {
  for (const p of CREDENTIAL_PARAMS) {
    if (url.searchParams.has(p)) throw new PurlError(400, 'token-in-url', `credentials must be sent in the Authorization header, never in the URL (found "${p}" query parameter)`);
  }
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) throw err.unauthenticated('Authorization must be "Bearer <token>"');
  return m[1];
}

export function baseHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'ETag, Location, Link, Vary',
    ...extra,
  };
}

export const HTML_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export function sendJson(res, status, body, { type = MEDIA.purl, headers = {} } = {}) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, baseHeaders({ 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', Vary: 'Accept, Authorization', ...headers }));
  res.end(text);
}

export function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, baseHeaders({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': HTML_CSP, 'Cache-Control': 'no-store', Vary: 'Accept, Authorization', ...headers }));
  res.end(html);
}

export function sendProblem(res, e, instance) {
  const problem = e instanceof PurlError ? e.toProblem(instance) : new PurlError(500, 'internal', 'internal error').toProblem(instance);
  if (!(e instanceof PurlError)) console.error(e);
  const headers = {};
  if (problem.status === 401) headers['WWW-Authenticate'] = 'Bearer realm="purl"';
  if (problem.status === 405 && e.extra?.allow) headers.Allow = e.extra.allow;
  sendJson(res, problem.status, problem, { type: MEDIA.problem, headers });
}

/** Token bucket per key. */
export class RateLimiter {
  constructor({ capacity = 120, refillPerSecond = 4, now = () => Date.now() } = {}) {
    this.capacity = capacity;
    this.refill = refillPerSecond;
    this.now = now;
    this.buckets = new Map();
  }
  take(key) {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.t) / 1000) * this.refill);
    b.t = t;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      throw err.limit('rate limit exceeded; slow down', { retry_after_seconds: Math.ceil((1 - b.tokens) / this.refill) });
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 50_000) this.buckets.clear();
  }
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** JSON safe to embed inside <script type="application/purl+json">. */
export const embedJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
