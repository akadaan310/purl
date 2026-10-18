import { randomBytes } from 'node:crypto';
import { canonicalize, clone, hashOf, sha256 } from '../../src/core/canonical.js';
import { normalizeSchema, schemaErrors } from './schema.js';

export { canonicalize, clone, hashOf, sha256 };
export const PROTOCOL = 'PURL/0.2';
export const RIGHTS = ['read', 'edit', 'build', 'run', 'publish', 'checkpoint', 'propose', 'grant', 'play'];
export const uid = (kind) => `${kind}_${randomBytes(12).toString('hex')}`;
export class ApiError extends Error {
  constructor(status, code, message, details = {}) { super(message); Object.assign(this, { status, code, details }); }
}
export const fail = (status, code, message, details) => { throw new ApiError(status, code, message, details); };
export const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function initialize(data) {
  for (const key of ['principals', 'programs', 'executions', 'artifacts', 'releases', 'idempotency']) data[key] ??= {};
  data.audit ??= [];
  return data;
}
export function principalView(principal) {
  if (!principal) return null;
  const { token_hash, token_hashes, ...publicPrincipal } = principal;
  return clone(publicPrincipal);
}
export function authenticate(data, token, required = false) {
  const digest = token ? sha256(String(token)) : null;
  const principal = digest ? Object.values(data.principals).find((p) => (p.token_hash === digest || p.token_hashes?.includes(digest)) && !p.revoked_at) : null;
  if (token && !principal) fail(401, 'invalid_token', 'Bearer token is invalid or revoked');
  if (required && !principal) fail(401, 'authentication_required', 'A bearer session is required');
  return principal;
}
// Authority follows the original continuity layer: one effective provenance
// chain must authorize an operation, and delegated rights only attenuate.
export function activeGrant(program, grant, seen = new Set()) {
  if (!grant || grant.revoked_at || seen.has(grant.id)) return false;
  if (grant.expires_at && Date.parse(grant.expires_at) <= Date.now()) return false;
  if (!grant.parent) return grant.granted_by === program.owner;
  seen.add(grant.id);
  const parent = program.grants[grant.parent];
  return activeGrant(program, parent, seen) && parent.principal_id === grant.granted_by && grant.rights.every((r) => parent.rights.includes(r));
}
export function sources(program, principal) {
  const pid = principal?.id;
  const out = pid && pid === program.owner ? [{ via: 'owner', grant: null, rights: RIGHTS }] : [];
  if (program.visibility !== 'private') out.push({ via: 'visibility', grant: null, rights: ['read'] });
  for (const grant of Object.values(program.grants ?? {})) {
    if ((grant.principal_id === pid || grant.principal_id === '*') && activeGrant(program, grant)) out.push({ via: 'grant', grant: grant.id, rights: grant.rights });
  }
  return out;
}
export function authority(program, principal, right) { return sources(program, principal).find((s) => s.rights.includes(right)); }
export function requireRight(program, principal, right, { hide = false } = {}) {
  const source = authority(program, principal, right);
  if (!source) fail(hide ? 404 : 403, hide ? 'not_found' : 'forbidden', hide ? 'Program not found' : `Current authority does not grant ${right}`);
  return clone(source);
}
export function expected(program, body) {
  if (!Number.isSafeInteger(body.expected_version) || body.expected_version < 1) fail(400, 'expected_version_required', 'expected_version must be a positive integer');
  if (body.expected_version !== program.version) fail(409, 'version_conflict', 'Program changed; inspect the current version', { expected_version: body.expected_version, current_version: program.version });
}
export function snapshot(program) {
  const { history, versions, ...state } = program;
  return clone(state);
}
export function record(data, program, operation, principal, auth, payload, now) {
  program.version++;
  program.updated_at = now;
  const state = snapshot(program);
  const event = { id: uid('event'), program_id: program.id, version: program.version, operation, actor: principal?.id ?? null, authority: clone(auth), at: now, payload: clone(payload), previous_hash: program.history.at(-1)?.hash ?? null, state_hash: hashOf(state), state };
  event.hash = hashOf(event);
  program.history.push(event);
  program.versions[String(program.version)] = state;
  data.audit.push({ id: event.id, program_id: program.id, operation, actor: event.actor, at: now, event_hash: event.hash });
  return event;
}
export function replayProgram(program) {
  const problems = [];
  let previous = null;
  let state = null;
  for (let i = 0; i < program.history.length; i++) {
    const event = program.history[i];
    const { hash, ...unsigned } = event;
    if (hashOf(unsigned) !== hash) problems.push({ version: event.version, problem: 'event hash mismatch' });
    if (event.previous_hash !== previous) problems.push({ version: event.version, problem: 'event chain mismatch' });
    if (event.version !== i + 1) problems.push({ version: event.version, problem: 'nonconsecutive version' });
    if (event.state_hash !== hashOf(event.state)) problems.push({ version: event.version, problem: 'state hash mismatch' });
    if (hashOf(program.versions[String(event.version)] ?? null) !== event.state_hash) problems.push({ version: event.version, problem: 'version snapshot mismatch' });
    if (event.operation === 'move' && state) {
      const next = clone(state.state);
      try { applyMove(next, event.actor, event.payload.cell); if (hashOf(next) !== hashOf(event.state.state)) problems.push({ version: event.version, problem: 'game transition mismatch' }); }
      catch { problems.push({ version: event.version, problem: 'invalid recorded game move' }); }
    }
    previous = hash;
    state = event.state;
  }
  if (hashOf(state) !== hashOf(snapshot(program))) problems.push({ problem: 'current state differs from replay' });
  return { program_id: program.id, valid: problems.length === 0, version: program.version, events: program.history.length, head: previous, state_hash: state ? hashOf(state) : null, problems };
}
export function applyMove(state, pid, cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) fail(400, 'invalid_cell', 'cell must be an integer from 0 through 8');
  if (state.winner || state.draw) fail(409, 'game_finished', 'The game has finished');
  const mark = Object.keys(state.players).find((key) => state.players[key] === pid);
  if (!mark) fail(403, 'not_player', 'Join this game before playing');
  if (mark !== state.turn) fail(409, 'wrong_turn', `It is ${state.turn}'s turn`);
  if (state.board[cell] !== null) fail(409, 'occupied_cell', 'The cell is occupied');
  state.board[cell] = mark;
  state.moves.push({ cell, mark, principal_id: pid });
  const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
  state.winner = lines.some((line) => line.every((i) => state.board[i] === mark)) ? mark : null;
  state.draw = !state.winner && state.board.every((c) => c !== null);
  state.turn = state.winner || state.draw ? null : mark === 'X' ? 'O' : 'X';
}
export function registerSchema(schema = {}) {
  try { return clone(normalizeSchema(schema)); }
  catch (error) { fail(400, error.code ?? 'invalid_schema', error.message); }
}
export function validate(schema, value, kind) {
  let errors;
  try { errors = schemaErrors(schema ?? {}, value); }
  catch (error) {
    if (error.code) fail(400, error.code, error.message);
    fail(422, `${kind}_schema_mismatch`, `${kind} exceeds schema validation bounds`, { diagnostics: [{ path: '/', message: error.message }] });
  }
  if (errors.length) fail(422, `${kind}_schema_mismatch`, `${kind} does not match the declared schema`, { diagnostics: errors });
}
export function validateSource(body) {
  const source = body.source;
  if (typeof source !== 'string' && !object(source)) fail(400, 'invalid_source', 'source must be text or a JSON program');
  let bytes;
  try { bytes = Buffer.byteLength(canonicalize(source)); } catch { fail(400, 'invalid_source', 'Source must be finite JSON'); }
  if (bytes > 256 * 1024) fail(413, 'source_too_large', 'Source exceeds 256 KiB');
  if (body.language !== 'purl' && typeof source !== 'string') fail(400, 'invalid_source', 'Authored language source must be text');
  return clone(source);
}
