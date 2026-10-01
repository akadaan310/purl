# Architecture of the bridge (the circle)

Code: `purl/src/circle/` (layer rule: imports only `core`, `client`, `circle`).
Launch: `SUBSTRATE_DIR=../substrateIO ACSP_DIR=../NetGovComEduGovOrgEduGovComNet npm run circle`.
Entry URL: `GET /` (JSON; HTML with clickable hrefs for `Accept: text/html`).

## Epistemic ledger

| | |
|---|---|
| Established | The four ACSP invariants and GET-safety are existing, tested properties of ACSP/0.1 and PURL/0.1. They are cited, not re-derived. |
| Implemented | Every arrow in the table below, through named adapters. |
| Observed (in this repository's runs) | The arrows execute end to end against real processes: `test/circle.test.js` (11 tests), `circle/experiments/e2e/record-{1,2,3}.json`. |
| Simulated | All actors in those runs are scripts or subagents. The ACSP used is a local in-memory instance. The Golden Surface phone is a FakePhone. |
| Hypothesized | That this arrangement is the *right* one. The diagram in the directive was a hypothesis, and §2 below records where it changed. |
| Unresolved | The phone→circle arrow with a real Android WebView. Cross-provider participants. Owner-latency on ACSP proposals. |

## 1. What changed from the directive's diagram

The directive drew a single vertical chain: AI → SEURL → Golden Surface → PURL →
ACSP → SubstrateIO. Running the systems showed two corrections.

1. **Golden Surface is not on the computation path.** It is a *client*, a place
   where a URL is opened. The computation path is
   SEURL → substrate (typed term, value) → PURL (Scroll record) → ACSP (continuity) → substrate (observation).
   Golden Surface can open any circle URL (http) in an owned tab. It cannot
   open `seurl://` (its owner's routing seam refuses non-web schemes, by spec),
   and it has no write path into the circle. Evidence: `experiments/golden/record-1.json`.
2. **"PURL" is two layers.** Values are addressed by substrateIO's derivation
   paths (`substrate-purl/0`). Records (Scrolls, checkpoints, conformance
   runs, amendments) are PURL/0.1 *resources*. A Scroll is a record that
   *holds* value addresses. Neither layer implements the other.

```
                         constitution-v1.json  (clauses K-01..K-19, content-addressed)
                                   │ checked by conformance.js (POST /conformance/runs)
                                   ▼
 AI session ──GET/POST──► circle  /seurl/…  (FSM over the URL path; pure on GET)
   (or Golden Surface tab)   │
                             ├─(1) adapter.substrate  GET /term/<addr>      typed term, derivation_id
                             ├─(2) adapter.substrate  GET <addr>            value, value_id
                             ├─(3) PurlClient          POST /r (type scroll) Scroll record (PURL/0.1)
                             ├─(4) adapter.substrate  POST <addr> per step execution records
                             ├─(5) adapter.acsp       GET prepare_propose → POST propose   (prepared → submitted)
                             ├─(6) adapter.substrate  POST /observations  P-ACSP-EV-1 over ACSP events
                             └─(7) PurlClient          POST /r (circle-checkpoint) → GET /resume/{id}
```

## 2. Every arrow

| # | Arrow | Input → output | Identity boundary | Authority boundary | Provenance | State | Failure | Test / evidence |
|---|---|---|---|---|---|---|---|---|
| 0 | session → circle | URL → JSON document with `moves` | session id is **declared** (`?session=`), stored as `assurance: asserted`, never inferred | none needed for GET. POST needs a declared session but no credential. Credentials in URLs → 400 | every document carries the constitution content id | none (the circle stores nothing itself) | 4xx with `legal` moves; 503 `unavailable_here` | K-01, K-02, K-06 checks; `circle.test.js` "fresh participant" |
| 1 | SEURL → typed term | path → `{kind, steps, derivation_id}` | address_id ≠ derivation_id (`/term`) | none (pure) | derivation_id = H(op, op version, args) | none | ill-sorted → substrate 404/422 forwarded as `ill_typed` | `test_purl_terms.py`; "SEURL → typed term" test |
| 2 | term → value | address → value envelope | value_id (canonical per kind) | none (pure) | operation versions, environment_id | none | 409 not materialized, 501 unavailable | substrate `test_purl*.py` |
| 3 | program → Scroll | SEURL path (POST …/COMMIT) → PURL resource `scroll` | Scroll id (record) ≠ value_id ≠ derivation_id | owner = the circle's PURL principal; author = declared session. New versions are forks; the parent is never written (K-03) | PURL hash-chained event log; `verify` replays it | PURL event-sourced resource | PURL refusal → 403 `not_authorized` / 502 | K-03, K-12 checks; client-side replay `scroll_log_verifies` |
| 4 | Scroll → executions | each step address → substrate execution record | execution_hash = H(derivation, environment, code, occurrence); value_id shared across scrolls (K-11) | none (append-only record) | code_hash, git state, environment | substrate `.purl-store` (append-only) | first failing step stops the build, is kept as `failure`, outcome `FAILED` | K-11 check; E2E record `reruns: reproduced` |
| 5 | Scroll → ACSP | TOK (type `observation`) projected from the Scroll → **pending proposal** | ACSP actor session = declared session (`asserted`); TOK refs cite scroll URL + derivation_id | circle holds **no** ACSP capability and submits only `propose`; commitment is the owner's (K-04, K-08) | ACSP event with request_hash and idempotency key | ACSP resource version +1 (exactly) | invalid intent stops at `prepared`; ACSP down → `unavailable_here` | K-04, K-08; integration test asserts version +1, proposal pending, 0 TOKs |
| 6 | ACSP → SubstrateIO | ACSP event list → observation (P-ACSP-EV-1) | observation id (record); deterministic hash excludes wall clock | none (append-only record) | projection declaration: source, transformation, lost, clock, resolution | substrate observations.jsonl | malformed source → 422 | `test_acsp_events.py` (live snapshot fixture) |
| 7 | → checkpoint → resume | live state → content-addressed checkpoint (PURL resource) → resume doc | checkpoint content_id = H(state) | reading is free; rebuilding needs the same circle principal (token persisted beside the PURL store) | commits, constitution id, protocols, scrolls+versions, environment_id, ACSP version | PURL resource | integrity checked on resume (`intact`), constitution change and scroll drift reported | E2E record (resume in a new process + rebuild = reproduced) |
| 8 | Golden Surface ↔ circle | circle URL → tab text | tab owner = seat | seat token (env only); drive own tabs only (403 otherwise); any seat may read any tab | relay event ledger | relay twin / SQLite | phone offline → 503/202 queued; non-web scheme → 422 | `experiments/golden/record-1.json` (FakePhone) |

## 3. Constitutional orientation at task boundaries (implemented, partially)

Every circle document carries `constitution.{version, content_id}`. Every
Scroll records the constitution id it was committed under. Every checkpoint
records it, and `resume` reports `constitution_changed`. So a session that
resumes against a changed constitution sees the change. What is **not**
implemented is re-running conformance automatically at each task boundary. It
runs on `POST /conformance/runs`, in the test suite, and in `npm run
circle:conformance`.

## 4. Not built, on evidence

* MLIR, LLVM, Tree-sitter, Wasmtime adapters. No existing operation needs them.
  The substrate's `requires` + `501 unavailable_here` path is the slot for them.
* Code-as-value for TypeScript, Python and shell sources. Operations already
  carry `implementation` refs (surface, locator, sha256 digest) in the
  substrate registry. Making arbitrary source files addressable values was not
  needed by any arrow above, and is an open item (CURRENT-STATE.md).
* An agent hierarchy. Participants use the environment directly. Nothing in
  the circle spawns or manages agents.
