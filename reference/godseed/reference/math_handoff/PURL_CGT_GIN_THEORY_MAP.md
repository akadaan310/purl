# Source-grounded crosswalk: PURL × CGT × GiN × ACSP × SEURL × SubstrateIO

**All source refs are pinned to specific revisions (2026-10-18).** A reference implementation is evidence of a code mechanism, not evidence of a deployed service, a peer-reviewed proof or a new theorem. Source lines may change after the listed SHA.

## Exact crosswalk

| Item | Source / claim | Evidence classification | Potential PURL use | Judgment |
|---|---|---|---|---|
| CGT-DEF-001 | `computationalgrammartheory/DEFINITIONS.md`: structure vs representation | Standard, defined | Distinguish resource semantics from URL serialization | **IMPORT NOW** |
| CGT-DEF-002, -003 | `DEFINITIONS.md`: alphabet of moves, relation on states, admissibility language | Standard LTS + provisional CGT packaging | Path parser + admissibility checker + labeled operational steps | **IMPORT NOW** |
| CGT-PROP-001 | `RESULTS.md`: words interpret to relations; concatenation maps to relational composition | Standard proposition / self-checked exposition | Compositional pure operation fragment | **IMPORT NOW**, with typing |
| CGT-DEF-006 | `DEFINITIONS.md`: shortlex grammatical address | Provisional / related to automatic structures | Choose a canonical path among many *syntactic* aliases | **EXPERIMENT**, not semantic identity |
| CGT-DEF-007, -011 / THM-006 | `DEFINITIONS.md`, `RESULTS.md`: transition monoid, arithmetically compilable structure, restricted tree word compilation | Standard / self-checked scope statement, novelty unverified | Compile path fragments where finite verified summary exists | **EXPERIMENT** |
| CGT-THM-004 | `RESULTS.md`: same semantics, differing grammar shapes and costs | Established elements plus self-checked counting | Distinguish composition depth from total work | **IMPORT COST DISCIPLINE** |
| CGT-THM-007 | `RESULTS.md`: constant-sized summaries do not cover arbitrary tree shapes | Elementary counting / self-checked | Guard against O(1) metadata claims on unbounded programs | **IMPORT NEGATIVE BOUNDARY** |
| GiN-DEF-001…004 | `grammarinnumbers/DEFINITIONS.md`: number, numeral, encoding, machine state | Classical distinction | Distinguish URL bytes, typed AST, denotation, runtime event | **IMPORT NOW** |
| GiN-DEF-005…008 | Digit grammar, value map, canonical numeral, affine transition monoid | Classical positional notation with framework packaging | Numerical route params and canonical encoding checks | **IMPORT SELECTIVELY** |
| GiN-DEF-015…017 | Converse problems, none/unique/many solutions, repairs | Standard relational converse + GiN vocabulary | Failure classes for inversion/undo and resource query results | **IMPORT NOW**, keep domain hypotheses |
| GiN-DEF-061 | Four evaluation layers: syntax, typing, semantics, execution | Framework refinement | Distinguish parser error, type error, undefined operation, denied runtime | **IMPORT NOW** |
| GiN-THM-001 | Solutions to `b*c=a` empty or annihilator coset in commutative rings | Classical theorem, self-checked exposition | Only for ring-valued operation modules; not a generic HTTP law | **KEEP SEPARATE** |
| THE NUMBER / NUM-DEF-004 | `grammarinnumbers` PR #1 `research/the-number/FOUNDATIONS.md`: obligations O1–O5 | Definition + toy confirmations | Track value preservation, commutation, converse classes, cost and syntax transforms | **EXPERIMENT** |
| PURL/0.1 SPEC | `purl/SPEC.md`: machine-readable manifests, RESTful read/mutate operations, schema, events | Reference-implemented draft | Existing continuity shell | **IMPORT/RETAIN NOW** |
| PURL authority | `purl/src/continuity/store.js`, `authority.js`, `operations.js` | Source mechanism, selected tests inspected | Expected-version, scoped grants and conditional rights | **RETAIN AND TEST INTEGRATION** |
| PURL projection | `purl/src/research/projection.js` and `grammar.js` | Implemented measurement/conversion, not derived executability | Log -> symbolic dataset, explicit lossy projection | **IMPORT AS OBSERVATION ONLY** |
| ACSP/0.1 | `NetGovComEduGovOrgEduGovComNet/PROTOCOL.md`, `src/protocol/operations.ts` | Independent implemented prototype | Checkpoint/handoff/ack/proposal semantics | **ADAPT VIA CONTRACT**, don't equate IDs or operations |
| SEURL verbs | `seurl/README.md`, `NAI-CI.md` | Descriptive static-page concept | Historical UX/agent-affordance vocabulary | **KEEP AS MACROS/NOTES** |
| SubstrateIO pure addresses | `substrateIO/substrate/purl.py`: map/state/trace/graph as pure resolution | Implemented Python research surface, distinct semantics | A read-only computational kernel or typed module | **EXPERIMENT AS ISOLATED ADAPTER** |

