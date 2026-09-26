# exp-0002 — ACSP × PURL composition

**Question.** Can PURL provide an addressable, compositional computational
substrate while ACSP provides the continuity, authority, provenance,
checkpoint and transport envelope needed to move computational artifacts
between independent agents?

**Short answer, as measured.** PURL resources compose into computation graphs
using only existing operations (closure: yes), a shared subexpression can be
one resource referenced by many, and ACSP moved such computations between two
agent processes that each verified the other's work and caught both injected
faults. The substrate does **not** provide content addressing, does not
identify equivalent or commuted expressions, does not evaluate or attest to
any computed value, and gives no complexity advantage beyond what a map, a
reverse index and memoised traversal give. Every result below is from
[`record.json`](record.json) (run 2) unless marked.

| | |
|---|---|
| Pre-registration | [`definition.json`](definition.json), commit `007558f`, before any composition code |
| Primary run | run 2 · purl `e3c74c3` · acsp `4302e86` · clean worktrees · Node v22.22.2 linux x64 |
| Earlier run | [`run-1/`](run-1/) · purl `07c9c36` · same 14 outcomes · two measuring defects, see §9 |
| Output hash (run 2) | `sha256:7c893ea15e5beda85f15cc68f18077ddb2f303b84531cb936c0e1246a9ba693a` (timing excluded) |
| Reproduce | `npm run reproduce -- exp-0002` (needs the ACSP checkout for the handoff section) |
| Raw handoff logs | [`raw/handoff.json`](raw/handoff.json) |
| Design | [`docs/composition.md`](../../docs/composition.md) |

The sections keep four kinds of statement apart, labelled **OBS**
(observation), **TRF** (transformation of observations), **INT**
(interpretation) and **HYP** (pre-registered hypothesis and its mechanical
outcome). The record itself contains no interpretation and no conclusion.

---

## 1. Outcomes of the pre-registered hypotheses

| | Statement | Outcome |
|---|---|---|
| H1 | Closure C1 → C2 → C3 with existing PURL operations only | supported |
| H2 | Deterministic construction under a deterministic store | supported |
| H3 | PURL state hash is content-addressed w.r.t. value | **not supported** |
| H4 | State hash invariant to serialisation of the submitted state | supported |
| H5 | State hash invariant to irrelevant metadata | **not supported** |
| H6 | Representation identifies XOR(A,B) with XOR(B,A) | **not supported** |
| H7 | Representation captures extensional equivalence | **not supported** |
| H8 | Shared subexpression stored once, evaluated once, pinned identically | supported |
| H9 | Application state hash = F(operation, operand hashes, value) alone | **not supported** |
| H10 | Staleness identifiable from substrate provenance; unaffected branches valid | supported |
| H11 | Operation counts scale as the data structure predicts | supported |
| H12 | Lookup time flat in n; scan grows; index search flat | **not supported** |
| H13 | Computation nodes survive a store restart | supported |
| H14 | ACSP moves a computation between independent agents with independent verification | supported |

Runs 1 and 2 agree on all fourteen.

## 2. What was built (summary; details in docs/composition.md)

- **OBS** Neither protocol changed. The PURL operation vocabulary hash is
  `sha256:1422638e…f697` before and after (`observations.examples.vocabulary_hash`).
  ACSP gained a local HTTP wrapper for experiments and one harness scenario.
- A computation node is an ordinary PURL resource. A literal's state is
  `{compute, node: "literal", value}`. An application's state is
  `{compute, node: "application", operation, operands: [pin…], value, evaluator}`,
  where a pin is `{resource, version, state_hash}`, plus one `link`
  (`references`) per operand at the pinned version.
- The value of an application is **the creator's claim**. The server stores
  it; nothing on the server evaluates it. Verification means reading every
  node of the cone at its pinned version, comparing state hashes with the
  pins, and re-evaluating.
- The algebra is NOT, AND, OR, XOR, CONCAT and HASH over bit strings, each
  with an explicit operand schema. Declared properties are checked
  exhaustively over single bits by the tests; they are never used to rewrite
  an expression.

## 3. Computation examples and closure (H1)

**OBS** (over HTTP, deterministic store; `observations.examples.nodes`):

