import { compile, execute, operators } from './compiler.js';
import { diff } from '../src/continuity/diff.js';
import { ApiError, PROTOCOL, RIGHTS, activeGrant, applyMove, authenticate, authority, canonicalize, clone, expected, fail, hashOf, initialize, object, principalView, record, registerSchema, replayProgram, requireRight, sha256, snapshot, sources, uid, validate, validateSource } from './domain/support.js';
import { randomBytes } from 'node:crypto';
import { missionState, SEED_IDS, SEED_OWNER, templates } from './domain/seed.js';

const OP_RIGHT = { source: 'edit', compile: 'build', build: 'build', run: 'run', publish: 'publish', fork: 'read', checkpoint: 'checkpoint', propose: 'propose', commit: 'edit', grants: 'grant', revoke: 'grant', move: 'play', join: 'play', mission: 'checkpoint' };
const MUTATION_NAMES = Object.keys(OP_RIGHT);
const RESPONSE_STATUS = { fork: 201, grants: 201, publish: 201, run: 202 };
const now = () => new Date().toISOString();
const response = (status, body, headers) => ({ status, body, ...(headers ? { headers } : {}) });
const pureEnvironment = () => ({ runtime: 'purl-bounded-interpreter', runtime_version: '1', ir_version: 'purl-ir/1', architecture: process.arch, node: process.versions.node, network: false, external_effects: false });
const BUILD_STEPS = 20000;
const BUILD_TEST_BYTES = 256 * 1024;
const REPLAY_COUNT = 100;
const REPLAY_STEPS = 20000;
const SYNC_WORK_BYTES = 8 * 1024 * 1024;
const RUNTIME_QUOTAS = new Set(['STEP_QUOTA', 'WORK_QUOTA', 'TRACE_QUOTA', 'VALUE_QUOTA', 'GRAPH_QUOTA', 'result_too_large']);

// Count stored JSON without expanding oversized strings or traversing an entire
// over-budget tree. Admission itself must remain bounded.
function boundedJsonBytes(value, limit = SYNC_WORK_BYTES) {
  let bytes = 0, nodes = 0;
  function visit(value, depth = 0) {
    if (++nodes > 100000 || depth > 64 || bytes > limit) return false;
    if (value === undefined) return true;
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'string' && Buffer.byteLength(value) > limit - bytes) return false;
      const encoded = JSON.stringify(value);
      if (encoded === undefined) return false;
      bytes += Buffer.byteLength(encoded);
    } else {
      bytes += 2;
      if (Array.isArray(value)) {
        bytes += Math.max(0, value.length - 1);
        for (const child of value) if (!visit(child, depth + 1)) return false;
      } else {
        const keys = Object.keys(value).filter(key => value[key] !== undefined);
        bytes += Math.max(0, keys.length - 1);
        for (const key of keys) {
          if (!visit(key, depth + 1)) return false;
          bytes++;
          if (!visit(value[key], depth + 1)) return false;
        }
      }
    }
    return bytes <= limit;
  }
  return visit(value) ? bytes : Infinity;
}

// A compact repeat can copy a large literal thousands of times into runtime
// values and trace records. Count expanded arguments without expanding the AST.
function expandedArgumentBytes(plan) {
  function sum(steps, depth = 0) {
    if (!Array.isArray(steps) || depth > 24) return Infinity;
    let bytes = 0;
    for (const step of steps) {
      if (step.repeat) {
        if (!Number.isSafeInteger(step.repeat.count) || step.repeat.count < 0 || step.repeat.count > 1000) return Infinity;
        if (step.repeat.count === 0) continue;
        bytes += step.repeat.count * sum(step.repeat.steps, depth + 1);
      } else if (step.branch) {
        bytes += sum(step.branch.when, depth + 1) + Math.max(sum(step.branch.then, depth + 1), sum(step.branch.else, depth + 1));
      } else bytes += boundedJsonBytes(step.args ?? {});
      if (!Number.isFinite(bytes) || bytes > SYNC_WORK_BYTES) return Infinity;
    }
    return bytes;
  }
  return sum(plan?.steps ?? []);
}

const buildFor = (program) => program.builds.find((build) => build.id === program.active_build && build.source_revision === program.source_revision);

export class PurlService {
  constructor({ repository, baseUrl = '', sandboxAdapter = null, verifyHuman = null } = {}) {
    if (!repository?.read || !repository?.transaction) throw new TypeError('PurlService requires a transactional repository');
    this.repository = repository;
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.sandboxAdapter = sandboxAdapter;
    this.verifyHuman = verifyHuman;
  }

  url(path) { return `${this.baseUrl}${path}`; }

  authoredEnvironment(language) {
    const manifest = typeof this.sandboxAdapter?.manifest === 'function' ? this.sandboxAdapter.manifest() : {};
    return { runtime: 'authored-code', adapter_id: this.sandboxAdapter?.id ?? null, isolated: this.sandboxAdapter?.verified === true, ...clone(manifest), image: language !== 'python' ? this.sandboxAdapter?.nodeImage ?? manifest?.image ?? null : this.sandboxAdapter?.pythonImage ?? manifest?.image ?? null };
  }

  programView(program, principal = null) {
    const out = snapshot(program);
    out.url = this.url(`/p/${program.id}`);
    out.manifest_url = this.url(`/api/programs/${program.id}/manifest`);
    out.history_url = this.url(`/api/programs/${program.id}/history`);
    out.continuity_url = this.url(`/api/programs/${program.id}/continuity`);
    out.replay_url = this.url(`/api/programs/${program.id}/replay`);
    out.grants = Object.values(program.grants ?? {}).map((grant) => ({ ...clone(grant), active: activeGrant(program, grant) }));
    out.authority = { authenticated: Boolean(principal), principal_id: principal?.id ?? null, owner: principal?.id === program.owner, rights: [...new Set(sources(program, principal).flatMap((source) => source.rights))] };
    out.execution_policy = program.language === 'purl' ? { kind: 'bounded-pure', available: true } : { kind: 'isolated-authored-code', available: this.sandboxAdapter?.verified === true, reason: this.sandboxAdapter?.verified === true ? null : 'A verified isolated sandbox adapter is not configured' };
    return out;
  }

  metadata(data) {
    return { protocol: PROTOCOL, name: 'PURL', meaning: 'Programmable URLs', status: 'LIVE', persistence: this.repository.mode ?? this.repository.constructor.name, capabilities: { pure_computation: true, durable_jobs: true, authenticated_principals: true, verified_human_accounts: typeof this.verifyHuman === 'function', claimed_ai_identity: 'self-declared', arbitrary_code_execution: this.sandboxAdapter?.verified === true, sandbox_adapter: this.sandboxAdapter?.verified === true ? this.sandboxAdapter.id : null, immutable_builds: true, replay: true, mission_graph: true }, endpoints: { session: this.url('/api/session'), human_auth_session: this.url('/api/auth/session'), programs: this.url('/api/programs'), templates: this.url('/api/templates'), operators: this.url('/api/operators'), sdk: this.url('/sdk/client.js'), docs: this.url('/docs'), continuity_reference: this.url('/.well-known/purl-reference') }, mission: data.programs[SEED_IDS.mission] ? { id: SEED_IDS.mission, url: this.url(`/p/${SEED_IDS.mission}`), manifest: this.url(`/api/programs/${SEED_IDS.mission}/manifest`) } : null, examples: Object.entries(SEED_IDS).filter(([, id]) => data.programs[id]).map(([kind, id]) => ({ id, kind, url: this.url(`/p/${id}`), manifest: this.url(`/api/programs/${id}/manifest`) })), authentication: { scheme: 'Bearer', endpoint: this.url('/api/session'), disclaimer: 'Guest and claimed AI identities are self-declared. A label is not proof of identity and grants no authority.' } };
  }

