// The circle: one entry URL over five systems, each reached through an adapter.
//
//   AI session -> SEURL path -> typed term (substrate) -> value (substrate)
//              -> Scroll (PURL/0.1 resource) -> execution records (substrate)
//              -> continuity (ACSP propose) -> observation (substrate projection)
//              -> checkpoint (PURL/0.1 resource) -> resume
//
// The circle owns no state of its own. Every persistent thing lives in a PURL/0.1
// resource (scrolls, checkpoints, conformance runs, amendments), in the substrate's
// append-only store (executions, observations) or on an ACSP resource (proposals).
// GET handlers only read; every write is a POST.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PurlClient } from '../client/client.js';
import { canonicalize } from '../core/canonical.js';
import { run, parseMoves, pathOf, VERBS, SeurlError } from './seurl.js';
import { SubstrateAdapter, AcspAdapter, GoldenAdapter, unavailable, sha256 } from './adapters.js';
import { createBridge } from './bridge.js';

export const CIRCLE_PROTOCOL = 'circle/0 (provisional)';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONSTITUTION_PATH = join(ROOT, 'circle', 'constitution', 'constitution-v1.json');

class CircleError extends Error {
  constructor(status, code, message, details = {}) { super(message); Object.assign(this, { status, code, details }); }
}

export function loadConstitution(path = CONSTITUTION_PATH) {
  const bytes = readFileSync(path);
  const doc = JSON.parse(bytes);
  return { doc, content_id: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), path };
}

const move = (rel, method, href, effect, extra = {}) => ({ rel, method, href, effect, ...(href.includes('{') ? { template: true } : {}), ...extra });

