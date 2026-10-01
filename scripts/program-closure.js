// node scripts/program-closure.js — EXP-PROGRAM-CLOSURE-1 (circle/experiments/program-closure/SPEC.md, pre-registered).
// Four arms filter one candidate alphabet (src/circle/closure.js). Pure GETs against a local substrate.
// Writes circle/experiments/program-closure/record-N.json. Information loss measured by substrateIO.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/circle/seurl.js';
import { MODES, candidateAlphabet, admissible, nBitsOf } from '../src/circle/closure.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUB = resolve(ROOT, '..', 'substrateIO');
const DIR = join(ROOT, 'circle', 'experiments', 'program-closure');
const PORT = Number(process.env.CLOSURE_PORT ?? 42665);
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCES = ['/seurl/START/map/eca/90/8/state/5', '/seurl/START/map/eca/30/8/state/1', '/seurl/START/map/increment/3/state/2', '/seurl/START/map/eca/110/16/state/9'];

const child = spawn('python3', ['-m', 'tools.purl_server', '--port', String(PORT), '--store', mkdtempSync(join(tmpdir(), 'closure-sub-'))], { cwd: SUB, stdio: 'ignore', detached: true });
for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
const getJson = async (p) => { const r = await fetch(BASE + p); let j = null; try { j = await r.json(); } catch { /* non-JSON */ } return { status: r.status, json: j }; };

