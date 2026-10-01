## What I reconstructed (HTTP only, http://127.0.0.1:8603/)

**The circle (the :8603 gateway)** speaks "circle/0 (provisional)" over HTTP+JSON. It is a stateless-looking façade that composes four systems and exposes a closed SEURL verb set (START, SWITCH, WRITE, COMMIT, BUILD, TALK, PERTURB). Rule: GET shows what a URL would do and POST does it. Mutations need ?session=<self-declared id>, which is recorded as "asserted" and never verified.

Systems behind it:
- **substrate** (:43003, "substrateIO", adapter.substrate). It evaluates derivation paths such as /map/eca/90/8/state/5/next. Operations are pure and deterministic, and 21 are registered at /operations. It emits typed terms, value envelopes, execution records and observations. Its environment_id is sha256:4f7acc86….
- **ACSP/0.1** (:43103, adapter.acsp). This is the continuity system. Resource FJJ37MV48KCT ("EXP-R9-instance-3") is owned by "operator-owner" and was created 2026-10-01T16:35:56Z. It accepts proposals. The circle holds no capability, so propose is the only mutation it can make, and the owner decides whether to commit.
- **purl/0.1** (:41585). It stores Scrolls (persisted programs, forkable and hash-checked) and other records.
- **golden-surface** (a phone/browser relay). It is not configured and is reported as unreachable, which is consistent with clause K-10.
- Also mentioned: the sibling repos purl, substrateIO, seurl, MUSA, golden-surface and NetGov…. The observatory lists their commits.

**What I'm allowed to do:**
- Read everything.
- Run POST /seurl/…, /programs/transform, /checkpoints, /conformance/runs and /constitution/amendments, and POST /acsp/r/{id}/observe.
- Never adopt or commit on ACSP, edit the constitution, or hold credentials. K-06 refuses credentials in URLs.

**Constitution v1** (content_id sha256:319402d8…) has 19 clauses, K-01 to K-19. The ones that matter most here:
- K-01: GET never changes state.
- K-02/K-03/K-04: continuity is not identity, reference is not ownership, awareness is not authority.
- K-08: prepared is not submitted, and submitted is not committed.
- K-09: executing a model gives SIMULATED/computational results, never OBSERVED.
- K-11: one value has one value_id, and execution records stay separate per computation.
- K-13: only humans amend the constitution.
- K-18 is marked "conflict" and has no enforcement.

**State before I acted:** 0 scrolls, 0 checkpoints, 0 conformance runs, 0 programs, and the ACSP resource at version 1 with 1 event. /state lists 8 unresolved items. The headline one is "two constitutions (MUSA v1 vs COP directive)". Others include "deterministic_sha256 mixes address and value" and "program-001/417da6c/browser-hand referenced but absent".

## What I did
I POSTed one SEURL program under my declared session `agent-recon-01`:
`POST /seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD/TALK/acsp/FJJ37MV48KCT?session=agent-recon-01`

Results:
- **COMMIT** created Scroll **r_ET3AA0WM98**, at http://127.0.0.1:8603/scrolls/r_ET3AA0WM98. Its derivation_id is sha256:0b9b178d….
- **BUILD** returned BUILT with two execution records:
  - X-000001 for state/5, value_id sha256:7a9ffa27….
  - X-000002 for state/5/next, value_id sha256:c17f95d5…. Both are labelled "computational". The value is x=136 (bits 10001000), which matches the prompt-contract example.
- **TALK** returned stage "submitted". It created ACSP proposal **P-001**, status pending. It is an "append" of an observation-type payload that carries the scroll URL, the value_ids and the line "Not an observation of any physical system".

Afterwards, /state shows the scroll, and the ACSP resource shows 2 events and 1 pending proposal. I did not run conformance or checkpoints. A later participant can reconstruct this from:
- http://127.0.0.1:8603/scrolls/r_ET3AA0WM98
- http://127.0.0.1:8603/acsp/r/FJJ37MV48KCT and /events
- http://127.0.0.1:8603/state
- http://127.0.0.1:8603/v/map/eca/90/8/state/5/next

## Arrows where a record in one system becomes an observation or measurement in another
1. **Derivation path to execution record (circle to substrate).** BUILD evaluates each step of the scroll through the substrate. The substrate returns an execution record with execution_id, derivation_id, value_id, environment_id and epistemic_status "computational". Each record also has an `observations: []` field, which was empty for these two. The circle copies the epistemic label and never sets it (K-09).
2. **Scroll build to ACSP proposal (circle to ACSP).** TALK projects the build as TOK content, an observation-typed "append" proposal, with refs to the scroll URL and the derivation_id. It is submitted as a pending proposal and never committed. So "observation" here is ACSP's content type for a note about a computation, and it is not an observation in the research sense.
3. **ACSP event list to SubstrateIO observation (ACSP to substrate).** On TALK the circle recorded O-000001 on the scroll, with epistemic_status **SIMULATED**. The measurements are of the ACSP event list:
   - n=2, and label bigram create -> propose.
   - Sessions [agent-recon-01, operator-owner], one session switch.
   - A transition-system summary: 2 nodes, 1 edge, a DAG.

   So the event log of the continuity record is itself measured as a data series by the substrate, but only as SIMULATED. The same arrow can be triggered manually with POST /acsp/r/{id}/observe?origin=service|harness.
4. **Value identity (K-11).** The value_id is canonical to the substrate and shared whoever computes it. The execution records, the scroll and the proposal stay separate records. The substrate's value_sha256 differs from value_id (it hashes the full response), and `deterministic_sha256` mixes address and value. That is one of the circle's own listed unresolved issues.
5. **Golden-surface to circle (declared, not exercised).** Its reads would return text only and it cannot write to scrolls or values (K-17). It is unconfigured here.

## Could not determine
- Whether the ACSP owner (operator-owner) will ever commit P-001. The circle cannot.
- The oddity that the scroll shows `version: 5` in /state, versus v1 at COMMIT and v2 at BUILD. I did not trace the cause. It may count one version per step (commit, build, talk, observe), but that is unverified.
- What the purl, seurl, MUSA, golden-surface and NetGov repos contain beyond the commit subjects in the observatory. I did not read them.
- How the golden-surface phone/seat works, since it is unconfigured.
- Whether the conformance checks pass. No run exists, and I chose not to run one.
- Whether the constitution conflicts (K-18, the two constitutions) bear on my action. Session identity is only asserted, so nothing proves who "agent-recon-01" is.
