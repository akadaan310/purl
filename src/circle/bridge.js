// Bridge surfaces added at STASIS-2. Every handler here is either pure (GET) or an
// explicit POST, and reaches other systems only through the circle's adapters.
//
//   /sdk …              self-description (version, routes, schemas, constitution, provenance)
//   /prompt-contract    when a prompt is a program, and when it is conversation
//   /programs …         programs as first-class objects; transformation with build_id/content_id
//   /transitions …      the addressed-transition projection of seven record kinds (C-052)
//   /git/{repo}/{sha}   a commit as a transition (read-only)
//   /tests …            conformance checks as addressable test artifacts
//   /observatory        the live development terminal, derived from records
//   /stases …           cross-repository baselines (C-049)

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, parseMoves, pathOf, MUTATING } from './seurl.js';
import { sha256 } from './adapters.js';
import { CHECK_SPECS } from './conformance.js';
import { createIde, IDE_STAGES } from './ide.js';

export const DESCRIPTOR = {
  module: 'src/circle/bridge.js',
  claims: ['ROUTES is the complete route table of the circle (routeOf classifies against it)', 'transformers are pure functions over moves, versioned by the hash of their source', 'GET handlers here change nothing; POST /programs/transform commits a new Scroll only if the result is well-typed'],
  requires: { modules: ['./seurl.js', './adapters.js', './conformance.js', './ide.js'], services: ['substrate (typing)', 'PURL (records)', 'ACSP (projections)'], files: ['circle/constitution/*.json', 'circle/stases.json', 'circle/experiments/axes/*'] },
  produces: ['DESCRIPTOR', 'SDK_VERSION', 'SDK_GREETING', 'ROUTES', 'routeOf', 'transformerVersion', 'createBridge'],
  changes: ['PURL scroll records (POST /programs/transform)'],
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
export const SDK_VERSION = 'circle-sdk/0.3';
export const SDK_GREETING = 'You have entered a programmable computational substrate. Everything here is addressable. GET shows what an operation would do and changes nothing; POST, with your declared session, does it. Start at /sdk.';

// ---------------------------------------------------------------------------
// Routes: the SDK's operation table. Every route the circle serves is listed here;
// a test checks the list against the router (sdk_describes_itself).
// ---------------------------------------------------------------------------
export const ROUTES = [
  ['GET', '/', 'ADDRESS', 'pure', 'entry: protocol, verbs, grammar, systems, moves'],
  ['GET', '/sdk', 'ADDRESS', 'pure', 'this self-description'],
  ['GET', '/sdk/constitution', 'ADDRESS', 'pure', 'the SDK constitution'],
  ['GET', '/sdk/schemas', 'ADDRESS', 'pure', 'schemas of the documents the SDK returns'],
  ['GET', '/sdk/schemas/{name}', 'ADDRESS', 'pure', 'one schema'],
  ['GET', '/nomenclature', 'RESOLVE', 'pure', 'the term registry (substrateIO), with status and scope'],
  ['GET', '/nomenclature/{id}', 'RESOLVE', 'pure', 'one term'],
  ['GET', '/experiments', 'RESOLVE', 'pure', 'experiments: SPECs and records, failed and invalid ones included'],
  ['GET', '/experiments/{name}', 'RESOLVE', 'pure', 'one experiment'],
  ['GET', '/research', 'RESOLVE', 'pure', 'research state: hypotheses, open problems, research queue (read-only view)'],
  ['GET', '/research/open', 'RESOLVE', 'pure', 'open questions only'],
  ['GET', '/examples', 'ADDRESS', 'pure', 'worked examples, each a URL to GET'],
  ['GET', '/code', 'RESOLVE', 'pure', 'module descriptors (claims, requires, produces, changes) verified against the source'],
  ['GET', '/code/{module}', 'RESOLVE', 'pure', 'one module descriptor and its verification'],
  ['GET', '/ide?program={seurl}', 'ADDRESS', 'pure', 'the eight IDE stages for a program, each a URL'],
  ['GET', '/ide/{stage}?program={seurl}', 'PARSE', 'pure', 'one stage: discover, parse, type, plan, build, execute (pure value), observe, record (described, never performed)'],
  ['GET', '/constitution', 'RESOLVE', 'pure', 'bridge constitution v1'],
  ['GET', '/constitution/model', 'RESOLVE', 'pure', 'constitution / enforcement / implementation / evidence / authority identities and the three axes'],
  ['GET', '/constitution/axes', 'RESOLVE', 'pure', 'recorded quadrant probes of conformance x authority'],
  ['GET', '/constitution/clauses/{id}', 'RESOLVE', 'pure', 'one clause'],
  ['POST', '/constitution/amendments?session={s}', 'RECORD', 'append-only', 'propose an amendment (never adopts)'],
  ['GET', '/conformance', 'RESOLVE', 'pure', 'latest conformance run'],
  ['POST', '/conformance/runs?session={s}', 'EXECUTE', 'creates test artifacts', 'run every constitutional check'],
  ['GET', '/tests', 'RESOLVE', 'pure', 'conformance runs as test suites (failed runs included)'],
  ['GET', '/tests/{run}', 'RESOLVE', 'pure', 'one run: every check as a test artifact'],
  ['GET', '/tests/{run}/{check}', 'RESOLVE', 'pure', 'one test artifact with hash and provenance'],
  ['GET', '/prompt-contract', 'ADDRESS', 'pure', 'prompt contract schema and the program/conversation boundary'],
  ['GET', '/prompts/classify?p={json}', 'PARSE', 'pure', 'classify a prompt; never executes'],
  ['POST', '/prompts/classify', 'PARSE', 'pure (POST only to carry a body)', 'classify a prompt; never executes'],
  ['GET', '/operations', 'RESOLVE', 'pure', 'substrate operation registry'],
  ['GET', '/term/{value address}', 'PARSE', 'pure', 'typed term, not evaluated'],
  ['GET', '/v/{value address}', 'RESOLVE', 'pure', 'value with identity'],
  ['GET', '/seurl/{moves}', 'PARSE', 'pure', 'SEURL session: FSM state, term, value, legal moves; prepares mutations'],
  ['POST', '/seurl/{moves}?session={s}', 'RECORD', 'COMMIT/BUILD/TALK as prepared', 'perform the prepared mutations'],
  ['GET', '/programs', 'RESOLVE', 'pure', 'every program (circle Scroll) with content_id and lineage'],
  ['GET', '/programs/transform?source={seurl|scroll}&t={transformer}&p={params}', 'BUILD', 'pure', 'prepare program -> program with build_id'],
  ['POST', '/programs/transform?source={…}&t={…}&p={…}&session={s}', 'BUILD', 'append-only', 'commit the transformed program as a new Scroll'],
  ['GET', '/programs/transformers', 'ADDRESS', 'pure', 'the declared transformers and their versions'],
  ['GET', '/programs/closure?source={…}&depth={1|2}', 'BUILD', 'pure', 'closure of a program under the transformers (typing only)'],
  ['GET', '/scrolls', 'RESOLVE', 'pure', 'circle Scrolls'],
  ['GET', '/scrolls/{id}', 'RESOLVE', 'pure', 'one Scroll: program, builds, talks, observations, perturbations'],
  ['POST', '/scrolls/{id}/build?session={s}', 'EXECUTE', 'append-only', 'record an execution of every step'],
  ['GET', '/aliases', 'OBSERVE', 'pure', 'measured recurrences (never named automatically)'],
  ['GET', '/transitions/coverage', 'PROJECT', 'pure', 'addressed-transition projection of seven record kinds, field coverage'],
  ['GET', '/transitions/{system}/{ref}', 'PROJECT', 'pure', 'one record kind projected (purl, acsp, substrate, git, seurl, checkpoint)'],
  ['GET', '/git/{repo}/{commit}', 'PROJECT', 'pure', 'a git commit as a transition (read-only)'],
  ['GET', '/checkpoints', 'RESOLVE', 'pure', 'checkpoints'],
  ['GET', '/checkpoints/{id}', 'RESOLVE', 'pure', 'one checkpoint'],
  ['POST', '/checkpoints?session={s}', 'RECORD', 'append-only', 'create a checkpoint'],
  ['GET', '/resume/{id}', 'RECONSTRUCT', 'pure', 'resume from a checkpoint; drift reported'],
  ['GET', '/stases', 'RECONSTRUCT', 'pure', 'cross-repository baselines'],
  ['GET', '/stases/{n}', 'RECONSTRUCT', 'pure', 'one baseline'],
  ['GET', '/observatory', 'OBSERVE', 'pure', 'live terminal derived from records'],
  ['GET', '/projections', 'PROJECT', 'pure', 'declared projections: P-ACSP-EV-1 (substrate) and the addressed-transition projectors'],
  ['GET', '/state', 'OBSERVE', 'pure', 'IDE state'],
  ['GET', '/adapters', 'ADDRESS', 'pure', 'adapter contracts'],
  ['GET', '/acsp/r/{id}', 'PROJECT', 'pure', 'an ACSP record, addressable here'],
  ['GET', '/acsp/r/{id}/events', 'RESOLVE', 'pure', 'ACSP events'],
  ['POST', '/acsp/r/{id}/observe?session={s}&origin={o}', 'OBSERVE', 'append-only', 'record P-ACSP-EV-1 observation'],
  ['GET', '/naici/{surface|read|legal|trace}?url={circle url}', 'OBSERVE', 'pure', 'NAI-CI structures of circle documents'],
].map(([method, path, edge, effect, description]) => ({ method, path, edge, effect, description }));

const routeRegex = (p) => new RegExp('^' + p.split('?')[0].replace(/[.*+^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]*\}/g, '[^?]+') + '$');
export function routeOf(method, path) {
  return ROUTES.find((r) => r.method === method && routeRegex(r.path).test(path)) ?? null;
}

