// Entry point: `npm start`. Configuration by environment:
//   PORT (8080) · HOST (127.0.0.1) · PURL_DATA_DIR (unset = in-memory) · PURL_CREATE_ADMIN=1
import { createPurlServer } from './server.js';
import { Store } from '../continuity/store.js';

const store = new Store({ dataDir: process.env.PURL_DATA_DIR || null });
if (process.env.PURL_CREATE_ADMIN === '1') {
  const { principal, token } = store.registerPrincipal({ kind: 'human', label: 'administrator', admin: true });
  console.log(`admin principal ${principal.id}; token (shown once): ${token}`);
}
const server = createPurlServer({ store });
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '127.0.0.1';
server.listen(port, host, () => {
  console.log(`PURL/0.1 listening on http://${host}:${port}`);
  console.log(`  machine entry point: http://${host}:${port}/.well-known/purl`);
  console.log(`  protocol resource:   http://${host}:${port}/r/purl-protocol`);
  console.log(`  persistence:         ${store.dataDir ?? 'in-memory (set PURL_DATA_DIR to persist)'}`);
});
