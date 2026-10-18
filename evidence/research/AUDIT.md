# Independent research audit

Prepared 2026-10-18. Scope: every Markdown, JSON and Python file in `PURL_GODSEED_V3/reference/math_handoff/`, plus the enclosing `GODSEED.md` and `README.md`. All 16 research files were read completely. No bundled source was edited, and no application file was edited. This audit verifies the bundle itself; it does not substitute for inspection and execution of the upstream repositories.

## Findings that affect implementation

1. The projection theorem is correct for its stated domain: a **total deterministic function** induces a deterministic function on the projection image exactly when equal projections have equal projected successors. The proof is elementary and complete. It does not cover partial operation enabledness, capabilities, observable effects or nondeterministic transitions. The enclosing God seed explicitly requires these additional checks.
2. The reproducible evidence is **17 passing isolated Python unit tests**, not production conformance. The regenerated results match the archived file byte for byte. E3 and E7 share one corpus and checker; the reported zero checker false acceptances is a literal constant in the result dictionary, not an independent accuracy measurement.
3. The research offers a usable architecture and boundaries, not a completed runtime or a new theorem. Four identity namespaces, conservative rights/effect composition, safe discovery and replay classification should carry into the implementation. Real authority, persistence, worker isolation, deployment and fresh-provider continuity remain separate obligations.
4. There is no frozen mission protocol in the bundle. Its examples use several incompatible envelopes, effect spellings, rights and type names. They must be reconciled into an explicitly versioned schema rather than treated as interoperable fixtures.
5. The bundled E1–E7 and two extras are **not** the God seed's ten experiments. They provide partial mathematical controls for E01/E02/E04 and an offline continuity fixture; they do not establish any of the ten complete production acceptance claims.

## Exact preserved-source rerun

Python: `3.12.14 (main, Aug 25 2026, 14:00:49) [Clang 22.1.3 ]`.

The original `commission_checks.py` was copied without modification to `/workspace/research-evidence/commission-rerun/` before its writing mode was invoked. The original test suite was then run in place with bytecode writes disabled:

```sh
python -B /workspace/research-evidence/commission-rerun/commission_checks.py --write
cd /workspace/PURL_GODSEED_V3/reference/math_handoff
python -B -m unittest discover -s experiments -p commission_checks.py -v
```

Both commands exited `0`. The generator printed `Wrote /workspace/research-evidence/commission-rerun/results.json (9 categories)`. The original suite reported `Ran 17 tests in 0.002s` and `OK`.

The nine **top-level output keys** are E1–E7, `extra` and `scope`; the generator's phrase “9 categories” is not a count of nine independent experiments. The narrative describes seven numbered experiments and two extras, with E7 repeating E3's corpus.

Original and regenerated `results.json` have identical bytes and SHA-256:

```text
695f673f14d277d0862dc1b177aeba6e6909726e6335ab1a7d531324440c126c
```

SHA-256 snapshots of all 16 bundled files before and after execution match exactly. Machine-readable evidence, full stdout/stderr, regenerated results and before/after inventories are in [research-evidence](/workspace/research-evidence/rerun-evidence.json).

| Archived experiment | Exact reproduced result | Practical scope |
|---|---|---|
| E1 toggle | 2 distinct histories for every step count `n=0..8`; annotation family `2,4,8,16,32,64,128,256,512` | The annotation count is computed by formula; no sensor or timing experiment occurs. |
| E2 rotation | 3 histories for every `n=0..8`; sample `007,070,700,007,070,700,007` | Three finite-state labels; no universal computation. |
| E3 composition | 125 triples; 7 well typed; 118 rejected; 5 valid triples require `write` | A finite nominal type contract, using the checker itself to define the categories. |
| E4 identity | Equal integer-value digests; different address, derivation and execution digests | Two fixed expressions under toy semantics, not general canonical URL conformance. |
| E5 replay | Initial 2, add 4, multiply 3 → 18; unknown external operation raises `ValueError` in the suite | Two integer reducer operations, no real external read/effect capture. |
| E6 bootstrap | `next=eval`, `version=4`, source `Checked`, requirements `[]`, one artifact, `authenticated=false` | Supplied offline manifest lookup; HTTP/cross-provider trial remains `NOT RUN`. |
| E7 baseline | Same 118 rejected/7 accepted as E3 | No second corpus, agent trial, accuracy or cost study. |
| Projection extra | Swap/first-bit projection fails; 4 **ordered** obstructing pairs; first witness `(0,0),(0,1)`; first-bit toggle passes | Exhaustive verification over four states. |
| Hash extra | Rewritten event gets different hash and remains internally valid | One-event records, without a real linked history, trusted anchor, signature or fork test. |

