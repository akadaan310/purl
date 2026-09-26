// Start a PURL instance and an ACSP instance, populate them with the
// exp-0002 artifacts (example graph, shared DAG, the three handoff runs), write
// the resource URLs to a JSON file and keep both servers running until killed.
// Used to give an independent agent live resources to inspect.
//
//   node scripts/serve-inspection-instance.js <out.json>
import { writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createPurlServer } from '../src/transport/server.js';
import { Store } from '../src/continuity/store.js';
import { HttpPort } from '../src/compute/ports.js';
import { Composer } from '../src/compute/composer.js';
import { startAcsp, runHandoff, acspAvailable } from './lib/handoff.js';

const out = process.argv[2] ?? 'inspection-urls.json';
if (!acspAvailable()) {
  console.error('ACSP checkout not available (ACSP_DIR)');
  process.exit(2);
}
const acsp = await startAcsp();
const server = createPurlServer({ store: new Store() });
server.listen(Number(process.env.PURL_PORT ?? 0), '127.0.0.1');
await once(server, 'listening');
const purl = `http://127.0.0.1:${server.address().port}`;

const reg = await (await fetch(`${purl}/principals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'agent', label: 'example-builder' }) })).json();
const port = new HttpPort(purl, reg.token);
const c = new Composer(port);
const zero = await c.literal('0');
const one = await c.literal('1');
const C1 = await c.apply('XOR', [zero.id, one.id]);
const C2 = await c.apply('XOR', [C1.id, one.id]);
const C3 = await c.apply('AND', [C1.id, one.id]);
const A = await c.literal('0');
const B = await c.literal('1');
const Cc = await c.literal('0');
const D = await c.literal('0');
const X = await c.apply('XOR', [A.id, B.id]);
const Y = await c.apply('AND', [X.id, Cc.id]);
const Z = await c.apply('OR', [X.id, D.id]);
const W = await c.apply('AND', [Cc.id, D.id]);
const href = (n) => port.href(n.id);

const runs = [];
for (const [runId, fault] of [['honest', undefined], ['fault-misreport', 'misreport'], ['fault-wrong-node', 'wrong-node']]) {
  const r = await runHandoff({ acsp: acsp.base, purlBase: purl, runId, fault });
  runs.push({ run: runId, acsp_resource: r.acsp_resource, acsp_resource_json: `${r.acsp_resource}.json` });
}

const urls = {
  purl_instance: `${purl}/.well-known/purl`,
  acsp_instance: `${acsp.base}/.well-known/acsp`,
  acsp_protocol: `${acsp.base}/protocol`,
  purl_resources: {
    examples: { '0': href(zero), '1': href(one), C1: href(C1), C2: href(C2), C3: href(C3) },
    graph_2: { A: href(A), B: href(B), C: href(Cc), D: href(D), X: href(X), Y: href(Y), Z: href(Z), W: href(W) },
    note: 'All compute-* resources on this instance are publicly readable. Register your own principal (POST /principals) to invoke operations.',
  },
  acsp_resources: runs,
};
writeFileSync(out, JSON.stringify(urls, null, 1) + '\n');
console.log(JSON.stringify(urls));
const stop = async () => {
  server.closeAllConnections();
  server.close();
  await acsp.stop();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
