import test from 'node:test';
import assert from 'node:assert/strict';
import { PurlService } from '../../service/domain.js';
import { MemoryRepository } from '../../service/repository.js';
import { hashOf, registerSchema, validate } from '../../service/domain/support.js';

const source = 'input number | math.add 2 | math.multiply 3';
async function setup(adapter = null) {
  const repository = new MemoryRepository();
  const service = new PurlService({ repository, sandboxAdapter: adapter });
  const session = await service.handle('POST', '/api/session', { label: 'Security regression owner' });
  return { repository, service, token: session.body.token };
}
async function create(ctx, extra = {}) {
  const result = await ctx.service.handle('POST', '/api/programs', { title: 'Regression', source, visibility: 'public', input_schema: { type: 'number' }, output_schema: { type: 'number' }, tests: [{ input: 4, expected: 18 }], ...extra }, { token: ctx.token });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.program;
}
async function complete(ctx, extra = {}) {
  let program = await create(ctx, extra);
  const build = await ctx.service.handle('POST', `/api/programs/${program.id}/build`, { expected_version: program.version }, { token: ctx.token });
  assert.equal(build.body.build.status, 'passed', JSON.stringify(build.body));
  program = build.body.program;
  const run = await ctx.service.handle('POST', `/api/programs/${program.id}/run`, { expected_version: program.version, input: 4, seed: 7 }, { token: ctx.token });
  assert.equal(run.status, 202, JSON.stringify(run.body));
  const execution = await ctx.service.workOnce({ workerId: 'regression-worker' });
  assert.equal(execution.status, 'succeeded', JSON.stringify(execution));
  return { program: run.body.program, execution };
}

for (const property of ['constructor', 'toString', '__proto__']) {
  test(`required ${property} needs an own data property`, () => {
    const schema = registerSchema({ type: 'object', required: [property] });
    assert.throws(() => validate(schema, {}, 'input'), { code: 'input_schema_mismatch' });
    assert.doesNotThrow(() => validate(schema, JSON.parse(`{"${property}":1}`), 'input'));
  });
  test(`additionalProperties false rejects undeclared ${property}`, () => {
    const schema = registerSchema({ type: 'object', properties: {}, additionalProperties: false });
    assert.throws(() => validate(schema, JSON.parse(`{"${property}":1}`), 'input'), { code: 'input_schema_mismatch' });
  });
}
test('boolean schemas, false propertyNames and canonical JSON equality are enforced', () => {
  assert.equal(registerSchema(false), false);
  assert.throws(() => validate(false, null, 'input'), { code: 'input_schema_mismatch' });
  assert.doesNotThrow(() => validate(registerSchema(true), null, 'input'));
  assert.throws(() => validate(registerSchema({ propertyNames: false }), { x: 1 }, 'input'), { code: 'input_schema_mismatch' });
  for (const schema of [{ enum: [{ a: 1, b: 2 }] }, { const: { a: 1, b: 2 } }]) {
    assert.doesNotThrow(() => validate(registerSchema(schema), { b: 2, a: 1 }, 'input'));
  }
  assert.throws(() => validate(registerSchema({ uniqueItems: true }), [{ a: 1, b: 2 }, { b: 2, a: 1 }], 'input'), { code: 'input_schema_mismatch' });
});
for (const schema of [
  { items: 42 }, { properties: { x: 42 } }, { additionalProperties: null }, { propertyNames: [] }, { $defs: { x: 'schema' } },
  { anyOf: [] }, { oneOf: [42] }, { format: 42 }, { format: 'unimplemented' }, { description: [] }, { $id: 42 }, { examples: {} },
  { required: ['x', 'x'] }, { type: ['number', 'number'] }, { enum: [{ a: 1, b: 2 }, { b: 2, a: 1 }] },
]) {
  test(`malformed schema is rejected: ${JSON.stringify(schema)}`, () => {
    assert.throws(() => registerSchema(schema), { code: 'invalid_schema' });
  });
}
test('schema annotations and nested JSON consume a bounded size and complexity budget', () => {
  assert.throws(() => registerSchema({ $id: 'retained-attacker-id', default: 'x'.repeat(200 * 1024) }), { code: 'invalid_schema' });
  assert.throws(() => registerSchema({ default: Array.from({ length: 20000 }, () => null) }), { code: 'invalid_schema' });
  let nested = null;
  for (let i = 0; i < 30; i++) nested = { x: nested };
  assert.throws(() => registerSchema({ default: nested }), { code: 'invalid_schema' });
});
test('schema identifiers do not create reference authority', () => {
  registerSchema({ $id: 'transient-schema', type: 'number' });
  registerSchema({ $id: 'transient-schema', type: 'string' });
  assert.throws(() => registerSchema({ $ref: 'transient-schema' }), { code: 'unsupported_schema' });
});
test('fork enforces the global program quota atomically', async () => {
  const ctx = await setup();
  const program = await create(ctx);
  await ctx.repository.transaction(data => {
    for (let i = 0; i < 9999; i++) data.programs[`quota_${i}`] = { id: `quota_${i}` };
  });
  const before = await ctx.repository.read();
  const result = await ctx.service.handle('POST', `/api/programs/${program.id}/fork`, { expected_version: program.version }, { token: ctx.token });
  assert.equal(result.status, 429);
  assert.equal(result.body.error.code, 'program_limit');
  assert.deepEqual(await ctx.repository.read(), before);
});