// ---------------------------------------------------------------------------
// Program transformation (C-053). Transformers are pure functions over moves,
// versioned by the hash of their own source.
// ---------------------------------------------------------------------------
const TRANSFORMERS = {
  extend: { params: 'op segments (e.g. next or trace/8)', fn: (m, a) => [...m, { verb: 'WRITE', args: a }] },
  perturb: { params: 'bit index', fn: (m, a) => [...m, { verb: 'PERTURB', args: a.slice(0, 1) }] },
  iterate: { params: 'k (repeat the program body k times)', fn: (m, a) => [m[0], ...Array.from({ length: Math.min(8, Number(a[0]) || 1) }, () => m.slice(1)).flat()] },
  truncate: { params: 'none (drop the last move)', fn: (m) => (m.length > 1 ? m.slice(0, -1) : m) },
  retarget: { params: 'value address segments', fn: (m, a) => [{ verb: 'START', args: a }, ...m.slice(1)] },
};
export const transformerVersion = (name) => sha256(TRANSFORMERS[name].fn.toString());
const CLOSURE_SET = [['extend', ['next']], ['extend', ['orbit']], ['perturb', ['0']], ['iterate', ['2']], ['truncate', []]];

const programText = (moves) => pathOf(moves.filter((m) => !MUTATING.has(m.verb)));

