// Layer 0: map HTTP onto the continuity store.
//
//   GET  never mutates. Only POST /r, POST /principals and POST /r/{id}/ops/{op} write.
//   Credentials only in the Authorization header. The server never dereferences a
//   client-supplied URL and never redirects to one.
import { createServer as createHttpServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, INSTANCE } from '../continuity/store.js';
import { OPERATIONS, isMutation } from '../continuity/operations.js';
import { PurlError, err } from '../core/errors.js';
import { hashOf } from '../core/canonical.js';
import { SCHEMA_DIR } from '../core/schema.js';
import { eventHeader } from '../continuity/views.js';
import { diff } from '../continuity/diff.js';
import { MEDIA, readJson, negotiate, bearer, sendJson, sendHtml, sendProblem, baseHeaders, RateLimiter } from './http.js';
import * as docs from './documents.js';
import * as html from './html.js';
import { projectEvents, PROJECTIONS } from '../research/projection.js';
import { transitionGraph } from '../research/graph.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROTOCOL_RESOURCE = 'purl-protocol';
const STATIC_TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
const SAFE_ACTIONS = { inspect: '', retrieve: '', status: '/status', manifest: '/manifest', events: '/events', history: '/events', synchronize: '/events', lineage: '/lineage', verify: '/verify', continuity: '/continuity' };

/** The protocol describes itself as a PURL resource (see docs/decisions/0004-self-description.md). */
export function ensureProtocolResource(store) {
  const instance = store.principal(INSTANCE);
  const description = docs.vocabulary();
  const state = { description, description_hash: hashOf(description) };
  if (!store.has(PROTOCOL_RESOURCE)) {
    store.create(instance, { type: 'protocol', state, public: 'reader' }, { id: PROTOCOL_RESOURCE });
  } else if (store.get(PROTOCOL_RESOURCE).state.description_hash !== state.description_hash) {
    // Protocol evolution is itself recorded as an event: replace the description wholesale.
    const r = store.get(PROTOCOL_RESOURCE);
    store.invoke(instance, PROTOCOL_RESOURCE, 'update', { expected_version: r.version, input: { merge_patch: { description: null } } });
    store.invoke(instance, PROTOCOL_RESOURCE, 'update', { expected_version: r.version + 1, input: { merge_patch: state } });
  }
}

