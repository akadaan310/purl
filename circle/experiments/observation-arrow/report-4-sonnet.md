## Reconstruction (HTTP only, starting at http://127.0.0.1:8607/)

**What the entry point is.** It is the "circle" (circle/0, provisional), an HTTP+JSON façade that sits over four other systems. Its constitution v1 has clauses K-01 to K-19 (sha256:319402d8…8cb4), at /constitution. Rule: GET shows what would happen and changes nothing. POST with `?session=<declared id>` does it. The session id is only recorded as "asserted" (K-02).

**The systems and what each is responsible for**
- **Substrate** (:43007, substrateIO `purl_server.py`). It computes values from derivation paths such as /map/eca/90/8/state/5/next. It gives each value a value_id, derivation_id, address_id and environment_id. It keeps append-only execution records (X-…) and observations (O-…). Every status it gives is "computational" or SIMULATED (K-09).
- **ACSP/0.1** (:43107). It holds continuity resources, here BFXB31D0447N, titled "EXP-R9-instance-7". The owner is `operator-owner`, and `accepts_proposals` is true. It keeps an append-only, versioned event log. The circle holds no capability. It can only `propose`, which stays pending until the owner decides (K-04, K-08).
- **PURL/0.1** (:36443). It is the store for Scrolls (persisted programs), amendments, tests and checkpoints. It keeps hash-chained resource histories.
- **Golden-surface** (phone/browser relay). Not configured, so unavailable (K-10). Its 8 recorded actions in /transitions/coverage carry almost no source_ref, target_ref, clock or content_id.
- **Circle layer itself.** It provides SEURL, with the verbs START, SWITCH, WRITE, COMMIT, BUILD, TALK and PERTURB. It also provides the IDE stages, nomenclature (54 terms), research registries (hypotheses H-*, questions Q-*), conformance, checkpoints, stases, observatory, naici and code descriptors.

**What I may do.** Any GET. POST with a declared session can create Scrolls, builds, observations, checkpoints, conformance runs, dev iterations and amendment proposals (propose only). It cannot adopt amendments, edit the constitution, or commit to ACSP. K-18 (nothing waits for approval) is recorded as in conflict with K-04 and is unresolved. The conflict is spelled out in /constitution.

**State at the start.**
- Substrate and ACSP were reachable.
- There were 0 scrolls, 0 checkpoints, no conformance run and 0 dev iterations.
- ACSP BFXB31D0447N was at v1 with a single `create` event and no proposals.
- /research/open lists H-003, H-007 and H-008 as UNRESOLVED, Q-001 to Q-003, Q-005, Q-007 and Q-011 as ready, and Q-004, Q-006, Q-008 and Q-009 as blocked.
- /state lists 8 unresolved items, for example "two constitutions" and "deterministic_sha256 mixes address and value".

**Arrows where a record in one system becomes an observation, measurement or other record in another**
1. **Value address to Scroll (SEURL COMMIT).** The program path /map/eca/90/8/state/5/WRITE/next/WRITE/orbit becomes PURL resource r_61W4Y612AK.
2. **Scroll to execution records (BUILD).** The substrate runs each step and writes X-000001 to X-000003. These carry value_id, derivation_id, environment_id, code_hash and epistemic_status "computational". Their `observations` fields are empty. This is execution, not observation (K-09).
3. **Scroll build to ACSP proposal (TALK).** The result is written as a pending `propose append` (P-001, ACSP event @2, stage "submitted"). The ACSP payload `type` is "observation", but its text says it is a computational result and not an observation of a physical system. The `type` label is therefore stronger than the content.
4. **ACSP events to substrate observation, projection P-ACSP-EV-1.** Each event becomes (t=version, label=operation, actor=session_id, assurance, request_hash). The measurements are label_counts, label_bigrams, session_switches, chain_problems and a transition system over labels. The projection declares what it loses: data, summary, agent_id, kind, capability_id, on_behalf_of, request bodies and wall time.
5. **ACSP events to addressed-transition rows** (/transitions/coverage). The coverage matrix shows what each system's records lose when projected. ACSP is complete (6 of 6 fields), git is missing clock, and golden-action is missing nearly everything.
6. **Git commits to transitions** (also in /transitions/coverage). Clock is lost.
7. **Substrate and PURL records to the observatory.** These are read-only views and nothing is stored.
8. **PERTURB** is the bit-flip verb. I did not use it, but per the repo's rules injected flips are not SEUs.

The arrow at 2 is the key one. A model run is only "computational". The only things the circle calls "observations" are measurements of its own ACSP event log, which is a record of process, not of the world. Nothing in the environment produces OBSERVED data.

**What I did** (session id `session-claude-explorer-1`, asserted)
1. POST http://127.0.0.1:8607/seurl/START/map/eca/90/8/state/5/WRITE/next/WRITE/orbit/COMMIT/BUILD/TALK/acsp/BFXB31D0447N?session=session-claude-explorer-1
   - Created Scroll http://127.0.0.1:8607/scrolls/r_61W4Y612AK. It was BUILT with executions X-000001 to X-000003.
   - Submitted ACSP proposal P-001, now pending the owner's decision. It sits at event BFXB31D0447N@2 and is visible at http://127.0.0.1:8607/acsp/r/BFXB31D0447N/events.
   - This also created substrate observation O-000001, labelled SIMULATED.
2. POST http://127.0.0.1:8607/acsp/r/BFXB31D0447N/observe?session=session-claude-explorer-1&origin=service
   - Created substrate observation O-000002 over the 2-event log. Result: create to propose, 2 sessions, 1 session switch, is_dag true.
   - The substrate serves it at http://127.0.0.1:43007/observations/O-000001 (the same path serves O-000002).
3. A next participant can reconstruct this from the scroll URL, the ACSP events URL, /observatory (current_program, current_projection, transitions) and the observation IDs above.

I did not run /conformance/runs, checkpoints, amendments or any research question, and I changed no hypothesis.

**Anomalies and what I could not determine**
- **Inconsistent epistemic labels.** O-000001 (from TALK, origin "harness") is labelled SIMULATED. O-000002 (direct observe, origin "service") is labelled UNRESOLVED. Both have identical measurements and the same deterministic_sha256 (d7c509bd…). The label therefore depends on the call path or origin, not on the data. I did not find the rule that sets it.
- **Self-referential measurement.** O-000001 includes the very `propose` event that carried it, so the measurement covers its own transport.
- **Missing documents.** The experiment SPEC and record files, for example observation-arrow/SPEC.md and cells.json, are listed but not served. I could not read them.
- **Routes that 404.** GET /observations/{id} on the circle (:8607) returns 404, and GET /acsp/r/{id}/observe returns 404 (observe is POST-only). I found no circle-level way to list observations. I only reached them through the substrate port.
- **Unresolved, not tested.**
  - Whether the ACSP owner `operator-owner` will accept or reject P-001. Only the owner can commit it, and I cannot act on its behalf. The next participant should check proposal status at http://127.0.0.1:43107/r/BFXB31D0447N.
  - Who or what the owner is.
  - The real meaning of "EXP-R9-instance-7".
  - Whether golden-surface could ever run here.
  - Whether the PURL-side git and deployment state matches /stases claims. I did not verify them.
  - The K-18 conflict.
  - The program-001 (417da6c) reference. /stases says the earlier claim that it was absent was later disproven.
- The scroll shows version 5 and the observatory shows 5 events after one POST, so the number of internal writes behind one SEURL POST is not clear to me.