| Node | Resource | Version | Value | Events | Cone verified |
|---|---|---|---|---|---|
| 0 | r_000001 | 2 | 0 | 2 | — |
| 1 | r_000002 | 2 | 1 | 2 | — |
| C1 = XOR(0,1) | r_000003 | 4 | 1 | 4 | 3 nodes ✓ |
| C2 = XOR(C1,1) | r_000004 | 4 | 0 | 4 | 4 nodes ✓ |
| C3 = AND(C1,1) | r_000005 | 4 | 1 | 4 | 4 nodes ✓ |
| K = CONCAT(C1,1) | r_000006 | 4 | 11 | 4 | 4 nodes ✓ |
| HK = HASH(K) | r_000007 | 3 | 256 bits | 3 | 5 nodes ✓ |
| H0 = HASH(0) | r_000008 | 3 | 256 bits | 3 | 2 nodes ✓ |
| HX = XOR(HK,H0) | r_000009 | 4 | 256 bits | 4 | 7 nodes ✓ |
| N = NOT(C3) | r_000010 | 3 | 0 | 3 | 5 nodes ✓ |
| E = OR(C2,N) | r_000011 | 4 | 0 | 4 | 7 nodes ✓ |

Every node's URL serves a PURL document of kind `resource`, a manifest with
its operations evaluated for the requester, a valid `/verify`, and
`/lineage` whose `inbound` lists the nodes that reference it. Construction
evaluated 3 XOR, 1 AND, 1 CONCAT, 2 HASH, 1 NOT and 1 OR: one evaluation per
application node.

**HYP** H1 supported. Every output was itself used as an operand, with no
protocol change.

**INT** Closure here is *representational*: a result is a resource of the
same kind as its inputs, so any operation that takes resources takes
results. Nothing in PURL makes the result's value correct. Closure of the
*value* domain comes from the algebra (bit strings in, bit strings out, with
HASH mapping any length to 256 bits), not from PURL.

## 4. Hashing, identity and equivalence (H3–H7, H9)

**OBS** Equality of seven identifiers for paired nodes
(`observations.equivalence`; ✓ = equal):

| Pair | resource id | value | value hash | PURL state hash | merkle-by-value* | merkle-by-identity* | head event hash |
|---|---|---|---|---|---|---|---|
| E1 XOR(0,1) built twice, same operands | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| E2 same values, different operand resources | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| E3 XOR(A,B) vs XOR(B,A) | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| E7 Y built before vs after Z (fresh stores) | ✗ | ✓ | — | ✗ | ✓ | — | — |
| E8 XOR(a,b) vs OR(AND(a,¬b),AND(¬a,b)), every assignment | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | — |

\* baselines computed outside PURL; not PURL properties.

- **OBS** E1: the two records differ at exactly `/id`, `/created_at`,
  `/updated_at`, `/grants/<id>` (grant ids) and `/relations/*/at`.
- **OBS** E4: five closed forms of the value 1 (literal, XOR(0,1),
  NOT(NOT(1)), AND(1,1), OR(0,1)) give 1 distinct value hash and 5 distinct
  resource ids, state hashes, merkle-by-value and merkle-by-identity hashes.
- **OBS** E5: two byte-different JSON bodies (keys permuted, whitespace)
  submitted to fresh deterministic stores give the same state hash.
- **OBS** E6: adding `note` to a literal's state changes the state hash
  (the only differing path is `/state/note`).
- **OBS** E8: over all four assignments of the mutable literals a, b
  (updated in place, dependents recomputed in place), XOR and the OR/AND/NOT
  form agree on every value; XOR and AND disagree on three. No identifier is
  equal for the equivalent pair across assignments.
- **TRF** An application's state hash covers 25 record paths that are not
  fixed by (operation, operand pins, value, evaluator): `/id`, `/created_at`,
  `/updated_at`, `/created_by`, `/owner`, `/version`, the public grant's
  eleven fields, `/relations`, `/lifecycle/*`, `/assignee`, `/collections`,
  `/derived_from`, `/protocol`, `/type`
  (`H9_triples.state_hash_inputs_of_an_application`).

**HYP** H3, H5, H6, H7 and H9 not supported; H4 supported.

