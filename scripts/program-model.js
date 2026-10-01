// node scripts/program-model.js — EXP-PROGRAM-MODEL-1 (circle/experiments/program-model/SPEC.md, pre-registered).
// σ: program -> circle Scroll record (COMMIT); π: record -> program; τ: record -> ACSP TOK (TALK).
// Isolated circle (temporary PURL store, local substrate, local ACSP with a fresh resource).
// Writes circle/experiments/program-model/record-N.json. Loss measured by substrateIO.
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCircle } from './circle-lib.js';
import { run, parseMoves, pathOf, MUTATING } from '../src/circle/seurl.js';
import { sha256 } from '../src/circle/adapters.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'circle', 'experiments', 'program-model');
const SESSION = 'program-model-exp';
const c = await startCircle({ substrateDir: resolve(ROOT, '..', 'substrateIO'), acspDir: resolve(ROOT, '..', 'NetGovComEduGovOrgEduGovComNet'),
  substratePort: 42065, acspPort: 42087, purlDataDir: mkdtempSync(join(tmpdir(), 'pm-purl-')) });
// PURL rate-limits writes; the circle reports it as 429 purl_limited (fixed after record-1, where it
// surfaced as 502). The experiment honours retry_after: it slows down, it does not bypass the limit.
let waits = 0;
const partials = [];
const h = async (m, p) => {
  for (;;) {
    const r = await fetch(c.base + p, { method: m });
    const doc = await r.json();
    if (r.status !== 429) return { status: r.status, doc };
    // resend only if nothing was performed (record-4: resending partial POSTs duplicated proposals)
    if (m === 'POST' && doc.error?.partial && (doc.error.performed_steps?.length || doc.error.step_effects)) { partials.push({ path: p, error: doc.error }); return { status: r.status, doc }; }
    waits++;
    await new Promise((ok) => setTimeout(ok, 1000 * Math.min(30, doc.error?.retry_after_seconds ?? 1)));
  }
};
const acsp = async (p, init) => { const r = await fetch(c.acspBase + p, init); return { status: r.status, doc: await r.json().catch(() => null) }; };
const canonical = (p) => pathOf(parseMoves(p).filter((m) => !MUTATING.has(m.verb)));

// the declared space (same as scripts/projection-matrix.js)
const BOUNDS = ['/map/eca/90/8/state/5', '/map/eca/30/8/state/1', '/map/increment/3/state/2'];
const MOVES = [['WRITE', 'next'], ['WRITE', 'flip/0'], ['PERTURB', '0'], ['WRITE', 'orbit']];
const programs = [];
const rec = (prefix, depth) => { programs.push(prefix); if (depth === 3) return; for (const [v, a] of MOVES) rec(`${prefix}/${v}/${a}`, depth + 1); };
for (const b of BOUNDS) rec(`/START${b}`, 0);

