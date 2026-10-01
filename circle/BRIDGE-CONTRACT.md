# Bridge contract (normative, STASIS-2)

"MUST" statements here are enforced by a named check, or marked **(declared)**
when no mechanical check exists. The test matrix (§9) gives the evidence for
each boundary. Supersedes nothing: `INTEGRATION-CONTRACT.md` (STASIS-1) stays
as history and is consistent with this document.

## 1. Responsibilities

| System | Is responsible for | Is NOT responsible for |
|---|---|---|
| **SEURL** | the notation of programs as move words (START SWITCH WRITE COMMIT BUILD TALK PERTURB) and their FSM (MUSA `url-machine.md`). Executable in `purl/src/circle/seurl.js`; the `seurl` repo holds the halt page | storage, typing, execution, authority. The `seurl://golden` addresses belong to Golden Surface, not to this notation |
| **PURL** | records: Scrolls, checkpoints, conformance runs, amendments as PURL/0.1 resources (hash-chained events, grants, forks, replay) | computing values; continuity across sessions; meaning |
| **substrateIO** | values (substrate-purl/0): typed terms, evaluation, identity (address/derivation/value/environment), execution records, declared projections, observations, epistemic status, nomenclature registry | authorship, publication, application semantics. It never decides what an observation means |
| **ACSP** | published continuity: TOKs, proposals, handoffs, checkpoints, capabilities, owner decisions | values, programs, execution. It never merges identities |
| **Golden Surface** | the embodied client: tabs on a phone, the relay, ownership by seat, the twin, the bus, Najwa (a live witness surface) | authority over substrate records; credentials leaving the phone; being the source of truth |
| **MUSA** | specification sources (`url-machine.md`, NAI-CI, constitution v1) and prototypes outside the bridge (`shell.py`, `loom.py`, `ramz.py`) | anything the bridge executes. **`shell.py` (`POST /exec`, arbitrary shell) MUST NOT be reachable from the bridge** (declared) |

## 2. What may cross, and what may not

| Crosses | Never crosses |
|---|---|
| addresses, typed terms, value ids, execution records, PURL record URLs, ACSP proposals, observation documents, git commit projections | capability tokens, seat tokens, passwords, cookies, PURL principal tokens (K-06, K-07, `no_secret_in_records`, golden token test) |
| a declared session id, labelled `asserted` | an inferred identity; authority derived from possession of a URL (K-02, K-06) |
| an ACSP **proposal** | an ACSP commit by anyone but the resource owner (K-04, K-08) |
| a Golden Surface tab URL that the seat owns | control of another seat's tab (golden 403 test); a page driving the Surface through `seurl://golden` (engine branch: address bar and relay only) |

## 3. Adapters: what survives A → B

| A → B | Input | Output | Lost | Preserved | Identity transformation | Authority effect | Side effect | Reversible | Validation |
|---|---|---|---|---|---|---|---|---|---|
| SEURL → PURL (COMMIT) | move word | `scroll` resource | nothing of the program; the FSM state is recomputable from the text | program text, steps, typed term's derivation_id, author (asserted), constitution id, content_id | text → record id (new); content_id = H(text); derivation_id carried | creates a record owned by the circle's principal, authored by the session | 1 PURL resource | no (append-only); superseded only by fork | K-02, K-03, `scroll_log_verifies` |
| SEURL → substrate (PARSE/RESOLVE) | value address | term; value | the session's FSM state (not the substrate's concern) | address, derivation | address → address_id, derivation_id, value_id | none | none | yes (pure) | `test_purl_terms.py` |
| PURL → substrateIO (BUILD) | scroll step addresses | execution records | the scroll's authorship (stays in PURL) | derivation, value, environment, code hash | → execution_hash per occurrence; value_id shared | none | append-only substrate store | no | K-11, E2E `reproduced` |
| PURL → ACSP (TALK) | scroll + last build | TOK in a pending proposal | execution ids, environment, code hash, PURL event log (only the URL survives) | scroll URL, program, address, derivation_id, per-step value_id + status, asserted session | record → ACSP proposal id; refs keep URL + derivation_id | proposal only; ACSP version +1 | 1 ACSP event | no; the owner may reject | K-04, K-08, integration test |
| ACSP → substrateIO (OBSERVE, P-ACSP-EV-1) | ACSP event list | observation | data, summaries, agent_id, capability_id, on_behalf_of, request bodies, wall clock (from hashes) | version order, operation labels, actor sessions, assurance, request_hash | events → observation_id + deterministic hash | none | append-only substrate store | no | `test_acsp_events.py` |
| ACSP → PURL-addressable view | ACSP resource | `/acsp/r/{id}` document | TOK content | record id@version, checkpoint snapshot hashes as values | record stays record; checkpoint hash as value_id | none (reading confers nothing) | none | yes | `get_sweep_changes_nothing` |
| Golden Surface → PURL / circle | a tab opening a circle http URL | tab text (`read`) | everything structural (`read` = url/title/text) | URL | none: a view | seat may drive only its own tab | relay ledger | yes | `test/golden.test.js` |
| Golden Surface → ACSP | **NOT IMPLEMENTED**: no adapter. A tab can *open* an ACSP prepare URL (an http page), and the human submits the form | — | — | — | — | the human submits; the Surface grants nothing | — | — | not testable here (no phone, relay unreachable) |
| MUSA → bridge | `url-machine.md`, seurl halt page | the executable FSM's specification | prose context | verbs, transitions | none | none | none | yes | `test/musa.test.js` |
| bridge → nomenclature | terms found while building | registry entries C-0xx | — | definition, established mapping, status, evidence | — | none | substrateIO registry commit | yes (revision_history) | `tools.validate` |
| git → bridge (PROJECT) | commit | addressed transition | a clock position (git is a DAG); file contents | parent, tree id, author, subject, diffstat | commit → content_id = tree id | none | none (read-only `git show`) | yes | `/git` route; coverage matrix |

