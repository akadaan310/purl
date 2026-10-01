// node scripts/r9-apparatus.js — EXP-R9 apparatus (circle/experiments/observation-arrow/SPEC.md).
// Starts four cells (surface pre-F-R4 a9133b2 | current) × (prompt neutral | eliciting), each a circle
// with fresh stores and a local ACSP continuity resource, behind a logging proxy. The proxy is the same
// instrument for both surfaces: method, URL, status, size, and whether the response contained the
// markers. No request bodies, no headers. Runs until SIGTERM or until the STOP file exists.
import { createServer, request as httpRequest } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'circle', 'experiments', 'observation-arrow');
const PRE = 'a9133b2';
const WT = resolve(ROOT, '..', 'wt-r9-pre'); // sibling: ../substrateIO resolves as in the main checkout
const STOP = join(OUT, 'STOP');
const MARKERS = ['P-ACSP-EV-1', '/observe'];

if (!existsSync(WT)) { execFileSync('git', ['-C', ROOT, 'worktree', 'add', '-q', '--detach', WT, PRE]); symlinkSync(join(ROOT, 'node_modules'), join(WT, 'node_modules')); }
const libPre = await import(pathToFileURL(join(WT, 'scripts', 'circle-lib.js')).href);
const libCur = await import(pathToFileURL(join(ROOT, 'scripts', 'circle-lib.js')).href);
mkdirSync(join(OUT, 'logs'), { recursive: true });

function proxy(target, logFile, port) {
  let seq = 0;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const up = httpRequest(target + req.url, { method: req.method, headers: { ...req.headers, host: new URL(target).host } }, (r) => {
        const out = [];
        r.on('data', (c) => out.push(c));
        r.on('end', () => {
          const buf = Buffer.concat(out);
          const text = buf.toString('utf8');
          appendFileSync(logFile, JSON.stringify({ seq: ++seq, t: new Date().toISOString(), method: req.method, url: req.url, status: r.statusCode, bytes: buf.length,
            markers: Object.fromEntries(MARKERS.map((m) => [m, text.includes(m)])) }) + '\n');
          res.writeHead(r.statusCode, r.headers);
          res.end(buf);
        });
      });
      up.on('error', (e) => { res.writeHead(502); res.end(String(e.message)); });
      up.end(body);
    });
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

const CELLS = [
  { cell: 1, surface: 'pre', prompt: 'neutral', lib: libPre, commit: PRE },
  { cell: 2, surface: 'pre', prompt: 'eliciting', lib: libPre, commit: PRE },
  { cell: 3, surface: 'current', prompt: 'neutral', lib: libCur, commit: execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() },
  { cell: 4, surface: 'current', prompt: 'eliciting', lib: libCur, commit: null },
];
CELLS[3].commit = CELLS[2].commit;
const running = [];
const doc = { experiment: 'EXP-R9', started: new Date().toISOString(), cells: [] };
for (const c of CELLS) {
  const circle = await c.lib.startCircle({ substrateDir: resolve(ROOT, '..', 'substrateIO'), acspDir: resolve(ROOT, '..', 'NetGovComEduGovOrgEduGovComNet'),
    substratePort: 43000 + c.cell, acspPort: 43100 + c.cell, purlDataDir: mkdtempSync(join(tmpdir(), `r9-cell${c.cell}-`)) });
  // the operator creates the continuity resource as owner (as in EXP-BRIDGE-RECON)
  const intent = await (await fetch(`${circle.acspBase}/new?format=json&session_id=operator-owner&title=EXP-R9-cell-${c.cell}`)).json();
  const rid = (await (await fetch(`${circle.acspBase}/r`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intent.request) })).json()).resource_id;
  circle.cfg.acspResource = rid;
  const port = 8600 + c.cell;
  const logFile = join(OUT, 'logs', `cell-${c.cell}.jsonl`);
  const px = await proxy(circle.base, logFile, port);
  circle.cfg.publicBase = `http://127.0.0.1:${port}`; // links the circle writes point at the proxy
  running.push({ circle, px });
  doc.cells.push({ cell: c.cell, surface: c.surface, prompt: c.prompt, purl_commit: c.commit, url: `http://127.0.0.1:${port}/`, circle_direct: circle.base, acsp_resource: rid, log: `logs/cell-${c.cell}.jsonl` });
  console.log('cell', c.cell, c.surface, c.prompt, `http://127.0.0.1:${port}/`);
}
writeFileSync(join(OUT, 'cells.json'), JSON.stringify(doc, null, 1) + '\n');
console.log('READY');
const stop = async () => { for (const r of running) { r.px.close(); await r.circle.close(); } process.exit(0); };
process.on('SIGTERM', stop);
setInterval(() => { if (existsSync(STOP)) stop(); }, 2000);