const out = { experiment: 'EXP-PROGRAM-CLOSURE-1', spec: 'circle/experiments/program-closure/SPEC.md', started: new Date().toISOString(),
  commits: { purl: execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), substrateIO: execFileSync('git', ['-C', SUB, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } };
try {
  const catalog = (await getJson('/operations')).json;
  const limits = JSON.parse(execFileSync('python3', ['-c', 'import json; from substrate.purl import LIMITS; print(json.dumps(LIMITS))'], { cwd: SUB, encoding: 'utf8' }));
  const alphabet = candidateAlphabet(catalog);
  out.catalog_version = catalog.operations.map((o) => o.version);
  out.limits_read_from_code = limits;
  out.alphabet_size = alphabet.length;

  // evaluation cache by address (PERTURB/b and WRITE/flip/b share an address)
  const cache = new Map();
  async function evalAddress(address) {
    if (cache.has(address)) return cache.get(address);
    const p = (async () => {
      const t = await getJson('/term' + address);
      const v = await getJson(address);
      return { typed: t.status === 200, kind: t.status === 200 ? t.json?.kind ?? null : null, term_status: t.status, term_code: t.json?.error?.code ?? null,
        executable: v.status === 200, value_status: v.status, value_code: v.json?.error?.code ?? null, value_id: v.json?.identity?.value_id ?? null, x: v.json?.value?.x ?? null, value_kind: v.json?.kind ?? null };
    })();
    cache.set(address, p);
    return p;
  }
  async function evalProgram(text) {
    let s; try { s = run(text.slice('/seurl'.length)); } catch (e) { return { text, fsm: false, fsm_code: e.code }; }
    if (!s.current_address) return { text, fsm: false, fsm_code: 'unbound' };
    return { text, fsm: true, address: s.current_address, ...(await evalAddress(s.current_address)) };
  }
  async function pool(items, f, k = 8) { const res = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const j = i++; res[j] = await f(items[j]); } })); return res; }

  out.arms = {};
  for (const mode of MODES) {
    const programs = [];
    // depth 1
    const d1 = [];
    for (const src of SOURCES) {
      const se = await evalProgram(src);
      const ctx = { kind: se.kind, n: nBitsOf(se.address), catalog, limits };
      for (const c of alphabet) if (admissible(mode, c, ctx)) d1.push({ text: `${src}/${c.move}`, depth: 1, segment: c.segment });
    }
    const r1 = await pool(d1, async (p) => ({ ...p, ...(await evalProgram(p.text)) }));
    programs.push(...r1);
    // depth 2: extend this arm's own admitted depth-1 programs
    const d2 = [];
    for (const p of r1) {
      const ctx = { kind: p.kind ?? null, n: nBitsOf(p.address), catalog, limits };
      for (const c of alphabet) if (admissible(mode, c, ctx)) d2.push({ text: `${p.text}/${c.move}`, depth: 2, segment: c.segment });
    }
    const r2 = await pool(d2, async (p) => ({ ...p, ...(await evalProgram(p.text)) }));
    programs.push(...r2);

    const n = programs.length, cnt = (f) => programs.filter(f).length;
    const exec = programs.filter((p) => p.executable);
    const gap = programs.filter((p) => p.typed && !p.executable);
    const reasons = (xs, k) => xs.reduce((a, p) => ({ ...a, [`${p[k + '_status']} ${p[k + '_code']}`]: (a[`${p[k + '_status']} ${p[k + '_code']}`] ?? 0) + 1 }), {});
    out.arms[mode] = {
      generated: n, by_depth: { 1: r1.length, 2: r2.length }, fsm_legal: cnt((p) => p.fsm), well_typed: cnt((p) => p.typed), executable: exec.length,
      executable_fraction: n ? exec.length / n : null, typing_gap: gap.length, typing_gap_reasons: reasons(gap, 'value'),
      not_typed_reasons: reasons(programs.filter((p) => p.fsm && !p.typed), 'term'),
      coverage_segments: [...new Set(exec.map((p) => p.segment))].sort(),
      non_executable_examples: programs.filter((p) => !p.executable).slice(0, 5).map((p) => ({ text: p.text, term: p.term_status, value: p.value_status, code: p.value_code ?? p.term_code ?? p.fsm_code })),
      _exec: exec.map((p) => ({ text: p.text, address: p.address, value_id: p.value_id, x: p.x, kind: p.kind })),
    };
    console.log(mode, 'generated', n, 'typed', out.arms[mode].well_typed, 'exec', exec.length, 'gap', gap.length, 'frac', out.arms[mode].executable_fraction?.toFixed(4));
  }

  // laws on executable state-valued programs (deduplicated by address)
  const states = new Map();
  for (const [mode, a] of Object.entries(out.arms)) for (const p of a._exec) if (p.kind === 'state') { if (!states.has(p.address)) states.set(p.address, { ...p, arms: new Set() }); states.get(p.address).arms.add(mode); }
  const laws = await pool([...states.values()], async (p) => {
    const l1 = await getJson(p.address + '/flip/0/flip/0');
    const mapRoot = p.address.split('/state/')[0];
    const nn = await getJson(p.address + '/next/next');
    const f2 = await getJson(`${mapRoot}/power/2/state/${p.x}/next`);
    return { address: p.address, arms: [...p.arms],
      L1: l1.status === 200 ? l1.json?.identity?.value_id === p.value_id : null,
      L2: nn.status === 200 && f2.status === 200 ? nn.json?.value?.x === f2.json?.value?.x : null, L2_status: [nn.status, f2.status] };
  });
  out.laws = { instances: laws.length, L1_counterexamples: laws.filter((l) => l.L1 === false), L1_not_checked: laws.filter((l) => l.L1 === null).length,
    L2_counterexamples: laws.filter((l) => l.L2 === false), L2_not_checked: laws.filter((l) => l.L2 === null).map((l) => ({ address: l.address, status: l.L2_status })).slice(0, 10), L2_not_checked_count: laws.filter((l) => l.L2 === null).length };

  // information loss H(program | value_id) over executable programs, per arm (substrateIO)
  const boundaries = Object.entries(out.arms).map(([mode, a]) => ({ id: `closure-${mode}`, from: 'program', to: 'value_id', pairs: a._exec.filter((p) => p.value_id).map((p) => [p.value_id, p.text]) }));
  const meas = spawnSync('python3', [join(ROOT, 'scripts', 'projection_matrix_measure.py')], { input: JSON.stringify({ boundaries }), encoding: 'utf8', maxBuffer: 1 << 28 });
  out.information_loss = meas.status === 0 ? JSON.parse(meas.stdout).map((m) => ({ id: m.id, n: m.n, H_program: m.H_source_bits, loss_H_program_given_value_id: m.loss_H_source_given_output_bits })) : { error: meas.stderr };

  // predictions
  const A = out.arms, f = (m) => A[m].executable_fraction;
  out.verdicts = {
    P1: f('untyped') < f('typed') && f('typed') < f('constitution') && f('constitution') < f('code') ? 'held' : 'FALSIFIED',
    P2: f('code') === 1 ? 'held' : `FALSIFIED (code arm executable fraction ${f('code')})`,
    P3: A.constitution.typing_gap > 0 ? 'held' : 'FALSIFIED',
    P4: JSON.stringify(A.typed.coverage_segments) === JSON.stringify(A.constitution.coverage_segments) && JSON.stringify(A.constitution.coverage_segments) === JSON.stringify(A.code.coverage_segments) ? 'held' : 'FALSIFIED',
    P5: out.laws.L1_counterexamples.length === 0 && out.laws.L2_counterexamples.length === 0 ? 'held' : 'FALSIFIED',
  };
  for (const a of Object.values(A)) { a.executable_programs = a._exec.length; delete a._exec; }
} catch (e) { out.crashed = { message: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 5) }; } finally { try { process.kill(-child.pid); } catch { /* gone */ } }
out.finished = new Date().toISOString();
const n = readdirSync(DIR).filter((x) => x.startsWith('record-')).length + 1;
writeFileSync(join(DIR, `record-${n}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(out.crashed ? 'CRASHED ' + out.crashed.message : JSON.stringify(out.verdicts), 'record', n);
process.exit(0);