The 17 passing tests are: `test_007_cycle`, `test_007_cycle_fixed_count`, `test_bad_composition_rejected`, `test_bootstrap`, `test_composition_associativity`, `test_determinism`, `test_effects_union`, `test_equal_values_not_equal_terms`, `test_identity`, `test_local_rehash_not_independent_authentication`, `test_projection_congruent`, `test_projection_not_congruent`, `test_pure_replay`, `test_replay_unknown_rejected`, `test_rights`, `test_toggle_periodic`, and `test_two_fixed_length_toggle_traces`.

## Proof and claim status

| Claim/source | Audit status | Qualification needed in product evidence |
|---|---|---|
| C1 / `PURL_FORMAL_SEMANTICS.md:20`, `commission_checks.py:57` | Classical composition law; finite syntax tests reproduced | Tuple concatenation and set union are associative. This does not prove implementation purity, effect coverage, dynamic authorization, commutativity or reversibility. |
| C2 / handoff JSON, upstream store claims | Upstream source-inspection report | This audit did not independently rerun PURL's original Node tests or verify database/crash atomicity. The reported historical counts of 58 PURL and 75 GiN tests are not newly verified counts. |
| C3 / `PURL_INDEPENDENT_DISCOVERIES.md:5` | Correct proof for total deterministic `δ:X→X` on `π(X)` | Partial operations need equal definedness in each fiber; observable effects must factor through the projection too. Finite checking needs the full declared domain and closure. |
| C4 / `PURL_FORMAL_SEMANTICS.md:92` | Sound distinction between address, derivation, value and execution | Add the God seed's content/environment/build/principal/session identities. Specify typed encodings and algorithms. A digest is operational collision-resistant evidence, not a theorem of semantic equivalence. |
| C5 / `PURL_INDEPENDENT_DISCOVERIES.md:51` | Sound authority principle; upstream behavior reported | Discovery cannot grant authority. Actual authentication, grant attenuation/revocation, per-resource scopes and execution-time rights must be exercised in integration. |
| C6 / `PURL_INDEPENDENT_DISCOVERIES.md:43` | Correct threat-model argument; tiny witness reproduced | An attacker recomputing unkeyed hashes can replace a self-contained history. Signatures only establish the promised trust if the verifying key/checkpoint is independently trusted and rotation is covered. |
| C7 / `PURL_TRANSITION_LANGUAGE.md:3` | Correct finite-state argument | `n` counts transitions, and a generated history has `n+1` states. Exact external times/labels add assumptions or outside information; unbounded finite records do not give the toggle unbounded memory. |
| C8 / handoff JSON | Properly scoped absence-of-evidence statement | Current PURL/0.1 source inspection is not proof of general sandbox execution. New runtime behavior needs new tests and receipts. |
| CGT/GiN manuscript theorem listings / theory map | Classical or self-checked exposition as labeled | No external peer review or novelty claim is established by this bundle. Ring converse-fiber claims require their algebraic hypotheses and cannot classify generic HTTP failures. |
| POC-01 through POC-12 / `PURL_OPEN_CONJECTURES.md` | Open hypotheses except the scoped classical quotient result | Static effect-system soundness, compression gains, safer delegation, causal induction and cross-provider advantage remain unproved or unmeasured. |

### Required strengthening of projection admission

Let `D` be an explicitly declared finite reachable domain, `π:D→Y` a projection, and for each exposed operator `o`, let `enabled_o(s)` record definedness under the modeled preconditions. When enabled, let `δ_o(s)` be its successor and `e_o(s)` its observable effect record. To define an enabledness-preserving deterministic quotient with the same effect observations, require for every `s,t∈D` such that `π(s)=π(t)`:

1. `enabled_o(s)=enabled_o(t)`;
2. when enabled, `π(δ_o(s))=π(δ_o(t))`;
3. when enabled, `e_o(s)=e_o(t)` under a stated effect observation policy.

Also check `δ_o(s)∈D` when the checker claims a closed executable state model. Each failure should return the operator, original states, common projection and conflicting definedness/effects/successors. The same representative-independence proof used by the bundle gives sufficiency under these assumptions. This is an engineering specialization of the classical result, not a novelty claim.

