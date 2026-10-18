import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile, utimes, rm } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { MemoryRepository, FileRepository, SupabaseRepository, createRepository } from '../../service/repository.js';

const initial = () => ({ principals: {}, programs: {}, executions: {}, artifacts: {}, audit: [] });

test('memory transactions persist detached snapshots and roll back failed or async mutators', async () => {
  const repository = new MemoryRepository();
  const value = await repository.transaction(data => {
    data.programs.example = { count: 1 };
    return data.programs.example;
  });
  value.count = 9;
  const snapshot = await repository.read();
  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.data.programs.example.count, 1);
  snapshot.data.programs.example.count = 8;
  await assert.rejects(repository.transaction(data => { data.audit.push('bad'); throw new Error('abort'); }), /abort/);
  await assert.rejects(repository.transaction(async data => { data.audit.push('async'); }), /synchronous/);
  assert.deepEqual((await repository.read()).data, { ...initial(), programs: { example: { count: 1 } } });
});

test('file repository survives restart and ignores interrupted temporary writes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-repository-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const first = new FileRepository(path);
  await first.transaction(data => { data.programs.saved = { version: 1 }; });
  await writeFile(`${path}.tmp-interrupted`, '{');
  const restarted = new FileRepository(path);
  assert.deepEqual(await restarted.read(), { revision: 1, data: { ...initial(), programs: { saved: { version: 1 } } } });
  const disk = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(disk.revision, 1);
  await assert.rejects(restarted.transaction(() => { throw new Error('stop'); }), /stop/);
  assert.equal((await restarted.read()).revision, 1);
});

test('file repository serializes independent processes without lost updates', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-processes-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const moduleUrl = new URL('../../service/repository.js', import.meta.url).href;
  const source = `import { FileRepository } from ${JSON.stringify(moduleUrl)};
    const repository = new FileRepository(process.argv[1]);
    for (let i=0; i<12; i++) await repository.transaction(data => { data.programs.counter = (data.programs.counter ?? 0) + 1; });`;
  const children = Array.from({ length: 4 }, () => spawn(process.execPath, ['--input-type=module', '-e', source, path], { stdio: ['ignore', 'pipe', 'pipe'] }));
  const exits = await Promise.all(children.map(async child => {
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
    const [code] = await once(child, 'exit'); return { code, stderr };
  }));
  assert.deepEqual(exits, Array.from({ length: 4 }, () => ({ code: 0, stderr: '' })));
  const snapshot = await new FileRepository(path).read();
  assert.equal(snapshot.revision, 48);
  assert.equal(snapshot.data.programs.counter, 48);
});