  manifest(program, principal) {
    const href = `/api/programs/${program.id}`;
    const operations = [
      ...['inspect', 'history', 'continuity', 'replay', 'diff'].map((name) => ({ name, method: 'GET', href: this.url(name === 'inspect' ? href : `${href}/${name}`), available: true, requires: ['read'], effects: [], input_schema: {} })),
      ...MUTATION_NAMES.filter((name) => !['move', 'join'].includes(name) || program.kind === 'game').filter((name) => name !== 'mission' || program.kind === 'mission').map((name) => {
        const available = Boolean(principal && (name === 'join' && program.kind === 'game' && program.visibility !== 'private' || name === 'move' && Object.values(program.state.players ?? {}).includes(principal.id) || authority(program, principal, OP_RIGHT[name]))) && (name !== 'commit' || program.owner === principal.id);
        const properties = { expected_version: { type: 'integer', const: program.version } };
        const extra = name === 'source' ? { source: {} } : name === 'run' ? { input: clone(program.input_schema), seed: { type: 'integer' } } : name === 'checkpoint' ? { summary: { type: 'string' }, next: {}, evidence: {} } : name === 'propose' ? { source: {}, summary: { type: 'string' } } : name === 'commit' ? { proposal_id: { type: 'string' } } : name === 'grants' ? { principal_id: { type: 'string' }, rights: { type: 'array', items: { enum: RIGHTS } } } : name === 'move' ? { cell: { type: 'integer', minimum: 0, maximum: 8 } } : name === 'revoke' ? { grant_id: { type: 'string' } } : {};
        return { name, method: 'POST', href: this.url(`${href}/${name}`), available, requires: ['authenticated', OP_RIGHT[name]], effects: ['local-state', ...(name === 'run' ? ['enqueue-job'] : [])], input_schema: { type: 'object', properties: { ...properties, ...extra }, required: ['expected_version', ...(name === 'run' ? ['input'] : [])] }, prepare: { href: this.url(`/p/${program.id}?prepare=${name}`), mode: 'human-mediated', description: 'Read-only clients can prepare this operation in the browser; mutations require a bearer session.' } };
      }),
    ];
    const links = { self: this.url(`/p/${program.id}`), source: this.url(href), history: this.url(`${href}/history`), continuity: this.url(`${href}/continuity`), replay: this.url(`${href}/replay`), sdk: this.url('/sdk/client.js'), operators: this.url('/api/operators'), ...(program.kind === 'mission' ? { mission: this.url(`${href}/mission`) } : {}) };
    return { protocol: PROTOCOL, program: { id: program.id, title: program.title, kind: program.kind, version: program.version, url: links.self, language: program.language, input_schema: clone(program.input_schema), output_schema: clone(program.output_schema) }, operations, links, authority: this.programView(program, principal).authority, continuation: { checkpoint: clone(program.checkpoints.at(-1) ?? null), expected_version: program.version, inspect: links.source, permitted: operations.filter((operation) => operation.available).map((operation) => operation.name), steps: ['GET this manifest and continuity', 'Read current state, source, dependencies and evidence', 'Authenticate only when authorized to mutate', 'Use expected_version and a payload-bound Idempotency-Key', 'Write a checkpoint with evidence and next operations'] } };
  }

  async handle(method, path, body = {}, context = {}) {
    try {
      method = String(method).toUpperCase();
      const url = new URL(path, 'http://purl.internal');
      if (url.searchParams.has('token') || url.searchParams.has('access_token')) fail(400, 'token_in_url', 'Bearer tokens must be sent in the Authorization header');
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (method === 'GET') return await this.read(url, segments, context);
      if (method !== 'POST') fail(405, 'method_not_allowed', 'Use GET for inspection or POST for an explicit mutation');
      body ??= {};
      if (!object(body)) fail(400, 'invalid_body', 'Request body must be a JSON object');
      try { canonicalize(body); } catch { fail(400, 'invalid_body', 'Request body must contain finite JSON values'); }
      if (Buffer.byteLength(canonicalize(body)) > 512 * 1024) fail(413, 'body_too_large', 'Request body exceeds 512 KiB');
      if (segments.join('/') === 'api/session') return await this.createSession(body);
      if (segments.join('/') === 'api/auth/session') return await this.createHumanSession(body, context);
      if (segments.join('/') === 'api/programs') return await this.create(body, context);
      if (segments[0] === 'api' && segments[1] === 'programs' && segments.length === 4) return await this.mutate(segments[2], segments[3], body, context);
      fail(404, 'not_found', 'Unknown API endpoint');
    } catch (error) {
      if (error instanceof ApiError) return response(error.status, { error: { code: error.code, message: error.message, ...error.details } });
      if (error instanceof URIError || error instanceof TypeError && /URL/.test(error.message)) return response(400, { error: { code: 'invalid_url', message: 'URL is malformed' } });
      // Storage failures are explicit and do not leak connector credentials.
      return response(500, { error: { code: 'internal_error', message: 'The operation could not be completed', ...(process.env.NODE_ENV === 'test' ? { detail: error.message } : {}) } });
    }
  }

