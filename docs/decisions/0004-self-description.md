# ADR 0004 — Should the protocol describe itself using the protocol?

Status: **accepted, with limits**.

## Question
The brief asks whether a PURL resource can describe the protocol, and
warns against recursion for aesthetic reasons. Does it add discovery value?

## Decision
Yes, narrowly. At start-up the instance principal creates a public
resource `/r/purl-protocol` of type `protocol` whose state is the same
vocabulary served in `/.well-known/purl`. If the vocabulary changes, the
instance records it as `update` events.

## Practical value found
1. **One parser.** A client that can read any PURL resource can read the
   protocol description; it needs no second document format.
2. **Protocol history.** Changes to the vocabulary acquire versions,
   timestamps, hashes and a verifiable chain — "which protocol was in
   force when this event happened?" becomes answerable.
3. **The protocol can be forked, annotated and superseded** with the
   same operations as any resource (e.g. a proposed extension as a fork).

## Limits
- **The recursion must bottom out.** A client must already understand the
  resource envelope to read the protocol resource. `/.well-known/purl` is
  the non-recursive base case and remains required (SPEC §11).
- The protocol resource is owned by the instance principal and is only
  observable/readable by others; it is not a governance mechanism.
- Whether any client benefits in practice beyond (1) is untested
  (RESEARCH_QUESTIONS Q-P9).
