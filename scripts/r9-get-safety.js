// node scripts/r9-get-safety.js — EXP-R9 GET-safety re-check (SPEC: "GET-safety is re-checked per cell").
// For each instance: hash the state, replay every GET the participant made (direct to the circle, so the
// proxy logs stay the participant's), hash again. Writes observation-arrow/get-safety.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'circle', 'experiments', 'observation-arrow');
const cells = JSON.parse(readFileSync(join(OUT, 'cells.json'), 'utf8')).cells;
const H = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex');
const out = [];
for (const c of cells) {
  const j = async (p) => { try { const r = await fetch(c.circle_direct + p); return await r.json(); } catch { return null; } };
  const state = async () => { const s = await j('/scrolls'), k = await j('/checkpoints'), t = await j('/tests'), a = await j(`/acsp/r/${c.acsp_resource}/events`);
    return H(JSON.stringify([s?.scrolls ?? s?.items, k?.checkpoints ?? k?.items, t?.runs, (a?.events ?? []).map((e) => [e.version, e.operation])])); };
  const gets = readFileSync(join(OUT, c.log), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.method === 'GET').map((e) => e.url);
  const before = await state();
  for (const u of gets) { try { await fetch(c.circle_direct + u); } catch { /* recorded below as unchanged/changed only */ } }
  const after = await state();
  out.push({ inst: c.inst, gets_replayed: gets.length, before, after, unchanged: before === after });
}
writeFileSync(join(OUT, 'get-safety.json'), JSON.stringify({ checked: new Date().toISOString(), instances: out, all_unchanged: out.every((x) => x.unchanged) }, null, 1) + '\n');
console.log(out.map((x) => `${x.inst}:${x.gets_replayed}:${x.unchanged}`).join(' '));
