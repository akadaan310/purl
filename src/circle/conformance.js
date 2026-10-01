// Constitutional conformance: every mechanical clause names checks; this file runs
// them against a live circle and derives each clause's status from the outcomes.
// No status is ever set by hand. A check that cannot run is "not_run", and its
// clause stays IMPLEMENTED (mechanism exists, unverified) rather than passing.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AcspAdapter, SubstrateAdapter } from './adapters.js';
import { createCircle } from './server.js';
import { sha256 } from './adapters.js';

const NOT_RUN = Symbol('not_run');
const ENFORCEMENT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'circle', 'constitution', 'enforcement.json');

export function loadEnforcement(path = ENFORCEMENT) {
  const bytes = readFileSync(path);
  return { doc: JSON.parse(bytes), content_id: 'sha256:' + createHash('sha256').update(bytes).digest('hex') };
}

async function snapshot(api, acspResource) {
  const types = ['scroll', 'circle-checkpoint', 'conformance-run', 'amendment'];
  const purl = {};
  for (const t of types) purl[t] = (await api.purlList(t)).map((x) => [x.id, x.version]);
  const addrs = new Set();
  for (const [id] of purl.scroll) for (const a of (await api.purlRead(id)).state.steps ?? []) addrs.add(a);
  const sub = {};
  for (const a of addrs) sub[a] = (await api.substrate.resolve('/executions?purl=' + encodeURIComponent(a))).json?.count ?? null;
  const acsp = acspResource ? (await api.acsp.status(acspResource)).json?.version ?? null : null;
  return sha256({ purl, sub, acsp });
}

async function crawl(api, limit = 60) {
  const seen = new Map();
  const queue = ['/', '/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD', '/naici/legal?url=/', '/naici/read?url=/&as=tree'];
  while (queue.length && seen.size < limit) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    const r = await api.handle('GET', u, null);
    seen.set(u, r);
    for (const m of r.doc.moves ?? []) if (m.method === 'GET' && !m.template && m.href.startsWith('/') && !seen.has(m.href)) queue.push(m.href);
  }
  return seen;
}

