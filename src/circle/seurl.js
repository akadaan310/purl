// SEURL: the finite move language, as a pure function of a URL path.
//
// Source of the semantics: MUSA luna-agent/protocols/url-machine.md (§3, §4) and
// the seurl halt page. The seven verbs are the whole vocabulary; nothing is added.
//
//   IDLE      --START(addr)-->   BOUND(addr)
//   BOUND     --SWITCH(addr)-->  BOUND(addr)
//   BOUND     --WRITE(ops)-->    WRITING          (interpretation: WRITING --WRITE--> WRITING too)
//   WRITING   --COMMIT-->        COMMITTED        (a mutation: prepared on GET, performed on POST)
//   COMMITTED --BUILD-->         BUILT | FAILED   (a mutation: prepared on GET, performed on POST)
//   any       --TALK(to)-->      any              (routed through ACSP; prepared on GET)
//   any       --PERTURB(bit)-->  any              (logged; here: flip/{bit} on the current address)
//
// A SEURL path is the program: `/seurl/START/map/eca/90/8/state/5/WRITE/next/PERTURB/0/COMMIT`.
// Verbs are the seven upper-case tokens; everything between verbs is their argument.
// The session's entire state is a function of the path (url-machine §5: "Session keeps:
// its url. Nothing else."), so evaluating a path on GET changes nothing anywhere.

export const DESCRIPTOR = {
  module: 'src/circle/seurl.js',
  claims: ['the SEURL move-word FSM is pure: run(path) reads only its argument', 'mutating verbs (COMMIT, BUILD, TALK) are returned as prepared, never performed', 'parse is syntax only (no evaluation)'],
  requires: { modules: [], services: [], files: [] },
  produces: ['DESCRIPTOR', 'VERBS', 'MUTATING', 'SeurlError', 'parseMoves', 'run', 'pathOf'],
  changes: [],
};

export const VERBS = ['START', 'SWITCH', 'WRITE', 'COMMIT', 'BUILD', 'TALK', 'PERTURB'];
export const MUTATING = new Set(['COMMIT', 'BUILD', 'TALK']);

const TRANSITIONS = {
  IDLE: { START: 'BOUND' },
  BOUND: { SWITCH: 'BOUND', WRITE: 'WRITING' },
  WRITING: { WRITE: 'WRITING', COMMIT: 'COMMITTED' },
  COMMITTED: { BUILD: 'BUILT' },
  BUILT: {},
  FAILED: {},
};
const ANY = { TALK: true, PERTURB: true };

export class SeurlError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

/** Tokens -> moves. Syntax only. */
export function parseMoves(path) {
  const toks = path.split('?')[0].split('/').filter(Boolean);
  const moves = [];
  for (const t of toks) {
    // TALK has fixed arity 2 (system, resource id) and takes them raw: ACSP ids are
    // upper-case Crockford tokens and may spell a word (found by test: "ABC").
    const last = moves[moves.length - 1];
    if (last?.verb === 'TALK' && last.args.length < 2) { last.args.push(t); continue; }
    if (/^[A-Z]+$/.test(t)) {
      if (!VERBS.includes(t)) throw new SeurlError(400, 'unknown_verb', `"${t}" is not a SEURL verb. The verbs are all there is: ${VERBS.join(' ')}.`, { verbs: VERBS });
      moves.push({ verb: t, args: [] });
    } else {
      if (!moves.length) throw new SeurlError(400, 'no_verb', 'A SEURL program starts with a verb (START).', { verbs: VERBS });
      moves[moves.length - 1].args.push(t);
    }
  }
  return moves;
}

function legalVerbs(state) {
  return [...Object.keys(TRANSITIONS[state] ?? {}), ...Object.keys(ANY)].filter((v) => !(v === 'PERTURB' && state === 'IDLE'));
}

/**
 * Run the FSM over the moves. Returns the session as the URL denotes it.
 * Mutating moves are recorded as `prepared`; the state they would reach is reported
 * separately (`would_reach`), never as the current state. Prepared != submitted != committed.
 */
export function run(path) {
  const moves = parseMoves(path);
  let state = 'IDLE';
  let at = null;
  const program = []; // [{verb, op}] — op is a value-address suffix
  const prepared = [];
  let wouldReach = null;
  for (const [i, m] of moves.entries()) {
    const from = wouldReach ?? state;
    const legal = legalVerbs(from);
    if (!legal.includes(m.verb)) {
      throw new SeurlError(409, 'illegal_move', `${m.verb} is not a legal move from ${from}.`, { at_move: i, state: from, legal });
    }
    if (prepared.length && !MUTATING.has(m.verb)) {
      throw new SeurlError(409, 'illegal_move', `${m.verb} cannot follow a prepared ${prepared[prepared.length - 1].verb}: only COMMIT, BUILD and TALK may chain after a mutation.`, { at_move: i, state: from, legal: legal.filter((v) => MUTATING.has(v)) });
    }
    switch (m.verb) {
      case 'START':
      case 'SWITCH':
        if (!m.args.length) throw new SeurlError(400, 'missing_address', `${m.verb} needs an address, e.g. ${m.verb}/map/eca/90/8/state/5.`);
        at = '/' + m.args.join('/');
        program.length = 0;
        state = 'BOUND';
        break;
      case 'WRITE':
        if (!m.args.length) throw new SeurlError(400, 'missing_operation', 'WRITE needs at least one operation segment, e.g. WRITE/next.');
        program.push({ verb: 'WRITE', op: m.args.join('/') });
        state = 'WRITING';
        break;
      case 'PERTURB':
        if (m.args.length !== 1 || !/^\d+$/.test(m.args[0])) throw new SeurlError(400, 'bad_perturbation', 'PERTURB takes exactly one bit index, e.g. PERTURB/0.');
        program.push({ verb: 'PERTURB', op: `flip/${m.args[0]}` });
        break;
      case 'COMMIT':
        if (m.args.length) throw new SeurlError(400, 'unexpected_args', 'COMMIT takes no arguments.');
        prepared.push({ verb: 'COMMIT' });
        wouldReach = 'COMMITTED';
        break;
      case 'BUILD':
        if (m.args.length) throw new SeurlError(400, 'unexpected_args', 'BUILD takes no arguments.');
        prepared.push({ verb: 'BUILD' });
        wouldReach = 'BUILT';
        break;
      case 'TALK':
        if (m.args.length !== 2 || m.args[0] !== 'acsp') throw new SeurlError(422, 'unknown_talk_target', 'TALK routes through ACSP only: TALK/acsp/{resource_id}.', { targets: ['acsp/{resource_id}'] });
        prepared.push({ verb: 'TALK', to: { system: 'acsp', resource_id: m.args[1] } });
        break;
    }
  }
  const current = at === null ? null : at + program.map((p) => '/' + p.op).join('');
  return {
    state,
    would_reach: wouldReach,
    bound: at,
    program,
    current_address: current,
    prepared,
    legal: legalVerbs(wouldReach ?? state).filter((v) => !prepared.length || MUTATING.has(v)),
    moves,
  };
}

/** Canonical SEURL path for a session (used to construct next-move URLs). */
export function pathOf(moves) {
  return '/seurl/' + moves.map((m) => [m.verb, ...m.args].join('/')).join('/');
}
