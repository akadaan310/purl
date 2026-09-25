# Architecture

PURL is three layers that can be understood — and replaced — independently.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Layer 0 — Transport            src/transport/                         │
│   URLs · HTTP methods · content negotiation · manifests · HTML views  │
│   SSE subscription · problem details · limits                         │
├───────────────────────────────────────────────────────────────────────┤
│ Layer 1 — Continuity           src/continuity/                        │
│   resources · event log · reducer · authority (grants, chains)        │
│   operations (primitives, compositions, aliases) · lineage · diff     │
│   continuity packages · communication profiles                        │
├───────────────────────────────────────────────────────────────────────┤
│ Layer 2 — Research             src/research/                          │
│   symbol sequences · measures · temporal analysis · transition graphs │
│   grammar compression · surrogates · experiment records               │
└───────────────────────────────────────────────────────────────────────┘
                 src/core/  canonical JSON, hashing, ids, schema validation
```

## Dependency rule

| Module | May import |
|--------|------------|
| `src/core` | Node stdlib only |
| `src/continuity` | `core` |
| `src/research` | `core` |
| `src/transport` | `core`, `continuity`, `research` |
| `scripts/`, `test/` | anything |

Layer 1 knows nothing about HTTP. Layer 2 knows nothing about resources:
it consumes plain arrays of `{t, symbol}`. The *bridge* between Layer 1
and Layer 2 is a **projection** — a declared, documented function from an
event list to a symbol sequence (`src/research/projection.js`). Because
projections are explicit, the choice of projection is visible in every
experiment record, and different projections of the same log can be
compared.

`test/architecture.test.js` parses every import in `src/` and fails if
the rule is violated.

## Request flow (mutation)

```
POST /r/{id}/ops/handoff            Layer 0: parse, size-limit, content-type check,
  Authorization: Bearer …                    authenticate → principal
  {"expected_version": 7, "input": {…}}
        │
        ▼
store.invoke(actor, id, "handoff", body)    Layer 1
        │  1. look up operation in registry (unknown → 404, never eval)
        │  2. validate input against the operation's JSON Schema
        │  3. check lifecycle gate (e.g. archived resources reject writes)
        │  4. check expected_version (409 on mismatch — also replay defence)
        │  5. plan(): operation → list of primitive events
        │  6. authorise: ONE authority source must cover the rights of
        │     every primitive AND permit the operation name
        │  7. apply each primitive with the reducer on a copy; any failure
        │     aborts the whole invocation (atomicity)
        │  8. hash-chain, append, persist, notify subscribers
        ▼
201/200 operation-result (events, new version, links)
```

## Storage: event sourcing

The event log is the source of truth. State is a left fold:

```
state_n = reduce(apply, events[1..n], ∅)
```

Consequences, each used somewhere in the implementation:

- **Time travel** — `GET /r/{id}/state?at=n` replays to version *n*.
- **Diff** — `GET /r/{id}/diff?from=a&to=b` compares two replays.
- **Verification** — every event carries `prev` (previous event hash),
  `state_before`, `state_after` and its own `hash`. `GET /r/{id}/verify`
  replays the log and checks all four, which detects tampering with
  either events or stored state.
- **Research substrate** — the log *is* a time-indexed sequence of state
  transitions, which is exactly Layer 2's input type.

Trade-off acknowledged: replay cost grows with log length. The store keeps
the current state cached; `state?at=` replays from genesis (O(n)). Snapshots
are an obvious optimisation, deliberately not implemented yet (see
[RESEARCH_QUESTIONS.md](RESEARCH_QUESTIONS.md)).

Persistence is an append-only JSON-Lines file (`PURL_DATA_DIR`). On start
the log is replayed and verified; a broken hash chain refuses to load.

## Why these technology choices

- **Zero runtime dependencies.** The implementation must be small enough
  to read completely. Node's standard library provides HTTP, SHA-256,
  randomness and a test runner.
- **JSON Schema (2020-12 subset)** for every wire format, with a ~150-line
  validator in `src/core/schema.js`, so the schemas in `schemas/` are
  enforced rather than decorative.
- **Canonical JSON** (sorted keys; compatible with RFC 8785 JCS for the
  value space PURL uses) so hashes are reproducible across runs.

## Directory map

```
PRINCIPLES.md  SPEC.md  SECURITY.md  NOMENCLATURE.md  RESEARCH_QUESTIONS.md
docs/
  decisions/        architecture decision records (URL form, discovery, storage…)
  operations.md     operation algebra: primitives, compositions, aliases, properties
  authority.md      rights, roles, grants, delegation chains
  continuity.md     checkpoints, handoff, continuity packages, communication profiles
  prior-art.md      what PURL borrows and what (if anything) is new
  research/         measure definitions, experiment protocol
schemas/            JSON Schemas (resource, event, manifests, packages, records)
src/core            canonical JSON, ids, schema validator, errors
src/continuity      Layer 1
src/transport       Layer 0
src/research        Layer 2
public/             browser visualisations (driven by the machine interface)
experiments/        experiment definitions, raw data, run records, reports
scripts/            demo, experiment runner, reproducer
test/               node:test suites
```
