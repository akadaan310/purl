// node scripts/r9-score.js — EXP-R9 scoring (circle/experiments/observation-arrow/SPEC.md).
// Written before any participant report existed. Reads cells.json, logs/cell-N.jsonl, report-<cell>-<model>.md,
// and manual.json (scores assigned by reading each report, with a one-line reason). Writes results.json.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'circle', 'experiments', 'observation-arrow');
const cells = JSON.parse(readFileSync(join(OUT, 'cells.json'), 'utf8')).cells;
const manual = existsSync(join(OUT, 'manual.json')) ? JSON.parse(readFileSync(join(OUT, 'manual.json'), 'utf8')) : {};
const sessionsOf = (url) => { try { return new URL(url, 'http://x').searchParams.get('session'); } catch { return null; } };

/** mechanical R9: names the projection, or says "observ…" within 200 chars of both "ACSP" and "substrate" */
export function mechanicalR9(text) {
  if (text.includes('P-ACSP-EV-1')) return true;
  const low = text.toLowerCase();
  for (let i = low.indexOf('observ'); i >= 0; i = low.indexOf('observ', i + 1)) {
    const w = low.slice(Math.max(0, i - 200), i + 200);
    if (w.includes('acsp') && w.includes('substrate')) return true;
  }
  return false;
}

const rows = [];
for (const c of cells) {
  const log = existsSync(join(OUT, c.log)) ? readFileSync(join(OUT, c.log), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const f = `report-${c.cell}-${c.model}.md`;
  if (!existsSync(join(OUT, f))) { rows.push({ inst: c.inst, cell: c.cell, surface: c.surface, prompt: c.prompt, model: c.model, missing_report: true, requests: log.length }); continue; }
  const text = readFileSync(join(OUT, f), 'utf8');
  const exposed = log.some((e) => Object.values(e.markers).some(Boolean));
  const requestedArrow = log.some((e) => /^\/projections(\?|$)/.test(e.url) || /^\/acsp\/r\/[^/]+\/observe/.test(e.url) || (e.method === 'POST' && /\/TALK\//.test(e.url)));
  const mech = mechanicalR9(text);
  const man = manual[`${c.cell}-${c.model}`] ?? null;
  rows.push({ inst: c.inst, cell: c.cell, surface: c.surface, prompt: c.prompt, model: c.model, requests: log.length, gets: log.filter((e) => e.method === 'GET').length, posts: log.filter((e) => e.method === 'POST').length,
    sessions: [...new Set(log.map((e) => sessionsOf(e.url)).filter(Boolean))], exposed, first_exposure_seq: log.find((e) => Object.values(e.markers).some(Boolean))?.seq ?? null,
    exposure_urls: [...new Set(log.filter((e) => Object.values(e.markers).some(Boolean)).map((e) => e.url.split('?')[0]))].slice(0, 10),
    requested_arrow: requestedArrow, r9_mechanical: mech, r9_manual: man?.r9 ?? null, r9_manual_reason: man?.reason ?? null,
    miss: (man?.r9 ?? mech) ? null : (exposed ? 'reporting failure (exposed, not reported)' : 'discovery failure (never exposed)') });
}
const cell = (s, p) => rows.filter((r) => r.surface === s && r.prompt === p && !r.missing_report);
const r9 = (xs) => xs.filter((r) => (r.r9_manual ?? r.r9_mechanical)).length;
const res = {
  rows,
  table: Object.fromEntries(['pre', 'current'].flatMap((s) => ['neutral', 'eliciting'].map((p) => [`${s}/${p}`, { n: cell(s, p).length, r9: r9(cell(s, p)), exposed: cell(s, p).filter((r) => r.exposed).length }]))),
};
const pn = cell('pre', 'neutral'), cn = cell('current', 'neutral'), pe = cell('pre', 'eliciting');
res.verdicts = {
  H1: r9(cn) >= 1 && r9(cn) > r9(pn) ? 'held' : 'FALSIFIED',
  H2: pn.every((r) => !r.exposed || (r.r9_manual ?? r.r9_mechanical)) ? (pn.some((r) => r.exposed) ? 'held (exposed participants reported)' : 'held') : 'FALSIFIED (a pre-neutral participant was exposed and did not report)',
  H3: pe.some((r) => r.exposed) ? 'held' : 'FALSIFIED',
};
res.mechanical_vs_manual_disagreements = rows.filter((r) => r.r9_manual != null && r.r9_manual !== r.r9_mechanical).map((r) => `${r.cell}-${r.model}`);
writeFileSync(join(OUT, 'results.json'), JSON.stringify(res, null, 1) + '\n');
console.log(JSON.stringify(res.table), JSON.stringify(res.verdicts));
