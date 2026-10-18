# Experiments: registered questions, toy execution and results

**Execution class:** isolated Python standard-library model, *not* integration tests of actual GitHub repositories, a hosted PURL or a live agent. Experiment definitions below specify the tiny model; all counts are bounded exact enumerations. Code: `experiments/commission_checks.py`. Results: `experiments/results.json`.

## E1 — Binary toggle vs enriched history

- **Hypothesis:** fixed-length deterministic toggle histories are determined by the start bit; externally supplied transition labels increase distinguishable traces.
- **Control:** no labels, state `s∈{0,1}` and `δ(s)=1-s`. **Treatment:** per-transition independent binary labels.
- **Metric:** number of distinct histories at `n=0..8`.
- **Falsifier:** more than two bare histories at fixed n, or fewer than `2·2^n` distinguishable labeled histories under the explicit independent-label assumption.
- **Result:** bare histories **2 at each n**; *mathematical family count* for external binary labels `2·2^n` (formula, not simulated independent sensor readings). **Class:** elementary mathematical consequence, not new computational expressivity.
- **Budget:** `O(n)` generation for each enumerated history; tiny, deterministic.

## E2 — The 007/070/700 cycle

- **Hypothesis:** three-state deterministic rotation has exactly three fixed-length histories and period 3.
- **Control:** rotation with three labels and no external tags. **Metric:** distinct length-n histories, `n=0..8`.
- **Falsifier:** an additional reachable state or an invalid order.
- **Result:** **3** at each n; `007→070→700→007`. Periodicity is not Turing completeness. **Class:** finite-state enumeration.

## E3 — Typed operation composition

- **Hypothesis:** typed composition is associative when defined, has identities, rejects mismatched types, and conservatively unions rights/effects.
- **Corpus:** five toy operators `parse:Raw→AST`, `typecheck:AST→Checked`, `eval:Checked→Value`, `persist:Value→Value !mutation [write]`, `render:Value→View`. All `5^3=125` triples.
- **Baseline:** accepts all triples. **Checker:** rejects adjacent type mismatches and aggregates declared rights.
- **Falsifier:** an ill-typed accepted triple or a well-typed triple with disagreement under parenthesization.
- **Result:** **7/125** well typed, **118/125** ill typed; 5 of the seven well-typed triples require `write`. All applicable associativity and identity unit tests pass. Naive baseline makes 118 false acceptances **relative to the toy type contract**; not a production accuracy claim.
- **Limit:** the type declarations themselves are the oracle, not an independent test against external program semantics.

## E4 — Four identities; no semantic hash miracle

- **Hypothesis:** address, derivation, value and execution are different equivalence relations.
- **Control:** toy integer expressions `add(1,2)` and `add(2,1)` under a fixed interpreter version.
- **Metric:** canonical serialization SHA-256 digest equality for four identity namespaces.
- **Falsifier:** distinct derivations required to hash identically by definition.
- **Result:** same `value_id` for integer 3, different normalized path, derivation and run hashes. Note that digest agreement is evidence of equal **chosen encodings**, not an intrinsic proof of all-context program equality.

## E5 — Trace-to-program/replay boundary

- **Hypothesis:** replay of a deterministic reducer with all inputs succeeds; replay of an external read without captured result cannot be certified.
- **Control:** initial `2`, events `[add 4, multiply 3]`; **treatment:** unknown external fetch event.
- **Metric:** exact final state / explicit unsupported operation.
- **Result:** pure replay gives `18`; external fetch raises explicit unsupported-op error. Real side-effect replay remains **NOT RUN**.

## E6 — Fresh-session bootstrap

- **Hypothesis:** a client given one complete machine-readable *manifest* can reconstruct a task cursor without previous dialogue.
- **Control:** serializable toy manifest with operation catalog, checkpoint and next node.
- **Metric:** reconstructed next step, required rights, external authentication status.
- **Result:** offline reconstruction yields next operation `eval`, resource version 4, no authenticated principal. **Cross-provider HTTP test: NOT RUN**. There was no deployed URL + authorised worker + independent fresh agent available to the isolated test.
- **Falsifier for future integration:** a fresh client cannot discover legal next actions and evidence from the URL without hidden chat instructions, or attempts a forbidden mutation.

## E7 — Checker vs baseline

- **Hypothesis:** declared typed/effect checking catches some invalid compositions that the unconstrained baseline accepts.
- **Corpus and metrics:** identical to E3; control accepts all.
- **Result:** 118 structurally invalid triples rejected by typed checker; 7 accepted. This is **contract validity, not general intelligence, security or end-to-end correctness**.
- **Future control:** real PURL manifests, independent reference validator, session-agent execution attempts. Measure precondition errors, bypasses, false rejections, worker violations, latency, build cache hit rate and cost.

## Extra experiment: projected-transition admissibility

- **Hypothesis:** not every many-to-one projection of a deterministic system induces a deterministic transition on the quotient.
- **Domain:** two-bit states `(a,b)`; projection `π(a,b)=a`; transition `swap(a,b)=(b,a)`.
- **Falsifier:** projected output always agrees for states with equal projection.
- **Result:** **counterexample found**, `(0,0)` and `(0,1)` project equally but their next projected values differ. Positive control `δ(a,b)=(1-a,b)` passes the congruence check.
- **Use:** compiler must check operation congruence or retain additional hidden state before learning reusable rules from a projection.

## Extra experiment: hash-chain trust

- **Hypothesis:** integrity of a chain relative to its current content does not establish its authenticity without an independently trusted anchor.
- **Result:** rewritten payload + recomputed local hash forms a locally internally consistent record with a different digest. An observer who trusted the earlier digest detects divergence; one shown only the new chain cannot know which history is original.

## Reproducibility and exclusions

**Executed:** 17 Python unittest cases passed in this working container. Results were generated deterministically; the code checks repeated result identity.

**Not executed:** PURL/0.1 Node suite, GitHub actions, real agent/browser URL bootstrap, real worker isolation, QEMU/CPU claims, database concurrency/crash test, external signatures, actual web-service authorization. All such claims remain pending.

**Pre-registration note:** These hypotheses and controls are written here as an experimental specification accompanying the run, **not cryptographically timestamped as a preregistration made before execution**. Future external runs should pin protocol versions and publish their spec before collecting outputs.