## Sources pinned

- **PURL** (commit `3df4452`): [SPEC](https://github.com/akadaan310/purl/blob/3df4452a3624b3f5492bf23c2dacc49d8d2b33c7/SPEC.md), [operation registry](https://github.com/akadaan310/purl/blob/3df4452a3624b3f5492bf23c2dacc49d8d2b33c7/src/continuity/operations.js), [store](https://github.com/akadaan310/purl/blob/3df4452a3624b3f5492bf23c2dacc49d8d2b33c7/src/continuity/store.js), [read/write HTTP test](https://github.com/akadaan310/purl/blob/3df4452a3624b3f5492bf23c2dacc49d8d2b33c7/test/http.test.js), [projection](https://github.com/akadaan310/purl/blob/3df4452a3624b3f5492bf23c2dacc49d8d2b33c7/src/research/projection.js), [prior art](https://github.com/akadaan310/purl/blob/3df4452a3624b3f5492bf23c2dacc49d8d2b33c7/docs/prior-art.md).
- **CGT** (commit `bfe32fc`): [Definitions](https://github.com/akadaan310/computationalgrammartheory/blob/bfe32fc37f7fa61d50da50ecd2aa7fa97c0dd5a1/DEFINITIONS.md), [Results](https://github.com/akadaan310/computationalgrammartheory/blob/bfe32fc37f7fa61d50da50ecd2aa7fa97c0dd5a1/RESULTS.md), [Formal models](https://github.com/akadaan310/computationalgrammartheory/blob/bfe32fc37f7fa61d50da50ecd2aa7fa97c0dd5a1/FORMAL_MODELS.md).
- **GiN** (default `2a94f8a`, newer edition PR head `5c96ddc`): [Definitions](https://github.com/akadaan310/grammarinnumbers/blob/2a94f8a6be686078a9dad88863be9aafc5e6379b/DEFINITIONS.md), [CGT Concept Map](https://github.com/akadaan310/grammarinnumbers/blob/2a94f8a6be686078a9dad88863be9aafc5e6379b/CGT_CONCEPT_MAP.md), [The Number foundation](https://github.com/akadaan310/grammarinnumbers/blob/5c96ddca7b032ff76ab11d1c8306d2aef4bcf211/research/the-number/FOUNDATIONS.md), [PR #1](https://github.com/akadaan310/grammarinnumbers/pull/1).
- **ACSP** (`9fcf2e1`): [PROTOCOL](https://github.com/akadaan310/NetGovComEduGovOrgEduGovComNet/blob/9fcf2e1da3ce01a4e66eb5be5e2249b1f211878b/PROTOCOL.md), [operations](https://github.com/akadaan310/NetGovComEduGovOrgEduGovComNet/blob/9fcf2e1da3ce01a4e66eb5be5e2249b1f211878b/src/protocol/operations.ts).
- **SEURL** (`620ff95`): [README](https://github.com/akadaan310/seurl/blob/620ff955b87857c3eb7a7700a81b6a4d0217400a/README.md).
- **SubstrateIO** (`7ace119`): [PURL-like pure address registry](https://github.com/akadaan310/substrateIO/blob/7ace119a544fc736f0d4ec1d72cded9dad0a83e3/substrate/purl.py), [Ontology](https://github.com/akadaan310/substrateIO/blob/7ace119a544fc736f0d4ec1d72cded9dad0a83e3/research/ONTOLOGY.md).
- **External standards / baseline (not CGT discoveries):** [RFC 9110 §9.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2), [W3C PROV-O](https://www.w3.org/TR/prov-o/), [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).

## Existing functionality vs unverified ambition

- Confirmed by source inspection: PURL operation registry distinguishes primitives, composites, aliases and projections; store checks `expected_version`, validates inputs, computes authority requirements and applies planned primitive events; security doc requires POST for mutations. That does **not** establish successful deployment, durability under crashes, multi-user scale or arbitrary sandboxed execution.
- Confirmed by source inspection: SubstrateIO `Operation` includes `applies_to`, `yields`, effect/determinism metadata and versioned implementation references. Its pure address resolver is useful design evidence, but the PURL/0.1 stateful store and SubstrateIO mathematical resolver are **not a common protocol**.
- Unverified: fresh cross-provider AI bootstrap with just one URL, arbitrary program execution, live capability attenuation across adapters, persistent shell/IDE, complete replay of external side effects, semantic equivalence from hashes.

## Important negative transfer results

1. A CGT monoid homomorphism describes **pure relational path composition**. It does not establish that side effects commute, authority is stable or external programs can be composed without runtime checks.
2. GiN's `none / unique / many` is a well-defined **converse-fiber count**, not an adequate taxonomy of network failures or authentication errors.
3. An event-log projection is often many-to-one. Its induced transitions may be undefined; see congruence counterexample in `PURL_INDEPENDENT_DISCOVERIES.md`.
4. A canonical *syntax* hash may produce stable IDs. It does not decide program equivalence (undecidable for general programs).
