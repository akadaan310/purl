# exp-0002 — independent-agent analysis (verbatim)

| | |
|---|---|
| Category | **interpretation**, by a separate agent, not by the builders |
| Agent | a separate Claude Code subagent (general-purpose), started with no conversation context |
| It received | only the blind packet built by `scripts/build-blind-packet.js` from commit `762e84f`: both repositories without history, the pre-registered hypotheses, the record, the hypothesis evaluator and the composition test files; a neutral procedure specification; run 1's raw observations and raw handoff logs; schemas; URLs of live PURL and ACSP instances populated by `scripts/serve-inspection-instance.js` |
| Its instructions | [`blind/README.md`](blind/README.md) ("Characterise the computational properties of this resource system", nine required questions, OBSERVATION / TRANSFORMATION / INTERPRETATION / CONFIDENCE), plus: work only inside the packet and the live URLs; treat all documentation as claims |
| It did not receive | the research question, the hypotheses, their outcomes, `REPORT.md`, or any statement of the builders' conclusions |
| Data it analysed | run 1 (the packet was built before run 2) |
| Its probes | copied unchanged to [`independent-review/`](independent-review/); they import `../purl/…` and `../live.json` relative to the packet layout and need the live instances to re-run |
| Caveat | the harness refused the agent's attempt to write `REPORT.md` into the packet; the text below is its final message, unedited. Its full run also wrote a record inside the packet, which was not kept. |

---

# Independent characterisation of the PURL × ACSP computation layer (exp-0002)

Packet directory: `/tmp/claude-0/-home-user/03cf2fea-c83a-5b4d-b14a-75cfc56441b4/scratchpad/blind-packet/`. All paths below are relative to it.

## 0. What I ran
| # | Command | Result |
|---|---|---|
| R1 | `cd purl && ACSP_DIR=../acsp npm run composition` (full run, n up to 10 000) | Exit 0, 71.9 s. All 9 hashed sections match `section_hashes_of_recorded_run` exactly: examples, determinism, equivalence, sharing, update, persistence, counts, handoff_outcomes, transformations. |
| R2 | `cd purl && npm test` | 58/58 pass. None of these tests cover `src/compute` or `src/bridge`; those tests were withheld. |
| R3 | `cd acsp && npm test` | 25/25 pass. |
| R4 | `node review/live-probe.mjs` → `review/live-probe.out.json` | Probes L1–L9 against live PURL at 127.0.0.1:34113. |
| R5 | `node review/inprocess-probe.mjs` → `review/inprocess-probe.out.json` | Probes P1–P5 on deterministic stores. |
| R6 | `node review/acsp-probe.mjs` → `review/acsp-probe.out.json` | Re-verifies the three live ACSP resources against live PURL, plus two write probes. |

I read these files in full: `purl/src/compute/*`, `purl/src/bridge/*`, `purl/src/continuity/store.js`, `purl/src/core/canonical.js`, `purl/scripts/lib/{composition,handoff}.js`, `purl/scripts/composition-experiment.js`, `schemas/compute-node.schema.json`.

## 1. What computational structure is actually present?
**OBSERVATION**
- `algebra.js` is a pure evaluator for NOT, AND, OR, XOR, CONCAT and HASH over bit strings, with schema-checked operands. The "properties" are metadata only, and the file states "normalisation: none".
- `composer.js` is a client library:
  - `apply()` reads each operand's head.
  - The state hash is `hashOf(record)`, computed **on the client** (`ports.js head()`).
  - It evaluates **on the client**, POSTs a resource `{operation, operands:[{resource,version,state_hash}], value, evaluator}`, then adds one `link rel:"references"` per operand.
  - `verify()` is a client-side DFS over (resource, version) pins: it replays each record, compares pin hashes, re-evaluates, and calls the server's `/verify` (a log hash-chain check).
  - `dependents()` is a BFS over the server's inbound-link index.
  - Recomputation (path-copy or in-place) is also client-side.
- In `store.js`, `stateHash = hashOf(entire record)`. That record includes id, created_at, owner, grants, relations and version.
- The server never evaluates and does not validate compute-node state. Live probe L5: `type:"compute-application"` with state `{"hello":"world"}` was accepted.
- The bridge carries tasks and claims as JSON text inside ACSP TOKs.

**TRANSFORMATION:** I traced the data flow through the code.

**INTERPRETATION:** This is a provenance-pinned expression DAG (a build graph) stored as generic records in an event-sourced object store. The substrate provides:
- versioned, append-only, addressable storage;
- an inbound-link index;
- log-integrity checks.

Everything computational is client-side: evaluation, pin checks, dependency ordering and recomputation. The DAG shape over (resource, version) depends on clients behaving honestly. The server accepts dangling pins and pins to versions that do not exist yet (L5).

**CONFIDENCE:** High.

