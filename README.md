# PURL — Programmable URL Protocol

> A URL can address a **stateful resource and the operations on it** —
> with authority, provenance and continuity explicit — not only a document.

PURL is a small protocol and a zero-dependency reference implementation
(Node.js ≥ 20, standard library only). A person opening a PURL in a
browser sees a readable page. A machine requesting the same URL with
`Accept: application/purl+json` gets a document that says:

- **what this is** — `{"protocol": "PURL/0.1", "kind": "resource", "type": "research-session", "version": 11, …}`
- **what can be done** — every operation, with its JSON Schema, required
  rights, effects and **whether *you* may do it now, and via which grant**
- **what happened** — a hash-chained event log you can replay yourself
- **where it came from** — forks, merges, supersessions, delegation chains
- **what was handed to you** — the latest checkpoint addressed to you,
  with the preparer's claims separated from server-verified facts

Beneath the protocol sits a **research substrate** for observing state
transitions — including PURL's own event logs — without assigning them
meaning prematurely. Its first pre-registered experiment is in
[`experiments/exp-0001`](experiments/exp-0001/REPORT.md): 8 of 11
hypotheses supported, 3 not, and all three failures traced to
representation choices.

## Quick start

```bash
npm test                  # 58 tests: protocol, authority, HTTP, research, demo, reproducibility
npm run demo              # the end-to-end scenario below, over HTTP, narrated
npm start                 # http://127.0.0.1:8080  (PORT, HOST, PURL_DATA_DIR to persist)
npm run reproduce -- exp-0001   # re-derive the experiment and compare hashes
```

No `npm install` is needed. There are no dependencies.

## A 60-second tour for machines

```bash
H='Accept: application/purl+json'
curl -s -H "$H" localhost:8080/.well-known/purl | jq '.endpoints, (.vocabulary.operations | length)'

TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"kind":"agent","label":"me"}' localhost:8080/principals | jq -r .token)
AUTH="Authorization: Bearer $TOKEN"

ID=$(curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"type":"research-session","state":{"title":"demo"}}' localhost:8080/r | jq -r .resource.id)

curl -s -H "$H" -H "$AUTH" localhost:8080/r/$ID/manifest \
  | jq '.operations[] | select(.safe|not) | {name, available, requires: .requires.rights}'

curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"expected_version":1,"input":{"collection":"findings","body":{"claim":"hello"}}}' \
  localhost:8080/r/$ID/ops/append | jq '.events'

curl -s -H "$H" localhost:8080/r/$ID?action=append    # 405: GET never mutates
curl -s -H "$H" -H "$AUTH" localhost:8080/r/$ID/verify | jq '.valid'
```

## The demonstration (`npm run demo`)

Run by a generic client (`src/client/client.js`) that discovers every
operation URL and body shape from manifests:

1. A human creates a resource and delegates a scoped task to **Agent A**.
2. Agent A opens the URL, reads the manifest, sees what it may and may
   not do; appends a finding (allowed), is refused `update` (not
   delegated) — exactly as the manifest predicted.
3. Agent A **hands off** to **Agent B**: checkpoint + attenuated grant +
   assignment, atomically. The owner does not change.
4. Agent B reads the **continuity view**: the checkpoint addressed to it,
   whether its state hash matches the log, the package marked as claims.
5. Agent B performs the delegated operation. Its event records the chain
   `g_B → g_A`. B's attempts to transfer ownership or widen grants are refused.
6. The human **replays the log independently** and checks every hash.
7. B **forks**; the fork has lineage but no copied grants. B edits the
   branch. A **supersedes** its first finding — the original stays.
   The human **merges** the branch; the merge is recorded as `merged_from`.

## Architecture

```
Layer 0  Transport    src/transport   URLs, HTTP, negotiation, manifests, HTML, SSE
Layer 1  Continuity   src/continuity  event-sourced resources, authority, operations, continuity
Layer 2  Research     src/research    projections, measures, graphs, grammars, surrogates, records
         Core         src/core        canonical JSON, hashing, ids, schema validation
         Client       src/client      manifest-driven client with independent replay
```

