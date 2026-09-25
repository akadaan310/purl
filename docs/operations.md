# Operation algebra

The brief listed ~30 candidate operations in six families. This document
records which of them are **primitives**, which are **compositions**,
which are **aliases**, and which are **projections** (safe reads), and
why. The registry that implements it is `src/continuity/operations.js`;
`GET /.well-known/purl` publishes the same classification.

## 1. Criterion for a primitive

An operation is primitive iff it cannot be expressed as a sequence of
other primitives *without changing at least one of*:

1. **the part of the resource it mutates** (state, collections, grants,
   assignee, relations, lifecycle, owner);
2. **the right required to perform it** (so authority can be partitioned
   by primitive); or
3. **its algebraic behaviour** (idempotence, commutativity, monotonicity).

Criterion 2 is what makes the set security-relevant: because each
primitive maps to exactly one right, the authority required by *any*
composition is the union of the rights of its primitives. A composition
can therefore never require less authority than its parts — this is how
PURL prevents "confused composition" escalation.

## 2. The nine primitives

| Primitive | Mutates | Right | Properties |
|-----------|---------|-------|------------|
| `genesis` | everything (creates) | — (caller becomes owner) | exactly once per resource |
| `patch` | `state` | `update` | idempotent; last-writer-wins; not commutative |
| `append` | `collections` | `append` | monotone; idempotent and commutative **as a set keyed by entry id** (a grow-only set, G-Set, in CRDT terms) |
| `grant` | `grants` | `grant` | monotone in authority; idempotent by grant id |
| `revoke` | `grants` | `grant` | idempotent; anti-monotone; **does not commute with `grant`** |
| `assign` | `assignee` | `assign` | idempotent; last-writer-wins |
| `link` | `relations` | `link` | monotone; idempotent by (rel, target, version) |
| `transition` | `lifecycle` | `lifecycle` | governed by a finite state machine (below) |
| `transfer` | `owner` | *owner only* | not grantable; last-writer-wins |

### Why `append` is not a special case of `patch`

JSON Merge Patch replaces arrays wholesale, so appending with `patch`
means *read-modify-write the whole array*. Two concurrent appends then
conflict and one is lost. `append` of an entry with a unique id is a
set-union: concurrent appends commute. This is the difference between a
last-writer-wins register and a grow-only set, and it is what makes
`merge` able to union entries without conflicts. Different algebra →
different primitive (criterion 3). It also permits a weaker right:
contributors can add without being able to rewrite (criterion 2).

### Why `grant`/`revoke`/`assign`/`transfer` are not `patch`es on metadata

They could be implemented that way, but then a single `update` right would
confer the power to change authority. Separating them lets a resource
owner give someone the power to *edit content* without the power to
*change who may edit content*. (Criterion 2.)

### Why `revoke` is separate from `grant`

`revoke ∘ grant ≠ grant ∘ revoke`, and revocation must cascade through
delegation chains while leaving the revoked record in place for
provenance. It is also the one operation that must remain available in
*every* lifecycle state (so authority can always be withdrawn).

## 3. Compositions

A composition emits a fixed pattern of primitives in **one invocation**:
all events share an `invocation` id and are applied atomically (all or
nothing).

| Operation | = | Notes |
|-----------|---|-------|
| `annotate` | `append(annotations, {about, body})` | allowed after completion |
| `checkpoint` | `append(checkpoints, {package, checkpoint:{version, state_hash}})` | server binds the package to a verified state hash |
| `acknowledge` | `append(acks, {observed:{version, state_hash}})` | declaration of awareness; confers nothing |
| `supersede` | `append(c, {supersedes: id, body})` | the old entry is untouched; `superseded_by` is computed |
| `handoff` | `append(checkpoints)` · `grant`? · `assign` | never touches `owner` |
| `fork` | `genesis(new, derived_from)` | emits **nothing** on the source |
| `merge` | `patch`? · `append`* · `link(merged_from)` | three-way over state, set-union over entries |

## 4. Aliases

| Alias | Of | Difference |
|-------|----|------------|
| `retrieve` | `inspect` | none |
| `synchronize` | `history` (`GET …/events?since=`) | none — synchronisation *is* fetching events past your version and folding them |
| `delegate` | `grant` | requires `purpose` and a named grantee |
| `forward` | `handoff` | precondition: caller is the current assignee |
| `branch` | `fork` | none |
| `reconcile` | `merge` | none |

Aliases exist because the brief's vocabulary is what a client will
*look for*. They cost nothing and are marked as aliases in the manifest
so a client never believes they are distinct behaviours.

## 5. Lifecycle declarations

`close`, `complete`, `cancel`, `reopen`, `archive` and `restore` are all
the single primitive `transition` with different arguments. They are
exposed as separate operation names because the *meaning* a client
attaches to them differs (objective met vs. abandoned vs. neither), and a
grant's operation allow-list can distinguish them (e.g. allow `complete`
but not `cancel`).

```
            close            reopen
   active ──────────► closed ─────────► active
     │  complete                          ▲
     ├──────────► completed ──reopen──────┤
     │  cancel                            │
     ├──────────► cancelled ──reopen──────┘
     │
     │ archive (from any non-archived status)
     ▼
  archived ──restore──► (status before archive)
```

| Status | Permitted mutating operations |
|--------|-------------------------------|
| active | all |
| closed / completed / cancelled | annotate, acknowledge, grant, delegate, link, reopen, archive, revoke, transfer, fork |
| archived | restore, revoke, transfer, fork |

## 6. Projections (safe reads)

`inspect`, `status`, `search`, `diff`, `history`, `state_at`, `lineage`,
`verify`, `continuity`, `subscribe`. None of them emits an event. They
are served with `GET` and are listed in the manifest with `safe: true`.

`subscribe` deserves a note: it is often modelled as a mutation (a
server-side subscription record). In PURL it is a *connection*, not state:
an SSE stream resumable by `Last-Event-ID` (= version). Durable
subscriptions (webhooks) would require the server to dereference
client-supplied URLs, which PURL forbids (see SECURITY.md, SSRF).

## 7. What was removed and why

| Candidate | Outcome |
|-----------|---------|
| `create` vs `genesis` | same thing; `create` is the public name |
| `update` vs `patch` | same; `update` is the public name, `patch` the event kind |
| `search` | a projection over the *instance*, not a resource |
| `status` | projection (subset of `inspect`) |
| `complete`, `cancel`, `close` | one primitive, three declarations (§5) |
| `assign` vs `handoff` | kept both: `assign` is the bare pointer change, `handoff` carries a continuity package |

## 8. Minimality — status of the argument

The argument above shows each primitive differs from the others on at
least one of the three criteria. It does **not** prove that no smaller
basis exists under a *different* criterion (e.g. if rights were attached
to fields rather than to primitives, `grant`/`assign`/`transfer` would
collapse into a field-scoped `patch`). That alternative is recorded as an
open question in [RESEARCH_QUESTIONS.md](../RESEARCH_QUESTIONS.md).

## 9. Invocation contract

```
POST /r/{id}/ops/{operation}
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <optional client key>

{ "expected_version": <int>, "input": { … per the operation's input schema … } }
```

- `expected_version` is **required**. It is an optimistic-concurrency
  precondition (like `If-Match`) and it makes a captured request
  non-replayable once the resource has moved on.
- The whole plan must be authorised by **one** authority source. Two
  partial grants are not combined; this keeps each event's provenance a
  single chain.
- Response: `operation-result` with the produced events (version, kind,
  hash), the new version and operation-specific `result`.