## 2. What claims are directly supported?
**OBSERVATION**
1. The full run reproduces all hashed sections (R1).
2. A false application value is caught, but only by client re-evaluation:
   - Recorded fault-wrong-node run: `purl_cone_verifies:false`, and B does not perform step D.
   - Live L4: I created XOR(0,1) with a claimed value of "0". Server `/verify` returned valid:true; `Composer.verify` returned valid:false ("recorded value 0 ≠ re-evaluated 1").
   - R6 reproduces the same on live ACSP `0BJ99DDZWBMZ`.
3. A mismatch between an ACSP claim and the PURL value is detected: the fault-misreport run ends with a dispute. R6 on `9129B52PJBPJ`: claimed 0, PURL value 1, cone valid.
4. ACSP checkpoints re-hash correctly under PURL's independent canonicaliser, for all checkpoints of all three live resources (R6).
5. ACSP session binding holds:
   - impersonation with another session's capability → 403 `session_mismatch`;
   - an anonymous append claiming to be session-a → 401 (R6).
6. Old versions still verify after updates.
7. State hashes are identical after reloading from the log.
8. Sharing saves a constant amount: 8 vs 9 resources, 24 vs 28 events, 4 vs 5 evaluations.
9. The inbound index finds dependents in O(affected): 15 reads versus 9 999 records scanned (tree, n = 10⁴).
10. The vocabulary hash equals the baseline. I recomputed `sha256:1422638e…f697` myself.
11. All 13 live nodes listed in `live.json` verify, and none are stale (L2).
12. The declared algebraic properties hold: 0 counterexamples exhaustively over strings of 1–3 bits (P5). CONCAT associativity is not exercised anywhere in the packet.

**INTERPRETATION:** What is supported is integrity and detectability, assuming an honest server and an honest reference evaluator.

**CONFIDENCE:** High.

## 3. What claims are not supported?
- **Content addressing is absent.**
  - L3: the same literal created twice gets different ids (`r_2W9MSY50VG` / `r_1CEQN69052`) and different hashes.
  - L9: the same AND over the same pins and value, created by two principals, gets unequal state hashes.
  - H9_triples: `r_000003` and `r_000004` share (op, pins, value) but have different hashes.
  - `stateHashInputs` lists /id, /created_at, /grants and /relations among the hashed fields.
- **The state hash is not a commitment to the computation.**
  - E6: an irrelevant `note` field changes it.
  - L6: a link event on operand 0 left its value unchanged but advanced its version, so every dependent reports stale.
- **Verification is not independent.** Every verifier runs the same `algebra.js`; there is no second evaluator.
- **"Anyone can check" is true, but nothing is constrained.**
  - L5: the server accepted a future-version pin, a pin to a non-existent resource, a bogus state hash, NOT with two operands, and arbitrary state. Substrate `/verify` reports all of them valid.
  - `Composer.verify` throws on dangling pins (400/404) instead of reporting a problem.
- **Dependents can be forged.**
  - L8: another principal's `references` link shows up in `dependents()`.
  - P3: `recomputePathCopy` then crashes with "records.get.state.operands is not iterable".
- **One recorded measurement is wrong.** `update.*.recompute.evaluations = 10`, but the actual recomputation does 3 evaluations (P4). The other 7 come from two `verifyMany` calls that run before the counter is read.
- **The scan cost is understated.** "Scan reads = 1" reflects one in-process `list()` call. Over HTTP the scan costs N+1 GETs. The meaningful metric is `scanned`, which is O(N).

**CONFIDENCE:** High.

## 4. Are there hidden assumptions?
1. **The PURL server is trusted.** All hashes are computed by the client over records the server sends. `/verify` is a self-report. Nothing is signed or anchored externally. A server that serves a consistent alternative history would pass every check. The task author picks `purl_instance`, and agents only check `same_instance` against it. This is an inference from the code; I did not build a malicious server.
2. **The reference evaluator is trusted.** It is a single shared implementation.
3. **Several results depend on injected deterministic ids and clocks** (`sequentialIds` plus a fake clock). These are determinism `identical:true`, E5 equal hash (both resources are `r_000001`), and E7 X `id/state_hash` equal. The live server shows the opposite (L3).
4. **Staleness is by version, not by value.** Grant and link events count as changes (L6).
5. **Recomputation has no early cut-off.** P2: 52 nodes recreated, 1 value actually changed.
6. **All scaling runs use 1-bit values.**
7. **The default `maxResources` is 10 000.** The experiment raised it to 100 000, and the n = 10⁴ tree has 19 999 resources.
8. **Agent A's `verified:true` in the honest run is vacuous**: it had no verifications to perform.
9. **The recorded run used a dirty PURL worktree** (`dirty_worktree:true`). The packet code does reproduce the hashes.
10. **The agents are deterministic scripts, not LLMs.**

**CONFIDENCE:** High for items 2–10. Item 1 is inferred from code.

## 5. Are any apparent compositional properties artifacts of representation?
Yes.
- **Harness artifacts.** Determinism, serialisation invariance (E5) and construction-order invariance for X (E7) come from sequential ids and a scripted clock. With random ids (live), identical content gets distinct ids and hashes (L3). Canonical-JSON invariance is real at the `hashOf` level, but hashes only come out equal because ids and times were forced to match.
- **Closure (i)–(iv) holds for any JSON resource**, including my forged nodes (L4, L5).
- **merkle-by-value is an external baseline** (`commitments.js`). It reflects syntax: it breaks under operand permutation (E3).
- **value / value_hash equality (E4, E8) is equality of outputs.**

