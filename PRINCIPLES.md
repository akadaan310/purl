# PURL Principles

This document states the principles PURL is built on. Each principle is
paired with **the mechanism that enforces it** and **the test that checks
it**. A principle without a mechanism is an aspiration; aspirations are
listed separately at the end so the two are never confused.

## 1. Foundational stance

> A URL can function as an addressable transport surface for state,
> operations, delegation, continuity and machine-readable interaction —
> not only as a pointer to a document.

PURL treats that sentence as a **design claim to be tested**, not as a
fact. Most of its parts already exist (REST, hypermedia, capability
systems, event sourcing, W3C PROV). What PURL contributes is a specific
*composition* of them, aimed at clients that must discover how to operate
a resource without being taught. See [SPEC.md](SPEC.md) §1 and
[docs/prior-art.md](docs/prior-art.md) for what is borrowed and what is new.

## 2. Every interaction is a state transition

Every mutation of a resource is recorded as an immutable **event**
(`stateₙ₋₁ → eventₙ → stateₙ`). The current state is a *projection* of the
event log, never the other way around.

- Mechanism: `src/continuity/reducer.js` (pure `apply(state, event)`),
  `src/continuity/store.js` (append-only log, hash-chained).
- Test: `test/continuity.test.js` — "replay reconstructs every version".

## 3. The ten architectural invariants

| # | Invariant | Mechanism | Test |
|---|-----------|-----------|------|
| I1 | **Continuity does not imply identity.** | A handoff moves a *continuity package* between principals; principals never merge, and the package's `profile` is labelled as a specification of observable behaviour, not a transfer of identity. | `continuity.test.js` "handoff does not change identity or ownership" |
| I2 | **Reference does not imply ownership.** | Links (`derived_from`, `supersedes`, `references`) are stored on the *referencing* resource; the referenced resource is not mutated and grants nothing. | `structure.test.js` "linking to a resource grants nothing" |
| I3 | **Awareness does not imply authority.** | The `observe` and `read` rights are separate from every mutating right; `acknowledge` requires `append`, not `read`. | `authority.test.js` "reader cannot mutate" |
| I4 | **Access does not imply control.** | Opening a URL (`GET`) never mutates state — enforced in the router: only `POST …/ops/{op}` can reach the store's `invoke`. | `http.test.js` "GET is safe" |
| I5 | **Handoff does not imply merger.** | `handoff` = `append(checkpoint)` + optional `grant` + `assign`. It changes `assignee`, never `owner`, and never combines principals. | `continuity.test.js` |
| I6 | **Observation does not imply interpretation.** | Layer 2 outputs are tagged by epistemic category; raw data is stored separately from measurements. | `experiment.test.js` "an experiment rerun … reproduces" (asserts empty interpretation/conclusion sections); `experiment-record.schema.json` |
| I7 | **Interpretation does not imply conclusion.** | Experiment records have pre-registered hypotheses evaluated mechanically; the `conclusions` field is never written by the runner (schema: `maxItems: 0`). | `experiment.test.js`; `research.test.js` "hypothesis criteria evaluate…" |
| I8 | **Delegation does not erase provenance.** | Every grant stores its `parent` grant; every event stores the full authority `chain` that authorised it. Revocation cascades down the chain. | `authority.test.js` "delegation chain is recorded" |
| I9 | **Forking does not destroy lineage.** | A fork's genesis event records `derived_from {resource, version, state_hash}`; the source is untouched; grants are *not* copied. | `structure.test.js` "fork preserves lineage" |
| I10 | **Supersession does not require deletion.** | `supersede` appends a new entry pointing at the old one. Nothing is removed; `superseded_by` is a computed view. | `structure.test.js` "supersede keeps the original" |

## 4. Epistemic categories are never collapsed

The research layer distinguishes five categories and labels every output
with one of them:

1. **observation** — raw data as recorded (symbols, timestamps, events).
2. **transformation** — a deterministic function of observations
   (entropy estimate, transition matrix, grammar). Documented in
   [docs/research/MEASURES.md](docs/research/MEASURES.md) with definition,
   assumptions, domain, units, interpretation and limitations.
3. **interpretation** — a claim about what a transformation means.
   Always human- or rule-authored, always attributed.
4. **hypothesis** — a falsifiable statement registered *before* a run,
   with a machine-evaluable criterion.
5. **conclusion** — a judgement after inspecting evidence. Only humans (or
   explicitly identified agents) write these, in a separate report.

## 5. The protocol must be able to disprove its authors

- Every experiment ships with **negative controls** (i.i.d. data) and
  **surrogate data** (shuffles, Markov surrogates) so that apparent
  structure can be attributed to — or shown to be an artefact of — the
  representation.
- Measures are checked for **invariance** under representation changes
  (symbol relabelling, time rescaling). A measure that changes under
  relabelling is reporting on the encoding, not the process.
- Compression is not meaning. Grammar inference output carries
  `semantic_interpretation: null` by construction.

## 6. Protocol before interface

The machine interface (JSON representations, manifests, schemas) is the
protocol. The HTML interface is generated *from* the machine interface and
must never contain an affordance the manifest does not describe. The
browser console in `public/resource.js` builds its operation forms from
the manifest at runtime; there is no hand-written button for any operation.

## 7. Discoverability, authentication, authorisation and execution are separate steps

1. **Discoverability** — anyone may learn *that* an operation exists and
   what it requires (`/.well-known/purl`, manifests).
2. **Authentication** — a bearer token (header only, never in a URL)
   binds a request to a principal.
3. **Authorisation** — the principal's authority sources (owner, grant
   chain, administrator) are evaluated against the operation's required
   rights *and* its name.
4. **Execution** — only after (1)–(3), and only via `POST`, with an
   `expected_version` precondition.

## 8. Established vocabulary first

New terms are introduced only when no established term fits, and each is
recorded in [NOMENCLATURE.md](NOMENCLATURE.md) with definition, type,
scope, relationship to existing terms, motivation, examples and
non-examples.

## Aspirations (not yet enforced by mechanism)

- Cryptographic principal identity (signed events, verifiable across
  instances). Currently principals are server-issued bearer tokens.
- Cross-instance references that can be verified without dereferencing.
- A formal proof that the operation set is minimal. Currently minimality
  is argued, not proved (see [docs/operations.md](docs/operations.md)).