The extension matters even when successor observations agree. If hidden bit `b` makes an operation legal only for `b=0`, projecting `(a,b)` to `a` loses whether the operation is defined. If an operation leaves `a` unchanged but sends a network request only when `b=1`, equal projected successors still hide an effect mismatch. Both examples pass a successor-only criterion while failing the God seed's contract.

A list of observed transitions is not a declaration that every other successor or hidden state is impossible. A trace-derived program can be certified relative to its recorded finite relation or a supplied closed deterministic domain; it cannot honestly claim general semantic equivalence from sparse samples. Reject conflicting observations and uncovered states, or label the result a trace-specific replay program.

### Identity and replay implications

The toy `canon()` at `commission_checks.py:19` is Python `json.dumps(sort_keys=True,separators=(',', ':'),ensure_ascii=False)`. It is not an implementation of the versioned URL normalization policy or RFC 8785 mentioned in the theory map. E4 hashes two already supplied path strings. Production identity checks therefore need independent cross-runtime fixtures for canonical transport bytes, AST, typed values, content, environment, build and execution; finite-number/string/Unicode policies must be explicit.

Replay should verify a recorded effectful receipt rather than reissue its action. Missing external responses, environment data, operator versions, seeds or machine arithmetic semantics require `replay-incomplete` or an equivalent explicit refusal. The toy integer reducer does not establish cross-runtime numeric equivalence or side-effect replay. The versioned transition function, input ordering and initial state belong in the receipt contract.

## Compatibility and internal tensions

| Issue | Source-grounded observation | Resolution |
|---|---|---|
| Schema drift | Formal sample uses `protocol`, array `operators`, `version`; mission JSON uses `schema`, object `operators`, `operator_version`; toy uses `commission-toy/0`, `source`/`target` and `completed`/`next`. | Freeze one runtime schema and explicit adapters; preserve the research examples as historical fixtures. |
| Effect drift | Formal vocabulary is `{pure,local,external-read,mutation,network,process}` but examples use `local-process`; the God seed distinguishes local effects/external mutation. | Define one versioned effect enum and subset rules. Pure should be `[]`, as the formal prose itself recommends. |
| Rights drift | Toy persistence requires `write`; example checkpoint requires `append`; builds use `execute`. | Map actual upstream rights to target operations explicitly, including conditional composite requirements. Never infer a grant from an effect name. |
| Type drift | `Raw`, `AST`, `Checked`, `Value` differ from example `text`, `ast`, `checked-ast`, `artifact`. | Use namespaced canonical types and declared conversions. Matching labels are not enough to establish compatibility. |
| Completion claims | Mission fixture says n1/n2 completed and n3 ready while included events explicitly say `verified:false` and artifact references are empty. | It is correctly labeled a nonexecutable contract example. A live runtime must derive readiness from verified dependency receipts and completion predicates, not trust these fields as evidence. |
| Graph termination | Grammar table recommends a DAG but correctly warns that a node can call nonterminating code. The God seed also requires branching and bounded repetition. | Bounded language constructs plus runtime time/CPU/memory budgets; no claim that a DAG alone guarantees termination. |
| Publication/authority | Research recommends versioned registries and separate publish authority; SEURL labels are ambiguous. | Treat START/SWITCH/WRITE/COMMIT/TALK/PERTURB as typed, contextual macros where justified; BUILD is a new worker contract. Preserve loss and reject false equivalence. |
| Run/generator evidence | `create_handoff.py:63` hardcodes 17 passing tests and fixed claim statuses; it reads result values but does not run the suite. | Do not invoke this generator as a fresh verification mechanism or overwrite original research evidence. New results need measured commands, revisions and timestamps. |
| Preregistration language | README calls the checks preregistered; `PURL_EXPERIMENTS.md:79` explicitly says the specification accompanied the run and was not timestamped before execution. | Describe the archived checks as accompanying specifications. New E01–E10 protocols should be pinned before their corresponding new runs; preserve any earlier exploratory runs. |
| Historical release gate | README includes a no-deploy/merge gate and per-act confirmation wording from the earlier read-only commission. The enclosing God seed authorizes implementation and deployment where authorized, reserving destructive/consequential actions. | The active user's authorization governs this session. Keep substantive verification and external-authority requirements; do not mistake the old research commission's workflow for a new blanket permission demand. |

The title “identity lattice” is informal: the document enumerates useful identity notions but defines no lattice ordering, meet or join. Product documentation can call these identity namespaces without importing unproved algebraic structure.