export async function runConformance(api, author, { acspResource = api.cfg.acspTestResource ?? api.cfg.acspResource ?? null } = {}) {
  const results = {};
  const h = (m, p, b) => api.handle(m, p, b);
  const session = `?session=${author.session_id}`;
  const check = async (name, fn) => {
    try {
      const v = await fn();
      results[name] = v === NOT_RUN ? { ok: null, detail: 'not_run' } : { ok: Boolean(v.ok ?? v), detail: v.detail ?? null };
    } catch (e) {
      results[name] = { ok: false, detail: `threw: ${e.message}` };
    }
  };

  await check('get_sweep_changes_nothing', async () => {
    const before = await snapshot(api, acspResource);
    const seen = await crawl(api);
    const after = await snapshot(api, acspResource);
    return { ok: before === after, detail: `${seen.size} GET urls; state hash ${before === after ? 'unchanged' : 'CHANGED'}` };
  });
  await check('credentials_in_url_refused', async () => {
    const a = await h('GET', '/?cap=abc', null);
    const b = await h('POST', `/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT${session}&token=x`, null);
    return { ok: a.status === 400 && b.status === 400, detail: `${a.status}, ${b.status}` };
  });
  await check('mutation_requires_declared_session', async () => {
    const r = await h('POST', '/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT', null);
    return { ok: r.status === 422 && r.doc.error.code === 'session_required', detail: `${r.status} ${r.doc.error?.code}` };
  });
  await check('seurl_vocabulary_closed', async () => {
    const r = await h('GET', '/seurl/START/map/eca/90/8/JUMP', null);
    return { ok: r.status === 400 && r.doc.error.code === 'unknown_verb', detail: `${r.status} ${r.doc.error?.code}` };
  });
  await check('seurl_fsm_enforced', async () => {
    const a = await h('GET', '/seurl/WRITE/next', null);
    const b = await h('GET', '/seurl/START/map/eca/90/8/state/5/COMMIT', null);
    const c = await h('GET', '/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/WRITE/next', null);
    return { ok: [a, b, c].every((r) => r.status === 409 && r.doc.error.code === 'illegal_move'), detail: [a, b, c].map((r) => `${r.status}:${r.doc.error?.legal?.join('|')}`).join(', ') };
  });
  await check('constitution_not_writable', async () => {
    const r = await h('POST', '/constitution', {});
    return { ok: r.status === 405, detail: String(r.status) };
  });
  await check('amendment_is_proposal_only', async () => {
    const before = api.constitution().content_id;
    const r = await h('POST', `/constitution/amendments${session}`, { clause: 'K-18', proposed_text: '(conformance probe) no change intended', reason: 'checks that amendments are stored as proposals only' });
    return { ok: r.status === 201 && r.doc.status === 'proposed' && api.constitution().content_id === before, detail: `${r.status} ${r.doc.status}` };
  });

  // Commit + build two extensionally equal programs.
  const p1 = await h('POST', `/seurl/START/map/increment/3/WRITE/power/8/WRITE/table/COMMIT/BUILD${session}`, null);
  const p2 = await h('POST', `/seurl/START/map/eca/204/3/WRITE/table/COMMIT/BUILD${session}`, null);
  const s1 = p1.doc.scroll;
  const s2 = p2.doc.scroll;
  await check('author_assurance_is_asserted', async () => {
    if (!s1) return { ok: false, detail: `commit failed: ${p1.status} ${JSON.stringify(p1.doc.error)}` };
    const d = await h('GET', `/scrolls/${s1.id}`, null);
    return { ok: d.doc.author?.assurance === 'asserted' && d.doc.author?.session_id === author.session_id, detail: JSON.stringify(d.doc.author) };
  });
  await check('shared_value_distinct_records', async () => {
    const b1 = p1.doc.steps?.find((s) => s.verb === 'BUILD')?.build;
    const b2 = p2.doc.steps?.find((s) => s.verb === 'BUILD')?.build;
    if (!b1 || !b2) return { ok: false, detail: 'builds missing' };
    const r1 = b1.records.at(-1);
    const r2 = b2.records.at(-1);
    return { ok: b1.outcome === 'BUILT' && b2.outcome === 'BUILT' && r1.value_id && r1.value_id === r2.value_id && r1.execution_hash !== r2.execution_hash && r1.derivation_id !== r2.derivation_id,
      detail: `value_id equal=${r1.value_id === r2.value_id}; execution distinct=${r1.execution_hash !== r2.execution_hash}` };
  });
  await check('fork_leaves_parent_unchanged', async () => {
    if (!s2) return { ok: false, detail: 'no parent scroll' };
    const before = (await api.purlRead(s2.id));
    const other = { session_id: `${author.session_id}-other` };
    const r = await h('POST', `/seurl/START/map/eca/204/3/WRITE/table/WRITE/graph/COMMIT?session=${other.session_id}&parent=${s2.id}`, null);
    const after = (await api.purlRead(s2.id));
    const child = r.doc.scroll ? await api.purlRead(r.doc.scroll.id) : null;
    return { ok: r.status === 201 && before.version === after.version && sha256(before.state) === sha256(after.state) && child?.state.parent === s2.id && child?.state.author.session_id === other.session_id,
      detail: `parent v${before.version}->v${after.version}; child ${child?.id} parent=${child?.state.parent}` };
  });
  await check('scroll_log_verifies', async () => {
    const ids = (await api.purlList('scroll')).map((x) => x.id);
    const bad = [];
    for (const id of ids) { const rec = await api.purl.reconstruct(`/r/${id}`); if (!rec.all_ok) bad.push(id); }
    return { ok: ids.length > 0 && bad.length === 0, detail: `${ids.length} scrolls replayed client-side; failures: ${bad.join(',') || 'none'}` };
  });
  await check('fork_does_not_inherit_records', async () => {
    // build the parent, fork it, do not build the fork: the fork must show no builds of its own
    const p = await h('POST', `/seurl/START/map/eca/150/4/state/3/WRITE/next/COMMIT/BUILD${session}`, null);
    if (!p.doc.scroll) return { ok: false, detail: `parent: ${p.status}` };
    const f = await h('POST', `/seurl/START/map/eca/30/4/state/3/WRITE/next/COMMIT?session=${author.session_id}-fork&parent=${p.doc.scroll.id}`, null);
    const fd = (await h('GET', `/scrolls/${f.doc.scroll?.id}`, null)).doc;
    return { ok: f.status === 201 && fd.builds.length === 0 && fd.inherited_from_parent.builds >= 1, detail: `fork own builds=${fd.builds?.length}, inherited=${fd.inherited_from_parent?.builds}` };
  });
  await check('aliases_only_from_own_builds', async () => {
    // independent oracle: each listed address's value_id, resolved directly from the substrate
    const al = (await h('GET', '/aliases', null)).doc;
    const wrong = [];
    for (const e of al.equivalences ?? []) for (const a of e.addresses) {
      const v = (await api.substrate.resolve(a)).json?.identity?.value_id;
      if (v !== e.value_id) wrong.push(`${a}: ${v} != ${e.value_id}`);
    }
    return { ok: wrong.length === 0, detail: `${(al.equivalences ?? []).length} equivalence(s); wrong: ${wrong.join('; ') || 'none'}` };
  });
  await check('scrolls_publicly_readable', async () => {
    // read as an outsider: no token
    const bad = [];
    const ids = (await api.purlList('scroll')).map((x) => x.id);
    for (const id of ids) {
      const r = await fetch(`${api.cfg.purlBase}/r/${id}/verify`, { headers: { Accept: 'application/purl+json' } });
      const j = r.ok ? await r.json() : null;
      if (!r.ok || j?.valid !== true) bad.push(`${id}:${r.status}`);
    }
    return { ok: ids.length > 0 && bad.length === 0, detail: `${ids.length} scrolls verified without credentials; failures: ${bad.join(',') || 'none'}` };
  });
  await check('no_observed_claims', async () => {
    const claims = [];
    for (const { id } of await api.purlList('scroll')) {
      const c = (await api.purlRead(id)).collections ?? {};
      for (const e of [...(c.builds ?? []), ...(c.observations ?? [])]) {
        const b = e.body ?? e;
        for (const r of b.records ?? []) if ((r.epistemic_status ?? []).some((s) => /OBSERVED/i.test(s))) claims.push(id);
        if (/^OBSERVED$/i.test(b.epistemic_status ?? '')) claims.push(id);
      }
    }
    return { ok: claims.length === 0, detail: claims.length ? `OBSERVED in ${claims.join(',')}` : 'none' };
  });
  await check('adapter_refuses_non_propose', async () => {
    const r = await new AcspAdapter('http://127.0.0.1:9').submit({ request: { operation: 'append' }, execution: { href: '/r/X/operations' } });
    return { ok: r.status === 403 && !r.stage, detail: `${r.status}` };
  });
  await check('dead_adapter_is_explicit', async () => {
    const dead = createCircle({ ...api.cfg, substrateBase: 'http://127.0.0.1:9', runConformance: null });
    const r = await dead.handle('GET', '/seurl/START/map/eca/90/8/state/5', null);
    const t = await new SubstrateAdapter('http://127.0.0.1:9').term('/map/eca/90/8');
    return { ok: r.status === 503 && r.doc.error.code === 'unavailable_here' && t.available === false && !('json' in t && t.json), detail: `${r.status} ${r.doc.error?.code}` };
  });
  await check('acsp_prepare_changes_nothing', async () => {
    if (!acspResource) return NOT_RUN;
    const v0 = (await api.acsp.status(acspResource)).json?.version;
    const p = await api.acsp.prepare(acspResource, { session_id: author.session_id, tok: { type: 'observation', title: 'probe', content: 'prepare only' }, rationale: 'probe' });
    const v1 = (await api.acsp.status(acspResource)).json?.version;
    return { ok: p.ok && p.json?.type === 'operation_intent' && v0 === v1, detail: `version ${v0} -> ${v1}` };
  });
  await check('talk_stage_never_committed', async () => {
    if (!acspResource) return NOT_RUN;
    const r = await h('POST', `/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD/TALK/acsp/${acspResource}${session}`, null);
    const t = r.doc.steps?.find((s) => s.verb === 'TALK');
    const all = [];
    for (const { id } of await api.purlList('scroll')) for (const e of (await api.purlRead(id)).collections?.talks ?? []) all.push((e.body ?? e).stage);
    return { ok: t?.stage === 'submitted' && all.every((s) => s !== 'committed'), detail: `this talk: ${t?.stage} (${t?.proposal_id}); all stages: ${[...new Set(all)].join(',')}` };
  });
  await check('no_secret_in_records', async () => {
    const secrets = api.secrets();
    const hits = [];
    for (const t of ['scroll', 'circle-checkpoint', 'conformance-run', 'amendment']) {
      for (const { id } of await api.purlList(t)) { const s = JSON.stringify(await api.purlRead(id)); for (const x of secrets) if (s.includes(x)) hits.push(id); }
    }
    return { ok: secrets.length > 0 && hits.length === 0, detail: `${secrets.length} secret(s) checked; hits: ${hits.join(',') || 'none'}` };
  });
  await check('every_document_has_moves', async () => {
    const seen = await crawl(api, 40);
    const missing = [...seen].filter(([, r]) => r.status < 400 && !Array.isArray(r.doc.moves)).map(([u]) => u);
    const empty = [...seen].filter(([, r]) => ['entry', 'seurl-session', 'scroll', 'scrolls', 'ide-state', 'resume'].includes(r.doc.kind) && !r.doc.moves.length).map(([u]) => u);
    return { ok: missing.length === 0 && empty.length === 0, detail: `${seen.size} docs; without moves: ${missing.join(',') || 'none'}; empty where required: ${empty.join(',') || 'none'}` };
  });

  const c = api.constitution();
  const enf = loadEnforcement();
  const clauses = c.doc.clauses.map((k) => {
    k = { ...k, checks: [...k.checks, ...(enf.doc.additional_checks[k.id] ?? [])] };
    const kind = k.enforcement.kind;
    if (kind === 'external') return { id: k.id, status: 'EXTERNAL', checks: [] };
    if (kind === 'human-reviewed') return { id: k.id, status: 'HUMAN_REVIEWED', checks: [] };
    if (kind === 'conflict') return { id: k.id, status: 'CONFLICTING', checks: [] };
    const rs = k.checks.map((n) => ({ name: n, ...(results[n] ?? { ok: null, detail: 'no such check' }) }));
    const status = rs.some((r) => r.ok === false) ? 'FAILED' : rs.length && rs.every((r) => r.ok === true) ? 'TESTED' : rs.length ? 'IMPLEMENTED' : 'DECLARED';
    return { id: k.id, status, checks: rs };
  });
  const summary = {};
  for (const k of clauses) summary[k.status] = (summary[k.status] ?? 0) + 1;
  return { ran_at: new Date().toISOString(), commit: api.cfg.commits?.purl ?? null, constitution: c.content_id, enforcement: enf.content_id, by: author, acsp_resource: acspResource, checks: results, clauses, summary };
}