export function createCircle(cfg) {
  const substrate = new SubstrateAdapter(cfg.substrateBase);
  const acsp = new AcspAdapter(cfg.acspBase);
  const golden = new GoldenAdapter(cfg.goldenBase, cfg.goldenToken);
  const purl = new PurlClient(cfg.purlBase, { label: 'circle', token: cfg.purlToken ?? null });
  const secrets = () => [purl.token, cfg.goldenToken, cfg.purlToken].filter(Boolean);
  const constitution = () => loadConstitution(cfg.constitutionPath);
  const base = () => cfg.publicBase;

  async function ensurePrincipal() {
    if (purl.token) return;
    await purl.register('agent');
    cfg.onPrincipal?.(purl.token); // persisted by the launcher as configuration (0600), never into a record
  }

  // ---- PURL/0.1 persistence (scrolls, checkpoints, runs, amendments) -------------
  async function purlCreate(type, state) {
    await ensurePrincipal();
    const r = await purl.request('POST', '/r', { type, state, public: 'reader' });
    if (!r.ok) throw new CircleError(502, 'purl_refused', `PURL refused create: ${r.json?.detail}`, { purl: r.json });
    return r.json.resource;
  }
  async function purlRead(id) {
    const r = await purl.request('GET', `/r/${encodeURIComponent(id)}`);
    if (r.status === 404) throw new CircleError(404, 'not_found', `No PURL resource ${id}.`);
    if (!r.ok) throw new CircleError(502, 'purl_refused', r.json?.detail ?? 'PURL error');
    return r.json;
  }
  async function purlOp(id, name, input) {
    await ensurePrincipal();
    const doc = await purlRead(id);
    const r = await purl.request('POST', `/r/${id}/ops/${name}`, { expected_version: doc.version, input });
    if (r.status === 401 || r.status === 403) {
      throw new CircleError(403, 'not_authorized', `PURL refused ${name}: this circle's principal holds no right to change ${id}. Reference does not imply ownership; fork it instead (new-version move).`, { purl: r.json });
    }
    if (!r.ok) throw new CircleError(502, 'purl_refused', `PURL refused ${name}: ${r.json?.detail}`, { purl: r.json });
    return r.json;
  }
  async function purlList(type) {
    const r = await purl.request('GET', `/r?type=${encodeURIComponent(type)}`);
    return r.ok ? r.json.items : [];
  }

  // ---- documents ------------------------------------------------------------------
  function envelope(kind, body, moves = []) {
    const c = constitution();
    return { protocol: CIRCLE_PROTOCOL, kind, ...body, constitution: { version: c.doc.version, content_id: c.content_id, href: '/constitution' }, moves };
  }

  function entry() {
    return envelope('entry', {
      what: 'A computational environment. Values are addressed by derivation paths; programs are SEURL paths; persisted programs are Scrolls; records go to ACSP; measurements to SubstrateIO.',
      verbs: VERBS,
      grammar: {
        seurl: '/seurl/START/{value address}[/WRITE/{op...}][/PERTURB/{bit}][/COMMIT][/BUILD][/TALK/acsp/{resource_id}]',
        value_address: 'root constructor then operations, e.g. /map/eca/90/8/state/5/next (see /operations)',
        value: '/v/{value address} resolves a value; /term/{value address} shows its typed term without evaluating it',
        rule: 'GET any URL to see what it would do. POST the same URL to do it. Mutations need ?session=<your declared session id>.',
      },
      systems: { substrate: substrate.describe(), acsp: { ...acsp.describe(), continuity_resource: cfg.acspResource ?? null }, golden_surface: golden.describe(), purl: { id: 'purl/0.1', base: cfg.purlBase } },
    }, [
      ...(cfg.acspResource ? [move('continuity', 'GET', `/acsp/r/${cfg.acspResource}`, 'read', { note: 'the ACSP resource TALK publishes to here' })] : []),
      move('sdk', 'GET', '/sdk', 'read', { note: 'what this is, what you can do, and how it describes itself' }),
      move('observatory', 'GET', '/observatory', 'read'),
      move('programs', 'GET', '/programs', 'read'),
      move('tests', 'GET', '/tests', 'read'),
      move('prompt-contract', 'GET', '/prompt-contract', 'read'),
      move('constitution', 'GET', '/constitution', 'read'),
      move('operations', 'GET', '/operations', 'read'),
      move('value', 'GET', '/v/map/eca/90/8/state/5/next', 'read'),
      move('term', 'GET', '/term/map/eca/90/8/state/5/next', 'read'),
      move('start', 'GET', '/seurl/START/map/eca/90/8/state/5', 'read', { note: 'a session bound to a value' }),
      move('example-program', 'GET', '/seurl/START/map/eca/90/8/state/5/WRITE/next/WRITE/orbit/COMMIT/BUILD', 'read (prepares; POST performs)'),
      move('scrolls', 'GET', '/scrolls', 'read'),
      move('aliases', 'GET', '/aliases', 'read'),
      move('state', 'GET', '/state', 'read'),
      move('conformance', 'GET', '/conformance', 'read'),
      move('checkpoints', 'GET', '/checkpoints', 'read'),
      move('projections', 'GET', '/projections', 'read', { note: 'declared projections, e.g. ACSP events -> substrate observation (P-ACSP-EV-1)' }),
      move('adapters', 'GET', '/adapters', 'read'),
      move('naici', 'GET', '/naici/legal?url=/', 'read', { primitives: ['surface', 'read', 'legal', 'trace'] }),
    ]);
  }

  // ---- SEURL ----------------------------------------------------------------------
  async function seurlDoc(path, q) {
    const s = run(path);
    let term = null;
    let value = null;
    if (s.current_address) {
      const t = await substrate.term(s.current_address);
      if (!t.available) throw Object.assign(new CircleError(503, 'unavailable_here', 'substrate unreachable'), { details: unavailable('adapter.substrate', t) });
      if (!t.ok) throw new CircleError(t.status, 'ill_typed', `The program's address is not a well-typed term: ${t.json?.error?.message}`, { substrate: t.json?.error, address: s.current_address });
      term = { kind: t.json.kind, derivation_id: t.json.derivation_id, address_id: t.json.address_id, steps: t.json.steps.length, href: '/term' + s.current_address };
      if (!s.prepared.length) {
        const v = await substrate.resolve(s.current_address);
        value = v.ok ? { kind: v.json.kind, value: v.json.value, identity: v.json.identity, epistemic_status: v.json.execution?.epistemic_status }
          : { refused: v.json?.error ?? { reason: v.reason } };
      }
    }
    const here = pathOf(s.moves);
    const moves = [];
    for (const verb of s.legal) {
      if (verb === 'START' || verb === 'SWITCH') moves.push(move(verb, 'GET', `${here}/${verb}/{value address}`, 'read', { template: true }));
      if (verb === 'WRITE' && value?.kind) for (const n of (await substrate.resolve(s.current_address)).json?.operations ?? []) {
        moves.push(move('WRITE', 'GET', `${here}/WRITE/${n.template.slice(s.current_address.length + 1)}`, 'read', { yields: n.yields, executable_here: n.executable_here }));
      }
      if (verb === 'PERTURB' && term?.kind === 'state') moves.push(move('PERTURB', 'GET', `${here}/PERTURB/{bit}`, 'read', { template: true }));
      if (verb === 'COMMIT') moves.push(move('COMMIT', 'GET', `${here}/COMMIT`, 'read (prepares the commit)'));
      if (verb === 'BUILD') moves.push(move('BUILD', 'GET', `${here}/BUILD`, 'read (prepares the build)'));
      if (verb === 'TALK') moves.push(move('TALK', 'GET', `${here}/TALK/acsp/{resource_id}`, 'read (prepares an ACSP proposal)', { template: true }));
    }
    if (s.prepared.length) moves.unshift(move('perform', 'POST', `${here}?session={your session id}`, s.prepared.map((p) => p.verb).join(' then '), { requires: 'a declared session id; no credential' }));
    return envelope('seurl-session', {
      seurl: here,
      state: s.state,
      prepared: s.prepared.length ? { moves: s.prepared, would_reach: s.would_reach, status: 'prepared — NOT performed. GET changed nothing.' } : null,
      bound: s.bound, program: s.program, current_address: s.current_address,
      term, value,
      compiles_to: s.current_address ? {
        value_address: s.current_address,
        scroll: s.prepared.some((p) => p.verb === 'COMMIT') ? { system: 'purl/0.1', type: 'scroll', steps: prefixes(s) } : null,
        acsp: s.prepared.filter((p) => p.verb === 'TALK').map((p) => ({ operation: 'propose', resource_id: p.to.resource_id })),
      } : null,
    }, moves);
  }

  function prefixes(s) {
    const out = [s.bound];
    let a = s.bound;
    for (const p of s.program) { a += '/' + p.op; out.push(a); }
    return out;
  }

  function requireSession(q) {
    const session = q.get('session');
    if (!session || !/^[A-Za-z0-9._:-]{3,128}$/.test(session)) {
      throw new CircleError(422, 'session_required', 'Mutations need a declared session id: ?session=<3-128 chars [A-Za-z0-9._:-]>. It is recorded as asserted, never verified or inferred.');
    }
    return { session_id: session, agent_id: q.get('agent') ?? null, assurance: 'asserted' };
  }

  async function seurlPerform(path, q) {
    const s = run(path);
    if (!s.prepared.length) throw new CircleError(405, 'nothing_to_perform', 'This SEURL path prepares no mutation (COMMIT, BUILD or TALK). GET it instead.');
    const author = requireSession(q);
    await seurlDoc(path, q); // type-check before any write
    const steps = [];
    let scroll = null;
    const parent = q.get('parent');
    for (const p of s.prepared) {
      if (p.verb === 'COMMIT') { scroll = await commitScroll(s, author, parent); steps.push({ verb: 'COMMIT', stage: 'committed', scroll }); }
      if (p.verb === 'BUILD') { const b = await buildScroll(scroll.id, author); steps.push({ verb: 'BUILD', stage: b.outcome, build: b }); if (b.outcome === 'FAILED') break; }
      if (p.verb === 'TALK') steps.push({ verb: 'TALK', ...(await talk(p.to.resource_id, scroll, author, s)) });
    }
    return envelope('seurl-performed', { seurl: pathOf(s.moves), author, steps, scroll },
      scroll ? [move('scroll', 'GET', `/scrolls/${scroll.id}`, 'read'), move('checkpoint', 'POST', `/checkpoints?session=${author.session_id}`, 'creates a checkpoint')] : []);
  }

  // ---- Scrolls --------------------------------------------------------------------
  async function commitScroll(s, author, parent, extra = {}) {
    const t = (await substrate.term(s.current_address)).json;
    let id;
    let version = 1;
    const state = {
      language: 'seurl/0', seurl: pathOf(s.moves.filter((m) => !['COMMIT', 'BUILD', 'TALK'].includes(m.verb))),
      bound: s.bound, program: s.program, steps: prefixes(s), address: s.current_address,
      term: { kind: t.kind, derivation_id: t.derivation_id }, author, constitution: { version: constitution().doc.version, content_id: constitution().content_id },
      parent: parent ?? null,
      content_id: sha256(pathOf(s.moves.filter((m) => !['COMMIT', 'BUILD', 'TALK'].includes(m.verb)))),
      ...extra,
    };
    if (parent) {
      const pdoc = await scrollDoc(parent); // must exist; never written
      const f = await purlOp(parent, 'fork', { note: `new version by ${author.session_id}` });
      id = f.resource.id;
      // PURL forks copy no grants (by design); a scroll version must be readable like its parent (F-C2)
      await purlOp(id, 'grant', { grantee: '*', rights: 'reader', purpose: 'public visibility (scroll version)' });
      const after = await purlOp(id, 'update', { merge_patch: state });
      version = after.resource.version;
      state.version_of = pdoc.id;
    } else {
      const r = await purlCreate('scroll', state);
      id = r.id;
    }
    return { id, href: `/scrolls/${id}`, purl: `/r/${id}`, version, address: s.current_address, derivation_id: t.derivation_id };
  }

  async function scrollDoc(id) {
    const d = await purlRead(id);
    if (d.type !== 'scroll') throw new CircleError(404, 'not_found', `${id} is not a scroll.`);
    // PURL fork copies collection entries (by design). A scroll's own records are those it made (F-C1).
    const own = (name) => (d.collections?.[name] ?? []).map((e) => e.body ?? e).filter((b) => b.scroll === d.id);
    const inherited = (name) => (d.collections?.[name] ?? []).map((e) => e.body ?? e).filter((b) => b.scroll !== d.id).length;
    return { id: d.id, version: d.version, state: d.state, owner: d.owner, raw: d,
      builds: own('builds'), talks: own('talks'), observations: own('observations'),
      inherited: { builds: inherited('builds'), talks: inherited('talks'), observations: inherited('observations') } };
  }

  async function buildScroll(id, author) {
    const sc = await scrollDoc(id);
    const records = [];
    let outcome = 'BUILT';
    let failure = null;
    for (const address of sc.state.steps) {
      const r = await substrate.record(address);
      if (!r.available) { outcome = 'FAILED'; failure = unavailable('adapter.substrate', r); break; }
      if (!r.ok) { outcome = 'FAILED'; failure = { address, error: r.json?.error }; break; }
      const x = r.json.execution;
      records.push({ address, execution_id: x.execution_id, execution_hash: x.execution_hash, derivation_id: x.derivation_id, value_id: x.value_id,
        environment_id: x.environment_id, deterministic_sha256: x.deterministic_sha256, epistemic_status: x.epistemic_status, kind: x.kind,
        rerun: r.json.rerun?.verdict ?? null, observations: r.json.observations ?? [] });
    }
    const build = { outcome, scroll: id, scroll_version: sc.version, by: author, records, failure, constitution: constitution().content_id };
    await purlOp(id, 'append', { collection: 'builds', body: build });
    return build;
  }

  // ---- ACSP: TALK -----------------------------------------------------------------
  function scrollTok(scroll, s, builds) {
    const last = builds.at(-1);
    const lines = [
      `Scroll ${scroll.id} (v${scroll.version}) at ${base()}/scrolls/${scroll.id}`,
      `SEURL: ${pathOf(s.moves.filter((m) => !['COMMIT', 'BUILD', 'TALK'].includes(m.verb)))}`,
      `Value address: ${scroll.address}`, `derivation_id: ${scroll.derivation_id}`,
    ];
    if (last) lines.push(`Build: ${last.outcome}; ${last.records.length} execution record(s)`, ...last.records.map((r) => `  ${r.address} value_id=${r.value_id ?? 'none (not materialized)'} status=${(r.epistemic_status ?? []).join(',')}`));
    lines.push('Epistemic status: computational result of executing a model in the substrate. Not an observation of any physical system.');
    return {
      type: 'observation', title: `Circle build of scroll ${scroll.id}`.slice(0, 200),
      summary: `A SEURL program was committed as a Scroll${last ? ` and built (${last.outcome})` : ''}. Values are identified by value_id; records are separate.`,
      content: lines.join('\n').slice(0, 20000), stated_confidence: 'unclassified',
      refs: [{ url: `${base()}/scrolls/${scroll.id}` }, { citation: `derivation_id ${scroll.derivation_id}` }],
    };
  }

  async function talk(resourceId, scroll, author, s) {
    if (!scroll) throw new CircleError(409, 'nothing_to_talk', 'TALK needs a committed scroll in the same program (…/COMMIT[/BUILD]/TALK/acsp/{id}).');
    const builds = (await scrollDoc(scroll.id)).builds;
    const tok = scrollTok(scroll, s, builds);
    const prep = await acsp.prepare(resourceId, { session_id: author.session_id, agent_id: author.agent_id ?? undefined, tok, rationale: 'Publish a circle Scroll build as continuity.' });
    if (!prep.available) return { stage: null, error: unavailable('adapter.acsp', prep) };
    if (!prep.ok) return { stage: null, error: prep.json?.error ?? prep.json, prepare_url: prep.prepare_url };
    if (!prep.json.validation?.valid) return { stage: 'prepared', valid: false, validation: prep.json.validation, prepare_url: prep.prepare_url };
    const sub = await acsp.submit(prep.json);
    const record = { scroll: scroll.id, system: 'acsp', resource_id: resourceId, stage: sub.stage ?? 'prepared', proposal_id: sub.proposal_id, status: sub.status, prepare_url: prep.prepare_url,
      note: 'submitted = a pending proposal. Committed only if the resource owner accepts it; the circle cannot do that.' };
    await purlOp(scroll.id, 'append', { collection: 'talks', body: record });
    let observation = null;
    if (sub.ok) {
      const ev = await acsp.events(resourceId);
      if (ev.ok) {
        const o = await substrate.observe('P-ACSP-EV-1', cfg.acspOrigin ?? 'harness', ev.json);
        observation = o.ok ? { scroll: scroll.id, observation_id: o.json.observation.observation_id, epistemic_status: o.json.observation.epistemic_status,
          measurements: o.json.observation.measurements, deterministic_sha256: o.json.observation.deterministic_sha256 } : { scroll: scroll.id, error: o.json ?? o.reason };
        await purlOp(scroll.id, 'append', { collection: 'observations', body: observation });
      }
    }
    return { ...record, observation, acsp_response: sub.json?.result ?? sub.json?.error ?? null };
  }

  // ---- aliases: measured recurrence ----------------------------------------------
  async function aliases() {
    const items = await purlList('scroll');
    const docs = [];
    for (const it of items) docs.push(await scrollDoc(it.id));
    const grams = new Map();
    for (const d of docs) {
      const ops = (d.state.program ?? []).map((p) => p.op);
      const seen = new Set();
      for (let n = 2; n <= ops.length; n++) for (let i = 0; i + n <= ops.length; i++) {
        const g = ops.slice(i, i + n).join('/');
        if (seen.has(g)) continue;
        seen.add(g);
        if (!grams.has(g)) grams.set(g, new Set());
        grams.get(g).add(d.id);
      }
    }
    const candidates = [...grams].filter(([, s]) => s.size >= 2).map(([g, s]) => ({ candidate_id: sha256(g).slice(0, 23), sequence: g.split('/').length ? g : g, scrolls: [...s].sort(), recurrence: s.size,
      stage: 'observed_recurrence', next_stage: 'candidate concept (needs a formal description and a nomenclature entry; never named automatically)' }))
      .sort((a, b) => b.recurrence - a.recurrence || b.sequence.length - a.sequence.length);
    const byValue = new Map();
    for (const d of docs) {
      const last = d.builds.at(-1)?.records?.at(-1); // only the scroll's own latest build (F-C1)
      if (last?.value_id && last.address === d.state.address) { if (!byValue.has(last.value_id)) byValue.set(last.value_id, new Set()); byValue.get(last.value_id).add(d.state.address); }
    }
    const equivalences = [...byValue].filter(([, s]) => s.size >= 2).map(([v, s]) => ({ value_id: v, addresses: [...s].sort(), relation: 'equal canonical value (substrate value_id)', status: 'computational' }));
    return envelope('alias-candidates', { scrolls_examined: docs.length, method: 'contiguous WRITE/PERTURB operation subsequences (length >= 2) occurring in >= 2 distinct scrolls; plus final-value equality across scrolls', candidates, equivalences }, [move('scrolls', 'GET', '/scrolls', 'read')]);
  }

  // ---- checkpoints ----------------------------------------------------------------
  async function makeCheckpoint(q, body) {
    const author = requireSession(q);
    // F-R1: fields may come in the JSON body or the query; unknown body fields are refused, never ignored
    const ALLOWED = ['next', 'scroll', 'acsp_resource'];
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const unknown = Object.keys(b).filter((k) => !ALLOWED.includes(k));
    if (unknown.length) throw new CircleError(422, 'unknown_fields', `A checkpoint body may carry only ${ALLOWED.join(', ')}; refused: ${unknown.join(', ')}.`, { allowed: ALLOWED });
    const field = (k) => b[k] ?? q.get(k) ?? null;
    const scrolls = [];
    for (const it of await purlList('scroll')) scrolls.push({ id: it.id, version: it.version });
    const env = await substrate.environment();
    const runs = await purlList('conformance-run');
    const acspId = field('acsp_resource') ?? cfg.acspResource ?? null; // F-R2: default to the configured continuity resource
    const acspState = acspId ? await acsp.status(acspId) : null;
    const state = {
      by: author, constitution: { version: constitution().doc.version, content_id: constitution().content_id },
      commits: cfg.commits ?? {}, protocols: { circle: CIRCLE_PROTOCOL, purl: 'PURL/0.1', substrate: 'substrate-purl/0 (provisional)', acsp: 'ACSP/0.1', seurl: 'seurl/0 (url-machine.md)' },
      scrolls, active_scroll: field('scroll') ?? scrolls.at(-1)?.id ?? null,
      substrate_environment_id: env.json?.environment_id ?? null,
      acsp: acspState?.ok ? { resource_id: acspId, version: acspState.json.version } : null,
      conformance_run: runs.at(-1)?.id ?? null,
      unresolved: cfg.unresolved ?? [],
      next: field('next'),
    };
    const content_id = sha256(state);
    const r = await purlCreate('circle-checkpoint', { ...state, content_id });
    return envelope('checkpoint', { id: r.id, content_id, ...state }, [move('resume', 'GET', `/resume/${r.id}`, 'read'), move('self', 'GET', `/checkpoints/${r.id}`, 'read')]);
  }

  async function resume(id) {
    const d = await purlRead(id);
    if (d.type !== 'circle-checkpoint') throw new CircleError(404, 'not_found', `${id} is not a checkpoint.`);
    const { content_id, ...rest } = d.state;
    const intact = sha256(rest) === content_id;
    const scrolls = [];
    for (const s of d.state.scrolls) {
      const cur = await purl.request('GET', `/r/${s.id}/status`);
      scrolls.push({ ...s, now: cur.json?.version ?? null, changed_since: cur.json?.version !== s.version });
    }
    const c = constitution();
    return envelope('resume', {
      checkpoint: id, intact, content_id,
      constitution_changed: c.content_id !== d.state.constitution.content_id,
      scrolls, active_scroll: d.state.active_scroll, next: d.state.next, unresolved: d.state.unresolved,
      semantics: 'Resuming re-reads addresses and records; no transcript is involved. Differences since the checkpoint are reported, not hidden.',
    }, [
      ...(d.state.active_scroll ? [move('active-scroll', 'GET', `/scrolls/${d.state.active_scroll}`, 'read')] : []),
      move('conformance', 'GET', '/conformance', 'read'), move('entry', 'GET', '/', 'read'),
    ]);
  }

  // ---- constitution and conformance ------------------------------------------------
  async function latestConformance() {
    const runs = await purlList('conformance-run');
    if (!runs.length) return envelope('conformance', { run: null, note: 'No conformance run recorded yet. POST /conformance/runs?session=… runs every check against this circle.' }, [move('run', 'POST', '/conformance/runs?session={id}', 'runs checks (creates test artifacts)')]);
    const d = await purlRead(runs.at(-1).id);
    return envelope('conformance', { run: d.id, ...d.state }, [move('history', 'GET', '/r?type=conformance-run', 'read', { system: 'purl' })]);
  }

  // ---- NAI-CI over circle documents --------------------------------------------------
  function affordances(doc) {
    const out = [];
    const walk = (o, path) => {
      if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${path}[${i}]`));
      if (o && typeof o === 'object') {
        if (typeof o.href === 'string' && o.method) out.push({ verb: o.method, target: o.href, rel: o.rel ?? null, effect: o.effect ?? null, template: Boolean(o.template), at: path });
        for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(doc, '');
    return out;
  }

  async function naici(prim, q) {
    const url = q.get('url') ?? '/';
    if (/^https?:/i.test(url) && !url.startsWith(base())) throw new CircleError(422, 'foreign_url', 'NAI-CI here reads circle URLs only (no third-party pages; directive §28).');
    const path = url.startsWith(base()) ? url.slice(base().length) || '/' : url;
    const { status, doc } = await dispatch('GET', path, null);
    const aff = affordances(doc);
    if (prim === 'surface') return envelope('naici-surface', { url: path, status, halt: doc.kind ?? null, state: doc.state ?? null, affordances: aff.filter((a) => a.rel !== null) }, [move('legal', 'GET', `/naici/legal?url=${encodeURIComponent(path)}`, 'read')]);
    if (prim === 'legal') return envelope('naici-legal', { url: path, status, legal: (doc.moves ?? []).map((m) => ({ verb: m.method, target: m.href, rel: m.rel, effect: m.effect, template: Boolean(m.template) })) }, []);
    if (prim === 'read') {
      const as = q.get('as') ?? 'tree';
      if (as === 'affordances') return envelope('naici-read', { url: path, as, affordances: aff }, []);
      if (as === 'tree') {
        const shape = (o, d) => (d > 3 ? '…' : Array.isArray(o) ? [o.length ? shape(o[0], d + 1) : null, `×${o.length}`] : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v, d + 1)])) : typeof o);
        return envelope('naici-read', { url: path, as, tree: shape(doc, 0) }, []);
      }
      if (as === 'blocks') {
        const blocks = [];
        const walk = (o, p) => { if (typeof o === 'string' && o.length > 40) blocks.push({ role: p.split('.').pop(), text: o }); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k); };
        walk(doc, '');
        return envelope('naici-read', { url: path, as, blocks }, []);
      }
      if (as === 'diff') {
        const m = /^\/scrolls\/([^/]+)$/.exec(path);
        if (!m) throw new CircleError(422, 'unsupported', 'diff is defined for scrolls only (/scrolls/{id}): it is their PURL event log after &from=<version>.');
        const ev = await purl.request('GET', `/r/${m[1]}/events?since=${Number(q.get('from') ?? 0)}`);
        return envelope('naici-read', { url: path, as, from: Number(q.get('from') ?? 0), events: ev.json?.events?.map((e) => ({ version: e.version, kind: e.kind, op: e.op, actor: e.actor })) ?? [] }, []);
      }
      throw new CircleError(422, 'unsupported', 'as must be tree | affordances | blocks | diff');
    }
    if (prim === 'trace') {
      const m = /^\/scrolls\/([^/]+)$/.exec(path);
      if (m) {
        const ev = await purl.request('GET', `/r/${m[1]}/events`);
        return envelope('naici-trace', { url: path, transitions: ev.json?.events?.map((e) => ({ version: e.version, kind: e.kind, op: e.op, actor: e.actor, at: e.at ?? e.recorded_at ?? null })) ?? [] }, []);
      }
      if (path.startsWith('/seurl/')) return envelope('naici-trace', { url: path, transitions: parseMoves(path.slice(6)).map((mv, i) => ({ t: i + 1, verb: mv.verb, args: mv.args })) }, []);
      throw new CircleError(422, 'unsupported', 'trace is defined for /scrolls/{id} (recorded transitions) and /seurl/… (the moves the URL encodes).');
    }
    throw new CircleError(404, 'not_found', 'NAI-CI primitives: surface, read, legal, trace.');
  }

  // ---- IDE surface: everything derived from live state ------------------------------
  async function ideState() {
    const c = constitution();
    const [scrolls, checkpoints, runs, amendments] = await Promise.all(['scroll', 'circle-checkpoint', 'conformance-run', 'amendment'].map(purlList));
    const [sEnv, aDisc, gHealth] = await Promise.all([substrate.environment(), acsp.discovery(), golden.health()]);
    const lastRun = runs.length ? (await purlRead(runs.at(-1).id)).state : null;
    const scrollDocs = [];
    for (const it of scrolls.slice(-10)) {
      const d = await scrollDoc(it.id);
      scrollDocs.push({ id: d.id, version: d.version, address: d.state.address, author: d.state.author?.session_id, parent: d.state.parent, builds: d.builds.map((b) => b.outcome), talks: d.talks.map((t) => t.stage) });
    }
    return envelope('ide-state', {
      derived_from: 'live reads of PURL resources, the substrate, ACSP and the relay at request time; nothing here is stored by the circle',
      constitution: { version: c.doc.version, content_id: c.content_id, clauses: c.doc.clauses.length },
      systems: {
        substrate: sEnv.available ? { reachable: true, environment_id: sEnv.json?.environment_id, operations: sEnv.json?.operations?.length } : { reachable: false, reason: sEnv.reason },
        acsp: aDisc.available ? { reachable: true, protocol: aDisc.json?.protocol?.version } : { reachable: false, reason: aDisc.reason },
        golden_surface: gHealth.available ? { reachable: true, phone: gHealth.json?.phone ?? null } : { reachable: false, reason: gHealth.reason },
        purl: { reachable: true, base: cfg.purlBase },
      },
      scrolls: { count: scrolls.length, recent: scrollDocs },
      checkpoints: checkpoints.map((x) => x.id),
      conformance: lastRun ? { run_at: lastRun.ran_at, commit: lastRun.commit, summary: lastRun.summary, failed: lastRun.clauses.filter((x) => x.status === 'FAILED').map((x) => x.id) } : null,
      amendments: amendments.map((x) => x.id),
      unresolved: cfg.unresolved ?? [],
    }, [move('aliases', 'GET', '/aliases', 'read'), move('conformance', 'GET', '/conformance', 'read'), move('entry', 'GET', '/', 'read')]);
  }

  // ---- ACSP resource -> computationally addressable representation (read-only) ------
  async function acspView(id, at) {
    const st = await acsp.resource(id);
    if (!st.available) throw Object.assign(new CircleError(503, 'unavailable_here', 'ACSP unreachable'), { details: unavailable('adapter.acsp', st) });
    if (!st.ok) throw new CircleError(st.status, 'acsp_error', st.json?.error?.message ?? 'ACSP error');
    const d = st.json;
    const cps = d.checkpoints?.items ?? d.checkpoints ?? [];
    return envelope('acsp-record', {
      address: `/acsp/r/${id}`, record_of: 'an ACSP/0.1 resource (a RECORD, not a value: it changes by events and carries authority)',
      identity: {
        record: { resource_id: id, version: d.state.version, address_id: sha256({ address: `/acsp/r/${id}` }) },
        checkpoint_values: cps.map((c) => ({ number: c.number, version: c.version, value_id: c.sha256, note: 'ACSP snapshot hash: the value of the resource at that version' })),
        view: 'this document; ephemeral, not persisted',
      },
      lifecycle: d.state.lifecycle, counts: d.state.counts, owner: d.ownership?.owner ?? null,
      authority: 'Reading confers nothing. The circle holds no capability for this resource.',
    }, [
      move('events', 'GET', `/acsp/r/${id}/events`, 'read'),
      move('project', 'POST', `/acsp/r/${id}/observe?origin=service|harness`, 'records a SubstrateIO observation of the event list'),
      move('source', 'GET', `${cfg.acspBase}/r/${id}`, 'read', { system: 'acsp' }),
    ]);
  }

  // ---- router -----------------------------------------------------------------------
  const bridge = createBridge({ substrate, acsp, purl, purlRead, purlList, envelope, move, CircleError, constitution, cfg, scrollDoc, requireSession, commitScroll, handle: (...a) => handle(...a) });

  async function dispatch(method, rawPath, body) {
    const u = new URL(rawPath, 'http://circle.invalid');
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, '') || '/';
    const q = u.searchParams;
    for (const k of ['cap', 'capability', 'token', 'access_token', 'key']) {
      if (q.has(k)) throw new CircleError(400, 'credential_in_url', `Credentials never travel in URLs (found "${k}"). The circle holds no authority on your behalf and accepts none this way.`);
    }
    const ext = await bridge.dispatch(method, path, q, body);
    if (ext) return { status: method === 'POST' && ext.kind !== 'prompt-classification' ? 201 : 200, doc: ext };
    if (method === 'GET') {
      if (path === '/') return { status: 200, doc: entry() };
      if (path === '/constitution') { const c = constitution(); return { status: 200, doc: envelope('constitution', { content_id: c.content_id, document: c.doc }, c.doc.clauses.map((k) => move(k.id, 'GET', `/constitution/clauses/${k.id}`, 'read'))) }; }
      if (path.startsWith('/constitution/clauses/')) {
        const k = constitution().doc.clauses.find((x) => x.id === path.split('/').pop());
        if (!k) throw new CircleError(404, 'not_found', 'No such clause.');
        return { status: 200, doc: envelope('clause', { clause: k }, [move('conformance', 'GET', '/conformance', 'read')]) };
      }
      if (path === '/conformance') return { status: 200, doc: await latestConformance() };
      if (path === '/adapters') return { status: 200, doc: envelope('adapters', { adapters: [substrate.describe(), acsp.describe(), golden.describe()] }) };
      if (path === '/operations') { const r = await substrate.resolve('/operations'); if (!r.available) throw Object.assign(new CircleError(503, 'unavailable_here', 'substrate unreachable'), { details: unavailable('adapter.substrate', r) }); return { status: 200, doc: envelope('operations', { source: 'substrate', registry: r.json }) }; }
      if (path.startsWith('/term/') || path.startsWith('/v/')) {
        const addr = path.slice(path.indexOf('/', 1));
        const r = path.startsWith('/term/') ? await substrate.term(addr) : await substrate.resolve(addr);
        if (!r.available) throw Object.assign(new CircleError(503, 'unavailable_here', 'substrate unreachable'), { details: unavailable('adapter.substrate', r) });
        return { status: r.status, doc: envelope(path.startsWith('/term/') ? 'term' : 'value', { address: addr, substrate: r.json }, [move('START', 'GET', `/seurl/START${addr}`, 'read')]) };
      }
      if (path.startsWith('/seurl')) return { status: 200, doc: await seurlDoc(path.slice('/seurl'.length), q) };
      if (path === '/scrolls') {
        const items = await purlList('scroll');
        return { status: 200, doc: envelope('scrolls', { count: items.length, items: items.map((x) => ({ id: x.id, version: x.version, href: `/scrolls/${x.id}` })) }, items.map((x) => move('scroll', 'GET', `/scrolls/${x.id}`, 'read'))) };
      }
      if (/^\/scrolls\/[^/]+$/.test(path)) {
        const d = await scrollDoc(path.split('/')[2]);
        return { status: 200, doc: envelope('scroll', { id: d.id, version: d.version, owner: d.owner, ...d.state, builds: d.builds, talks: d.talks, observations: d.observations, perturbations: bridge.perturbations(d), inherited_from_parent: d.inherited, purl: `${cfg.purlBase}/r/${d.id}`,
          version_semantics: 'version is the PURL event count of this record (genesis, grant, each build/talk/observation append). A build records the version it ran against. Scroll *versions* in the program sense are forks (parent).' }, [
          move('rebuild', 'POST', `/scrolls/${d.id}/build?session={id}`, 'executes every step again and records it'),
          move('new-version', 'POST', `/seurl${d.state.seurl.slice('/seurl'.length)}/COMMIT?session={id}&parent=${d.id}`, 'commits a fork as the next version; this one is untouched', { template: true }),
          move('replay', 'GET', `${cfg.purlBase}/r/${d.id}/verify`, 'read', { system: 'purl' }),
          move('trace', 'GET', `/naici/trace?url=/scrolls/${d.id}`, 'read'),
        ]) };
      }
      if (path === '/aliases') return { status: 200, doc: await aliases() };
      if (path === '/state') return { status: 200, doc: await ideState() };
      if (path === '/checkpoints') { const items = await purlList('circle-checkpoint'); return { status: 200, doc: envelope('checkpoints', { items: items.map((x) => ({ id: x.id, href: `/checkpoints/${x.id}` })) }, [move('create', 'POST', '/checkpoints?session={id}', 'creates a checkpoint')]) }; }
      if (path.startsWith('/checkpoints/')) { const d = await purlRead(path.split('/')[2]); return { status: 200, doc: envelope('checkpoint', { id: d.id, ...d.state }, [move('resume', 'GET', `/resume/${d.id}`, 'read')]) }; }
      if (path.startsWith('/resume/')) return { status: 200, doc: await resume(path.split('/')[2]) };
      if (path.startsWith('/naici/')) return { status: 200, doc: await naici(path.split('/')[2], q) };
      let m = /^\/acsp\/r\/([^/]+)$/.exec(path);
      if (m) return { status: 200, doc: await acspView(m[1]) };
      m = /^\/acsp\/r\/([^/]+)\/events$/.exec(path);
      if (m) { const r = await acsp.events(m[1]); if (!r.available) throw Object.assign(new CircleError(503, 'unavailable_here', 'ACSP unreachable'), { details: unavailable('adapter.acsp', r) }); return { status: r.status, doc: envelope('acsp-events', { source: r.url, document: r.json }) }; }
      throw new CircleError(404, 'not_found', `Nothing at ${path}. Start at /.`);
    }
    if (method === 'POST') {
      if (path.startsWith('/seurl')) return { status: 201, doc: await seurlPerform(path.slice('/seurl'.length), q) };
      let m = /^\/scrolls\/([^/]+)\/build$/.exec(path);
      if (m) { const author = requireSession(q); return { status: 201, doc: envelope('build', { build: await buildScroll(m[1], author) }, [move('scroll', 'GET', `/scrolls/${m[1]}`, 'read')]) }; }
      if (path === '/checkpoints') return { status: 201, doc: await makeCheckpoint(q, body) };
      m = /^\/acsp\/r\/([^/]+)\/observe$/.exec(path);
      if (m) {
        requireSession(q);
        const ev = await acsp.events(m[1]);
        if (!ev.ok) throw new CircleError(ev.available ? ev.status : 503, 'acsp_error', 'could not read ACSP events', { reason: ev.reason });
        const o = await substrate.observe('P-ACSP-EV-1', q.get('origin') ?? '', ev.json);
        return { status: o.status ?? 503, doc: envelope('observation', { substrate: o.json ?? unavailable('adapter.substrate', o) }) };
      }
      if (path === '/constitution/amendments') {
        const author = requireSession(q);
        const b = body ?? {};
        if (!b.clause || !b.proposed_text || !b.reason) throw new CircleError(422, 'invalid_amendment', 'An amendment needs {clause, proposed_text, reason, evidence?: [refs]}.');
        const r = await purlCreate('amendment', { ...b, by: author, status: 'proposed', against: constitution().content_id, adoption: 'only by a human-authored commit to circle/constitution; the circle cannot adopt' });
        return { status: 201, doc: envelope('amendment', { id: r.id, status: 'proposed' }, [move('self', 'GET', `${cfg.purlBase}/r/${r.id}`, 'read', { system: 'purl' })]) };
      }
      if (path === '/conformance/runs') {
        const author = requireSession(q);
        if (!cfg.runConformance) throw new CircleError(501, 'unavailable_here', 'No conformance runner is wired into this circle process.');
        const result = await cfg.runConformance(api, author);
        const r = await purlCreate('conformance-run', result);
        return { status: 201, doc: envelope('conformance', { run: r.id, ...result }) };
      }
      if (path === '/constitution' || path.startsWith('/constitution/clauses')) throw new CircleError(405, 'not_writable', 'The constitution is not writable through the system it governs. Propose: POST /constitution/amendments.');
      throw new CircleError(404, 'not_found', `No POST at ${path}.`);
    }
    throw new CircleError(405, 'method_not_allowed', 'GET reads or prepares; POST performs.');
  }

  async function handle(method, rawPath, body) {
    try {
      return await dispatch(method, rawPath, body);
    } catch (e) {
      if (e instanceof CircleError || e instanceof SeurlError) {
        return { status: e.status, doc: { protocol: CIRCLE_PROTOCOL, kind: 'error', error: { status: e.status, code: e.code, message: e.message, ...e.details }, moves: [move('entry', 'GET', '/', 'read')] } };
      }
      return { status: 500, doc: { protocol: CIRCLE_PROTOCOL, kind: 'error', error: { status: 500, code: 'internal', message: String(e?.message ?? e) } } };
    }
  }

  const api = { handle, purl, substrate, acsp, golden, secrets, constitution, cfg, purlList, purlRead, bridge };
  return api;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** HTML for browser-only agents: the same JSON, with every GET href a link. No prose is added. */
function asHtml(doc) {
  const json = esc(JSON.stringify(doc, null, 1)).replace(/(&quot;href&quot;: &quot;)(\/[^&\s{]*)(&quot;)/g, '$1<a href="$2">$2</a>$3');
  // the observatory is a live terminal: its HTML view re-reads the records every 3 s (it stores nothing)
  const refresh = doc.kind === 'observatory' ? '<meta http-equiv="refresh" content="3">' : '';
  return `<!doctype html><meta charset="utf-8">${refresh}<title>${esc(String(doc.kind ?? 'circle'))}</title><pre>${json}</pre>`;
}

export function createCircleServer(cfg) {
  const circle = createCircle(cfg);
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = null;
    if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks)); } catch { body = null; } }
    const { status, doc } = await circle.handle(req.method, req.url, body);
    const html = (req.headers.accept ?? '').includes('text/html') && !req.url.includes('format=json');
    const out = html ? asHtml(doc) : JSON.stringify(doc, null, 1) + '\n';
    res.writeHead(status, { 'Content-Type': html ? 'text/html; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store' });
    res.end(out);
  });
  return { server, circle };
}

export { canonicalize };