export function createPurlServer({ store = new Store(), experimentsDir = join(ROOT, 'experiments'), publicDir = join(ROOT, 'public'), limiter = new RateLimiter(), maxStreams = 100, heartbeatMs = 25_000 } = {}) {
  ensureProtocolResource(store);
  let streams = 0;

  const experimentIds = () => (existsSync(experimentsDir) ? readdirSync(experimentsDir).filter((d) => existsSync(join(experimentsDir, d, 'record.json'))).sort() : []);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://purl.invalid');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const principal = authenticate(req, url);
    const accept = url.searchParams.get('format') === 'json' ? MEDIA.purl : url.searchParams.get('format') === 'html' ? MEDIA.html : req.headers.accept;
    const wantsHtml = (types = [MEDIA.purl, MEDIA.json, MEDIA.html]) => {
      const t = negotiate(accept, types);
      if (!t) throw new PurlError(406, 'not-acceptable', `available: ${types.join(', ')}`);
      return t === MEDIA.html;
    };
    const json = (status, body, headers = {}) => sendJson(res, status, body, { type: negotiate(req.headers.accept, [MEDIA.purl, MEDIA.json]) === MEDIA.json ? MEDIA.json : MEDIA.purl, headers });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, baseHeaders({ 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Idempotency-Key, If-Match, Last-Event-ID', 'Access-Control-Max-Age': '600' }));
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
      throw new PurlError(405, 'method-not-allowed', 'PURL uses GET for projections and POST for operations', { allow: 'GET, POST, OPTIONS' });
    }
    const isGet = req.method === 'GET' || req.method === 'HEAD';
    let m;

    // ---- instance level ----
    if (path === '/' && isGet) {
      const manifest = docs.instanceManifest({ experiments: experimentIds() });
      if (wantsHtml([MEDIA.html, MEDIA.purl, MEDIA.json])) return sendHtml(res, 200, html.homePage(manifest, store.list(null)), linkHeader(null));
      return json(200, manifest, linkHeader(null));
    }
    if (path === '/.well-known/purl' && isGet) return json(200, docs.instanceManifest({ experiments: experimentIds() }), linkHeader(null));
    if ((m = /^\/schemas\/([a-z-]+)$/.exec(path)) && isGet) {
      if (!docs.SCHEMA_NAMES.includes(m[1])) throw err.notFound(`no schema ${m[1]}`);
      return sendJson(res, 200, JSON.parse(readFileSync(join(SCHEMA_DIR, `${m[1]}.schema.json`), 'utf8')), { type: 'application/schema+json' });
    }
    if (path === '/principals' && req.method === 'POST') {
      limiter.take(`ip:${req.socket.remoteAddress}`);
      const body = await readJson(req);
      const { principal: p, token } = store.registerPrincipal({ kind: body.kind ?? 'agent', label: body.label ?? '' });
      return json(201, { protocol: 'PURL/0.1', kind: 'principal-registration', principal: p, token, token_usage: 'Send as "Authorization: Bearer <token>". Never put it in a URL. It is shown once.' }, { Location: `/principals/${p.id}` });
    }
    if (path === '/principals/me' && isGet) {
      if (!principal) throw err.unauthenticated('send Authorization: Bearer <token>');
      return json(200, { protocol: 'PURL/0.1', kind: 'principal', ...principal, owns: store.list(principal, { owner: principal.id }).map((r) => r.id), assigned: store.list(principal, { assignee: principal.id }).map((r) => r.id) });
    }
    if ((m = /^\/principals\/(p_[0-9A-Za-z]+)$/.exec(path)) && isGet) {
      const p = store.principal(m[1]);
      if (!p) throw err.notFound(`no principal ${m[1]}`);
      return json(200, { protocol: 'PURL/0.1', kind: 'principal', id: p.id, kind_of_principal: p.kind, label: p.label, created_at: p.created_at, note: 'A principal is an account on this instance. Its label is self-declared.' });
    }
    if (path === '/r' && isGet) {
      const filter = Object.fromEntries(['type', 'owner', 'assignee', 'status'].map((k) => [k, url.searchParams.get(k)]).filter(([, v]) => v));
      const items = store.list(principal, filter).map((r) => ({ id: r.id, type: r.type, version: r.version, lifecycle: r.lifecycle.status, owner: r.owner, assignee: r.assignee, href: `/r/${r.id}` }));
      return json(200, { protocol: 'PURL/0.1', kind: 'resource-list', filter, count: items.length, items });
    }
    if (path === '/r' && req.method === 'POST') {
      if (!principal) throw err.unauthenticated('creating a resource requires a principal; POST /principals first');
      limiter.take(principal.id);
      const body = await readJson(req);
      const out = store.create(principal, body);
      return json(201, operationResult('create', out), { Location: `/r/${out.resource.id}` });
    }
    if (path === '/experiments' && isGet) return json(200, { protocol: 'PURL/0.1', kind: 'experiment-index', experiments: experimentIds().map((e) => ({ id: e, href: `/experiments/${e}` })) });
    if ((m = /^\/experiments\/([a-z0-9-]+)$/.exec(path)) && isGet) {
      if (!experimentIds().includes(m[1])) throw err.notFound(`no experiment ${m[1]}`);
      return sendJson(res, 200, JSON.parse(readFileSync(join(experimentsDir, m[1], 'record.json'), 'utf8')), { type: MEDIA.json });
    }
    if (path === '/lab' && isGet) return sendHtml(res, 200, html.labPage(experimentIds()));
    if ((m = /^\/static\/([a-z0-9-]+\.[a-z]+)$/.exec(path)) && isGet) {
      const file = join(publicDir, m[1]);
      if (!STATIC_TYPES[extname(file)] || !existsSync(file)) throw err.notFound('no such file');
      res.writeHead(200, baseHeaders({ 'Content-Type': `${STATIC_TYPES[extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-cache' }));
      return res.end(readFileSync(file));
    }

    // ---- resource level ----
    if ((m = /^\/r\/([A-Za-z0-9_-]+)$/.exec(path)) && isGet) {
      const id = m[1];
      const action = url.searchParams.get('action');
      if (action) {
        if (action in SAFE_ACTIONS) return redirectInternal(`/r/${id}${SAFE_ACTIONS[action]}`);
        const op = OPERATIONS.get(action);
        if (op && isMutation(op)) {
          throw new PurlError(405, 'method-not-allowed', `"${action}" changes state, so it is never performed by GET (opening a URL must not imply authority). Use POST /r/${id}/ops/${action} with {"expected_version", "input"}.`, { allow: 'POST', operation: docs.describeOperation(op) });
        }
        throw err.unknownOperation(`unknown action "${action}"`);
      }
      store.require(id, principal, 'observe');
      const doc = docs.resourceDocument(store, id, principal);
      const headers = { ...linkHeader(id), ETag: `"${doc.version}"` };
      if (wantsHtml()) return sendHtml(res, 200, html.resourcePage(doc, docs.eventsDocument(store, id, principal)), headers);
      return json(200, doc, headers);
    }
    if ((m = /^\/r\/([A-Za-z0-9_-]+)\/(manifest|status|events|lineage|verify|continuity|state|diff|transitions)$/.exec(path)) && isGet) {
      const [, id, view] = m;
      const need = ['state', 'diff', 'continuity'].includes(view) ? 'read' : 'observe';
      store.require(id, principal, need);
      const headers = linkHeader(id);
      switch (view) {
        case 'manifest': return json(200, docs.resourceManifest(store, id, principal), headers);
        case 'status': return json(200, docs.statusDocument(store, id), headers);
        case 'lineage': return json(200, docs.lineageDocument(store, id, principal), headers);
        case 'verify': return json(200, { protocol: 'PURL/0.1', kind: 'verification', ...store.verify(id) }, headers);
        case 'continuity': return json(200, docs.continuityDocument(store, id, principal), headers);
        case 'events': {
          const since = intParam(url, 'since', Number(req.headers['last-event-id'] ?? 0));
          if (negotiate(req.headers.accept, [MEDIA.purl, MEDIA.json, MEDIA.sse]) === MEDIA.sse) return stream(req, res, id, principal, since);
          return json(200, docs.eventsDocument(store, id, principal, { since, limit: Math.min(intParam(url, 'limit', 500), 1000) }), headers);
        }
        case 'state': {
          const at = intParam(url, 'at', store.get(id).version);
          return json(200, { protocol: 'PURL/0.1', kind: 'state-at-version', resource: id, version: at, state: store.stateAt(id, at), reconstructed_by: 'replay of events 1..version' }, headers);
        }
        case 'diff': {
          const to = intParam(url, 'to', store.get(id).version);
          const from = intParam(url, 'from', Math.max(1, to - 1));
          const a = store.stateAt(id, from);
          const b = store.stateAt(id, to);
          return json(200, { protocol: 'PURL/0.1', kind: 'diff', resource: id, from, to, changes: diff(a, b) }, headers);
        }
        case 'transitions': {
          const projection = url.searchParams.get('projection') ?? 'kind';
          if (!PROJECTIONS[projection]) throw err.badRequest(`projection must be one of ${Object.keys(PROJECTIONS).join(', ')}`);
          const seq = projectEvents(store.events(id).map(eventHeader), projection);
          return json(200, { protocol: 'PURL/0.1', kind: 'transition-projection', category: 'transformation', resource: id, projection: { name: projection, definition: PROJECTIONS[projection].definition }, sequence: seq, graph: transitionGraph(seq.symbols, { order: 1, labels: seq.alphabet }), caution: 'A projection of this resource\'s event log. Structure seen here reflects both the activity and the choice of projection; operations that compose several primitives produce fixed patterns by construction.' }, headers);
        }
      }
    }
    if ((m = /^\/r\/([A-Za-z0-9_-]+)\/ops\/([a-z_]+)$/.exec(path))) {
      const [, id, opName] = m;
      const op = OPERATIONS.get(opName);
      if (isGet) {
        if (!op) throw err.unknownOperation(`"${opName}" is not in the operation vocabulary`);
        throw new PurlError(405, 'method-not-allowed', `operations are invoked with POST; GET on an operation URL never performs it`, { allow: 'POST', operation: docs.describeOperation(op) });
      }
      if (!principal) throw err.unauthenticated('operations require Authorization: Bearer <token>');
      limiter.take(principal.id);
      const body = await readJson(req);
      if (body.expected_version === undefined && req.headers['if-match']) {
        const v = /^"?v?(\d+)"?$/.exec(req.headers['if-match'].replace(/^W\//, ''));
        if (v) body.expected_version = Number(v[1]);
      }
      const out = store.invoke(principal, id, opName, body, { idempotencyKey: req.headers['idempotency-key'] });
      const created = out.resource.id !== id;
      return json(created ? 201 : 200, operationResult(opName, out), { ...linkHeader(out.resource.id), ...(created ? { Location: `/r/${out.resource.id}` } : {}), ETag: `"${out.resource.version}"` });
    }
    throw err.notFound(`no route for ${req.method} ${path}`);

    function redirectInternal(to) {
      // Same-origin, server-constructed path only — never a client-supplied URL.
      res.writeHead(303, baseHeaders({ Location: to }));
      res.end();
    }
  }

  function authenticate(req, url) {
    const token = bearer(req, url);
    if (!token) return null;
    const p = store.authenticate(token);
    if (!p) throw err.unauthenticated('unknown token');
    return p;
  }

  function stream(req, res, id, principal, since) {
    if (streams >= maxStreams) throw err.limit('too many open event streams');
    streams++;
    res.writeHead(200, baseHeaders({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' }));
    res.write(`: PURL/0.1 event stream for ${id}; id = resource version\n\n`); // flushes headers
    const send = (events) => {
      const rights = store.has(id) ? store.rightsOf(id, principal) : [];
      if (!rights.includes('observe')) return close(); // authority re-checked on every push
      for (const e of events) res.write(`id: ${e.version}\nevent: purl-event\ndata: ${JSON.stringify(rights.includes('read') ? e : eventHeader(e))}\n\n`);
    };
    send(store.events(id, since));
    const unsubscribe = store.subscribe(id, (events) => send(events));
    const beat = setInterval(() => res.write(': keep-alive\n\n'), heartbeatMs);
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      streams--;
      clearInterval(beat);
      unsubscribe();
      res.end();
    }
    req.on('close', close);
  }

  const server = createHttpServer((req, res) => {
    handle(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      const instance = req.url.split('?')[0];
      if (e instanceof PurlError && req.method === 'GET' && negotiate(req.headers.accept, [MEDIA.purl, MEDIA.json, MEDIA.html]) === MEDIA.html) {
        const problem = e.toProblem(instance);
        return sendHtml(res, problem.status, html.errorPage(problem));
      }
      sendProblem(res, e, instance);
    });
  });
  server.store = store;
  return server;
}

function linkHeader(id) {
  const links = ['</.well-known/purl>; rel="service-desc"; type="application/purl+json"'];
  if (id) links.push(`</r/${id}/manifest>; rel="describedby"; type="application/purl+json"`, `</r/${id}>; rel="alternate"; type="application/purl+json"`);
  return { Link: links.join(', ') };
}

function intParam(url, name, dflt) {
  const v = url.searchParams.get(name);
  if (v === null) return dflt;
  if (!/^\d+$/.test(v)) throw err.badRequest(`${name} must be a non-negative integer`);
  return Number(v);
}

function operationResult(opName, out) {
  const id = out.resource.id;
  return {
    protocol: 'PURL/0.1',
    kind: 'operation-result',
    operation: opName,
    invocation: out.invocation,
    resource: { id, version: out.resource.version, href: `/r/${id}` },
    events: out.events.map((e) => ({ version: e.version, kind: e.kind, hash: e.hash, authority: e.authority })),
    result: out.result,
    ...(out.idempotent_replay ? { idempotent_replay: true } : {}),
    links: { resource: `/r/${id}`, manifest: `/r/${id}/manifest`, events: `/r/${id}/events?since=${Math.max(0, out.resource.version - out.events.length)}` },
  };
}