test('killing a writer during atomic staging preserves a complete committed document', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-interruption-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const repository = new FileRepository(path);
  await repository.transaction(data => { data.audit.push('before crash'); });
  let timeout;
  let watcher;
  const staged = new Promise((resolve, reject) => {
    watcher = watch(directory, (_event, filename) => {
      if (filename?.startsWith('state.json.tmp-')) resolve();
    });
    timeout = setTimeout(() => reject(new Error('Writer never staged its atomic file')), 5000);
  });
  const moduleUrl = new URL('../../service/repository.js', import.meta.url).href;
  const source = `import { FileRepository } from ${JSON.stringify(moduleUrl)};
    await new FileRepository(process.argv[1]).transaction(data => { data.programs.large = 'x'.repeat(16 * 1024 * 1024); });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, path], { stdio: 'ignore' });
  const exit = once(child, 'exit');
  try { await staged; child.kill('SIGKILL'); await exit; }
  finally { clearTimeout(timeout); watcher.close(); child.kill('SIGKILL'); }
  const snapshot = await new FileRepository(path).read();
  assert.ok(snapshot.revision === 1 || snapshot.revision === 2);
  assert.deepEqual(snapshot.data.audit, ['before crash']);
  if (snapshot.revision === 2) assert.equal(snapshot.data.programs.large.length, 16 * 1024 * 1024);
  await repository.transaction(data => { data.audit.push('after recovery'); });
  assert.equal((await repository.read()).revision, snapshot.revision + 1);
});

test('file repository recovers dead-process and incomplete crash locks', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  await mkdir(`${path}.lock`);
  await writeFile(`${path}.lock/crashed.json`, JSON.stringify({ pid: 2147483647, token: 'crashed' }));
  const repository = new FileRepository(path, { staleLockMs: 20, lockTimeoutMs: 500 });
  await repository.transaction(data => { data.audit.push('recovered'); });
  await mkdir(`${path}.lock`);
  const old = new Date(Date.now() - 1000);
  await utimes(`${path}.lock`, old, old);
  await repository.transaction(data => { data.audit.push('incomplete'); });
  assert.deepEqual((await repository.read()).data.audit, ['recovered', 'incomplete']);
});

test('an old live-process lock is never stolen', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-live-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  await mkdir(`${path}.lock`);
  await writeFile(`${path}.lock/live.json`, JSON.stringify({ pid: process.pid, token: 'live' }));
  const old = new Date(Date.now() - 1000);
  await utimes(`${path}.lock/live.json`, old, old);
  const repository = new FileRepository(path, { staleLockMs: 1, lockTimeoutMs: 25 });
  await assert.rejects(repository.transaction(data => { data.audit.push('stolen'); }), /lock timeout/);
  assert.deepEqual((await repository.read()).data.audit, []);
  assert.equal(JSON.parse(await readFile(`${path}.lock/live.json`, 'utf8')).pid, process.pid);
});

test('Linux locks record the owner process start time', { skip: process.platform !== 'linux' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-owner-start-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = new FileRepository(join(directory, 'state.json'));
  const release = await repository.acquireLock();
  try {
    const [name] = await readdir(repository.lockPath);
    const owner = JSON.parse(await readFile(`${repository.lockPath}/${name}`, 'utf8'));
    const processStat = await readFile(`/proc/${process.pid}/stat`, 'utf8');
    const startTime = processStat.slice(processStat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
    assert.equal(owner.startTime, startTime);
    assert.match(owner.startTime, /^\d+$/);
  } finally { await release(); }
});

test('a reused live PID with a different start time does not retain an abandoned lock', { skip: process.platform !== 'linux' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-reused-pid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const processStat = await readFile(`/proc/${process.pid}/stat`, 'utf8');
  const startTime = processStat.slice(processStat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
  await mkdir(`${path}.lock`);
  await writeFile(`${path}.lock/reused.json`, JSON.stringify({ pid: process.pid, host: hostname(), token: 'reused', startTime: String(BigInt(startTime) + 1n) }));
  const repository = new FileRepository(path, { lockTimeoutMs: 100 });
  await repository.transaction(data => { data.audit.push('recovered reused PID'); });
  assert.deepEqual((await repository.read()).data.audit, ['recovered reused PID']);
});

test('a matching process start time or foreign host keeps a live lock protected', { skip: process.platform !== 'linux' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-owner-guard-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const processStat = await readFile(`/proc/${process.pid}/stat`, 'utf8');
  const startTime = processStat.slice(processStat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
  for (const [name, owner] of [
    ['matching', { pid: process.pid, host: hostname(), startTime }],
    ['foreign', { pid: process.pid, host: `${hostname()}-other-host`, startTime: String(BigInt(startTime) + 1n) }],
    ['unavailable', { pid: process.pid, host: hostname(), startTime: 'unavailable' }],
  ]) {
    const path = join(directory, `${name}.json`);
    await mkdir(`${path}.lock`);
    await writeFile(`${path}.lock/${name}.json`, JSON.stringify({ ...owner, token: name }));
    const repository = new FileRepository(path, { staleLockMs: 1, lockTimeoutMs: 25 });
    await assert.rejects(repository.transaction(data => { data.audit.push('stolen'); }), /lock timeout/);
    assert.deepEqual((await repository.read()).data.audit, []);
    assert.equal(JSON.parse(await readFile(`${path}.lock/${name}.json`, 'utf8')).token, name);
  }
});

test('production configuration fails closed and development persistence is explicit', () => {
  assert.throws(() => createRepository({ NODE_ENV: 'production' }), /SUPABASE_URL/);
  assert.throws(() => createRepository({ NODE_ENV: 'production', PURL_PERSISTENCE: 'file' }), /production/i);
  assert.throws(() => createRepository({ NODE_ENV: 'production', PURL_PERSISTENCE: 'memory' }), /production/i);
  assert.throws(() => createRepository({ PURL_PERSISTENCE: 'other' }), /Unknown/);
  assert.equal(createRepository({}).mode, 'development-file');
  assert.equal(createRepository({ PURL_PERSISTENCE: 'memory' }).mode, 'development-memory');
});

test('Supabase adapter retries document CAS conflicts and preserves immutable object bytes', async t => {
  let snapshot = { revision: 0, data: initial() };
  let conflict = true;
  const objects = new Map();
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer server-secret');
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const reply = (status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
    if (request.url === '/rest/v1/rpc/purl_read_document') return reply(200, snapshot);
    if (request.url === '/rest/v1/rpc/purl_compare_and_swap') {
      const body = JSON.parse(bytes);
      if (conflict) {
        conflict = false;
        snapshot = { revision: 1, data: { ...initial(), audit: ['other writer'] } };
        return reply(200, { committed: false });
      }
      if (body.p_expected_revision !== snapshot.revision) return reply(200, { committed: false });
      snapshot = { revision: snapshot.revision + 1, data: body.p_data };
      return reply(200, { committed: true, revision: snapshot.revision });
    }
    if (request.url.startsWith('/storage/v1/object/purl-artifacts/')) {
      const key = request.url;
      if (request.method === 'POST') {
        assert.equal(request.headers['x-upsert'], 'false');
        if (objects.has(key)) return reply(409, { message: 'already exists' });
        objects.set(key, bytes); return reply(200, { Key: key });
      }
      if (!objects.has(key)) return reply(404, {});
      response.writeHead(200); return response.end(objects.get(key));
    }
    reply(404, {});
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const repository = new SupabaseRepository({ url: `http://127.0.0.1:${server.address().port}`, serviceRoleKey: 'server-secret' });
  const result = await repository.transaction(data => { data.audit.push('this writer'); return data.audit.length; });
  assert.equal(result, 2);
  assert.deepEqual((await repository.read()).data.audit, ['other writer', 'this writer']);
  const artifact = await repository.putArtifact(Buffer.from('immutable'), { contentType: 'text/plain' });
  assert.match(artifact.id, /^sha256:[a-f0-9]{64}$/);
  assert.equal((await repository.getArtifact(artifact.id)).toString(), 'immutable');
  assert.deepEqual(await repository.putArtifact(Buffer.from('immutable'), { contentType: 'text/plain' }), artifact);
});

test('Supabase adapter bounds conflicts and surfaces service failures', async () => {
  const fetch = async url => new Response(JSON.stringify(url.endsWith('purl_read_document') ? { revision: 0, data: initial() } : { committed: false }), { status: 200 });
  const repository = new SupabaseRepository({ url: 'https://example.supabase.co', serviceRoleKey: 'secret', fetch, maxRetries: 2 });
  await assert.rejects(repository.transaction(data => { data.audit.push('lost'); }), /conflict/i);
  const unavailable = new SupabaseRepository({ url: 'https://example.supabase.co', serviceRoleKey: 'secret', fetch: async () => new Response('offline', { status: 503 }) });
  await assert.rejects(unavailable.read(), /503/);
});