const out = { experiment: 'EXP-PROGRAM-MODEL-1', spec: 'circle/experiments/program-model/SPEC.md', started: new Date().toISOString(), commits: c.cfg.commits, results: {} };
try {
  // ---- M1: π∘σ = id -------------------------------------------------------------
  const m1 = { n: programs.length, committed: 0, refused: [], mismatches: [], rows: [] };
  for (const p of programs) {
    const r = await h('POST', `/seurl${p}/COMMIT?session=${SESSION}`);
    if (r.status !== 201) { m1.refused.push({ program: p, status: r.status, code: r.doc.error?.code, fsm_state: (() => { try { return run(p).state; } catch { return null; } })() }); continue; }
    m1.committed++;
    const id = r.doc.steps.find((s) => s.verb === 'COMMIT').scroll.id;
    const d = (await h('GET', `/scrolls/${id}`)).doc;
    const want = canonical(p);
    const row = { program: p, id, seurl: d.seurl, content_id: d.content_id, derivation_id: d.term?.derivation_id ?? null, address: d.address };
    m1.rows.push(row);
    if (d.seurl !== want || d.content_id !== sha256(d.seurl)) m1.mismatches.push({ ...row, expected: want, content_id_ok: d.content_id === sha256(d.seurl) });
  }
  m1.verdict = m1.mismatches.length === 0 ? (m1.refused.length ? `π∘σ = id on the domain of σ (${m1.committed}/${m1.n}); σ refused ${m1.refused.length} programs, so σ is partial` : 'π∘σ = id on all programs') : 'FALSIFIED: mismatches';
  out.results.M1 = { ...m1, rows: undefined, rows_count: m1.rows.length };

  // ---- M2: σ is not a function ------------------------------------------------------
  const sample = m1.rows.filter((_, i) => i % 50 === 1).slice(0, 5);
  const m2 = [];
  for (const r of sample) {
    const again = await h('POST', `/seurl${r.program}/COMMIT?session=${SESSION}`);
    const id2 = again.doc.steps?.find((s) => s.verb === 'COMMIT')?.scroll?.id;
    const d2 = (await h('GET', `/scrolls/${id2}`)).doc;
    m2.push({ program: r.program, ids: [r.id, id2], content_ids_equal: d2.content_id === r.content_id, ids_differ: id2 && id2 !== r.id });
  }
  out.results.M2 = { pairs: m2, verdict: m2.every((x) => x.ids_differ && x.content_ids_equal) ? 'held: same program, distinct records, one content_id' : 'FALSIFIED' };

  // ---- M3: the verb label survives σ -----------------------------------------------------
  const byNorm = new Map();
  for (const r of m1.rows) { const k = r.program.replace(/PERTURB\/(\d+)/g, 'WRITE/flip/$1'); if (!byNorm.has(k)) byNorm.set(k, []); byNorm.get(k).push(r); }
  const pairs = [...byNorm.values()].filter((g) => g.length > 1);
  const m3bad = [];
  for (const g of pairs) for (let i = 1; i < g.length; i++) {
    if (g[i].content_id === g[0].content_id || g[i].derivation_id !== g[0].derivation_id || g[i].address !== g[0].address) m3bad.push([g[0].program, g[i].program]);
  }
  out.results.M3 = { groups: pairs.length, records_in_groups: pairs.reduce((a, g) => a + g.length, 0), violations: m3bad,
    verdict: m3bad.length ? 'FALSIFIED' : 'held: same address and derivation_id, distinct content_id (the record keeps what the address loses: B1)' };

  // ---- M4: lineage reconstructible from records ------------------------------------------
  const TR = [['extend', 'next'], ['extend', 'trace/8'], ['perturb', '3'], ['iterate', '2'], ['truncate', ''], ['retarget', 'map/eca/110/8/state/9']];
  const m4 = [];
  for (const [t, p] of TR) for (const src of [m1.rows[5], m1.rows[90]]) {
    const q = `source=${encodeURIComponent(src.seurl)}&t=${t}&p=${encodeURIComponent(p)}`;
    const made = await h('POST', `/programs/transform?${q}&session=${SESSION}`);
    if (made.status !== 201) { m4.push({ transformer: t, params: p, source: src.seurl, committed: false, status: made.status, code: made.doc.error?.code }); continue; }
    const d = (await h('GET', `/scrolls/${made.doc.scroll.id}`)).doc;
    const df = d.derived_from;
    // reconstruct from the record alone: source text, transformer id, params
    const again = (await h('GET', `/programs/transform?source=${encodeURIComponent(df.source.text)}&t=${df.transformer.id}&p=${encodeURIComponent(df.build.params.join('/'))}`)).doc;
    m4.push({ transformer: t, params: p, source: src.seurl, committed: true, record_seurl: d.seurl, rebuilt_seurl: again.result?.text,
      seurl_equal: again.result?.text === d.seurl, build_id_equal: again.build_id === df.build_id, version_equal: again.transformer?.version === df.transformer.version,
      build_id_recomputed_from_record: sha256(df.build) === df.build_id });
  }
  const done = m4.filter((x) => x.committed);
  out.results.M4 = { cases: m4, verdict: done.every((x) => x.seurl_equal && x.build_id_equal && x.version_equal && x.build_id_recomputed_from_record)
    ? `held on ${done.length} committed transformations (${m4.length - done.length} refused as ill-typed: nothing committed)` : 'FALSIFIED' };

  // ---- M5: τ (TALK) keeps the program, loses the record ------------------------------------
  const intent = await acsp('/new?format=json&session_id=owner-human&title=program-model');
  const rid = (await acsp('/r', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intent.doc.request) })).doc.resource_id;
  c.cfg.acspResource = rid;
  const parent = m1.rows[3].id;
  const m5 = [];
  const R = m1.rows, k = Math.floor(R.length / 5);
  for (const r of [R[k], R[2 * k], R[3 * k], R[4 * k]].filter(Boolean)) {
    // a COMMIT/BUILD/TALK POST makes several PURL writes and must not be resent once begun (records 5-6):
    // let PURL's write bucket (4/s) refill first
    await new Promise((ok) => setTimeout(ok, 10_000));
    const t = await h('POST', `/seurl${r.program}/COMMIT/BUILD/TALK/acsp/${rid}?session=${SESSION}&parent=${parent}`);
    const steps = t.doc.steps ?? [];
    const sid = steps.find((s) => s.verb === 'COMMIT')?.scroll?.id;
    const talk = steps.find((s) => s.verb === 'TALK');
    const d = (await h('GET', `/scrolls/${sid}`)).doc;
    const res = await acsp(`/r/${rid}?format=json`);
    const prop = (res.doc?.proposals ?? []).find((x) => x.id === talk?.proposal_id);
    const content = prop?.payload?.content ?? '';
    const seurlLine = (content.match(/^SEURL: (\S+)$/m) ?? [])[1] ?? null;
    const citedVersion = Number((content.match(/\(v(\d+)\)/) ?? [])[1] ?? NaN);
    m5.push({ program: r.program, scroll: sid, proposal: talk?.proposal_id ?? null, talk_stage: talk?.stage ?? null, talk_refusal: talk?.refusal ?? null, talk_status: talk?.status ?? null, talk_error: talk?.error ?? null,
      program_recovered: seurlLine === d.seurl, tok_program: seurlLine, record_seurl: d.seurl,
      provenance_in_tok: { author_session: content.includes(SESSION), parent: content.includes(parent), parent_recorded: d.parent?.id ?? d.parent ?? null },
      scroll_url_in_tok: content.includes(`/scrolls/${sid}`), tok_cites_version: citedVersion, record_version_after_talk: d.version });
  }
  out.results.M5 = { cases: m5, verdict: m5.every((x) => x.program_recovered && !x.provenance_in_tok.author_session && !x.provenance_in_tok.parent)
    ? 'held: program recoverable from TOK content; author and parent absent (recoverable only by following the scroll URL)' : 'FALSIFIED or partial (see cases)' };

  // ---- loss, measured by substrateIO --------------------------------------------------------
  const boundaries = [
    { id: 'PM-σπ', from: 'program', to: 'record.seurl (π∘σ)', pairs: m1.rows.map((r) => [r.seurl, canonical(r.program)]) },
    { id: 'PM-π', from: 'record (seurl, author, parent, id)', to: 'program (π)', pairs: [...m1.rows, ...m2.map((x) => ({ ...m1.rows.find((r) => r.program === x.program), id: x.ids[1] }))].map((r) => [r.seurl, { id: r.id, seurl: r.seurl }]) },
    { id: 'PM-τ', from: 'record (seurl, author, parent, version)', to: 'TOK content program line', pairs: m5.map((x) => [x.tok_program, { seurl: x.record_seurl, parent: x.provenance_in_tok.parent_recorded, author: SESSION, version: x.record_version_after_talk, id: x.scroll }]) },
  ];
  const meas = spawnSync('python3', [join(ROOT, 'scripts', 'projection_matrix_measure.py')], { input: JSON.stringify({ boundaries }), encoding: 'utf8' });
  out.loss = meas.status === 0 ? JSON.parse(meas.stdout) : { error: meas.stderr };
} catch (e) { out.crashed = { message: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 4) }; } finally { await c.close(); }
out.finished = new Date().toISOString();
out.rate_limit_waits = waits;
out.partial_posts_not_resent = partials;
const n = readdirSync(DIR).filter((f) => f.startsWith('record-')).length + 1;
writeFileSync(join(DIR, `record-${n}.json`), JSON.stringify(out, null, 1) + '\n');
if (out.crashed) console.log('CRASHED', out.crashed.message);
for (const [k, v] of Object.entries(out.results)) console.log(k, v.verdict);
for (const l of out.loss ?? []) console.log(l.id, 'n', l.n, 'loss', l.loss_H_source_given_output_bits, 'spurious', l.H_output_given_source_bits);
console.log('record', n);
process.exit(0);