**INT**
- PURL's state hash is a **commitment to one record at one version**,
  including who made it, when, and under which ids. It is canonical-JSON
  based, so serialisation does not matter (H4), but everything else in the
  record does. It is not content addressing: equal values, equal
  expressions and equal inputs do not share it (H3, H9).
- A deterministic F with H(C) = F(H(A), H(B), …) exists only in the trivial
  sense that C's record embeds H(A) and H(B) in its pins and H(C) is the hash
  of that record. The embedding is a design choice of the bridge, not a
  property of PURL. The resulting structure is a Merkle DAG over *records*
  (execution history), not over values. F needs C's id, timestamps, owner,
  grant ids and relation times, none of which follows from the inputs.
- The representation records **how a value was produced, by whom and when**.
  It captures equal outputs only by comparing values, and equivalence only by
  exhaustive evaluation, which the experiment did outside the substrate. No
  identifier, including the structural baselines, identifies equivalent
  expressions: merkle-by-value is structural, so it separates commuted
  operands (E3) and distinct formulas (E8).

## 5. Shared subexpressions (H8)

**OBS** Graph: A=0, B=1, C=0, D=0; X = XOR(A,B); Y = AND(X,C); Z = OR(X,D);
W = AND(C,D). Compared with the same expressions built with two separate
copies of XOR(A,B) (`observations.sharing`):

| | shared X | two copies of X |
|---|---|---|
| resources | 8 | 9 |
| events | 24 | 28 |
| log bytes | 18 651 | 21 930 |
| XOR evaluations during construction | 1 | 2 |
| X's provenance (events) stored | once (4 events) | twice |
| pins of X in Y and Z | identical `{r_000005, 4, sha256:4fab0f4b…}` | different resources |
| state hashes of the two X copies | — | different |
| merkle-by-value of the two X copies | — | equal |

Verifying Y and Z (`verification`):

| | nodes visited | reads | hash ops |
|---|---|---|---|
| one pass, shared memo | 7 | 14 | 74 |
| two separate passes | 10 | 22 | 106 |
| one pass, no memo | 10 | 28 | 112 |

Lookup of X by id: 1 read. Inbound relations of X: Y and Z.

**HYP** H8 supported.

**INT** Sharing works because the builder *chose* to reuse X's resource
id. PURL has no mechanism that finds an existing equal subexpression: the two
copies in the baseline have different state hashes, and only the external
merkle-by-value baseline notices they are the same. Savings in verification
come from the verifier's memo, not from the substrate.

## 6. Dynamic update (H10)

**OBS** A changed from 0 to 1 by `update`, in place (`observations.update`):

- Dependents found through the inbound-relation index: X, Y, Z (4
  traversals, 4 reads). The same result by scanning every application
  node: 4 scanned.