const tamperCases = [
  ['receipt seed', (data, execution) => { execution.receipt.seed++; }],
  ['execution trace', (data, execution) => { execution.trace.steps = []; }],
  ['immutable build source', (data, execution, program) => { program.builds[0].source = 'input number | math.add 100'; }],
  ['execution build hash', (data, execution) => { execution.build_content_id = 'sha256:invalid'; }],
  ['execution value id', (data, execution) => { execution.value_id = 'sha256:invalid'; }],
  ['captured environment', (data, execution) => { execution.environment.network = true; }],
  ['runtime environment', (data, execution) => { execution.runtime_environment.platform = 'invented'; }],
  ['dependencies', (data, execution) => { execution.dependencies.push('fabricated'); }],
  ['effects', (data, execution) => { execution.effects.push('network'); }],
  ['nondeterminism', (data, execution) => { execution.nondeterminism.push('fabricated'); }],
  ['artifact execution binding', (data, execution) => { const artifact = data.artifacts[execution.artifacts[0]]; artifact.execution_id = 'other'; const { content_id, storage, ...content } = artifact; artifact.content_id = hashOf(content); }],
  ['receipt execution binding with fresh hash', (data, execution) => { execution.receipt.execution_id = 'other'; const { content_id, ...content } = execution.receipt; execution.receipt.content_id = hashOf(content); }],
  ['receipt seed with fresh hash', (data, execution) => { execution.receipt.seed++; const { content_id, ...content } = execution.receipt; execution.receipt.content_id = hashOf(content); }],
  ['input and receipt rewritten coherently', (data, execution) => { execution.seed++; execution.receipt.seed++; const { content_id, ...content } = execution.receipt; execution.receipt.content_id = hashOf(content); }],
];
for (const [name, tamper] of tamperCases) {
  test(`replay rejects tampered ${name} and fails overall verification`, async () => {
    const ctx = await setup();
    const { program, execution } = await complete(ctx);
    await ctx.repository.transaction(data => tamper(data, data.executions[execution.id], data.programs[program.id]));
    const result = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.executions[0].valid, false, JSON.stringify(result.body));
    assert.equal(result.body.valid, false, JSON.stringify(result.body));
    assert.equal(result.body.program_valid, name === 'immutable build source' ? false : true);
  });
}
test('replay compares recomputed trace even when artifact and receipt hashes are rewritten', async () => {
  const ctx = await setup();
  const { program, execution } = await complete(ctx);
  await ctx.repository.transaction(data => {
    const job = data.executions[execution.id];
    const artifact = data.artifacts[job.artifacts[0]];
    job.trace.steps = []; artifact.trace.steps = [];
    const { content_id, storage, ...content } = artifact;
    artifact.content_id = hashOf(content);
    job.receipt.artifact_content_id = artifact.content_id;
    const { content_id: receiptId, ...receipt } = job.receipt;
    job.receipt.content_id = hashOf(receipt);
  });
  const result = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
  assert.equal(result.body.executions[0].valid, false);
  assert.equal(result.body.valid, false);
});
test('authored replay validates receipt integrity without executing the adapter again', async () => {
  let calls = 0;
  const image = `node@sha256:${'a'.repeat(64)}`;
  const ctx = await setup({ verified: true, id: 'isolated-fixture', nodeImage: image, execute: async ({ input }) => { calls++; return { value: input + 1, environment: { image, network: 'none' } }; } });
  const { program, execution } = await complete(ctx, { language: 'javascript', source: 'function main(input) { return input + 1; }', tests: [{ input: 4, expected: 5 }] });
  const before = calls;
  let replay = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
  assert.equal(replay.body.executions[0].valid, true, JSON.stringify(replay.body));
  assert.equal(replay.body.executions[0].verified, 'artifact-integrity-only');
  await ctx.repository.transaction(data => { data.executions[execution.id].receipt.seed++; });
  replay = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
  assert.equal(replay.body.executions[0].valid, false);
  assert.equal(replay.body.valid, false);
  assert.equal(calls, before);
});

