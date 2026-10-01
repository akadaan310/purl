// Differential test (EXP-DOGFOOD-3 record-1): implementation_id must identify the code a process
// loaded. Before: it hashed src/circle on disk at request time, so a file created after start (and
// never loaded) changed it. After: fixed at load; disk_differs_from_loaded reports the difference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('implementation_id is the loaded code, not the disk at request time', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'impl-id-'));
  cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true });
  mkdirSync(join(tmp, 'circle'), { recursive: true });
  cpSync(join(ROOT, 'circle', 'constitution'), join(tmp, 'circle', 'constitution'), { recursive: true });
  const { createCircle } = await import(pathToFileURL(join(tmp, 'src', 'circle', 'server.js')).href);
  const circle = createCircle({ purlBase: 'http://127.0.0.1:9', substrateBase: 'http://127.0.0.1:9', acspBase: 'http://127.0.0.1:9' });
  const before = circle.bridge.implementationId();
  writeFileSync(join(tmp, 'src', 'circle', 'zz-created-after-start.js'), 'export const X = 1;\n');
  const after = circle.bridge.implementationId();
  assert.equal(after.implementation_id, before.implementation_id);
  assert.equal(after.disk_differs_from_loaded, true);
});