- **Locally stale** (a pin behind its operand's head): X only. Y and Z pin
  X at its head, so they look fresh. **Transitively stale** (found by walking
  the cone): X, Y, Z. W (= AND(C,D)): not stale, not a dependent.
- Path copying: 3 new resources (X′, Y′, Z′), 3 evaluations, 12 writes,
  51 hash ops. Each new node declares `supersedes` to the old one. Every
  original node still verifies at its own version.
- In place: 0 new resources, 3 evaluations, 6 writes, 27 hash ops; X, Y, Z
  advance to version 6; their pre-update versions still verify by replay.
- Values: X 1→0, Z 1→0, **Y 0→0 unchanged**, yet Y′ has a new state hash
  (and a new merkle-by-value, because its operand X changed).
- **Which hashes changed:** the state hash of A, of every node in the cone
  above A (in-place), or new state hashes for the new nodes (path copy). B,
  C, D and W kept theirs.

**HYP** H10 supported.

**INT** The substrate's provenance, meaning immutable history, version pins
and the inbound index, is enough to find what an update invalidates and to
keep old results verifiable. The graph then behaves like a persistent data
structure: path copying leaves old roots intact and shares untouched
branches. But staleness is only *locally* visible one level up; everything
above needs traversal. Also, state-hash pins defeat early cutoff: Y's value
did not change, but its identity did, so anything above Y would have to be
re-pinned too.

## 7. Complexity (H11, H12)

### 7.1 Operation counts (deterministic; `observations.counts`)

Chain (x_i = XOR(x_{i−1}, b)) and balanced XOR tree over n random bits:

| family | n | app nodes | events | log bytes | construction hash ops | verify reads (memo) | verify reads (no memo) | dependents via index: reads / found | dependents via scan: scanned | leaf update: nodes recomputed |
|---|---|---|---|---|---|---|---|---|---|---|
| chain | 10 | 10 | 44 | 35 558 | 140 | 25 | 63 | 11 / 10 | 10 | 10 |
| chain | 100 | 100 | 404 | 330 668 | 1 310 | 205 | 603 | 101 / 100 | 100 | 100 |
| chain | 1 000 | 1 000 | 4 004 | 3 281 768 | 13 010 | 2 005 | 6 003 | 1 001 / 1 000 | 1 000 | 1 000 |
| chain | 10 000 | 10 000 | 40 004 | 32 792 768 | 130 010 | 20 005 | 60 003 | 10 001 / 10 000 | 10 000 | 10 000 |
| tree | 10 | 9 | 56 | 43 351 | 167 | 39 | 57 | 5 / 4 | 9 | 4 |
| tree | 100 | 99 | 596 | 463 021 | 1 787 | 399 | 597 | 8 / 7 | 99 | 7 |
| tree | 1 000 | 999 | 5 996 | 4 659 721 | 17 987 | 3 999 | 5 997 | 11 / 10 | 999 | 10 |
| tree | 10 000 | 9 999 | 59 996 | 46 626 721 | 179 987 | 39 999 | 59 997 | 15 / 14 | 9 999 | 14 |

Lookup by id: 1 read and 1 hash operation at every n, in both families.

**TRF** Log-log slopes over n = 10…10 000: construction, storage, full
verification and provenance reads are all ≈ 1.0 (0.97–1.01). Index-based
dependents: 0.99 (chain), 0.16 (tree). Scan: 1.0. Leaf update: 1.0 (chain),
0.18 (tree). Storage per node: ≈ 3.28 kB and 4.0 events (chain);
≈ 2.33 kB and 3.0 events per node averaged over leaves and applications
(tree). A value is 1 bit.

**TRF** Structural duplication in the tree (application nodes whose
merkle-by-value equals another's, i.e. what a hash-consing index would
remove): 22 % at n = 10, 59 % at 100, 75 % at 1 000, **85 % at 10 000**
(8 479 of 9 999). The chain has none.

**HYP** H11 supported: 1 read per lookup at every n; memoised verification
reads grow ×8.2–10.2 per ×10 in n; tree leaf updates touch exactly
⌈log₂ n⌉ nodes (4, 7, 10, 14) and chain leaf updates exactly n.

### 7.2 Wall-clock (one machine; not in the output hash; `observations.timing`)

Medians, run 2 (run 1 within the same order of magnitude everywhere):

| family | n | map lookup µs | head (read + state hash) µs | HTTP GET state ms | full cone verify ms | dependents index ms | dependents scan ms | hash-index lookup µs | value search by scan ms | leaf update ms |
|---|---|---|---|---|---|---|---|---|---|---|
| chain | 10 | 0.21 | 22.6 | 0.80 | 5.2 | 0.028 | 0.033 | 0.17 | 0.017 | 4.8 |
| chain | 10 000 | 0.95 | 25.9 | 0.84 | 3 373 | 29.4 | 26.7 | 0.14 | 15.4 | 5 585 |
| tree | 10 | 0.19 | 22.0 | 0.81 | 4.8 | 0.011 | 0.046 | 0.14 | 0.028 | 2.0 |
| tree | 10 000 | 1.05 | 25.3 | 0.78 | 4 794 | 0.032 | 51.4 | 0.14 | 31.6 | 7.2 |

Creation cost ≈ 0.23–0.43 ms per node at every n (slope of per-node time ≈ 0).

**HYP** H12 not supported, in both runs, for two reasons:
- direct `Map` lookup was 4.5× (chain) and 5.4× (tree) slower at n = 10 000
  than at n = 10 (0.2 µs → 1 µs), where the criterion allowed 3×;
- index-based dependent search in the chain has slope 1.0, because the
  answer itself has n members. In the tree it is 0.15.

**INT**
- Nothing here is constant-time *computation*. A result is computed once, at
  creation, by the client, at a cost linear in the nodes it creates.
  Afterwards, "retrieving a result" is a hash-map lookup of a cached record
  (1 read), which is a property of caching and indexing, not of derivation.
  Verifying a result costs time linear in its cone.
- The lookup-time growth is sub-microsecond and the read count is flat, so
  it is most plausibly memory-hierarchy behaviour of a larger map rather
  than algorithmic growth. It was not investigated, and the pre-registered
  criterion failed regardless.
- The inbound index makes dependents search output-sensitive
  (O(|dependents|)) instead of O(N). That is what any reverse index gives.
- A hash-consing index (the 0.14 µs baseline lookup) could find existing
  equal subexpressions in constant expected time and would remove 85 % of
  the tree's application nodes. PURL has no such index, and its identifiers
  could not key one (§4).

## 8. The ACSP envelope and two independent agents (H14)

**OBS** Three runs; the owner is this process. Agents A and B are separate
OS processes (distinct pids), each given only the ACSP resource URL, its own
capability and its session id (`observations.handoff_outcomes`,
`raw/handoff.json`):

| | honest | A misreports value in ACSP | A writes a wrong value into its PURL node |
|---|---|---|---|
| A: scopes seen / is owner | read, append, annotate, checkpoint, handoff / no | same | same |
| A: performed | C = 1 | PURL C = 1, ACSP claims 0 | PURL C claims 0, ACSP claims 0 |
| B: recomputes every ACSP checkpoint hash with PURL's canonicaliser | ✓ ✓ | ✓ ✓ | ✓ ✓ |
| B: checks on A's result | all pass | `acsp_claim_equals_purl_value` fails | `purl_cone_verifies` fails |
| B: annotation on A's finding | validation | dispute | dispute |
| B: performed | D = 0 | nothing | nothing |
| B: append as session-a | 403 `session_mismatch` | same | same |
| A: append as session-owner | 403 `session_mismatch` | same | same |
| owner: ownership at end | session-owner | session-owner | session-owner |
| task responsibility at end | session-owner (after owner → A → B → owner) | same | same |
| ACSP events by owner / A / B | 6 / 4 / 5 | 6 / 4 / 4 | 6 / 4 / 4 |
| identity_assurance of A's and B's events | capability only | capability only | capability only |
| owner's own events | `asserted` (create) and `capability` | same | same |

**HYP** H14 supported.

**INT**
- The separation ACSP promises held in every run. B needed its own
  delegated capability to accept the handoff (a handoff grants nothing),
  could not act as A, and its validation and dispute annotations are
  attributed to B.
- The chain of commitments crosses both protocols. The ACSP checkpoint hash
  covers the finding TOK's text, which contains the PURL pin
  `{resource, version, state_hash}`. That state hash covers C's record,
  which contains its operands' pins. But every link in that chain is a
  claim until someone re-evaluates. ACSP verifies authority and history,
  PURL verifies internal log consistency, and **neither verifies the
  computation**. The misreport and the wrong node were caught only because
  B re-read PURL and re-evaluated. The wrong node itself passes PURL's
  `/verify` (see also `test/compute.test.js`, "faults").
- The agents are deterministic programs. The runs show what the substrates
  permit and refuse, not what an LLM agent would do.

## 9. Two runs, and corrections

Run 1 (commit `b486ac3`) and run 2 agree on all fourteen outcomes and on
every deterministic value except these, caused by defects in the measuring
code (not in either protocol), found while writing this report:

| field | run 1 | run 2 | cause |
|---|---|---|---|
| `update.*.recompute.evaluations` | 10 | 3 | counter read after two verification passes |
| `update.in-place.recompute.writes` / final versions | 9 / 7 | 6 / 6 | composer re-linked already-linked operands |
| `examples.evaluations` | cumulative | split into construction / including verification | clarity |

Run 1's worktree flag was `dirty` because two files unused by the run were
created during it. Run 1's raw handoff log was not committed with it
because `data/` is gitignored. It is now in `run-1/raw/` with a matching
hash. None of the hypothesis criteria reads the corrected fields.

## 10. Surprises, with the raw evidence kept

1. **`link` is declared idempotent but is not idempotent in the log**
   (exploratory, not pre-registered: `observations.equivalence.E9_repeated_link_exploratory`).
   A second identical `link` leaves `relations` unchanged but appends an
   event, advancing `/version` and `/updated_at`, so the state hash changes
   (`sha256:3ba7c74d…` → `sha256:d27ded22…`). The registry marks `link`
   `idempotent: true`. `append` with a known entry id, by contrast, emits no
   event. This is the defect that inflated run 1's in-place writes.
2. **State hashes depend on the instance's history, not only on the
   operations performed.** Starting a PURL server first writes the
   `purl-protocol` resource, which shifts every later id and timestamp. And
   under the test clock, which ticks per call, a port that makes extra
   *reads* produces different timestamps. The in-process and HTTP ports
   therefore produce records that differ only in time fields
   (`test/compute.test.js`, "ports"). Under a wall clock, the equivalent
   statement is that state hashes depend on when things happened.
3. **85 % of a random XOR tree's application nodes are structurally
   duplicate at n = 10 000.** The substrate stores each one separately with
   ≈ 2.3 kB of history.

## 11. Supported claims

- PURL resources can serve as nodes of a computation graph using only
  `create`, `link`, `update` and existing projections; results are
  addressable, inspectable, verifiable by log replay and usable as operands
  (H1).
- Construction is byte-deterministic under a deterministic store (H2), and
  the whole deterministic record reproduces from a fresh process, including
  re-run multi-agent handoffs (output hash identical).
- The PURL state hash is invariant to JSON serialisation (H4).
- A subexpression built once can be referenced by many consumers; it is
  stored, evaluated and recorded once (H8).
- Version pins plus the inbound-relation index identify all dependents of a
  change; old results remain verifiable; path copying behaves like a
  persistent data structure (H10).
- Operation counts scale linearly with nodes created or verified, and
  logarithmically for tree leaf updates (H11).
- Nodes survive a restart (H13).
- ACSP carried computations between two separate agent processes without
  merging identities, and the receiving agent's verification caught both
  injected faults (H14).

## 12. Unsupported claims

- PURL provides content addressing (H3). It does not.
- Equal computations share an identity or commitment (H3, E1, E4, H9). They do not.
- The representation captures commutativity or mathematical equivalence
  (H6, H7). It does not. Equal outputs are visible only by comparing values;
  equivalence only by exhaustive evaluation outside the substrate.
- The state hash is compositional in the Merkle sense over *values* (H9). It
  is compositional only over records, by the bridge's choice to embed pins.
- Any constant-time computational primitive. Retrieval is O(1) because it
  is a cached map lookup; derivation and verification are linear in the
  nodes involved. Timing criterion H12 failed.
- The substrate verifies computations. Neither server does.

## 13. Representation limitations

- A result's value is a claim; there is no server-attested evaluation.
- Identity is per record (random or sequential id + history), so
  independent builders cannot recognise each other's equal results without
  an external index.
- Every node carries ≈ 2.3–3.3 kB and 3–4 events of history to hold 1 bit.
- Pins by state hash force re-pinning above every recomputed node, even when
  its value is unchanged (no early cutoff).
- Staleness is visible locally only one level above a change.
- Pins and links are scoped to one PURL instance. The agents check
  `same_instance`; cross-instance pins are unaddressed.
- Operand order is part of the representation; no normalisation exists, by
  design of both protocols.

## 14. Independent-agent analysis

*Pending: filled in from* [`independent-analysis.md`](independent-analysis.md)
*when the blind review returns.*

## 15. Next experiment

Proposed as **exp-0003**, to be pre-registered separately:

1. **Content view vs. record view.** Add an additive, server-computed
   `content_hash` (hash of `state` only) to PURL events, and re-run E1–E8
   and the sharing and update sections. Measure: dedup rate available to a
   hash-consing index keyed on it, early-cutoff opportunities in update
   propagation, and what linkability across principals it introduces.
2. **Fix or re-declare `link` idempotence** (Q-X2), and check that no other
   operation declared idempotent appends events on repetition.
3. **LLM agents in the envelope.** Replace the deterministic agents with
   language-model agents given only the ACSP URL and a capability. Measure
   whether they discover and perform verify-before-build, and whether the
   two fault injections are caught.

New open questions are recorded in
[`RESEARCH_QUESTIONS.md`](../../RESEARCH_QUESTIONS.md) (Q-X1 … Q-X7).