export function createBridge(x) {
  const { substrate, acsp, purl, purlRead, purlList, envelope, move, CircleError, constitution, cfg, scrollDoc, requireSession, commitScroll, handle } = x;

  // ---- programs -------------------------------------------------------------
  async function sourceOf(q) {
    const src = q.get('source');
    if (!src) throw new CircleError(422, 'missing_source', 'source must be a SEURL path (/seurl/START/…) or a scroll id (r_…).');
    if (/^r_[0-9A-Z]+$/.test(src)) {
      const d = await scrollDoc(src);
      return { text: d.state.seurl, scroll: d.id, scroll_version: d.version };
    }
    const text = src.startsWith('/seurl/') ? src : '/seurl/' + src.replace(/^\/+/, '');
    return { text, scroll: null };
  }

  async function typed(text) {
    let s;
    try { s = run(text.slice('/seurl'.length)); } catch (e) { return { ok: false, stage: 'fsm', error: { code: e.code, message: e.message } }; }
    if (!s.current_address) return { ok: false, stage: 'fsm', error: { code: 'unbound', message: 'program binds no address' } };
    const t = await substrate.term(s.current_address);
    if (!t.available) return { ok: false, stage: 'substrate', error: { code: 'unavailable_here', message: t.reason } };
    if (!t.ok) return { ok: false, stage: 'type', error: t.json?.error };
    return { ok: true, fsm_state: s.state, address: s.current_address, kind: t.json.kind, derivation_id: t.json.derivation_id };
  }

  async function transform(q) {
    const name = q.get('t');
    if (!TRANSFORMERS[name]) throw new CircleError(404, 'unknown_transformer', `Transformers: ${Object.keys(TRANSFORMERS).join(', ')}.`);
    const src = await sourceOf(q);
    const params = (q.get('p') ?? '').split('/').filter(Boolean);
    const moves = parseMoves(src.text.slice('/seurl'.length)).filter((m) => !MUTATING.has(m.verb));
    const resultText = programText(TRANSFORMERS[name].fn(moves, params));
    const source_content_id = sha256(src.text);
    const build = { source_content_id, transformer: name, transformer_version: transformerVersion(name), params, target: 'seurl/0 move word', environment: 'circle/0' };
    return {
      source: { ...src, content_id: source_content_id, typed: await typed(src.text) },
      transformer: { id: name, version: build.transformer_version, params },
      build_id: sha256(build), build,
      result: { text: resultText, content_id: sha256(resultText), typed: await typed(resultText) },
      semantics: 'A transformation produces program TEXT. Being generated is not being correct: the result is typed here, and built and executed only by an explicit BUILD.',
    };
  }

  async function programs() {
    const items = [];
    for (const it of await purlList('scroll')) {
      const d = await scrollDoc(it.id);
      items.push({ id: d.id, version: d.version, program: d.state.seurl, content_id: sha256(d.state.seurl), derivation_id: d.state.term?.derivation_id,
        parent: d.state.parent ?? null, derived_from: d.state.derived_from ?? null, builds: d.builds.map((b) => b.outcome), href: `/scrolls/${d.id}` });
    }
    return items;
  }

  async function closure(q) {
    const depth = Math.min(2, Number(q.get('depth') ?? 1));
    const src = await sourceOf(q);
    let frontier = [src.text];
    const seen = new Map([[sha256(src.text), { text: src.text, depth: 0, typed: await typed(src.text) }]]);
    for (let d = 1; d <= depth; d++) {
      const next = [];
      for (const text of frontier) for (const [t, p] of CLOSURE_SET) {
        const moves = parseMoves(text.slice('/seurl'.length));
        const out = programText(TRANSFORMERS[t].fn(moves, p));
        const cid = sha256(out);
        if (seen.has(cid)) continue;
        const ty = await typed(out);
        seen.set(cid, { text: out, depth: d, via: `${t}(${p.join('/')})`, typed: ty });
        if (ty.ok) next.push(out);
      }
      frontier = next;
    }
    const results = [...seen.values()].filter((r) => r.depth > 0);
    const ok = results.filter((r) => r.typed.ok).length;
    return { source: src.text, depth, transformers: CLOSURE_SET.map(([t, p]) => `${t}(${p.join('/')})`), distinct_results: results.length, well_typed: ok,
      closure_fraction: results.length ? ok / results.length : null,
      failures_by_stage: results.filter((r) => !r.typed.ok).reduce((a, r) => ({ ...a, [r.typed.stage]: (a[r.typed.stage] ?? 0) + 1 }), {}),
      results, measure: 'fraction of distinct transformation results that are FSM-legal and well-typed. Typing only: execution is not attempted here (GET is pure).' };
  }

  // ---- addressed transitions (C-052) -------------------------------------------
  const FIELDS = ['source_ref', 'operation', 'target_ref', 'actor', 'clock', 'content_id'];
  const T = (system, o) => ({ system, ...Object.fromEntries(FIELDS.map((f) => [f, o[f] ?? null])), lost: FIELDS.filter((f) => o[f] == null || (f === 'clock' && o.clock?.position == null)) });
  const P = {
    purl: (res, e) => T('purl-event', { source_ref: `purl:/r/${res}@${e.version - 1}`, operation: e.op ?? e.kind, target_ref: `purl:/r/${res}@${e.version}`, actor: e.actor, clock: { domain: `purl:/r/${res}`, position: e.version }, content_id: e.hash }),
    acsp: (res, e) => T('acsp-event', { source_ref: `acsp:${res}@${e.parent_version}`, operation: e.operation, target_ref: `acsp:${res}@${e.version}`, actor: e.actor?.session_id, clock: { domain: `acsp:${res}`, position: e.version }, content_id: e.request_hash }),
    substrate: (x) => T('substrate-execution', { source_ref: `substrate:${x.purl ?? x.address}`, operation: 'execute', target_ref: x.value_id ? `value:${x.value_id}` : null, actor: null, clock: { domain: 'substrate:store', position: Number(String(x.execution_id).replace(/\D/g, '')) || null }, content_id: x.execution_hash }),
    seurl: (text, i) => { const ms = parseMoves(text.slice('/seurl'.length)); const pre = pathOf(ms.slice(0, i)); const post = pathOf(ms.slice(0, i + 1));
      return T('seurl-move', { source_ref: `seurl:${i ? pre : '(IDLE)'}`, operation: ms[i].verb, target_ref: `seurl:${post}`, actor: null, clock: { domain: `seurl:${text}`, position: i + 1 }, content_id: sha256(post) }); },
    git: (repo, c) => T('git-commit', { source_ref: c.parents.length ? `git:${repo}@${c.parents[0]}` : null, operation: 'commit', target_ref: `git:${repo}@${c.commit}`, actor: c.author, clock: { domain: `git:${repo}`, position: null }, content_id: `git-tree:${c.tree}` }),
    golden: (s) => T('golden-action', { source_ref: s.tab ? `golden:tab/${s.tab}` : null, operation: s.name, target_ref: s.tab ? `golden:tab/${s.tab}` : null, actor: 'seat:r', clock: null, content_id: null }),
    checkpoint: (c, i) => T('circle-checkpoint', { source_ref: c.active_scroll ? `purl:/r/${c.active_scroll}` : null, operation: 'checkpoint', target_ref: `purl:/r/${c.id}@1`, actor: c.by?.session_id, clock: { domain: 'circle:checkpoints', position: i + 1 }, content_id: c.content_id }),
  };

  function gitCommit(repo, sha) {
    const dir = cfg.gitRepos?.[repo];
    if (!dir) throw new CircleError(404, 'unknown_repo', `Configured repositories: ${Object.keys(cfg.gitRepos ?? {}).join(', ') || 'none (set GIT_REPOS=name=path,…)'}.`);
    if (!/^[0-9a-fA-F]{4,40}$|^HEAD$/.test(sha)) throw new CircleError(400, 'malformed', 'commit must be a hex id or HEAD');
    try {
      const out = execFileSync('git', ['-C', dir, 'show', '-s', '--format=%H%n%T%n%P%n%an%n%cI%n%s', sha], { encoding: 'utf8' }).split('\n');
      const stat = execFileSync('git', ['-C', dir, 'show', '--shortstat', '--format=', sha], { encoding: 'utf8' }).trim();
      const gen = Number(execFileSync('git', ['-C', dir, 'rev-list', '--count', sha], { encoding: 'utf8' }).trim());
      return { repo, commit: out[0], tree: out[1], parents: out[2].split(' ').filter(Boolean), author: out[3], committed_at: out[4], subject: out[5], diffstat: stat, generation: gen };
    } catch {
      throw new CircleError(404, 'not_found', `No commit ${sha} in ${repo}.`);
    }
  }

  async function coverage() {
    const rows = [];
    const scrolls = await purlList('scroll');
    if (scrolls.length) {
      const id = scrolls.at(-1).id;
      const ev = await purl.request('GET', `/r/${id}/events`);
      for (const e of ev.json?.events ?? []) rows.push(P.purl(id, e));
      const d = await scrollDoc(id);
      // execution records: from the most recent scroll that has been built (the latest may be unbuilt)
      let built = d.builds.length ? d : null;
      for (const it of [...scrolls].reverse()) { if (built) break; const x = await scrollDoc(it.id); if (x.builds.length) built = x; }
      for (const r of built?.builds.at(-1)?.records ?? []) rows.push(P.substrate(r));
      d.state.seurl && parseMoves(d.state.seurl.slice('/seurl'.length)).forEach((_, i) => rows.push(P.seurl(d.state.seurl, i)));
    }
    if (cfg.acspResource) { const ev = await acsp.events(cfg.acspResource); for (const e of ev.json?.events ?? []) rows.push(P.acsp(cfg.acspResource, e)); }
    for (const repo of Object.keys(cfg.gitRepos ?? {}).slice(0, 3)) rows.push(P.git(repo, gitCommit(repo, 'HEAD')));
    try { for (const s of JSON.parse(readFileSync(join(ROOT, 'circle', 'experiments', 'golden', 'record-1.json'), 'utf8')).steps) rows.push(P.golden(s)); } catch { /* fixture absent */ }
    const cps = await purlList('circle-checkpoint');
    for (const [i, c] of cps.entries()) { const d = await purlRead(c.id); rows.push(P.checkpoint({ id: c.id, ...d.state }, i)); }
    const systems = [...new Set(rows.map((r) => r.system))];
    const matrix = systems.map((s) => { const rs = rows.filter((r) => r.system === s);
      return { system: s, n: rs.length, ...Object.fromEntries(FIELDS.map((f) => [f, rs.filter((r) => !r.lost.includes(f)).length / rs.length])) }; });
    return { schema: '/sdk/schemas/addressed-transition', fields: FIELDS, matrix, rows,
      reading: 'A field below 1.0 is information the system does not carry in its own records: the projection loses it. Equal schemas do not make the transitions identical.' };
  }

  // ---- tests surface -----------------------------------------------------------
  async function testDoc(runId, check) {
    const d = await purlRead(runId);
    if (d.type !== 'conformance-run') throw new CircleError(404, 'not_found', `${runId} is not a conformance run.`);
    const st = d.state;
    const mk = (name) => {
      const r = st.checks[name];
      if (!r) throw new CircleError(404, 'not_found', `No check ${name} in ${runId}.`);
      const clauses = st.clauses.filter((k) => k.checks.some((c) => c.name === name)).map((k) => k.id);
      const art = { test: name, clauses, input: CHECK_SPECS[name]?.input ?? null, expected_transition: CHECK_SPECS[name]?.expected ?? null,
        actual_transition: r.detail, status: r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'NOT_RUN',
        evidence: { run: runId, purl: `${cfg.purlBase}/r/${runId}`, replay: `${cfg.purlBase}/r/${runId}/verify` },
        provenance: { ran_at: st.ran_at, commit: st.commit, constitution: st.constitution, enforcement: st.enforcement ?? null, by: st.by } };
      return { ...art, hash: sha256(art) };
    };
    if (check) return mk(check);
    return { run: runId, ran_at: st.ran_at, commit: st.commit, summary: st.summary, tests: Object.keys(st.checks).map(mk) };
  }

  // ---- observatory ----------------------------------------------------------------
  async function observatory() {
    const types = ['scroll', 'circle-checkpoint', 'conformance-run', 'amendment'];
    const events = [];
    for (const t of types) for (const it of await purlList(t)) {
      const ev = await purl.request('GET', `/r/${it.id}/events`);
      for (const e of ev.json?.events ?? []) events.push({ at: e.at, type: t, resource: it.id, version: e.version, op: e.op ?? e.kind, actor: e.actor });
    }
    events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const runs = await purlList('conformance-run');
    const lastRun = runs.length ? (await purlRead(runs.at(-1).id)).state : null;
    const scrolls = await purlList('scroll');
    const lastScroll = scrolls.length ? await scrollDoc(scrolls.at(-1).id) : null;
    const cps = await purlList('circle-checkpoint');
    const lastCp = cps.length ? (await purlRead(cps.at(-1).id)).state : null;
    const commits = {};
    for (const repo of Object.keys(cfg.gitRepos ?? {})) { try { const c = gitCommit(repo, 'HEAD'); commits[repo] = { commit: c.commit.slice(0, 7), subject: c.subject }; } catch { commits[repo] = null; } }
    const lastCheck = lastRun ? Object.entries(lastRun.checks).at(-1) : null;
    return {
      derived_from: 'PURL event logs of circle records, conformance runs, git, read at request time. Nothing here is stored or invented by the observatory.',
      current_state: { scrolls: scrolls.length, checkpoints: cps.length, conformance_runs: runs.length, events: events.length },
      current_task: cfg.currentTask ?? lastCp?.next ?? null,
      current_constitution: { version: constitution().doc.version, content_id: constitution().content_id },
      current_program: lastScroll ? { id: lastScroll.id, program: lastScroll.state.seurl, builds: lastScroll.builds.map((b) => b.outcome) } : null,
      current_test: lastCheck ? { run: runs.at(-1).id, check: lastCheck[0], href: `/tests/${runs.at(-1).id}/${lastCheck[0]}` } : null,
      current_result: lastRun ? { summary: lastRun.summary, failed: lastRun.clauses.filter((k) => k.status === 'FAILED').map((k) => k.id) } : null,
      current_commit: { running: cfg.commits ?? {}, head: commits,
        running_differs_from_head: Object.entries(cfg.commits ?? {}).some(([k, v]) => v && commits[k === 'acsp' ? 'NetGovComEduGovOrgEduGovComNet' : k] && !commits[k === 'acsp' ? 'NetGovComEduGovOrgEduGovComNet' : k].commit.startsWith(v.slice(0, 7))),
        semantics: 'running = the commit each process was started from (what produced the records); head = the repository now. They differ when code was committed after start.' },
      current_projection: lastScroll?.observations.at(-1) ?? null,
      current_open_problem: (cfg.unresolved ?? [])[0] ?? null,
      transitions: events.slice(-30),
    };
  }

  // ---- stases ------------------------------------------------------------------
  const stases = () => JSON.parse(readFileSync(join(ROOT, 'circle', 'stases.json'), 'utf8'));

  // ---- SDK --------------------------------------------------------------------
  function sdkProvenance() {
    const files = readdirSync(HERE).filter((f) => f.endsWith('.js')).sort();
    return { files: Object.fromEntries(files.map((f) => [`src/circle/${f}`, sha256(readFileSync(join(HERE, f), 'utf8'))])), commit: cfg.commits?.purl ?? null };
  }
  const SCHEMAS = {
    'addressed-transition': { type: 'object', required: ['system', 'source_ref', 'operation', 'target_ref', 'actor', 'clock', 'content_id', 'lost'], properties: { system: { type: 'string' }, source_ref: { type: ['string', 'null'] }, operation: { type: ['string', 'null'] }, target_ref: { type: ['string', 'null'] }, actor: { type: ['string', 'null'] }, clock: { type: ['object', 'null'], properties: { domain: { type: 'string' }, position: { type: ['integer', 'null'] } } }, content_id: { type: ['string', 'null'] }, lost: { type: 'array', items: { type: 'string' } } } },
    'prompt-contract': { type: 'object', required: ['operation', 'expected_transition', 'test', 'completion_condition'], properties: { instruction: { type: 'string' }, constraint: { type: ['string', 'array'] }, objective: { type: 'string' }, state: { type: ['string', 'object'], description: 'an address or checkpoint id the prompt starts from' }, operation: { type: 'object', required: ['method', 'href'], properties: { method: { enum: ['GET', 'POST'] }, href: { type: 'string', description: 'a circle route' } } }, expected_transition: { type: 'string' }, test: { type: ['string', 'object'] }, evidence: { type: ['string', 'array'] }, completion_condition: { type: 'string' } } },
    'test-artifact': { type: 'object', required: ['test', 'input', 'expected_transition', 'actual_transition', 'status', 'evidence', 'provenance', 'hash'] },
    perturbation: { type: 'object', required: ['target', 'perturbation', 'parameters', 'pre_state', 'post_state', 'environment', 'observation', 'comparison'] },
    'program-transformation': { type: 'object', required: ['source', 'transformer', 'build_id', 'build', 'result'] },
  };

  function implementationId() {
    const p = sdkProvenance();
    return { implementation_id: sha256(p.files), files: p.files, commit: p.commit };
  }

  async function constitutionModel() {
    const c = constitution();
    const enfBytes = readFileSync(join(ROOT, 'circle', 'constitution', 'enforcement.json'));
    const runs = await purlList('conformance-run');
    const last = runs.length ? (await purlRead(runs.at(-1).id)).state : null;
    return {
      model: 'Five things, five identities. Each changes for a different reason; none is derived from another.',
      identities: {
        constitution: { id: c.content_id, version: c.doc.version, changes_when: 'a clause, a source or the amendment rule changes; only by amendment (K-13)', href: '/constitution' },
        enforcement: { id: 'sha256:' + createHash('sha256').update(enfBytes).digest('hex'), changes_when: 'a check is attached to a clause; no amendment needed (verification is not governance)', href: '/sdk/schemas' },
        implementation: { ...implementationId(), changes_when: 'code changes; recorded as a git transition (/git) and a dev iteration (/dev/iterations)' },
        evidence: last ? { id: sha256(last), run: runs.at(-1).id, ran_at: last.ran_at, against: { constitution: last.constitution, enforcement: last.enforcement ?? null, implementation: last.implementation_id ?? null }, changes_when: 'a conformance run is recorded; evidence is about one (constitution, enforcement, implementation, data) tuple at one time' } : null,
        authority: { id: null, note: 'Authority has no identity in the bridge. It is held by other systems: ACSP capabilities (owner/delegation), PURL grants, Golden Surface seats, git push rights. The bridge records which authority an operation needed and whether it was present; it never holds or grants it.' },
      },
      axes: {
        conformance: 'does the operation/result satisfy the constitution as checked by enforcement (TESTED / FAILED / IMPLEMENTED / …)',
        authority: 'did the system that owns the target permit it (granted / refused / not required)',
        evidence: 'is the conformance status backed by a run that covers the current implementation and data (current / stale / none)',
      },
      quadrant_probes: '/constitution/axes (recorded by scripts/axes-probe.js)',
      stale: last ? (last.implementation_id ?? null) !== implementationId().implementation_id : null,
    };
  }

  function sdkDoc() {
    const sc = JSON.parse(readFileSync(join(ROOT, 'circle', 'constitution', 'sdk-constitution.json'), 'utf8'));
    return {
      sdk: SDK_VERSION, greeting: SDK_GREETING, what: 'A provider-neutral description of how to act in this environment. It assumes nothing about the participant except that it can make HTTP requests.',
      questions: {
        'what am I?': 'a participant identified only by the session id you declare (?session=…, recorded as asserted)',
        'what protocol is this?': 'circle/0 over HTTP+JSON; values substrate-purl/0; records PURL/0.1; continuity ACSP/0.1',
        'what can I inspect?': ROUTES.filter((r) => r.method === 'GET').map((r) => r.path),
        'what can I execute or record?': ROUTES.filter((r) => r.method === 'POST').map((r) => `${r.path} (${r.effect})`),
        'what can I construct?': '/seurl/… programs; /programs/transform',
        'what can I publish?': 'TALK/acsp/{resource}: a pending ACSP proposal, never more',
        'what can I test?': '/conformance/runs, /tests, /programs/closure',
        'what programs exist?': '/programs', 'what nomenclature exists?': '/nomenclature (substrateIO registry); conflicts: circle/BRIDGE-NOMENCLATURE.md §9',
        'what experiments exist?': '/experiments', 'what is the research state?': '/research; open questions: /research/open', 'show me examples': '/examples',
        'what does the code claim?': '/code (descriptors verified against the source)', 'how do I develop here?': `/ide: ${IDE_STAGES.join(' → ')}, each stage its own URL`,
        'what is safe?': 'every GET (pure); discovery, classification and planning never execute. Mutations: POST with ?session=',
        'what are the invariants?': '/constitution and /sdk/constitution', 'what is my environment?': '/adapters, /state, /operations',
      },
      routes: ROUTES, schemas: Object.keys(SCHEMAS).map((n) => `/sdk/schemas/${n}`),
      constitution: { href: '/sdk/constitution', content_id: sha256(sc) },
      tests: { href: '/tests', checks_about_the_sdk: ['sdk_describes_itself', 'prompt_conversation_not_executed'] },
      provenance: sdkProvenance(),
    };
  }

  // ---- prompt contract -----------------------------------------------------------
  function classify(p) {
    if (p == null || typeof p !== 'object' || Array.isArray(p)) {
      return { kind: 'conversation', executable: false, reason: 'not a structured object: ordinary conversation, outside the programming substrate' };
    }
    const missing = SCHEMAS['prompt-contract'].required.filter((k) => p[k] == null);
    if (missing.length) return { kind: 'conversation', executable: false, reason: `missing ${missing.join(', ')}: without them it cannot be checked, so it is not a program`, present: Object.keys(p) };
    const op = p.operation;
    if (!['GET', 'POST'].includes(op.method) || typeof op.href !== 'string') return { kind: 'invalid_program', executable: false, reason: 'operation must be {method: GET|POST, href}' };
    const path = op.href.split('?')[0];
    const r = routeOf(op.method, path);
    if (!r) return { kind: 'invalid_program', executable: false, reason: `${op.method} ${path} is not a route of this environment (see /sdk)` };
    return { kind: 'program', executable: true, compiled: { method: op.method, href: op.href, edge: r.edge, effect: r.effect },
      would_mutate: op.method === 'POST', checks: { expected_transition: p.expected_transition, test: p.test, completion_condition: p.completion_condition },
      note: 'Classification never executes. Performing the operation is a separate request by the participant.' };
  }

  // ---- perturbation records -------------------------------------------------------
  function perturbations(d) {
    const recs = d.builds.at(-1)?.records ?? [];
    const out = [];
    (d.state.program ?? []).forEach((p, i) => {
      if (p.verb !== 'PERTURB') return;
      const pre = recs[i];
      const post = recs[i + 1];
      const dmg = (d.state.program ?? []).slice(i + 1).findIndex((x) => x.op.startsWith('damage'));
      out.push({ target: d.state.steps[i], perturbation: 'state_bit_flip', parameters: { bit: Number(p.op.split('/')[1]) },
        pre_state: pre ? { address: pre.address, value_id: pre.value_id } : { address: d.state.steps[i], value_id: null },
        post_state: post ? { address: post.address, value_id: post.value_id } : { address: d.state.steps[i + 1], value_id: null },
        environment: post?.environment_id ?? null, observation: dmg >= 0 ? d.state.steps[i + 2 + dmg] : null,
        comparison: dmg >= 0 ? 'damage step: baseline vs perturbed orbit (substrate perturb.compare_state_sequences)' : null,
        epistemic_status: 'SIMULATED intervention on a computational model' });
    });
    return out;
  }

  // ---- dispatch ---------------------------------------------------------------
  const ide = createIde({ envelope, move, CircleError, cfg, substrate, typed: (t) => typed(t), P: { seurl: (t, i) => P.seurl(t, i) } });

  async function dispatch(method, path, q, body) {
    const fromIde = await ide.dispatch(method, path, q);
    if (fromIde) return fromIde;
    if (method === 'GET') {
      if (path === '/sdk') return envelope('sdk', sdkDoc(), [move('constitution', 'GET', '/sdk/constitution', 'read'), move('schemas', 'GET', '/sdk/schemas', 'read'), move('entry', 'GET', '/', 'read')]);
      if (path === '/constitution/model') return envelope('constitution-model', await constitutionModel(), [move('constitution', 'GET', '/constitution', 'read'), move('axes', 'GET', '/constitution/axes', 'read')]);
      if (path === '/constitution/axes') {
        // the latest record is current; earlier ones stay listed (record-1 is invalid: CONSTITUTION-ENFORCEMENT-MODEL.md §4)
        const dir = join(ROOT, 'circle', 'experiments', 'axes');
        let names = [];
        try { names = readdirSync(dir).filter((f) => /^record-\d+\.json$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])); } catch { /* not recorded yet */ }
        const rec = names.length ? JSON.parse(readFileSync(join(dir, names.at(-1)), 'utf8')) : null;
        return envelope('constitution-axes', { current: names.at(-1) ?? null, recorded: rec, all_records: names, invalid_records: names.includes('record-1.json') ? { 'record-1.json': 'check read state one level too shallow (CONSTITUTION-ENFORCEMENT-MODEL.md §4)' } : {},
          note: rec ? 'Recorded probes (committed). Re-run: node scripts/axes-probe.js' : 'No probe recorded yet.' }, [move('model', 'GET', '/constitution/model', 'read')]);
      }
      if (path === '/sdk/constitution') return envelope('sdk-constitution', { document: JSON.parse(readFileSync(join(ROOT, 'circle', 'constitution', 'sdk-constitution.json'), 'utf8')) }, [move('sdk', 'GET', '/sdk', 'read')]);
      if (path === '/sdk/schemas') return envelope('schemas', { schemas: Object.keys(SCHEMAS) }, Object.keys(SCHEMAS).map((n) => move(n, 'GET', `/sdk/schemas/${n}`, 'read')));
      if (path.startsWith('/sdk/schemas/')) { const s = SCHEMAS[path.split('/').pop()]; if (!s) throw new CircleError(404, 'not_found', 'No such schema.'); return envelope('schema', { schema: s }, [move('sdk', 'GET', '/sdk', 'read')]); }
      if (path === '/prompt-contract') return envelope('prompt-contract', {
        schema: SCHEMAS['prompt-contract'],
        boundary: 'A prompt is a PROGRAM only if it is a JSON object with operation (a route of this environment), expected_transition, test and completion_condition. Anything else is conversation: it is answered, never executed. Classification itself never executes.',
        example: { instruction: 'advance the state once', objective: 'observe f(5) under rule 90', state: '/map/eca/90/8/state/5', operation: { method: 'GET', href: '/seurl/START/map/eca/90/8/state/5/WRITE/next' }, expected_transition: 'WRITING; value.x = 136', test: 'value.value.x == 136', evidence: 'value_id', completion_condition: 'state WRITING and value present' },
      }, [move('classify', 'GET', '/prompts/classify?p={json}', 'read')]);
      if (path === '/prompts/classify') { let p = q.get('p'); try { p = JSON.parse(p); } catch { /* plain text */ } return envelope('prompt-classification', classify(p), [move('contract', 'GET', '/prompt-contract', 'read')]); }
      if (path === '/programs') { const items = await programs(); return envelope('programs', { count: items.length, programs: items }, items.map((p) => move('program', 'GET', p.href, 'read'))); }
      if (path === '/programs/transformers') return envelope('transformers', { transformers: Object.fromEntries(Object.entries(TRANSFORMERS).map(([k, v]) => [k, { params: v.params, version: transformerVersion(k) }])) }, []);
      if (path === '/programs/transform') {
        const r = await transform(q);
        return envelope('program-transformation', { ...r, status: 'prepared — nothing committed' },
          r.result.typed.ok ? [move('commit', 'POST', `/programs/transform?${q.toString()}&session={s}`, 'commits the result as a new Scroll'), move('result', 'GET', r.result.text, 'read')] : []);
      }
      if (path === '/programs/closure') return envelope('closure', await closure(q), []);
      if (path === '/transitions/coverage') return envelope('transition-coverage', await coverage(), []);
      let m = /^\/transitions\/(purl|acsp|substrate|git|seurl|checkpoint)\/(.+)$/.exec(path);
      if (m) {
        const [, sys, ref] = m;
        let rows;
        if (sys === 'purl') rows = ((await purl.request('GET', `/r/${ref}/events`)).json?.events ?? []).map((e) => P.purl(ref, e));
        else if (sys === 'acsp') rows = ((await acsp.events(ref)).json?.events ?? []).map((e) => P.acsp(ref, e));
        else if (sys === 'substrate') rows = ((await scrollDoc(ref)).builds.at(-1)?.records ?? []).map(P.substrate);
        else if (sys === 'git') { const [repo, sha] = ref.split('/'); rows = [P.git(repo, gitCommit(repo, sha ?? 'HEAD'))]; }
        else if (sys === 'seurl') { const text = '/seurl/' + ref; rows = parseMoves(ref).map((_, i) => P.seurl(text, i)); }
        else { const d = await purlRead(ref); rows = [P.checkpoint({ id: ref, ...d.state }, 0)]; }
        return envelope('transitions', { system: sys, ref, transitions: rows }, []);
      }
      m = /^\/git\/([^/]+)\/([^/]+)$/.exec(path);
      if (m) { const c = gitCommit(m[1], m[2]); return envelope('git-commit', { ...c, as_transition: P.git(m[1], c), note: 'A projection of a commit. Reading it executes nothing.' }, c.parents.map((p) => move('parent', 'GET', `/git/${m[1]}/${p}`, 'read'))); }
      if (path === '/tests') {
        const runs = [];
        for (const r of await purlList('conformance-run')) { const d = await purlRead(r.id); runs.push({ run: r.id, ran_at: d.state.ran_at, commit: d.state.commit, summary: d.state.summary, href: `/tests/${r.id}` }); }
        return envelope('test-suites', { runs, note: 'Failed runs are never removed.' }, runs.map((r) => move('run', 'GET', r.href, 'read')));
      }
      m = /^\/tests\/([^/]+)(?:\/([^/]+))?$/.exec(path);
      if (m) { const doc = await testDoc(m[1], m[2]); return envelope('test', doc, m[2] ? [move('run', 'GET', `/tests/${m[1]}`, 'read')] : doc.tests.map((t) => move(t.test, 'GET', `/tests/${m[1]}/${t.test}`, 'read'))); }
      if (path === '/projections') {
        const sp = await substrate.projections();
        return envelope('projections', {
          substrate: sp.available ? sp.json?.projections ?? [] : { unavailable: sp.reason },
          record: 'POST /acsp/r/{id}/observe?session={s}&origin=harness|service: applies P-ACSP-EV-1 to that resource\'s event list',
          addressed_transition: { schema: '/sdk/schemas/addressed-transition', coverage: '/transitions/coverage', projectors: ['purl', 'acsp', 'substrate', 'seurl', 'git', 'golden', 'checkpoint'] },
        }, [move('coverage', 'GET', '/transitions/coverage', 'read'), ...(cfg.acspResource ? [move('observe-continuity', 'POST', `/acsp/r/${cfg.acspResource}/observe?session={s}&origin=harness`, 'records an observation')] : [])]);
      }
      if (path === '/observatory') return envelope('observatory', await observatory(), [move('tests', 'GET', '/tests', 'read'), move('programs', 'GET', '/programs', 'read'), move('stases', 'GET', '/stases', 'read')]);
      if (path === '/stases') { const s = stases(); return envelope('stases', s, s.stases.map((x) => move(x.id, 'GET', `/stases/${x.n}`, 'read'))); }
      m = /^\/stases\/(\d+)$/.exec(path);
      if (m) { const x = stases().stases.find((s) => String(s.n) === m[1]); if (!x) throw new CircleError(404, 'not_found', 'No such stasis.'); return envelope('stasis', x, [move('all', 'GET', '/stases', 'read')]); }
    }
    if (method === 'POST') {
      if (path === '/prompts/classify') return envelope('prompt-classification', classify(body), []);
      if (path === '/programs/transform') {
        const author = requireSession(q);
        const r = await transform(q);
        if (!r.result.typed.ok) throw new CircleError(422, 'ill_typed', 'The transformed program is not well-typed; nothing committed.', { result: r.result });
        const s = run(r.result.text.slice('/seurl'.length));
        const scroll = await commitScroll(s, author, null, { derived_from: { source: { content_id: r.source.content_id, scroll: r.source.scroll, scroll_version: r.source.scroll_version ?? null, text: r.source.text },
          transformer: r.transformer, build_id: r.build_id, build: r.build }, content_id: r.result.content_id });
        return envelope('program-committed', { scroll, build_id: r.build_id, content_id: r.result.content_id, derived_from: r.source },
          [move('build', 'POST', `/scrolls/${scroll.id}/build?session=${author.session_id}`, 'executes the new program'), move('program', 'GET', `/scrolls/${scroll.id}`, 'read')]);
      }
    }
    return null;
  }

  return { dispatch, perturbations, routeOf, classify, implementationId, typed, P };
}
