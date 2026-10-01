# Participant 3 (model: default) — verbatim report

I worked out how the system at http://127.0.0.1:8484/ is laid out and what state it is in, using only HTTP requests to that address and the links it returns. I then took one step forward: I ran the one program that had been saved but never run, and recorded a checkpoint after it. The note I tried to attach to that checkpoint for the next participant was silently dropped, so the to-do list lives only in this report.

**What exists**

- **The circle (port 8484)** is the entry point that links everything, labelled "circle/0 (provisional)". Every page says what it is and lists the next actions it allows.
  - **Programs** are URLs built from seven fixed verbs: START, SWITCH, WRITE, COMMIT, BUILD, TALK, PERTURB.
  - A program that has been saved is called a **Scroll**.
  - **Values** are named by URL paths that describe how they were computed, e.g. `/map/eca/90/8/state/5/next` (step 5 of an elementary cellular automaton, rule 90, 8 cells). `/v/...` computes the value and `/term/...` shows its structure without computing it.
  - It also has checkpoints and resume, conformance tests, a constitution, an "observatory" status page, `/state`, `/aliases`, `/stases` (dated baselines across the connected repositories), and a full self-description at `/sdk`.
- **substrate (port 18765)** does the actual computing: it resolves values and appends execution records. Every result is labelled "computational", never "observed".
- **ACSP (port 18787)** is a shared, append-only log for passing work between sessions. The circle holds no permission on it beyond proposing; adopting a proposal is up to the resource's owner. The continuity log is resource EWHFG2ST3J8E, owned by `owner-human`.
- **PURL (port 34459)** stores the circle's own records: scrolls, amendment proposals and checkpoints. Each record's history can be checked at `/r/{id}/verify`.
- **golden-surface** is a phone/browser relay. It is not configured here and is reported as unreachable.

**What I'm allowed to do**

- Any GET is read-only; doing something takes a POST to the same URL.
- Every POST must carry a session name I choose (`?session=…`). It is recorded as "asserted", not verified.
- Credentials in URLs are refused.
- I can only propose changes to the constitution. Adopting them takes a git commit by a human.
- On ACSP I can only propose, so nothing I send gets past "submitted".

**State before I acted**

- **Constitution:** version 1 (sha256:3194…), 19 clauses. Clause K-18 ("nothing waits for approval") conflicts with K-04 and ACSP's owner-approved proposals, and needs a decision by the operator.
- **Conformance:** one test run, r_JZST1M8CBZ. 14 clauses passed their checks, none failed; the other 5 are enforced elsewhere, by human review, or are the K-18 conflict.
- **Scrolls:** 12 in total.
  - The active scroll, r_722WQGQRKB (rule 30, 6 cells: start at 1, step twice), had been saved but never run.
  - r_X1V8849X2S, r_FET5KXQ44H and r_8F7ZYMS4NS have also never been run.
- **Checkpoint:** one, r_W4P3KM7Z0C, from session `claude-recon-2026-10-01`. Its ACSP field is empty and its next-step field is null.
- **ACSP log:** at version 4, with 3 proposals waiting for the owner. P-001 came from `claude-recon-2026-10-01`; P-002 and P-003 came from a different session, `claude-recon-session-001`.
- **Amendment proposal:** one, r_VDFFPYNQ37, a test probe against K-18 that intends no change.
- **Baselines:** STASIS-2 is still open; its final checkpoint has not been recorded.
- **Known open problems:** 8, listed at `/state`. The observatory names "two constitutions" as the current one.

**What I did** (session `claude-recon-2026-10-01-continuation`)

1. I computed the active scroll's result by hand first (rule 30, 6 cells: 1 → 35 → 22) and it matched `/v/map/eca/30/6/state/1/next/next`.
2. `POST http://127.0.0.1:8484/scrolls/r_722WQGQRKB/build?session=claude-recon-2026-10-01-continuation` returned 201 and the program ran. It created execution records X-000020 to X-000022, labelled computational, with final value x=22. The scroll moved from version 2 to 3, and `http://127.0.0.1:34459/r/r_722WQGQRKB/verify` reports its history valid (3 events).
3. `POST http://127.0.0.1:8484/checkpoints?session=claude-recon-2026-10-01-continuation` returned 201 and created checkpoint **r_W4DQ08HVD7**. You can read it at `/checkpoints/r_W4DQ08HVD7` and resume from it at `/resume/r_W4DQ08HVD7`.
4. Resuming from the old checkpoint, `/resume/r_W4P3KM7Z0C`, now correctly reports one change: r_722WQGQRKB has gone from version 2 to 3. The observatory now shows 2 checkpoints and 45 events.

I did not send anything to ACSP, re-run the conformance tests, or propose any amendment.

**Notes for the next participant (not recorded anywhere in the system)**

- Run the three scrolls that have never been run.
- The ACSP proposals P-001 to P-003 are waiting on `owner-human`.
- The K-18 conflict needs a decision.
- STASIS-2 still needs its final checkpoint.

**What I could not determine**

- **How to attach a note to a checkpoint.** The POST accepted a JSON body with a `next` field and ignored it. I found no schema for the checkpoint body.
- **Which code versions are running.** Checkpoints record purl ddbd066 and substrateIO 07e15d0, but the observatory reports newer commits (8edcec5 and 16657b5). I can't tell whether the running services are out of date or the checkpoint is reading a stale value.
- **Why checkpoints record ACSP as empty** even though ACSP is reachable.
- **Who the participants are.** I can't tell whether `claude-recon-2026-10-01` and `claude-recon-session-001` are different agents; identities are only asserted. ACSP also lacks a link from the circle to P-002 and P-003.
- **Two listed links are broken.** `/stases/{n}` and `/transitions/coverage` both return 404, though the SDK lists them.
- **golden-surface** is not configured, and the source documents the constitution cites are only reachable as files, which I was not allowed to read.