The book proposals are explicitly gated pedagogical/research directions. They are not evidence that a new mathematical field or completed body of empirical research exists. Their proposed 30+ mission benchmark is a future publication threshold, not a performed trial.

## The ten required God seed experiments

Source of truth: [GODSEED.md:29](/workspace/PURL_GODSEED_V3/GODSEED.md:29). These identifiers deliberately use two digits to avoid collision with archived E1–E7. For **each** new experiment the contract requires a hypothesis, controls, exact source revision, metrics, falsification threshold, executable scripts, negative evidence and machine-readable results. Save failed runs as well as the final outcome. Use PASS/FAIL/BLOCKED/NOT_RUN with a separate LIVE/FIXTURE/SIMULATED/UNAVAILABLE execution classification where appropriate.

| Required experiment | Minimum distinct evidence | What the archived bundle supplies |
|---|---|---|
| E01 Identity | Same value/different address and derivation, stable canonical hashes, no namespace or semantic-equivalence confusion | E4 is a useful two-expression toy control; no URL parser, canonicalization suite, content/environment/build IDs or cross-runtime trial. |
| E02 Grammar | Parse, type, composition and normalization; valid/invalid ops; effects/capability errors; deterministic pure results | E3 validates a finite nominal chain model; no parser, branches, bounded repetition, IR normalization or live runtime. |
| E03 SEURL reconciliation | Measured mappings of all seven verbs against actual PURL grammar, retaining lossy cases and rejecting false equivalence | A thoughtful mapping table and refusal policy, not executable adapter conformance. |
| E04 SubstrateIO projection | Positive replay plus explicit noncongruent counterexample; compiler rejects the unsound trace | Four-state successor quotient check and pure replay controls; no real source adapter or definedness/effect admission checks. |
| E05 AI-authored program | Author/test/build/publish Python or JS; independently discover/reuse by immutable PURL | No performed trial or worker. Local reuse can be labeled local, but not independent-provider evidence. |
| E06 Security | File/network/process isolation escapes, SSRF, forged principal, revoked grant, stale version and idempotency | A simple subset-rights unit test and unknown-op refusal, no adversarial integration. |
| E07 Continuity | Sessions A/B/C read/propose/commit/reconstruct with actual authority; simulation labeled | E6 performs offline metadata extraction only. No HTTP, authentic principal, proposal/commit or session isolation. |
| E08 Game | Backend validates tic-tac-toe turns; multiplayer races; replay after restart | No game evidence. |
| E09 God-seed mission | The full directive encoded in typed executable graph; fresh navigation/checkpoint; plain-text URL baseline | Nonlive toy build-test mission JSON, not the full directive or a comparative run. |
| E10 Cold rebuild/UI | Clean checkout/migrations/worker/app; full Playwright flow; capsule whole-surface/touch/keyboard copy; IDE compile/run; persistence/replay; screenshots/accessibility/performance | No UI, migration, cold rebuild, worker or browser evidence. |

At this audit boundary, all ten complete product experiments remain **NOT_RUN**. The archived mathematical controls pass within their declared toy scope. The main implementation may update the ten statuses only from new, attributable integration evidence.

## Read inventory and preserved evidence

Read in full: `README_HANDOFF.md`, `PURL_CGT_GIN_THEORY_MAP.md`, `PURL_FORMAL_SEMANTICS.md`, `PURL_TRANSITION_LANGUAGE.md`, `PURL_GRAMMAR_RECOMMENDATIONS.md`, `PURL_INDEPENDENT_DISCOVERIES.md`, `PURL_OPEN_CONJECTURES.md`, `PURL_NEW_RESEARCH_DIRECTIONS.md`, `PURL_BOOK_PROPOSALS.md`, `PURL_NEXT_SESSION_SEED.md`, `PURL_EXPERIMENTS.md`, `PURL_MISSION_EXAMPLE.json`, `PURL_REVIEW_HANDOFF.json`, `create_handoff.py`, `experiments/commission_checks.py`, and `experiments/results.json`.

Preserved artifacts outside the original bundle:

- [Rerun record](/workspace/research-evidence/rerun-evidence.json)
- [Original-file hashes before execution](/workspace/research-evidence/source-sha256-before.json)
- [Original-file hashes after execution](/workspace/research-evidence/source-sha256-after.json)
- [Regenerated results](/workspace/research-evidence/commission-rerun/results.json)
- [Exact unittest stderr](/workspace/research-evidence/original-source-unittest.stderr)

No upstream production claim, deployment result, external proof review or independent-provider result is asserted by this audit.