  async read(url, segments, context) {
    const { data: document } = await this.repository.read();
    const data = initialize(document);
    const principal = authenticate(data, context.token);
    const route = segments.join('/');
    if (route === '.well-known/purl') return response(200, this.metadata(data));
    if (route === 'api/session') {
      if (!principal) fail(401, 'authentication_required', 'A bearer session is required');
      return response(200, { principal: principalView(principal), disclaimer: 'Identity is self-declared; resource authority comes from ownership and effective grants.' });
    }
    if (route === 'api/templates') return response(200, { items: templates() });
    if (route === 'api/operators') return response(200, { items: operators(), provenance: 'trusted built-in typed registry', execution_class: 'bounded-pure' });
    if (route === 'api/programs') {
      const items = Object.values(data.programs).filter((program) => program.visibility === 'public' || program.owner === principal?.id || sources(program, principal).some((source) => source.via === 'grant' && source.rights.includes('read') && program.grants[source.grant]?.principal_id !== '*')).filter((program) => authority(program, principal, 'read')).map((program) => this.programView(program, principal));
      return response(200, { items });
    }
    if (segments[0] !== 'api') fail(404, 'not_found', 'Unknown API endpoint');
    if (['executions', 'artifacts', 'releases'].includes(segments[1]) && segments.length === 3) {
      const kind = segments[1];
      const item = data[kind]?.[segments[2]];
      if (!item) fail(404, 'not_found', 'Resource not found');
      const program = data.programs[item.program_id];
      if (!program) fail(404, 'not_found', 'Program not found');
      requireRight(program, principal, 'read', { hide: true });
      if (kind === 'releases') return response(200, { release: clone(item), program: this.programView(item.program_snapshot ?? program, principal) });
      return response(200, { [kind === 'executions' ? 'execution' : 'artifact']: clone(item) });
    }
    if (segments[1] !== 'programs' || segments.length < 3 || segments.length > 5) fail(404, 'not_found', 'Unknown API endpoint');
    const program = data.programs[segments[2]];
    if (!program) fail(404, 'not_found', 'Program not found');
    requireRight(program, principal, 'read', { hide: true });
    const operation = segments[3];
    if (!operation) return response(200, { program: this.programView(program, principal) });
    if (operation === 'manifest') return response(200, this.manifest(program, principal));
    if (operation === 'history') return response(200, { program_id: program.id, version: program.version, events: program.history.map(({ state, ...event }) => clone(event)) });
    if (operation === 'continuity') {
      const manifest = this.manifest(program, principal);
      const checkpoint = program.checkpoints.at(-1) ?? null;
      return response(200, { protocol: PROTOCOL, program_id: program.id, version: program.version, checkpoint: clone(checkpoint), state: clone(program.state), changes_since_checkpoint: program.history.filter((event) => event.version > (checkpoint?.version ?? 0)).map(({ state, ...event }) => clone(event)), next_operations: manifest.operations.filter((operation) => operation.available), authority: manifest.authority, links: manifest.links, dependencies: clone(program.dependencies), continuation: manifest.continuation });
    }
    if (operation === 'replay') {
      const executionIds = new Set([
        ...Object.entries(data.executions).filter(([, execution]) => execution.program_id === program.id).map(([id]) => id),
        ...program.history.filter(event => event.operation === 'run').map(event => event.payload.execution_id),
      ]);
      const jobs = [...executionIds].map(id => ({ id, execution: data.executions[id] }));
      const budgetError = () => fail(422, 'replay_budget', 'Replay verification exceeds the synchronous batch limit', { max_executions: REPLAY_COUNT, max_steps: REPLAY_STEPS, max_work_bytes: SYNC_WORK_BYTES });
      if (jobs.length > REPLAY_COUNT) budgetError();
      let steps = 0, workBytes = 0;
      const buildWork = new Map();
      for (const { execution } of jobs) {
        if (execution?.status !== 'succeeded') continue;
        const build = program.builds.find(build => build.id === execution.build_id);
        const cost = Math.max(1, build?.plan?.cost ?? 1);
        steps += cost;
        if (steps > REPLAY_STEPS) budgetError();
        if (!buildWork.has(build)) buildWork.set(build, boundedJsonBytes(build?.plan) + expandedArgumentBytes(build?.plan));
        workBytes += buildWork.get(build);
        // Input/output sizes account for value propagation; both captured trace
        // copies are subsequently hashed and compared by verification.
        workBytes += cost * (boundedJsonBytes(execution.input) + boundedJsonBytes(execution.value));
        const artifact = data.artifacts[execution.artifacts?.[0]];
        workBytes += boundedJsonBytes(execution.trace) + boundedJsonBytes(artifact?.trace) + boundedJsonBytes(artifact?.value);
        if (workBytes > SYNC_WORK_BYTES) budgetError();
      }
      const replay = replayProgram(program);
      const executions = jobs.map(({ id, execution }) => execution && execution.id === id && execution.program_id === program.id
        ? this.verifyExecution(data, execution)
        : { execution_id: id, valid: false, problem: 'Recorded execution is missing or has a different identity' });
      return response(200, { ...replay, program_valid: replay.valid, valid: replay.valid && executions.every(execution => execution.valid !== false), executions, assurance: 'Content hashes establish internal consistency, not external authenticity' });
    }
    if (operation === 'diff') {
      const from = Number(url.searchParams.get('from') ?? Math.max(1, program.version - 1));
      const to = Number(url.searchParams.get('to') ?? program.version);
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || !program.versions[from] || !program.versions[to]) fail(400, 'invalid_version', 'from and to must name existing program versions');
      return response(200, { program_id: program.id, from, to, changes: diff(program.versions[from], program.versions[to]) });
    }
    if (operation === 'mission' && program.kind === 'mission') {
      if (!segments[4]) return response(200, { program_id: program.id, directive: program.state.directive, amendment: program.state.amendment, graph: clone(program.state.graph), links: this.manifest(program, principal).links });
      const node = program.state.graph.nodes.find((node) => node.id === segments[4]);
      if (!node) fail(404, 'not_found', 'Mission node not found');
      return response(200, { program_id: program.id, node: clone(node), dependencies: node.dependencies.map((id) => clone(program.state.graph.nodes.find((n) => n.id === id))), operations: this.manifest(program, principal).operations.filter((operation) => ['checkpoint', 'propose', 'fork'].includes(operation.name)) });
    }
    fail(404, 'not_found', 'Unknown program inspection');
  }

  async createSession(body) {
    const kind = body.kind ?? 'guest';
    if (!['guest', 'human', 'agent', 'service'].includes(kind)) fail(400, 'invalid_kind', 'kind must be guest, human, agent or service');
    if (typeof (body.label ?? '') !== 'string' || (body.label ?? '').length > 120) fail(400, 'invalid_label', 'label must be at most 120 characters');
    const token = `purl_${randomBytes(32).toString('base64url')}`;
    const principal = { id: uid('principal'), label: body.label || 'Guest', kind, identity_verified: false, identity_claim: kind === 'agent' ? 'self-declared AI identity' : 'self-declared guest identity', created_at: now() };
    await this.repository.transaction((document) => { const data = initialize(document); if (Object.keys(data.principals).length >= 10000) fail(429, 'principal_limit', 'Session capacity reached'); data.principals[principal.id] = { ...principal, token_hash: sha256(token) }; });
    return response(201, { principal, token, disclaimer: 'This is a self-declared identity, not a verified account. Keep the bearer token private.' });
  }

  async createHumanSession(body, context) {
    if (typeof this.verifyHuman !== 'function') fail(503, 'human_auth_unavailable', 'Verified human account authentication is not configured');
    const accessToken = context.token ?? body.access_token;
    if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 16384) fail(401, 'authentication_required', 'Provide an identity-provider bearer token');
    let user;
    try { user = await this.verifyHuman(accessToken); } catch { fail(401, 'identity_verification_failed', 'The identity provider did not verify this session'); }
    if (!user || typeof user.id !== 'string' || !user.id || typeof user.issuer !== 'string' || !user.issuer) fail(401, 'identity_verification_failed', 'The identity provider did not verify a stable subject');
    const id = `principal_human_${sha256(canonicalize([user.issuer, user.id])).slice(0, 32)}`;
    const token = `purl_${randomBytes(32).toString('base64url')}`;
    const principal = await this.repository.transaction((document) => {
      const data = initialize(document);
      if (!data.principals[id] && Object.keys(data.principals).length >= 10000) fail(429, 'principal_limit', 'Session capacity reached');
      data.principals[id] ??= { id, label: String(user.label ?? 'Member').slice(0, 120), kind: 'human', identity_verified: true, identity_claim: 'Identity-provider session verified server-side', identity_issuer: user.issuer, created_at: now(), token_hashes: [] };
      const existing = data.principals[id];
      if (existing.revoked_at) fail(403, 'principal_revoked', 'This principal is revoked');
      existing.token_hashes = [...(existing.token_hashes ?? []).slice(-49), sha256(token)];
      return principalView(existing);
    });
    return response(201, { principal, token, disclaimer: 'Identity-provider verification establishes this principal only; resource authority still requires ownership or effective grants.' });
  }

  newProgram(body, principal, id = uid('program')) {
    const language = body.language ?? 'purl';
    if (!['purl', 'javascript', 'typescript', 'python'].includes(language)) fail(400, 'unsupported_language', 'Supported languages are purl, javascript, typescript and python');
    const kind = body.kind ?? 'program';
    if (!['program', 'mission', 'game'].includes(kind)) fail(400, 'invalid_kind', 'kind must be program, mission or game');
    const visibility = body.visibility ?? 'private';
    if (!['public', 'private', 'unlisted'].includes(visibility)) fail(400, 'invalid_visibility', 'visibility must be public, private or unlisted');
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 180) fail(400, 'invalid_title', 'title must contain 1 through 180 characters');
    const tests = body.tests ?? [];
    if (!Array.isArray(tests) || tests.length > 100 || tests.some((test) => !object(test) || !Object.hasOwn(test, 'input') || !Object.hasOwn(test, 'expected'))) fail(400, 'invalid_tests', 'tests must contain at most 100 {input,expected} objects');
    const input_schema = registerSchema(body.input_schema ?? {});
    const output_schema = registerSchema(body.output_schema ?? {});
    for (const test of tests) { validate(input_schema, test.input, 'test_input'); validate(output_schema, test.expected, 'test_output'); }
    const at = now();
    return { id, title: body.title.trim(), kind, language, source: validateSource({ ...body, language }), source_revision: 1, version: 0, visibility, owner: principal.id, created_at: at, updated_at: at, input_schema, output_schema, tests: clone(tests), builds: [], active_build: null, compilation: null, state: kind === 'game' ? { board: Array(9).fill(null), players: { X: principal.id, O: null }, turn: 'X', winner: null, draw: false, moves: [] } : {}, grants: {}, checkpoints: [], proposals: [], releases: [], dependencies: [], lineage: null, history: [], versions: {} };
  }

  idempotency(data, principal, route, body, key) {
    if (!key) return null;
    if (typeof key !== 'string' || key.length > 200 || !key.trim()) fail(400, 'invalid_idempotency_key', 'Idempotency-Key must contain 1 through 200 characters');
    const id = hashOf([principal.id, route, key]);
    const fingerprint = hashOf(body);
    const prior = data.idempotency[id];
    if (prior && prior.fingerprint !== fingerprint) fail(409, 'idempotency_conflict', 'Idempotency-Key was already used with a different request payload');
    return { id, fingerprint, prior };
  }

  async create(body, context) {
    return this.repository.transaction((document) => {
      const data = initialize(document);
      const principal = authenticate(data, context.token, true);
      const idem = this.idempotency(data, principal, '/api/programs', body, context.idempotencyKey);
      if (idem?.prior) return clone(idem.prior.response);
      if (Object.keys(data.programs).length >= 10000) fail(429, 'program_limit', 'Program capacity reached');
      const program = this.newProgram(body, principal);
      data.programs[program.id] = program;
      record(data, program, 'create', principal, { via: 'creator', rights: RIGHTS }, { source_revision: 1, content_id: hashOf(program.source) }, now());
      const result = response(201, { program: this.programView(program, principal) }, { Location: this.url(`/api/programs/${program.id}`) });
      if (idem) data.idempotency[idem.id] = { fingerprint: idem.fingerprint, response: clone(result), created_at: now() };
      return result;
    });
  }

  mutationAuthority(program, principal, operation) {
    if (operation === 'commit' && program.owner !== principal.id) fail(403, 'owner_required', 'Only the program owner may commit a proposal');
    if (operation === 'join' && program.kind === 'game' && program.visibility !== 'private') return { via: 'public-game-join', rights: ['play'] };
    if (operation === 'move' && program.kind === 'game' && Object.values(program.state.players).includes(principal.id)) return { via: 'game-player', rights: ['play'] };
    return requireRight(program, principal, OP_RIGHT[operation]);
  }

  async prepareBuild(id, body, context) {
    const { data } = await this.repository.read();
    initialize(data);
    const principal = authenticate(data, context.token, true);
    const program = data.programs[id];
    if (!program) fail(404, 'not_found', 'Program not found');
    this.mutationAuthority(program, principal, 'build');
    const idem = this.idempotency(data, principal, `/api/programs/${id}/build`, body, context.idempotencyKey);
    if (idem?.prior) return { replay: clone(idem.prior.response) };
    expected(program, body);
    const compiled = program.language === 'purl' ? compile(program.source) : { ok: true, diagnostics: [], plan: { ir: 'purl-authored/1', language: program.language, content_id: hashOf(program.source) }, derivation_id: hashOf([program.language, program.source]) };
    const testBytes = Buffer.byteLength(canonicalize(program.tests));
    let testWorkBytes = 0;
    if (program.language === 'purl' && compiled.ok && program.tests.length) {
      const cost = Math.max(1, compiled.plan.cost);
      testWorkBytes = (boundedJsonBytes(compiled.plan) + expandedArgumentBytes(compiled.plan)) * program.tests.length;
      for (const test of program.tests) testWorkBytes += cost * (boundedJsonBytes(test.input) + boundedJsonBytes(test.expected));
    }
    if (testBytes > BUILD_TEST_BYTES || testWorkBytes > SYNC_WORK_BYTES || program.language === 'purl' && compiled.ok && Math.max(1, compiled.plan.cost) * program.tests.length > BUILD_STEPS) fail(422, 'build_budget', 'Build tests exceed the synchronous aggregate budget', { max_steps: BUILD_STEPS, max_test_bytes: BUILD_TEST_BYTES, max_work_bytes: SYNC_WORK_BYTES });
    const build = { id: uid('build'), program_id: program.id, source_revision: program.source_revision, source_content_id: hashOf(program.source), source: clone(program.source), language: program.language, plan: clone(compiled.plan ?? null), derivation_id: compiled.derivation_id ?? null, diagnostics: clone(compiled.diagnostics ?? []), status: compiled.ok ? 'passed' : 'failed', tests: [], input_schema: clone(program.input_schema), output_schema: clone(program.output_schema), environment: { ...pureEnvironment(), ...(program.language === 'purl' ? {} : this.authoredEnvironment(program.language)) }, created_at: now(), created_by: principal.id, immutable: true };
    if (program.language !== 'purl' && this.sandboxAdapter?.verified !== true) {
      build.status = 'blocked';
      build.diagnostics.push({ code: 'sandbox_unavailable', message: 'Source is retained; tests and execution require a verified isolated adapter' });
    }
    if (build.status === 'passed') {
      if (!program.tests.length && program.language !== 'purl') { build.status = 'failed'; build.diagnostics.push({ code: 'tests_required', message: 'Authored performers require at least one schema-checked test before publication' }); }
      for (let i = 0; i < program.tests.length; i++) {
        const spec = program.tests[i];
        try {
          validate(program.input_schema, spec.input, 'input');
          const result = program.language === 'purl' ? execute(compiled.plan, spec.input, { seed: 0 }) : await this.sandboxAdapter.execute({ language: program.language, source: program.source, input: clone(spec.input), seed: 0, environment: clone(build.environment) });
          validate(program.output_schema, result.value, 'output');
          const passed = canonicalize(result.value) === canonicalize(spec.expected);
          if (build.environment.image && result.environment?.image !== build.environment.image) fail(422, 'environment_mismatch', 'Build test did not run in the captured sandbox image');
          build.tests.push({ index: i, passed, input: clone(spec.input), expected: clone(spec.expected), actual: clone(result.value), ...(result.environment ? { environment: clone(result.environment), environment_id: hashOf(result.environment) } : {}) });
          if (!passed) build.status = 'failed';
        } catch (error) {
          build.tests.push({ index: i, passed: false, error: { code: error.code ?? 'test_execution_failed', message: error.message } });
          build.status = 'failed';
          if (RUNTIME_QUOTAS.has(error.code)) {
            for (let skipped = i + 1; skipped < program.tests.length; skipped++) build.tests.push({ index: skipped, passed: false, skipped: true, error: { code: 'prior_runtime_quota', message: `Skipped after test ${i} exceeded a runtime quota` } });
            break;
          }
        }
      }
    }
    build.tests_passed = build.status === 'passed' && build.tests.every((test) => test.passed);
    build.environment.environment_id = hashOf(build.environment);
    build.build_id = hashOf({ source: build.source, plan: build.plan, schemas: [build.input_schema, build.output_schema], tests: program.tests, environment: build.environment });
    build.content_id = hashOf(build);
    return { build };
  }

  async mutate(id, operation, body, context) {
    if (!MUTATION_NAMES.includes(operation)) fail(404, 'not_found', 'Unknown program operation');
    // Tests requiring an isolated process run outside the repository's CAS
    // transaction. The commit reauthenticates and compares the same version.
    const prepared = operation === 'build' ? await this.prepareBuild(id, body, context) : null;
    if (prepared?.replay) return prepared.replay;
    return this.repository.transaction((document) => {
      const data = initialize(document);
      const principal = authenticate(data, context.token, true);
      const program = data.programs[id];
      if (!program) fail(404, 'not_found', 'Program not found');
      const auth = this.mutationAuthority(program, principal, operation);
      const idem = this.idempotency(data, principal, `/api/programs/${id}/${operation}`, body, context.idempotencyKey);
      if (idem?.prior) return clone(idem.prior.response);
      expected(program, body);
      if (program.history.length >= 5000) fail(429, 'history_limit', 'Program history capacity reached; fork to continue');
      const at = now();
      let resultBody = {};
      let eventPayload = clone(body);
      if (operation === 'source') {
        program.source = validateSource({ ...body, language: program.language });
        program.source_revision++;
        program.active_build = null;
        program.compilation = null;
      } else if (operation === 'compile') {
        program.compilation = program.language === 'purl' ? clone(compile(program.source)) : { ok: true, diagnostics: [{ code: 'sandbox_required', severity: 'info', message: 'Authored source is retained; executable validation requires an isolated build' }], plan: null, derivation_id: hashOf([program.language, program.source]) };
        resultBody = { ...clone(program.compilation), compilation: clone(program.compilation) };
      } else if (operation === 'build') {
        const build = prepared.build;
        if (build.source_revision !== program.source_revision || build.source_content_id !== hashOf(program.source)) fail(409, 'version_conflict', 'Source changed while building');
        program.builds.push(build);
        program.active_build = build.status === 'passed' ? build.id : null;
        resultBody.build = clone(build);
        eventPayload = { build_id: build.id, status: build.status, tests_passed: build.tests_passed };
      } else if (operation === 'run') {
        const build = buildFor(program);
        if (program.language !== 'purl' && this.sandboxAdapter?.verified !== true) fail(422, 'sandbox_unavailable', 'Authored code execution requires a verified isolated adapter');
        if (!build || build.status !== 'passed') fail(422, 'build_required', 'Build this source successfully before running');
        if (!Object.hasOwn(body, 'input')) fail(400, 'input_required', 'run requires input, including null for no input');
        validate(build.input_schema, body.input, 'input');
        if (body.seed !== undefined && !Number.isSafeInteger(body.seed)) fail(400, 'invalid_seed', 'seed must be a safe integer');
        const environment = clone(build.environment);
        const execution = { id: uid('execution'), program_id: program.id, program_version: program.version, source_revision: program.source_revision, build_id: build.id, build_content_id: build.content_id, requested_by: principal.id, authorization: clone(auth), input: clone(body.input), input_id: hashOf(body.input), seed: body.seed ?? 0, environment, environment_id: environment.environment_id, status: 'queued', created_at: at, started_at: null, completed_at: null, attempts: 0, lease: null, logs: [{ at, level: 'info', message: 'Execution durably queued' }], artifacts: [], dependencies: clone(program.dependencies), effects: [], nondeterminism: [], value: null, error: null, receipt: null };
        data.executions[execution.id] = execution;
        resultBody.execution = clone(execution);
        eventPayload = { execution_id: execution.id, build_id: build.id, input_id: execution.input_id, seed: execution.seed };
      } else if (operation === 'publish') {
        const build = buildFor(program);
        if (!build || build.status !== 'passed' || !build.tests_passed) fail(422, 'passing_build_required', 'Publish requires a passing build and all declared tests');
        const release = { id: uid('release'), program_id: program.id, program_version: program.version + 1, source_revision: program.source_revision, build_id: build.id, build_content_id: build.content_id, source_content_id: hashOf(program.source), created_at: at, created_by: principal.id, immutable: true };
        release.url = this.url(`/api/releases/${release.id}`);
        program.releases.push(release.id);
        data.releases[release.id] = release;
        resultBody.release = clone(release);
        eventPayload = { release_id: release.id, build_id: build.id };
      } else if (operation === 'fork') {
        if (Object.keys(data.programs).length >= 10000) fail(429, 'program_limit', 'Program capacity reached');
        const fork = this.newProgram({ title: body.title ?? `${program.title} · fork`, kind: program.kind, language: program.language, source: program.source, visibility: body.visibility ?? 'private', input_schema: program.input_schema, output_schema: program.output_schema, tests: program.tests }, principal);
        fork.lineage = { program_id: program.id, version: program.version, source_content_id: hashOf(program.source), url: this.url(`/p/${program.id}`) };
        fork.dependencies = clone(program.dependencies);
        if (program.kind === 'mission') { fork.state = clone(program.state); for (const node of fork.state.graph.nodes ?? []) node.href = this.url(`/api/programs/${fork.id}/mission/${node.id}`); }
        data.programs[fork.id] = fork;
        record(data, fork, 'fork', principal, auth, { parent: clone(fork.lineage) }, at);
        const result = response(201, { program: this.programView(fork, principal) });
        if (idem) data.idempotency[idem.id] = { fingerprint: idem.fingerprint, response: clone(result), created_at: at };
        return result;
      } else if (operation === 'checkpoint') {
        if (typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 10000) fail(400, 'invalid_summary', 'checkpoint summary must contain 1 through 10000 characters');
        const checkpoint = { id: uid('checkpoint'), program_id: id, version: program.version + 1, prepared_at_version: program.version, summary: body.summary, next: clone(body.next ?? []), evidence: clone(body.evidence ?? []), state_hash: hashOf(snapshot(program)), actor: principal.id, created_at: at, evidence_verified: false, provenance: 'author assertions; state hash verified by service' };
        program.checkpoints.push(checkpoint);
        resultBody.checkpoint = clone(checkpoint);
      } else if (operation === 'propose') {
        if (typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 10000) fail(400, 'invalid_summary', 'proposal summary must contain 1 through 10000 characters');
        const proposal = { id: uid('proposal'), program_id: id, base_version: program.version, proposed_at_version: program.version + 1, source_revision: program.source_revision, summary: body.summary, source: body.source === undefined ? null : validateSource({ ...body, language: program.language }), proposed_by: principal.id, created_at: at, status: 'pending' };
        program.proposals.push(proposal); resultBody.proposal = clone(proposal);
      } else if (operation === 'commit') {
        const proposal = program.proposals.find((proposal) => proposal.id === body.proposal_id);
        if (!proposal) fail(404, 'not_found', 'Proposal not found');
        if (proposal.status !== 'pending') fail(409, 'proposal_closed', 'Proposal is already committed');
        if (proposal.source_revision !== program.source_revision) fail(409, 'proposal_conflict', 'Source changed since this proposal was prepared; submit a new proposal');
        if (proposal.source !== null) { program.source = clone(proposal.source); program.source_revision++; program.active_build = null; program.compilation = null; }
        proposal.status = 'committed'; proposal.committed_by = principal.id; proposal.committed_at = at;
        resultBody.proposal = clone(proposal);
      } else if (operation === 'grants') {
        if (body.principal_id !== '*' && !data.principals[body.principal_id]) fail(400, 'unknown_principal', 'principal_id must identify an existing principal');
        if (!Array.isArray(body.rights) || !body.rights.length || body.rights.some((right) => !RIGHTS.includes(right)) || new Set(body.rights).size !== body.rights.length) fail(400, 'invalid_rights', `rights must be a nonempty unique subset of ${RIGHTS.join(', ')}`);
        if (!body.rights.every((right) => auth.rights.includes(right))) fail(403, 'grant_escalation', 'A grant may only delegate rights from its authorizing source');
        if (body.principal_id === '*' && body.rights.some((right) => !['read', 'run', 'play', 'propose'].includes(right))) fail(403, 'public_grant_limit', 'Public grants may only confer read, run, play or propose');
        if (body.expires_at && (!Number.isFinite(Date.parse(body.expires_at)) || Date.parse(body.expires_at) <= Date.now())) fail(400, 'invalid_expiry', 'Grant expiry must be a future date');
        const grant = { id: uid('grant'), principal_id: body.principal_id, rights: [...body.rights], parent: auth.grant, granted_by: principal.id, created_at: at, expires_at: body.expires_at ?? null, revoked_at: null };
        program.grants[grant.id] = grant; resultBody.grant = clone(grant);
      } else if (operation === 'revoke') {
        const grant = program.grants[body.grant_id];
        if (!grant) fail(404, 'not_found', 'Grant not found');
        let parent = grant.parent;
        const seen = new Set();
        while (parent && parent !== auth.grant && !seen.has(parent)) { seen.add(parent); parent = program.grants[parent]?.parent; }
        if (auth.via !== 'owner' && parent !== auth.grant) fail(403, 'revoke_scope', 'A delegate may only revoke grants descending from its authorizing grant');
        grant.revoked_at = at; grant.revoked_by = principal.id;
      } else if (operation === 'join') {
        if (program.kind !== 'game') fail(400, 'not_game', 'join is available only on games');
        if (program.state.winner || program.state.draw) fail(409, 'game_finished', 'The game has finished');
        if (program.state.players.X === principal.id || program.state.players.O === principal.id) fail(409, 'already_joined', 'This principal is already a player');
        if (program.state.players.O) fail(409, 'game_full', 'Both player positions are occupied');
        program.state.players[program.state.players.X ? 'O' : 'X'] = principal.id;
      } else if (operation === 'move') {
        if (program.kind !== 'game') fail(400, 'not_game', 'move is available only on games');
        applyMove(program.state, principal.id, body.cell);
        eventPayload = { cell: body.cell };
      } else if (operation === 'mission') {
        if (program.kind !== 'mission' || !program.state.graph?.nodes) fail(400, 'not_mission', 'No typed mission graph exists on this program');
        const node = program.state.graph.nodes.find((node) => node.id === body.node_id);
        if (!node) fail(404, 'not_found', 'Mission node not found');
        if (!['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(body.status)) fail(400, 'invalid_status', 'Use PASS, FAIL, BLOCKED or NOT_RUN');
        if (body.status === 'PASS') {
          if (node.dependencies.some((id) => program.state.graph.nodes.find((n) => n.id === id)?.status !== 'PASS')) fail(409, 'dependencies_incomplete', 'All dependencies must pass first');
          if (!Array.isArray(body.evidence) || !body.evidence.length || body.evidence.some((id) => !data.artifacts[id] || data.artifacts[id].program_id !== program.id)) fail(422, 'verified_evidence_required', 'PASS requires immutable execution artifacts belonging to this mission');
        }
        node.status = body.status; node.evidence = clone(body.evidence ?? []); node.updated_at = at;
        program.state.completion = { status: program.state.graph.nodes.every((node) => node.status === 'PASS') ? 'PASS' : 'NOT_RUN', verified: false, note: 'Artifact presence is checked; requirement truth needs independent review' };
        resultBody.node = clone(node);
      }
      record(data, program, operation, principal, auth, eventPayload, at);
      if (operation === 'publish') {
        const release = data.releases[resultBody.release.id];
        release.program_snapshot = snapshot(program);
        release.content_id = hashOf(release);
        resultBody.release = clone(release);
      }
      resultBody.program = this.programView(program, principal);
      const result = response(RESPONSE_STATUS[operation] ?? 200, resultBody);
      if (idem) data.idempotency[idem.id] = { fingerprint: idem.fingerprint, response: clone(result), created_at: at };
      return result;
    });
  }

  verifyExecution(data, execution) {
    const invalid = problem => ({ execution_id: execution.id, valid: false, problem });
    if (execution.status !== 'succeeded' && (execution.receipt || execution.artifacts?.length)) return invalid('Completed evidence conflicts with execution status');
    if (execution.status !== 'succeeded') return { execution_id: execution.id, status: execution.status, replayable: Array.isArray(execution.effects) && execution.effects.length === 0, valid: null };
    try {
      const equal = (a, b) => canonicalize(a) === canonicalize(b);
      const unsigned = (value, omitted = []) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'content_id' && !omitted.includes(key)));
      const program = data.programs[execution.program_id];
      const build = program?.builds.find(build => build.id === execution.build_id);
      const artifact = execution.artifacts?.length === 1 ? data.artifacts[execution.artifacts[0]] : null;
      const receipt = execution.receipt;
      if (!artifact || !build || !object(receipt)) return invalid('Missing immutable build, receipt or artifact');
      if (build.immutable !== true || build.status !== 'passed' || hashOf(unsigned(build)) !== build.content_id || build.content_id !== execution.build_content_id || build.source_content_id !== hashOf(build.source)) return invalid('Immutable build content mismatch');
      if (build.program_id !== execution.program_id || build.source_revision !== execution.source_revision || build.language !== program.language) return invalid('Execution build binding mismatch');
      if (artifact.immutable !== true || artifact.id !== execution.artifacts[0] || artifact.program_id !== execution.program_id || artifact.execution_id !== execution.id || artifact.build_id !== execution.build_id || artifact.kind !== 'execution-result' || hashOf(unsigned(artifact, ['storage'])) !== artifact.content_id) return invalid('Immutable artifact content or binding mismatch');
      if (hashOf(unsigned(receipt)) !== receipt.content_id) return invalid('Immutable receipt content mismatch');
      if (!Number.isSafeInteger(execution.seed) || hashOf(execution.input) !== execution.input_id) return invalid('Execution input or seed mismatch');
      if (!equal(execution.environment, build.environment) || execution.environment_id !== build.environment.environment_id || hashOf(Object.fromEntries(Object.entries(build.environment).filter(([key]) => key !== 'environment_id'))) !== execution.environment_id) return invalid('Captured environment mismatch');
      if (!equal(execution.runtime_environment, artifact.runtime_environment) || execution.runtime_environment_id !== artifact.runtime_environment_id || hashOf(artifact.runtime_environment) !== artifact.runtime_environment_id) return invalid('Runtime environment mismatch');
      if (build.environment.image && artifact.runtime_environment.image !== build.environment.image) return invalid('Runtime image differs from the captured build environment');
      if (!equal(execution.value, artifact.value) || execution.value_id !== artifact.value_id || !equal(execution.trace, artifact.trace)) return invalid('Execution result or trace differs from immutable artifact');
      const event = program.history.find(event => event.version === execution.program_version + 1 && event.operation === 'run');
      const version = program.versions[String(execution.program_version)];
      if (!event || !version || event.actor !== execution.requested_by || !equal(event.authority, execution.authorization) || !equal(event.payload, { execution_id: execution.id, build_id: execution.build_id, input_id: execution.input_id, seed: execution.seed }) || version.source_revision !== execution.source_revision || !equal(version.dependencies, execution.dependencies) || !version.builds.some(saved => saved.id === build.id && saved.content_id === build.content_id)) return invalid('Execution differs from the recorded run request');
      const deterministic = build.language === 'purl';
      const nondeterminism = deterministic ? [] : ['authored runtime behavior is not proven deterministic'];
      if (!equal(execution.effects, []) || !equal(execution.nondeterminism, nondeterminism)) return invalid('Execution effects or nondeterminism mismatch');
      const expectedReceipt = { schema: 'purl.execution-receipt/1', execution_id: execution.id, build_id: execution.build_id, build_content_id: execution.build_content_id, input_id: execution.input_id, seed: execution.seed, environment_id: execution.environment_id, runtime_environment_id: execution.runtime_environment_id, dependencies: execution.dependencies, deterministic, nondeterminism, effects: execution.effects, value_id: execution.value_id, artifact_content_id: artifact.content_id, completed_at: execution.completed_at };
      if (!equal(unsigned(receipt), expectedReceipt)) return invalid('Receipt fields differ from the recorded execution');
      validate(build.input_schema, execution.input, 'input');
      validate(build.output_schema, execution.value, 'output');
      if (!deterministic) return { execution_id: execution.id, valid: true, replayable: false, verified: 'artifact-integrity-only', reason: 'Authored execution replay requires a verified isolated adapter' };
      const compiled = compile(build.source);
      if (!compiled.ok || !equal(compiled.plan, build.plan) || compiled.derivation_id !== build.derivation_id) return invalid('Build plan differs from source compilation');
      if (!Number.isSafeInteger(build.plan.cost) || build.plan.cost > REPLAY_STEPS) return invalid('Replay verification exceeds the synchronous step budget');
      const result = execute(build.plan, execution.input, { seed: execution.seed });
      if (!equal(result.value, execution.value) || result.value_id !== execution.value_id || !equal(result.trace, execution.trace) || !equal(result.trace.environment, execution.runtime_environment) || !equal(result.trace.observed_effects, execution.effects)) return invalid('Deterministic result, trace or environment differs from recomputation');
      return { execution_id: execution.id, valid: true, replayable: true, value_id: result.value_id };
    } catch (error) { return invalid(error.message); }
  }

  async workOnce({ workerId, leaseMs = 30000 } = {}) {
    if (typeof workerId !== 'string' || !workerId.trim() || workerId.length > 200) throw new TypeError('workerId is required');
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 100 || leaseMs > 300000) throw new TypeError('leaseMs must be 100 through 300000');
    // Supabase can answer an idle poll from its small indexed projection.
    // Positive hints still use the read-only eligibility check, so a live lease
    // never causes a no-op CAS write. The claim below rechecks atomically.
    if (typeof this.repository.hasPendingExecutions === 'function' && !await this.repository.hasPendingExecutions()) return null;
    const pending = await this.repository.read();
    if (!Object.values(pending.data.executions).some((execution) => execution.status === 'queued' || execution.status === 'running' && Date.parse(execution.lease?.expires_at ?? 0) <= Date.now())) return null;
    const claim = await this.repository.transaction((document) => {
      const data = initialize(document);
      const at = now();
      const job = Object.values(data.executions).find((execution) => execution.status === 'queued' || execution.status === 'running' && Date.parse(execution.lease?.expires_at ?? 0) <= Date.now());
      if (!job) return null;
      const program = data.programs[job.program_id];
      const principal = data.principals[job.requested_by];
      const build = program?.builds.find((build) => build.id === job.build_id);
      if (!program || !principal || principal.revoked_at || !authority(program, principal, 'run')) {
        job.status = 'denied'; job.error = { code: 'authority_revoked', message: 'Current principal authority no longer permits execution' }; job.completed_at = at; job.lease = null;
        job.logs.push({ at, level: 'error', message: 'Authority recheck denied this queued job' });
        return { denied: true, execution: clone(job) };
      }
      const unsignedBuild = build ? { ...build } : null;
      if (unsignedBuild) delete unsignedBuild.content_id;
      if (!build || build.status !== 'passed' || build.content_id !== job.build_content_id || hashOf(unsignedBuild) !== build.content_id) {
        job.status = 'failed'; job.error = { code: 'build_integrity', message: 'The immutable build could not be verified' }; job.completed_at = at; job.lease = null;
        return { denied: true, execution: clone(job) };
      }
      job.status = 'running'; job.started_at ??= at; job.attempts++;
      job.claim_authorization = clone(authority(program, principal, 'run'));
      job.lease = { worker_id: workerId, claim_id: uid('claim'), expires_at: new Date(Date.now() + leaseMs).toISOString() };
      job.logs.push({ at, level: 'info', message: `Worker claimed execution attempt ${job.attempts}` });
      return { execution: clone(job), build: clone(build) };
    });
    if (!claim) return null;
    if (claim.denied) return claim.execution;
    const job = claim.execution;
    let result;
    let executionError;
    try {
      validate(claim.build.input_schema, job.input, 'input');
      if (claim.build.language === 'purl') result = execute(claim.build.plan, job.input, { seed: job.seed });
      else {
        if (this.sandboxAdapter?.verified !== true) fail(422, 'sandbox_unavailable', 'Worker has no verified isolated authored-code adapter');
        if (claim.build.environment.adapter_id !== this.sandboxAdapter.id) fail(422, 'environment_mismatch', 'This worker does not match the captured isolated build environment');
        const workerManifest = this.authoredEnvironment(claim.build.language);
        if (claim.build.environment.image && workerManifest.image !== claim.build.environment.image) fail(422, 'environment_mismatch', 'This worker sandbox image differs from the captured immutable build');
        result = await this.sandboxAdapter.execute({ language: claim.build.language, source: claim.build.source, input: clone(job.input), seed: job.seed, environment: clone(job.environment) });
        if (claim.build.environment.image && result.environment?.image !== claim.build.environment.image) fail(422, 'environment_mismatch', 'Observed sandbox image differs from the captured immutable build');
      }
      if (!result || !Object.hasOwn(result, 'value')) fail(422, 'invalid_runtime_result', 'Runtime did not return a value');
      if (Buffer.byteLength(canonicalize(result.value)) > 512 * 1024) fail(422, 'result_too_large', 'Execution result exceeds 512 KiB');
      validate(claim.build.output_schema, result.value, 'output');
    } catch (error) { executionError = { code: error.code ?? 'execution_failed', message: error.message }; }
    let preparedArtifact;
    if (!executionError) {
      const runtime = result.environment ?? result.trace?.environment ?? { ...pureEnvironment(), worker_id: workerId };
      preparedArtifact = { id: uid('artifact'), program_id: job.program_id, execution_id: job.id, build_id: job.build_id, kind: 'execution-result', value: clone(result.value), value_id: result.value_id ?? hashOf(result.value), trace: clone(result.trace ?? []), runtime_environment: clone(runtime), runtime_environment_id: hashOf(runtime), created_at: now(), immutable: true };
      preparedArtifact.content_id = hashOf(preparedArtifact);
      if (typeof this.repository.putArtifact === 'function') {
        const content = { ...preparedArtifact }; delete content.content_id;
        try { preparedArtifact.storage = await this.repository.putArtifact(Buffer.from(canonicalize(content)), { contentType: 'application/purl+json' }); }
        catch { executionError = { code: 'artifact_storage_failed', message: 'Immutable artifact storage failed; no successful execution was acknowledged' }; }
      }
    }
    return this.repository.transaction((document) => {
      const data = initialize(document);
      const execution = data.executions[job.id];
      if (!execution || execution.status !== 'running' || execution.lease?.claim_id !== job.lease.claim_id) return execution ? clone(execution) : null;
      const at = now();
      const program = data.programs[execution.program_id];
      const principal = data.principals[execution.requested_by];
      if (!principal || principal.revoked_at || !program || !authority(program, principal, 'run')) executionError = { code: 'authority_revoked', message: 'Authority was revoked before the result could be committed' };
      execution.completed_at = at; execution.lease = null;
      execution.completion_authorization = program && principal ? clone(authority(program, principal, 'run') ?? null) : null;
      if (executionError) {
        execution.status = executionError.code === 'authority_revoked' ? 'denied' : 'failed'; execution.error = executionError;
        execution.logs.push({ at, level: 'error', message: executionError.message });
      } else {
        const artifact = preparedArtifact;
        data.artifacts[artifact.id] = artifact;
        execution.artifacts = [artifact.id]; execution.value = clone(result.value); execution.value_id = artifact.value_id; execution.trace = clone(result.trace ?? []); execution.status = 'succeeded';
        execution.runtime_environment = clone(artifact.runtime_environment); execution.runtime_environment_id = artifact.runtime_environment_id;
        const deterministic = claim.build.language === 'purl';
        execution.nondeterminism = deterministic ? [] : ['authored runtime behavior is not proven deterministic'];
        execution.receipt = { schema: 'purl.execution-receipt/1', execution_id: execution.id, build_id: execution.build_id, build_content_id: execution.build_content_id, input_id: execution.input_id, seed: execution.seed, environment_id: execution.environment_id, runtime_environment_id: execution.runtime_environment_id, dependencies: clone(execution.dependencies), deterministic, nondeterminism: clone(execution.nondeterminism), effects: clone(execution.effects), value_id: execution.value_id, artifact_content_id: artifact.content_id, completed_at: at };
        execution.receipt.content_id = hashOf(execution.receipt);
        execution.logs.push(...clone(result.logs ?? []), { at, level: 'info', message: 'Result and immutable artifact committed durably' });
      }
      data.audit.push({ id: uid('audit'), operation: 'execution-completed', program_id: execution.program_id, execution_id: execution.id, worker_id: workerId, status: execution.status, at });
      return clone(execution);
    });
  }

  async seed() {
    const mission = missionState(this.baseUrl);
    return this.repository.transaction((document) => {
      const data = initialize(document);
      data.principals[SEED_OWNER] ??= { id: SEED_OWNER, kind: 'service', label: 'PURL immutable examples', identity_verified: false, system: true, created_at: now() };
      const principal = data.principals[SEED_OWNER];
      const definitions = [
        { ...templates()[0], id: SEED_IDS.math },
        { ...templates()[1], id: SEED_IDS.diagnostic },
        { ...templates()[2], id: SEED_IDS.game },
        { id: SEED_IDS.mission, title: 'PURL · The God Seed', kind: 'mission', language: 'purl', source: 'input json | mission.inspect', tests: [], input_schema: { type: 'object', required: ['graph'] }, output_schema: { type: 'object', required: ['ready_nodes', 'completion', 'verified'] }, state: mission },
      ];
      for (const definition of definitions) {
        if (data.programs[definition.id]) continue;
        const program = this.newProgram({ ...definition, visibility: 'public' }, principal, definition.id);
        if (definition.state) program.state = clone(definition.state);
        const grant = { id: `grant_seed_${definition.id}`, principal_id: '*', rights: ['read', 'run', 'propose', ...(definition.kind === 'game' ? ['play'] : [])], parent: null, granted_by: principal.id, created_at: now(), expires_at: null, revoked_at: null };
        program.grants[grant.id] = grant;
        if (program.kind === 'game') program.state.players.X = null;
        const compiled = compile(program.source);
        if (compiled.ok) {
          const environment = pureEnvironment(); environment.environment_id = hashOf(environment);
          const testResults = program.tests.map((test, index) => {
            try { const result = execute(compiled.plan, test.input); return { index, passed: canonicalize(result.value) === canonicalize(test.expected), expected: clone(test.expected), actual: clone(result.value), input: clone(test.input) }; }
            catch (error) { return { index, passed: false, error: { message: error.message } }; }
          });
          const build = { id: `build_seed_${definition.id}`, program_id: program.id, source_revision: 1, source_content_id: hashOf(program.source), source: clone(program.source), language: 'purl', plan: clone(compiled.plan), derivation_id: compiled.derivation_id, diagnostics: [], status: testResults.every((test) => test.passed) ? 'passed' : 'failed', tests: testResults, tests_passed: testResults.every((test) => test.passed), input_schema: clone(program.input_schema), output_schema: clone(program.output_schema), environment, created_at: now(), created_by: principal.id, immutable: true };
          build.build_id = hashOf({ source: build.source, plan: build.plan, environment }); build.content_id = hashOf(build);
          program.builds.push(build); program.active_build = build.status === 'passed' ? build.id : null;
        }
        data.programs[program.id] = program;
        record(data, program, 'seed', principal, { via: 'owner', rights: RIGHTS }, { content_id: hashOf(definition), seed_revision: 1 }, now());
      }
      return { examples: clone(SEED_IDS) };
    });
  }
}
