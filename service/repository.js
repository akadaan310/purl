import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { hostname } from 'node:os';

export const emptyData = () => ({ principals: {}, programs: {}, executions: {}, artifacts: {}, audit: [] });
const clone = value => structuredClone(value);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function document(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
    throw new Error('Invalid persistence document; refusing to replace durable state');
  }
  for (const key of ['principals', 'programs', 'executions', 'artifacts']) {
    if (!value.data[key] || typeof value.data[key] !== 'object' || Array.isArray(value.data[key])) throw new Error(`Invalid persistence collection: ${key}`);
  }
  if (!Array.isArray(value.data.audit)) throw new Error('Invalid persistence audit log');
  return value;
}

function apply(mutator, data) {
  if (typeof mutator !== 'function') throw new TypeError('A synchronous transaction mutator is required');
  const result = mutator(data);
  if (result && typeof result.then === 'function') {
    // Consume an async rejection so the contract error remains the only failure.
    Promise.resolve(result).catch(() => {});
    throw new TypeError('Transaction mutators must be synchronous and have no external side effects');
  }
  return result;
}

export class MemoryRepository {
  mode = 'development-memory';
  constructor(data = emptyData()) {
    this.snapshot = document({ revision: 0, data: clone(data) });
  }
  async read() { return clone(this.snapshot); }
  async transaction(mutator) {
    const candidate = clone(this.snapshot);
    const result = apply(mutator, candidate.data);
    candidate.revision++;
    // Persist a separate copy: neither mutator references nor returned values own state.
    this.snapshot = document(clone(candidate));
    return result;
  }
}

/** Single-host DEVELOPMENT persistence. Supabase is required in production. */
export class FileRepository {
  mode = 'development-file';
  constructor(path = './.purl/state.json', { staleLockMs = 30_000, lockTimeoutMs = 15_000 } = {}) {
    this.path = resolve(path);
    this.lockPath = `${this.path}.lock`;
    this.staleLockMs = staleLockMs;
    this.lockTimeoutMs = lockTimeoutMs;
  }
  async read() {
    try { return clone(document(JSON.parse(await readFile(this.path, 'utf8')))); }
    catch (error) {
      if (error.code === 'ENOENT') return { revision: 0, data: emptyData() };
      throw error;
    }
  }
  async recoverLock() {
    try {
      const files = await readdir(this.lockPath);
      if (files.length === 0) {
        // Acquisitions rename a populated directory atomically. Empty directories
        // can only be abandoned release/recovery remnants, never an active lock.
        await rmdir(this.lockPath);
        return;
      }
      if (files.length !== 1 || !/^[a-zA-Z0-9-]+\.json$/.test(files[0])) throw new Error('Invalid repository lock directory');
      const ownerPath = `${this.lockPath}/${files[0]}`;
      let owner;
      try { owner = JSON.parse(await readFile(ownerPath, 'utf8')); } catch (error) {
        if (error.code === 'ENOENT') return;
        if (Date.now() - (await stat(ownerPath)).mtimeMs < this.staleLockMs) return;
      }
      if (owner && owner.host && owner.host !== hostname()) return;
      if (owner && Number.isInteger(owner.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0); return; }
        catch (error) { if (error.code !== 'ESRCH') return; }
      } else if (Date.now() - (await stat(ownerPath)).mtimeMs < this.staleLockMs) return;
      // The unique owner filename prevents a concurrent reaper from deleting a
      // replacement lock. A fresh acquisition always contains a different name.
      await unlink(ownerPath);
      await rmdir(this.lockPath).catch(error => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; });
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
    }
  }
  async acquireLock() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const token = randomUUID();
    const candidate = `${this.lockPath}-${token}`;
    await mkdir(candidate, { mode: 0o700 });
    const ownerFile = `${token}.json`;
    await writeSynced(`${candidate}/${ownerFile}`, JSON.stringify({ pid: process.pid, host: hostname(), token }), 'wx');
    const deadline = Date.now() + this.lockTimeoutMs;
    try {
      while (true) {
        try { await rename(candidate, this.lockPath); break; }
        catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
        await this.recoverLock();
        if (Date.now() >= deadline) throw new Error('Repository lock timeout; active transaction was not interrupted');
        await sleep(5 + Math.floor(Math.random() * 15));
      }
    } catch (error) {
      await unlink(`${candidate}/${ownerFile}`).catch(() => {});
      await rmdir(candidate).catch(() => {});
      throw error;
    }
    return async () => {
      await unlink(`${this.lockPath}/${ownerFile}`);
      await rmdir(this.lockPath).catch(error => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; });
    };
  }
  async transaction(mutator) {
    const release = await this.acquireLock();
    let temporary;
    try {
      const snapshot = await this.read();
      const result = apply(mutator, snapshot.data);
      snapshot.revision++;
      document(snapshot);
      const bytes = JSON.stringify(snapshot);
      temporary = `${this.path}.tmp-${randomUUID()}`;
      await writeSynced(temporary, bytes, 'wx');
      await rename(temporary, this.path);
      temporary = undefined;
      // A synced file plus synced parent directory survives a host crash on
      // filesystems that implement POSIX fsync/rename durability.
      const directory = await open(dirname(this.path), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
      return result;
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      await release();
    }
  }
}