Layer 1 and Layer 2 never import each other (enforced by
`test/architecture.test.js`); the bridge is an explicit, named
*projection* of an event log into a symbol sequence. See
[ARCHITECTURE.md](ARCHITECTURE.md).

## Invariants

Each is enforced by a mechanism and checked by a test — see
[PRINCIPLES.md](PRINCIPLES.md).

Continuity does not imply identity · Reference does not imply ownership ·
Awareness does not imply authority · Access does not imply control ·
Handoff does not imply merger · Observation does not imply interpretation ·
Interpretation does not imply conclusion · Delegation does not erase
provenance · Forking does not destroy lineage · Supersession does not
require deletion.

## Documents

| Deliverable | Where |
|-------------|-------|
| Principles | [PRINCIPLES.md](PRINCIPLES.md) |
| Specification | [SPEC.md](SPEC.md) |
| Operation algebra | [docs/operations.md](docs/operations.md) |
| Resource schema | [schemas/resource.schema.json](schemas/resource.schema.json) |
| Capability manifest schemas | [schemas/instance-manifest.schema.json](schemas/instance-manifest.schema.json), [schemas/resource-manifest.schema.json](schemas/resource-manifest.schema.json) |
| Event schema | [schemas/event.schema.json](schemas/event.schema.json) |
| Authority / ownership model | [docs/authority.md](docs/authority.md) |
| Continuity / handoff model | [docs/continuity.md](docs/continuity.md), [schemas/continuity-package.schema.json](schemas/continuity-package.schema.json), [schemas/communication-profile.schema.json](schemas/communication-profile.schema.json) |
| Reference implementation | [src/](src/) |
| Browser demonstration | `npm start` → `/`, `/r/{id}`, `/lab` |
| Machine-readable endpoints | `/.well-known/purl`, `/r/{id}/manifest`, `/r/purl-protocol` |
| Binary transition experiment | [experiments/exp-0001/](experiments/exp-0001/) |
| Transition graph visualisation | `/lab`, and each resource page's *Event transitions* section |
| Reproducible experiment record | [experiments/exp-0001/record.json](experiments/exp-0001/record.json), [schema](schemas/experiment-record.schema.json) |
| Measures (definitions, units, limitations) | [docs/research/MEASURES.md](docs/research/MEASURES.md) |
| Security | [SECURITY.md](SECURITY.md) |
| Architecture and decisions | [ARCHITECTURE.md](ARCHITECTURE.md), [docs/decisions/](docs/decisions/) |
| Nomenclature | [NOMENCLATURE.md](NOMENCLATURE.md) |
| Prior art / novelty accounting | [docs/prior-art.md](docs/prior-art.md) |
| Unresolved research questions | [RESEARCH_QUESTIONS.md](RESEARCH_QUESTIONS.md) |

## What the first experiment found, briefly

- The measurement pipeline behaves correctly on calibration sources:
  no structure in i.i.d. data; first-order structure fully explained by a
  Markov-1 null; compressibility of biased data **not** mistaken for
  structure; timing structure detected where symbols have none; encoding-
  and unit-dependent measures identified by invariance tests.
- **Three pre-registered hypotheses failed**, each because of a
  representation choice made by the author: a transition-matrix tolerance
  that ignored slow hidden dynamics (H2), an exact-string convergence
  metric blind to phase (H8), and a boundary criterion with an infeasible
  ceiling under a projection that merged five operations into one symbol
  (H10). The report analyses each from the preserved raw data.
- Nothing in the results bears on meaning or intelligence; every positive
  result is an established measure behaving as established theory says.

## Status and limits

PURL/0.1 is a research prototype. Principals are server-issued bearer
tokens, not verified identities; events are hash-chained but not signed;
storage is a single JSON-Lines file; the name collides with existing
"PURL" uses. See [SECURITY.md](SECURITY.md) and
[RESEARCH_QUESTIONS.md](RESEARCH_QUESTIONS.md).