**CONFIDENCE:** High.

## 6. Does the system demonstrate derived-resource closure?
- **By the packet's definition:** yes. Every example node satisfies it, and the live nodes verify. But forged and invalid nodes satisfy the same definition (L4, L5), so it does not discriminate.
- **Weak closure** (derived values are first-class, pinnable resources): yes. This is inherited from PURL treating any state as a resource.
- **Closure under validity:** no. Only client re-evaluation establishes it; the substrate cannot tell valid derived nodes from forged ones.

**CONFIDENCE:** High.

## 7. Does it demonstrate mathematical equivalence or merely equal outputs?
Only equal outputs.
- E8: for X1 vs X2, only `value` and `value_hash` agree. `resource_id`, `state_hash` and both merkle variants differ.
- E3: permutation breaks merkle and state-hash equality.
- E4: 5 forms, 5 distinct structural identifiers.
- There is no normalisation.

The exhaustive truth table does establish XOR(a,b) ≡ OR(AND(a,¬b),AND(¬a,b)) on single bits. Because the operations are bitwise, that extends to all equal-length strings; this extension is my argument, not the system's. In both cases the equivalence is established by brute force performed by the experimenter, outside any representation.

**CONFIDENCE:** High.

## 8. Does it demonstrate any nontrivial complexity advantage?
No.
- Everything is linear: log-log slopes 0.97–1.01 for construction, storage, verification and provenance.
- The cost per node is about 13–18 SHA-256 operations and 2.3–3.3 KB of log for a 1-bit value. Chain at n = 10⁴: 130 010 hashes and a 32.8 MB log.
- Memo vs naive verification on the packet's families is only a constant factor. Chain: 2n+1 vs n+2 visits. Tree: identical visits, 1.5× reads.
- Index vs scan:
  - chain: no gain (25.7 vs 26.0 ms);
  - tree: log n vs n.
- Leaf update costs n on the chain and about log n on the tree.
- In the tree, 1 520 of 9 999 nodes are structurally distinct; the rest are duplicates, and nothing deduplicates them.
- My diamond-ladder probe (P1) is the one place with a large gap, and it is textbook DAG memoisation:

| Probe P1, diamond ladder | memo visits | naive visits | naive reads |
|---|---|---|---|
| n = 8 | 9 | 511 | — |
| n = 16 | 17 | 131 071 | 393 213 |

The only asymptotic gaps are textbook ones and come from the client algorithm, not from PURL or ACSP:
- DAG memoisation, which the packet's families never exercise;
- a reverse index vs a scan;
- path copying.

On top of that the system adds constant overhead and has no early cut-off and no hash-consing.

**CONFIDENCE:** High for the counts. Medium-high for other workloads.

## 9. What experiment should be run next?
**Primary: an adversarial-substrate and evaluator-independence test.**
1. Serve a forged but internally consistent history for one operand: rewrite genesis and recompute all hashes. Run the unchanged agents against it; the pre-registered expectation is that every check passes. Then add signed event heads, or anchor PURL head hashes in the ACSP checkpoint at handoff, and measure detection.
2. Write a second evaluator in TypeScript on the ACSP side for the verifier. Inject a bug into `algebra.js` and see whether the cross-implementation check catches it.

**Secondary:**
- **Positive control for equivalence:** an ANF or ROBDD canonical form as an external identifier, which should equate the E3, E4 and E8 pairs and separate X1 from X3.
- **Workloads with real sharing:** random DAGs with reuse and diamonds, reporting memo vs naive, hash-consed vs PURL storage, and early cut-off.
- **Robustness:** dangling or forward pins, forged `references` links, wrong arity. Verify and recompute should report these, not throw.
- **Measurement fixes:** correct the recompute-evaluations counter and report HTTP read counts for scans.

## Appendix: probe outputs
- **L1:** the server's `state_after` equals the client's `hashOf(record)`.
- **L3:** distinct ids and hashes for identical literals.
- **L4:** `r_0PRG4PX34M` passes substrate verify but fails the cone check.
- **L5:** all 5 forged nodes accepted and substrate-valid. `Composer.verify` threw on 2, reported problems on 2; the fifth is a non-compute state.
- **L6:** version-only staleness `{pinned:2,current:3}`.
- **L7:** another principal can't update my literal (403) but can pin it and link to it.
- **L8 / P3:** the spam link appears in dependents, and recompute crashes.
- **L9:** unequal hashes for the same (op, pins, value).
- **P2:** 52 recomputed, 1 changed.
- **P4:** 3 real evaluations vs 10 recorded.
- **R6:** honest run C and D verify; misreport → dispute; wrong-node → cone invalid; all checkpoints OK; ACSP accepts a false claim from a resource owner (append 200), because ACSP never interprets content.