async function writeSynced(path, bytes, flags) {
  const handle = await open(path, flags, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

export class SupabaseRepository {
  mode = 'supabase';
  constructor({ url, serviceRoleKey, documentId = 'main', bucket = 'purl-artifacts', fetch: fetcher = globalThis.fetch, maxRetries = 8, timeoutMs = 15_000 } = {}) {
    if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid SUPABASE_URL');
    this.url = parsed.href.replace(/\/$/, '');
    this.key = serviceRoleKey;
    this.documentId = documentId;
    this.bucket = bucket;
    this.fetch = fetcher;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
  }
  async request(path, { method = 'POST', body, headers = {}, raw = false } = {}) {
    const response = await this.fetch(`${this.url}${path}`, {
      method,
      headers: { apikey: this.key, authorization: `Bearer ${this.key}`, 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      // Do not include response bodies or credentials in persistence errors.
      const error = new Error(`Supabase persistence request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response;
  }
  async read() {
    const response = await this.request('/rest/v1/rpc/purl_read_document', { body: { p_document_id: this.documentId } });
    return clone(document(await response.json()));
  }
  async transaction(mutator) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const snapshot = await this.read();
      const result = apply(mutator, snapshot.data);
      document(snapshot);
      const response = await this.request('/rest/v1/rpc/purl_compare_and_swap', {
        body: { p_document_id: this.documentId, p_expected_revision: snapshot.revision, p_data: snapshot.data },
      });
      const outcome = await response.json();
      if (outcome.committed === true) return result;
      if (outcome.committed !== false) throw new Error('Invalid Supabase CAS response');
      if (attempt + 1 < this.maxRetries) await sleep(Math.min(100, 2 ** attempt) + Math.floor(Math.random() * 5));
    }
    throw new Error('Persistence conflict retry limit exceeded');
  }
  async putArtifact(bytes, { contentType = 'application/octet-stream' } = {}) {
    const content = Buffer.from(bytes);
    const digest = createHash('sha256').update(content).digest('hex');
    const artifact = { id: `sha256:${digest}`, key: `${digest.slice(0, 2)}/${digest}`, size: content.length, contentType };
    try {
      await this.request(`/storage/v1/object/${encodeURIComponent(this.bucket)}/${artifact.key}`, {
        body: content, raw: true, headers: { 'content-type': contentType, 'x-upsert': 'false', 'cache-control': '31536000, immutable' },
      });
    } catch (error) {
      // Storage can report duplicate objects as 400 or 409. Never overwrite;
      // compare the existing content before treating a duplicate as success.
      if (![400, 409].includes(error.status)) throw error;
      const existing = await this.getArtifact(artifact.id);
      if (!existing.equals(content)) throw new Error('Immutable artifact hash collision or storage corruption');
    }
    return artifact;
  }
  async getArtifact(id) {
    if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error('Invalid immutable artifact id');
    const digest = id.slice(7);
    const response = await this.request(`/storage/v1/object/${encodeURIComponent(this.bucket)}/${digest.slice(0, 2)}/${digest}`, { method: 'GET' });
    const content = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(content).digest('hex') !== digest) throw new Error('Immutable artifact storage integrity check failed');
    return content;
  }
}

export function createRepository(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const mode = env.PURL_PERSISTENCE || (production ? 'supabase' : 'file');
  if (production && mode !== 'supabase') throw new Error('Production requires Supabase persistence; local adapters are DEVELOPMENT only');
  if (mode === 'supabase') return new SupabaseRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, documentId: env.PURL_DOCUMENT_ID || 'main', bucket: env.SUPABASE_ARTIFACT_BUCKET || 'purl-artifacts' });
  if (mode === 'file') return new FileRepository(env.PURL_DATA_FILE || './.purl/state.json');
  if (mode === 'memory') return new MemoryRepository();
  throw new Error(`Unknown PURL_PERSISTENCE adapter: ${mode}`);
}
