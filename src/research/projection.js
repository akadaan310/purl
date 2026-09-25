// Projections: the declared bridge from a PURL event log (Layer 1) to a symbol
// sequence (Layer 2). A projection is a representation choice; structure found
// in its output may belong to the activity OR to the projection. Every
// experiment names the projection it used.
//
// This module deliberately does not import Layer 1; it operates on plain event
// objects (headers suffice). The primitive list is duplicated as data and a
// test checks it matches Layer 1's.

export const EVENT_KINDS = ['genesis', 'patch', 'append', 'grant', 'revoke', 'assign', 'link', 'transition', 'transfer'];
const AUTHORITY_KINDS = new Set(['grant', 'revoke', 'assign', 'transfer']);

export const PROJECTIONS = {
  kind: {
    alphabet: EVENT_KINDS,
    definition: 'symbol = the primitive kind of each event (9 symbols)',
    fn: (e) => EVENT_KINDS.indexOf(e.kind),
  },
  authority: {
    alphabet: ['content', 'authority'],
    definition: '1 if the event changes who may act or who is responsible (grant, revoke, assign, transfer), else 0',
    fn: (e) => (AUTHORITY_KINDS.has(e.kind) ? 1 : 0),
  },
  actor_change: {
    alphabet: ['same-actor', 'actor-changed'],
    definition: '1 if the actor differs from the previous event\'s actor; 0 for the first event',
    fn: (e, prev) => (prev && prev.actor !== e.actor ? 1 : 0),
  },
};

export function projectEvents(events, name = 'kind') {
  const p = PROJECTIONS[name];
  if (!p) throw new Error(`unknown projection ${name}`);
  const t0 = events.length ? Date.parse(events[0].at) : 0;
  return {
    projection: name,
    alphabet: p.alphabet,
    units: 's',
    symbols: events.map((e, i) => p.fn(e, events[i - 1])),
    times: events.map((e) => (Date.parse(e.at) - t0) / 1000),
    invocations: events.map((e) => e.invocation),
  };
}

/** Positions (1..n-1) where a new invocation starts: ground-truth operation boundaries. */
export function invocationBoundaries(invocations) {
  const b = [];
  for (let i = 1; i < invocations.length; i++) if (invocations[i] !== invocations[i - 1]) b.push(i);
  return b;
}