## 4. No hidden semantics (declared boundaries)

| Boundary | Declared by |
|---|---|
| URL → program | `seurl.js` `parseMoves` + FSM (`run`) |
| program → term | substrate `parse()` (`GET /term/…`) |
| term → execution | substrate `evaluate()` in environment `environment_id` |
| execution → observation | named projection (`P-ACSP-EV-1`) with its declaration (`/projections`) |
| event → transition | `bridge.js` projectors (`P.purl`, `P.acsp`, …) with `lost` fields |
| program → program | named transformer with a version hash (`/programs/transformers`) |

## 5. Approval is not conformance

The bridge never blocks a transition to wait for approval. Conformance is
**recorded**, not requested: `POST /conformance/runs` derives statuses after the
fact. Two things do wait, and neither is a constitutional gate:
* ACSP commitment waits on the **resource owner**. This is ownership, an ACSP
  invariant, not approval of a transition.
* Changing the **constitution itself** goes through an amendment path (K-13).

K-18's conflict is therefore narrower than recorded at STASIS-1. It concerns
ownership of shared records, not approval of transitions (amendment proposal
A-002, BRIDGE-CONSTITUTION.md §4).

## 6. Provider-neutral external participant interface

A participant needs only HTTP GET (to read and prepare) and, optionally, POST
(to perform). It discovers everything from `/` and `/sdk`. Nothing names or
requires a provider. A human may open the entry URL in any provider's session
(ChatGPT, Claude, Gemini, Muse, Google AI Mode, a custom agent). The bridge
**MUST NOT** automate a provider's consumer interface (K-16, declared). A GET-only
participant hands its prepared POST URLs to a human (EXP-CIRCLE-FRESH condition C).

## 7. Android client contract (boundary only: NOT IMPLEMENTED on the device)

Minimum for Golden Surface (Android) as a client of the bridge:

| Need | Contract | Status |
|---|---|---|
| discovery | open `http(s)://<circle>/` in an owned tab; JSON, or HTML with links | possible today over http; **NOT TESTED on a phone** |
| open a program | open `/seurl/…` as an ordinary http URL. `seurl://` stays refused on main; on the engine branch only `seurl://golden` resolves | main: refused (tested with FakePhone) |
| continuity | ACSP prepare URLs open as pages; **Abed submits by hand** (fingers are the authority for anything that needs a credential) | by design; untested on device |
| live test observation | open `/observatory` (HTML refreshes) or `/tests` | untested on device |
| never | credentials in relay state or URLs; the relay granting authority because a tab can see a page | relay token test; `/state` field whitelist test |

Prerequisite that does not exist yet: a circle reachable from the phone
(LAN or tunnel). Localhost is not reachable from the phone.

## 8. Najwa

Najwa is a witness and coordination surface. It is **never** authoritative. A
conference turn that refers to bridge state should carry the bridge URL. The
state is whatever that URL resolves to, not the turn text.

## 9. Test matrix

| Boundary | Test | Expected | Actual | Evidence |
|---|---|---|---|---|
| SEURL → PURL | commit a program; fork it under another session | record created; parent untouched; author asserted | PASS | `circle.test.js`; checks `author_assurance_is_asserted`, `fork_leaves_parent_unchanged` |
| SEURL → substrate | ill-typed program | `ill_typed` from the substrate, nothing written | PASS | `circle.test.js` "SEURL -> typed term" |
| PURL → substrateIO | build two extensionally equal programs | equal value_id, distinct records | PASS | `shared_value_distinct_records`, `identity_kinds_stay_distinct` |
| PURL → ACSP | TALK | ACSP version +1, proposal pending, 0 TOKs | PASS | `circle.test.js` E2E test |
| ACSP → substrateIO | project the live field-trial events | chain consistent; counts; wall clock excluded | PASS | `test_acsp_events.py` |
| Golden Surface → PURL/circle | relay + FakePhone open/read a circle URL; seurl://; pilot tab | 200 / 422 / 403 drive, 200 read; no token | PASS (FakePhone, main) | `test/golden.test.js` |
| Golden Surface → ACSP | — | — | NOT TESTABLE: no adapter, no phone, relay unreachable | CANONICAL-STATE OP-B1 |
| MUSA → bridge | spec vs executable FSM | verbs equal; every §4 transition executable | PASS | `test/musa.test.js` |
| reconstruction | cold clone → suites → hashes → resume → §51 questions → E2E hash | all PASS | see `circle/cold/report-*.json` | `scripts/bridge-cold-reconstruct.js` |
| replay | PURL log replay of every scroll; checkpoint snapshot replay | all_ok; content id equal | PASS | `scroll_log_verifies`; checkpoint replay test |
| perturbation | PERTURB → perturbation record; damage comparison | pre/post value ids, environment, observation | PASS (dogfood) | `/scrolls/{id}` `perturbations`; DOGFOOD-REPORT |
| differential | current checks vs old commits | old FAIL, new PASS | 5/5 | `circle/differential/results.json` |
