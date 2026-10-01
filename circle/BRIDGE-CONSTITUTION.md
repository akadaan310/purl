# Constitution-Oriented Programming and Development (methodology)

One methodology, several artifacts. Status of the methodology itself: **HYPOTHESIS**
(C-045). Each component maps to an established practice: a traceability matrix,
policy-as-code, conformance testing, design by contract.

## 1. Definition used here

A **constitutional artifact** is a machine-readable statement of what counts as a
valid transition of a component. It contains:

`identity · purpose · boundaries · invariants · permitted transitions ·
forbidden transitions · observable effects · non-effects · validation method ·
evidence requirements · provenance · version · related terms · implementation ·
tests`

Format: `constitutional-artifact/1` (instance: `constitution/sdk-constitution.json`).

**A constitution is not an approval workflow.** Transitions proceed. Conformance
is *derived afterwards* from executed checks and *recorded* (`POST
/conformance/runs` → PURL `conformance-run` resources, addressable at `/tests`).
Approval ≠ conformance.

Governance and verification are separate files (lesson of STASIS-1, A-001):
* **clauses** (what must hold) → `constitution-v1.json` (content-addressed; changes only by amendment)
* **checks** (how it is verified) → `enforcement.json` (can grow without an amendment)
* **results** → conformance runs (never deleted, including failures)

## 2. Existing artifacts that already do this job (no new constitutions were made for them)

| Component | Existing constitutional artifact | Has machine-checked invariants? |
|---|---|---|
| ACSP | `PROTOCOL.md` §0 invariants + operation registry (`src/protocol/operations.ts`) | yes: harness `authority-matrix`, `get-safety`, … |
| PURL/0.1 | `PRINCIPLES.md` invariants I1–I10 + `SPEC.md` | yes: test suite, layer rule |
| substrateIO | `research/CHARTER.md` + `epistemic_statuses.json` + `CLAUDE.md` rules | yes: `tools.validate`, epistemic guards |
| SEURL | MUSA `url-machine.md` §3–§4 | yes since STASIS-2: `test/musa.test.js` |
| Golden Surface | `SPEC.md` + `AMENDMENTS.md` | partly: relay tests; the bridge's `golden.test.js` |
| MUSA | `genesis/CONSTITUTION.md` v1 | no |
| bridge | `constitution-v1.json` (K-01…K-19) + `enforcement.json` | yes: conformance runner |
| SDK | `sdk-constitution.json` (new; the SDK had none) | yes: `sdk_describes_itself`, `prompt_conversation_not_executed` |

Only the SDK received a new artifact, because nothing described it.
Constitutional proliferation was avoided by mapping, not by writing.

## 3. Constitutional prompts (the program/conversation boundary)

A prompt is a **program** iff it is a JSON object with `operation` (a route of
the environment, `{method, href}`), `expected_transition`, `test` and
`completion_condition`. Optional: `instruction`, `constraint`, `objective`,
`state`, `evidence`. Schema: `/sdk/schemas/prompt-contract`.

Anything else is **conversation**: it is answered, never executed. Classifying a
prompt (`/prompts/classify`) never executes it. Performing it is a separate
request. Check: `prompt_conversation_not_executed`.

## 4. Amendment proposals (not adopted; adoption is a human commit)

| Id | Proposal | Evidence | Status |
|---|---|---|---|
| A-001 | move clause→check mappings out of `constitution-v1.json` | STASIS-1: adding checks would change the constitution's content id | PROPOSED; practice already follows it (`enforcement.json`) |
| A-002 | restate K-18 as an *ownership* conflict (who may commit shared records), not an approval conflict; transitions never wait for approval | this directive §5 (approval ≠ conformance); BRIDGE-CONTRACT §5 | PROPOSED |
| A-003 | add a clause: the bridge never reaches MUSA `shell.py` or any arbitrary-execution endpoint | BRIDGE-RECONSTRUCTION §1 | PROPOSED; currently HUMAN_REVIEWED by absence of any adapter |
| A-004 | add a clause: a "seal" needs a secret (MAC/signature) or must be called a checksum | ramz forgery probe | PROPOSED (concerns MUSA; not adopted here) |

## 5. Implemented / conformant / reproducible: three different statuses

| Status | Meaning here | Where recorded |
|---|---|---|
| IMPLEMENTED | code exists | commits; `/sdk` provenance |
| CONFORMANT | its constitutional checks passed in a recorded conformance run | `/tests/{run}` |
| REPRODUCED | the same result was obtained again from committed artifacts in a cold reconstruction, or across two runs with an identical deterministic hash | `circle/cold/report-*.json`; e2e records |
