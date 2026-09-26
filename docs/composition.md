# Composition: PURL resources as computation nodes, ACSP as the envelope

This document describes the bridge built for experiment
[exp-0002](../experiments/exp-0002/REPORT.md): what exists in each protocol,
where the two meet, and what the bridge adds. It describes mechanism. The
results are in the report.

## 1. What each protocol already had (archaeology)

| Concept | PURL/0.1 (this repository) | ACSP/0.1 ([NetGovComEduGovOrgEduGovComNet](https://github.com/akadaan310/NetGovComEduGovOrgEduGovComNet)) |
|---|---|---|
| Resource | `/r/{id}`: an event-sourced record with a free-form `state` object, collections, grants, relations | `/r/{12-char id}`: a continuity surface holding TOKs, handoffs, proposals, checkpoints |
| Operation | fixed registry of named state transitions on **one** resource, compiled to nine primitives (`src/continuity/operations.js`); names are looked up, never evaluated | fixed registry (`src/protocol/operations.ts`) of envelope-POSTed operations |
| Capability / authority | rights on grants with attenuating delegation chains; one authority source per invocation | bearer capabilities bound to one resource and one session, with scopes; owner vs. delegation |
| State | `state` (JSON Merge Patch), `collections`, `relations`, `derived_from` | rows: resources, toks, annotations, handoffs, proposals, checkpoints |
| Event | per-resource hash chain: `prev`, `state_before`, `state_after`, `hash` | append-only rows `(resource, version)` with actor, `identity_assurance`, `request_hash`; **not** hash-chained |
| Hash | `state_hash = sha256(canonical JSON of the entire resource record)` — id, timestamps, owner, version, grants, relations included | checkpoint `sha256 = sha256(canonical JSON of snapshot)` |
| Checkpoint | `checkpoint` op appends a package (claims) next to a server-verified `{resource, version, state_hash}` | numbered snapshot of the resource with its hash; version and checkpoint are separate counters |
| Provenance | every event records `actor` and the full authority chain | every event records the actor session, capability id, `identity_assurance`, `on_behalf_of` |
| Cross-resource reference | `link` (`references`, `supersedes`, `parent`) pinned to a version; `fork` → `derived_from {resource, version, state_hash}`; inbound links indexed | TOK `refs`: `{tok}`, `{url}` or `{citation}`, stored verbatim, never dereferenced |
| Handoff | `handoff` = checkpoint + optional grant + `assign`; ownership unchanged | `handoff` of a task TOK, effective only on `acknowledge` by the addressee; grants no authority |
| Persistence | append-only JSON-Lines log, replayed and verified on load | PostgreSQL / PGlite, append-only enforced by trigger |

Neither protocol had any notion of *computing* something: PURL stores what a
principal writes; ACSP stores what a session claims.

## 2. The integration point

The smallest place where the two meet without changing either:

- **PURL side:** a computation node is an ordinary PURL resource. Creating
  one uses `create` (genesis state) and `link` (one `references` relation per
  operand, pinned to a version). Updating one uses `update`. Reading one uses
  the existing projections (`/state?at=`, `/verify`, `/lineage`).
- **ACSP side:** a computation task is an ordinary ACSP task TOK whose
  `content` is JSON text and whose `refs` are the PURL URLs. Results are
  `finding` TOKs; checks are `validation` / `dispute` annotations;
  responsibility moves by `handoff` + `acknowledge`; authority by `delegate`.

Neither server knows the other exists. The PURL operation vocabulary is
unchanged; a test compares `hashOf(vocabulary())` with its value at the
pre-registration commit. ACSP's code is unchanged except for a local HTTP
wrapper for experiments (`harness/serve.ts`) and a harness scenario.

## 3. Representation

A node's `state` ([`schemas/compute-node.schema.json`](../schemas/compute-node.schema.json)):

```json
{ "compute": "purl.compute/0.1", "node": "literal", "value": "0" }

{ "compute": "purl.compute/0.1", "node": "application", "operation": "XOR",
  "operands": [ { "resource": "r_…", "version": 2, "state_hash": "sha256:…" },
                { "resource": "r_…", "version": 2, "state_hash": "sha256:…" } ],
  "value": "1",
  "evaluator": "purl.compute/0.1 reference evaluator (src/compute/algebra.js)" }
```

Why this form and not another the prompt listed:

- **Not the URL path or query.** PURL URLs name resources and operations on
  one resource; a computation over several resources has no URL form in
  PURL/0.1, and encoding one would be a protocol change.
- **Not a new operation.** PURL's registry is closed and every operation acts
  on one resource. A server-side `compute` would be a protocol change.
- **Resource document + pins + links.** `state` carries the claim and the
  pins; `link` gives the existing reverse index (`/lineage` → `inbound`),
  which is what makes "which nodes depend on A?" answerable without a scan.
- **No content-addressed identifier.** PURL has none (ids are random or
  sequential); the bridge does not add one. Merkle-style hashes are computed
  only as baselines, outside the substrate.

Consequences built into the representation, stated here so no one mistakes
them for results:

- The **value of an application is a claim** by the principal that created
  the resource. The server validates nothing about it.
- **Verification** = read each operand at its pinned version, compare its
  state hash with the pin, re-evaluate, compare with the recorded value,
  recursively (`Composer.verify` / `verifyMany`).
- An application node costs 1 `create` (genesis + public-read grant = 2
  events) + 1 `link` event per distinct operand.

## 4. Modules

```
src/compute/            imports src/core only (enforced by test/architecture.test.js)
  algebra.js            NOT AND OR XOR CONCAT HASH over bit strings; operand schemas; no normalisation
  ports.js              StorePort (in-process Store) and HttpPort (any PURL/0.1 server); counted reads/writes
  composer.js           literal, apply, verify, verifyMany, dependents (index), dependentsByScan,
                        stale, recomputePathCopy (new nodes + supersedes links), recomputeInPlace
  commitments.js        value hash, merkle-by-value, merkle-by-identity (baselines), record diffs
src/bridge/             imports core and compute; speaks HTTP to ACSP
  acsp.js               an ACSP/0.1 session; re-derives checkpoint hashes with PURL's canonicaliser
  agent.js              one agent turn (below)
schemas/                compute-node, compute-task, compute-result, composition-record
scripts/
  composition-experiment.js   the exp-0002 runner (writes the record)
  lib/composition.js          measurement procedures
  lib/composition-hypotheses.js   mechanical evaluation of the pre-registered criteria
  lib/handoff.js              owner + two agent processes + PURL + ACSP
  agents/compute-agent.js     one agent as an OS process
  acsp-handoff.js             `npm run handoff`
  build-blind-packet.js       the independent-agent packet
  serve-inspection-instance.js  live instances for the independent agent
  reproduce-composition.js    `npm run reproduce -- exp-0002`
```

## 5. The handoff

```
owner (this process)            ACSP (child: tsx harness/serve.ts)          PURL (this process)
  create literals A=0, B=1  ───────────────────────────────────────────────►  r_A, r_B (public read)
  create task resource ───────► v1
  append task TOK (content = compute-task JSON, refs = PURL URLs) ► v2
  delegate A [append, annotate, checkpoint, handoff] ► v3 (token out of band)
  handoff TOK-001 → session-a ► v4
Agent A (child process; knows: ACSP URL, its token, its session id)
  GET resource → viewer scopes, operations, pending handoff
  acknowledge ► v5 (A responsible)
  read task JSON → PURL instance → register its own PURL principal
  verify every checkpoint hash; verify every earlier result (none)
  C = XOR(A,B) ─────────────────────────────────────────────────────────►  r_C (pins, links)
  append finding (content = compute-result JSON with pin; refs = r_C URL) ► v6
  checkpoint ► v7;  handoff → session-b ► v8
owner: delegate B ► v9
Agent B (child process; knows: ACSP URL, its token, its session id)
  acknowledge ► v10
  verify every checkpoint hash (PURL canonicaliser); for A's finding:
    schema, same instance, pin state hash = PURL state at pinned version,
    ACSP claim = PURL value, cone verifies, operation matches
  annotate validation (or dispute) ► v11
  if verified: D = XOR(C,B) ────────────────────────────────────────────►  r_D
  append finding ► v12; checkpoint ► v13; handoff → owner ► v14
  try to append as another session → 403 session_mismatch
owner: acknowledge ► v15; re-verify every result and checkpoint itself
```

Two fault-injected runs repeat this with Agent A either misreporting the
value in ACSP (PURL node honest) or recording a wrong value in its PURL node
(ACSP claim consistent with it). In both, Agent B verifies before building.

## 6. Running it

```bash
npm test                         # includes test/compute.test.js and test/bridge.test.js
npm run handoff                  # the three handoff runs, printed (needs the ACSP checkout: ACSP_DIR)
npm run composition              # the full exp-0002 run → experiments/exp-0002/record.json
npm run reproduce -- exp-0002    # re-run and compare every hashed section
```

The ACSP checkout defaults to `../NetGovComEduGovOrgEduGovComNet` with its
npm dependencies installed; `test/bridge.test.js` is skipped, with a reason,
when it is absent.
