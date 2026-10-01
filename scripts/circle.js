// npm run circle — the circle and its neighbours on localhost.
//   SUBSTRATE_DIR=../substrateIO ACSP_DIR=../NetGovComEduGovOrgEduGovComNet npm run circle
//   or SUBSTRATE_BASE=… ACSP_BASE=… (e.g. https://acsp-one.vercel.app; then TALK proposes on the live service)
//   PORT (8490+) · PURL_DATA_DIR to persist scrolls · GOLDEN_BASE + GOLDEN_TOKEN_R for the Golden Surface relay
import { startCircle } from './circle-lib.js';

const c = await startCircle({ port: Number(process.env.PORT ?? 8484), purlPort: Number(process.env.PURL_PORT ?? 0) });
console.log(`circle      ${c.base}/`);
console.log(`purl/0.1    ${c.purlBase}/.well-known/purl`);
console.log(`substrate   ${c.substrateBase ?? '(not configured: SUBSTRATE_DIR or SUBSTRATE_BASE)'}`);
console.log(`acsp        ${c.acspBase ?? '(not configured: ACSP_DIR or ACSP_BASE)'}`);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { await c.close(); process.exit(0); });