test('build rejects aggregate interpreter cost before running the test batch', async () => {
  const ctx = await setup();
  const program = await create(ctx, {
    source: { language: 'purl/1', input: 'number', steps: [{ repeat: { count: 1000, steps: Array.from({ length: 5 }, () => ({ op: 'identity' })) } }] },
    tests: Array.from({ length: 100 }, () => ({ input: 4, expected: 4 })),
  });
  const result = await ctx.service.handle('POST', `/api/programs/${program.id}/build`, { expected_version: program.version }, { token: ctx.token });
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, 'build_budget');
  assert.equal((await ctx.repository.read()).data.programs[program.id].builds.length, 0);
});
test('build rejects oversized aggregate test values before interpreter execution', async () => {
  const ctx = await setup();
  const value = 'x'.repeat(3000);
  const program = await create(ctx, { source: 'input json', input_schema: {}, output_schema: {}, tests: Array.from({ length: 50 }, () => ({ input: value, expected: value })) });
  const result = await ctx.service.handle('POST', `/api/programs/${program.id}/build`, { expected_version: program.version }, { token: ctx.token });
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, 'build_budget');
});
test('replay rejects an oversized verification batch before recomputing executions', async () => {
  const ctx = await setup();
  const { program, execution } = await complete(ctx);
  await ctx.repository.transaction(data => {
    for (let i = 0; i < 101; i++) data.executions[`extra_${i}`] = { ...structuredClone(execution), id: `extra_${i}` };
  });
  const result = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, 'replay_budget');
});

test('authored replay rejects a coherently rehashed runtime image that differs from its build', async () => {
  const image = `node@sha256:${'a'.repeat(64)}`;
  const ctx = await setup({ verified: true, id: 'image-fixture', nodeImage: image, execute: async ({ input }) => ({ value: input + 1, environment: { image, network: 'none' } }) });
  const { program, execution } = await complete(ctx, { language: 'javascript', source: 'function main(input) { return input + 1; }', tests: [{ input: 4, expected: 5 }] });
  await ctx.repository.transaction(data => {
    const job = data.executions[execution.id];
    const artifact = data.artifacts[job.artifacts[0]];
    job.runtime_environment.image = `node@sha256:${'b'.repeat(64)}`;
    artifact.runtime_environment = structuredClone(job.runtime_environment);
    job.runtime_environment_id = artifact.runtime_environment_id = hashOf(job.runtime_environment);
    const { content_id, storage, ...content } = artifact;
    artifact.content_id = hashOf(content);
    job.receipt.artifact_content_id = artifact.content_id;
    job.receipt.runtime_environment_id = job.runtime_environment_id;
    const { content_id: receiptId, ...receipt } = job.receipt;
    job.receipt.content_id = hashOf(receipt);
  });
  const result = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
  assert.equal(result.body.executions[0].valid, false);
  assert.equal(result.body.valid, false);
});
test('completed evidence cannot evade replay by changing execution status', async () => {
  const ctx = await setup();
  const { program, execution } = await complete(ctx);
  await ctx.repository.transaction(data => { data.executions[execution.id].status = 'queued'; });
  const result = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
  assert.equal(result.body.executions[0].valid, false);
  assert.equal(result.body.valid, false);
});

