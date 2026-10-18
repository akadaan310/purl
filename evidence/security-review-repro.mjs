// Local review probes. Uses isolated MemoryRepository instances only.
// Run: node --expose-gc evidence/security-review-repro.mjs [--slow]
import { PurlService } from '../service/domain.js';
import { MemoryRepository } from '../service/repository.js';
import { registerSchema, validate } from '../service/domain/support.js';

const report = (check, observations) => console.log(JSON.stringify({ check, ...observations }));
async function setup() {
  const repository = new MemoryRepository();
  const service = new PurlService({ repository });
  const session = (await service.handle('POST', '/api/session', { label: 'isolated security review' })).body;
  return { repository, service, post: (path, body) => service.handle('POST', path, body, { token: session.token }) };
}

{
  const { service, post } = await setup();
  let result = await post('/api/programs', {
    title: 'Schema prototype probe', language: 'purl', source: 'input json',
    input_schema: { type: 'object', required: ['constructor'], properties: {}, additionalProperties: false },
  });
  let program = result.body.program;
  result = await post(`/api/programs/${program.id}/build`, { expected_version: program.version });
  program = result.body.program;
  for (const input of [{}, JSON.parse('{"constructor":"untyped property"}')]) {
    result = await post(`/api/programs/${program.id}/run`, { expected_version: program.version, input });
    report('schema-prototype', { input, status: result.status, error: result.body.error?.code });
    if (result.body.program) program = result.body.program;
  }
  for (const candidate of [false, { items: 42 }, { properties: { x: 42 } }, { propertyNames: false }]) {
    try { validate(registerSchema(candidate), { x: 'anything' }, 'input'); report('schema-shape', { candidate, accepted: true }); }
    catch (error) { report('schema-shape', { candidate, accepted: false, error: error.code }); }
  }
}

{
  const { repository, post } = await setup();
  const created = await post('/api/programs', { title: 'Capacity probe', language: 'purl', source: 'input json' });
  const program = created.body.program;
  // Collection-size fixture: no persistent state or live service is modified.
  await repository.transaction(data => { for (let i = Object.keys(data.programs).length; i < 10000; i++) data.programs[`fixture_${i}`] = {}; });
  const create = await post('/api/programs', { title: 'Over capacity', language: 'purl', source: 'input json' });
  const fork = await post(`/api/programs/${program.id}/fork`, { expected_version: program.version });
  report('fork-capacity', { create: create.status, fork: fork.status, programs: Object.keys((await repository.read()).data.programs).length });
}

{
  const { repository, service, post } = await setup();
  let result = await post('/api/programs', { title: 'Replay integrity probe', language: 'purl', source: 'input number | math.add 1', visibility: 'public' });
  let program = result.body.program;
  result = await post(`/api/programs/${program.id}/build`, { expected_version: program.version }); program = result.body.program;
  result = await post(`/api/programs/${program.id}/run`, { expected_version: program.version, input: 3 });
  const executionId = result.body.execution.id;
  await service.workOnce({ workerId: 'isolated-review' });
  for (const [field, mutate] of [
    ['receipt.seed', data => { data.executions[executionId].receipt.seed = 999; }],
    ['trace.steps', data => { data.executions[executionId].trace.steps = []; }],
    ['build.source', data => { data.programs[program.id].builds[0].source = 'input number | math.add 9000'; }],
  ]) {
    await repository.transaction(mutate);
    const replay = await service.handle('GET', `/api/programs/${program.id}/replay`);
    report('replay-tampering', { field, programValid: replay.body.valid, executionValid: replay.body.executions[0].valid });
  }
}

if (global.gc) {
  const { repository, post } = await setup();
  global.gc(); const before = process.memoryUsage().heapUsed;
  let rejected = 0;
  for (let i = 0; i < 80; i++) {
    const result = await post('/api/programs', {
      title: 'Rejected cache probe', language: 'purl', source: 'input json',
      input_schema: { $id: `isolated-cache-${i}`, default: String(i) + 'x'.repeat(200000) },
      output_schema: { type: 'invalid' },
    });
    if (result.status === 400) rejected++;
  }
  global.gc();
  report('failed-create-schema-retention', { rejected, persistedPrograms: Object.keys((await repository.read()).data.programs).length, retainedHeapIncrease: process.memoryUsage().heapUsed - before });
}

if (process.argv.includes('--slow')) {
  const { post } = await setup();
  const created = await post('/api/programs', {
    title: 'Aggregate build work probe', language: 'purl',
    source: 'input number | repeat 1000 { identity | identity | identity | identity | identity }',
    tests: Array.from({ length: 100 }, () => ({ input: 0, expected: 0 })),
  });
  const program = created.body.program;
  let timerFired = false; setTimeout(() => { timerFired = true; }, 0);
  const started = performance.now();
  const result = await post(`/api/programs/${program.id}/build`, { expected_version: program.version });
  report('aggregate-build-work', { status: result.status, buildStatus: result.body.build?.status, tests: result.body.build?.tests.length, elapsedMs: Math.round(performance.now() - started), eventLoopTimerFired: timerFired });
}
