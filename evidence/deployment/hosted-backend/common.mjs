import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const output = dirname(fileURLToPath(import.meta.url));
export const transport = 'http://127.0.0.1:18183';
export const canonicalBase = 'https://purl-api-production.up.railway.app';
export const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
export const hash = (value) => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const without = (value, fields = ['content_id']) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
export function client(rawFile) {
  let token;
  const credentials = new Set();
  const redact = (value, key = '') => {
    if (/^(token|token_hash|token_hashes|authorization|access_token|cookie|secret)$/i.test(key)) return '[REDACTED]';
    if (typeof value === 'string') { for (const credential of credentials) if (value.includes(credential)) return value.replaceAll(credential, '[REDACTED]'); return value; }
    if (Array.isArray(value)) return value.map((entry) => redact(entry));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, redact(entry, name)]));
    return value;
  };
  return {
    setToken(value) { token = value; credentials.add(value); },
    async initialize() { await mkdir(output, { recursive: true }); await writeFile(rawFile, '', { mode: 0o600 }); },
    redact,
    async request(method, path, body, authenticated = false) {
      assert.ok(path.startsWith('/') && !path.startsWith('//'), 'Only loopback-relative API requests are permitted');
      const headers = { Accept: 'application/purl+json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (authenticated) { assert.ok(token); headers.Authorization = `Bearer ${token}`; }
      const response = await fetch(`${transport}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
      const json = await response.json();
      await appendFile(rawFile, `${JSON.stringify(redact({ at: new Date().toISOString(), request: { method, path, body, authenticated }, response: { status: response.status, body: json } }))}\n`);
      return { status: response.status, body: json };
    },
  };
}
export function recorder(checks) {
  return (name, passed, detail = {}) => {
    checks.push({ ...detail, ...(Object.hasOwn(detail, 'status') ? { observed_status: detail.status } : {}), name, status: passed ? 'PASS' : 'FAIL' });
    assert.ok(passed, name);
  };
}
export async function awaitExecution(http, id) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await http.request('GET', `/api/executions/${id}`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    if (['succeeded', 'failed', 'denied'].includes(result.body.execution.status)) return result.body.execution;
    await sleep(500);
  }
  throw new Error('Hosted worker did not complete the queued execution within60seconds');
}