for (const [name, tamper] of [
  ['program identity', (data, id) => { data.executions[id].program_id = 'other-program'; }],
  ['execution map identity', (data, id) => { data.executions[id].id = 'other-execution'; }],
  ['missing execution record', (data, id) => { delete data.executions[id]; }],
]) {
  test(`recorded run cannot disappear from replay through ${name}`, async () => {
    const ctx = await setup();
    const { program, execution } = await complete(ctx);
    await ctx.repository.transaction(data => tamper(data, execution.id));
    const result = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
    assert.equal(result.status, 200);
    assert.equal(result.body.valid, false);
    assert.equal(result.body.executions.length, 1);
    assert.equal(result.body.executions[0].valid, false);
  });
}

test('build budgets repeated literal argument bytes across every test', async () => {
  const ctx = await setup();
  const program = await create(ctx, {
    source: { language: 'purl/1', input: 'string', steps: [{ repeat: { count: 200, steps: [{ op: 'constant', args: { value: 'x'.repeat(50000) } }] } }] },
    input_schema: { type: 'string' }, output_schema: { type: 'string' },
    tests: Array.from({ length: 99 }, () => ({ input: '', expected: '' })),
  });
  const result = await ctx.service.handle('POST', `/api/programs/${program.id}/build`, { expected_version: program.version }, { token: ctx.token });
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, 'build_budget');
  assert.equal((await ctx.repository.read()).data.programs[program.id].builds.length, 0);
});
test('build records unattempted tests as skipped after the first runtime quota failure', async () => {
  const ctx = await setup();
  const program = await create(ctx, { source: 'input string | repeat 21 { json.stringify }', input_schema: { type: 'string' }, output_schema: { type: 'string' }, tests: Array.from({ length: 5 }, () => ({ input: '"', expected: '' })) });
  const result = await ctx.service.handle('POST', `/api/programs/${program.id}/build`, { expected_version: program.version }, { token: ctx.token });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.build.status, 'failed');
  assert.equal(result.body.build.tests.length, 5);
  assert.equal(result.body.build.tests[0].error.code, 'VALUE_QUOTA');
  for (const skipped of result.body.build.tests.slice(1)) {
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.passed, false);
    assert.equal(skipped.error.code, 'prior_runtime_quota');
  }
});
for (const field of ['input', 'value', 'trace']) {
  test(`replay bounds captured ${field} bytes before reexecuting`, async () => {
    const ctx = await setup();
    const { program, execution } = await complete(ctx);
    await ctx.repository.transaction(data => { data.executions[execution.id][field] = 'x'.repeat(8 * 1024 * 1024); });
    const result = await ctx.service.handle('GET', `/api/programs/${program.id}/replay`);
    assert.equal(result.status, 422);
    assert.equal(result.body.error.code, 'replay_budget');
  });
}

test('a zero repeat cannot turn expanded-byte admission into NaN', async () => {
  const ctx = await setup();
  const program = await create(ctx, {
    source: { language: 'purl/1', input: 'string', steps: [
      { repeat: { count: 0, steps: [{ repeat: { count: 1000, steps: [{ op: 'constant', args: { value: 'z'.repeat(10000) } }] } }] } },
      { repeat: { count: 200, steps: [{ op: 'constant', args: { value: 'x'.repeat(50000) } }] } },
    ] },
    input_schema: { type: 'string' }, output_schema: { type: 'string' },
    tests: Array.from({ length: 99 }, () => ({ input: '', expected: '' })),
  });
  const result = await ctx.service.handle('POST', `/api/programs/${program.id}/build`, { expected_version: program.version }, { token: ctx.token });
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, 'build_budget');
});
