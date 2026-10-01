// node scripts/program-closure-posthoc.js — EXP-PROGRAM-CLOSURE-1 post-hoc check PH-1 (NOT pre-registered;
// added after record-2 falsified P2). Which constraints does even the code-informed arm (A3) not know?
// Re-generates A3 exactly as scripts/program-closure.js does and groups its non-executable programs
// by (operation segment, error code, prefix kind). Writes circle/experiments/program-closure/posthoc-PH1.json.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/circle/seurl.js';
import { candidateAlphabet, admissible, nBitsOf } from '../src/circle/closure.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUB = resolve(ROOT, '..', 'substrateIO');
const PORT = 42765, BASE = `http://127.0.0.1:${PORT}`;
const SOURCES = ['/seurl/START/map/eca/90/8/state/5', '/seurl/START/map/eca/30/8/state/1', '/seurl/START/map/increment/3/state/2', '/seurl/START/map/eca/110/16/state/9'];
const child = spawn('python3', ['-m', 'tools.purl_server', '--port', String(PORT), '--store', mkdtempSync(join(tmpdir(), 'ph1-'))], { cwd: SUB, stdio: 'ignore', detached: true });
for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, json: await r.json().catch(() => null) }; };
const out = { check: 'PH-1', pre_registered: false, reason: 'record-2 falsified P2 (code arm executable fraction 0.8635)', groups: {} };
try {
  const catalog = (await get('/operations')).json;
  const limits = JSON.parse(execFileSync('python3', ['-c', 'import json; from substrate.purl import LIMITS; print(json.dumps(LIMITS))'], { cwd: SUB, encoding: 'utf8' }));
  const alphabet = candidateAlphabet(catalog);
  const evalP = async (text) => { const s = run(text.slice('/seurl'.length)); const t = await get('/term' + s.current_address); const v = await get(s.current_address);
    return { address: s.current_address, kind: t.json?.kind ?? null, executable: v.status === 200, status: v.status, code: v.json?.error?.code ?? null, message: v.json?.error?.message ?? null }; };
  const d1 = [];
  for (const src of SOURCES) { const se = await evalP(src); for (const c of alphabet) if (admissible('code', c, { kind: se.kind, n: nBitsOf(se.address), catalog, limits })) d1.push({ text: `${src}/${c.move}`, seg: c.segment, prefixKind: se.kind }); }
  const all = [];
  for (const p of d1) all.push({ ...p, ...(await evalP(p.text)) });
  const r1 = [...all];
  for (const p of r1) for (const c of alphabet) if (admissible('code', c, { kind: p.kind, n: nBitsOf(p.address), catalog, limits })) { const q = { text: `${p.text}/${c.move}`, seg: c.segment, prefixKind: p.kind, prefixSeg: p.seg }; all.push({ ...q, ...(await evalP(q.text)) }); }
  for (const p of all.filter((x) => !x.executable)) {
    const k = `${p.seg} after ${p.prefixSeg ?? '(source)'} | ${p.status} ${p.code}`;
    (out.groups[k] ??= { count: 0, example: p.text, message: p.message }).count++;
  }
  out.total = all.length; out.non_executable = all.filter((x) => !x.executable).length;
} finally { try { process.kill(-child.pid); } catch { /* gone */ } }
writeFileSync(join(ROOT, 'circle', 'experiments', 'program-closure', 'posthoc-PH1.json'), JSON.stringify(out, null, 1) + '\n');
console.log(out.total, out.non_executable); for (const [k, v] of Object.entries(out.groups)) console.log(v.count, k, '—', v.message);
process.exit(0);
