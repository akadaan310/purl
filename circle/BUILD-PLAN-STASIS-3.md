# Build plan: STASIS-2 → STASIS-3 (written before implementation, 2026-10-01)

Rule for every phase: TEST → RECORD → COMMIT → RECONSTRUCT → proceed. Failed
runs are kept. Epistemic labels have the meanings in substrateIO
`research/registries/epistemic_statuses.json` (summarised in BRIDGE-NOMENCLATURE §0).

| Phase | Question | Executable output | Falsifiable claim / acceptance |
|---|---|---|---|
| 1 Reconstruction | Does STASIS-2 hold from GitHub alone, independent of my report? | cold report-4 from origin; reconstruction note | report-4 = report-3 (29/29), or the differences are recorded |
| 2 Nomenclature | Where do the repositories' vocabularies conflict, and is the 12-field term schema the right one? | conflict register; recurrence-terminology verification script; schema-fit measurement over the registry | "cycle of a functional graph = bottom SCC = closed class" holds on every functional graph tested; counterexamples on empirical graphs |
| 3 Constitution model | Must constitution, enforcement, evidence, implementation and authority have separate identities? Are conformance and authority independent axes? | `/constitution/model`; probes for all four quadrants of conformance × authority | the two-axis model is falsified if some quadrant cannot be produced by an actual operation |
| 4 Cross-substrate map | Can the manifest describe every component by the XXIV fields, generated wherever possible? | generated `bridge-manifest.json` v3 with `components[]`; generated/declared provenance per field | every field is either generated or explicitly marked declared |
| 5 Transition model | What survives each boundary, measured by the substrate's information functions? | `PROJECTION-MATRIX.json` (measured), TRANSITION-MODEL.md | every row has a measured or declared loss; measured ones reproduce |
| 6 SDK | Does the SDK expose the substrate (nomenclature, experiments, research state, examples, code descriptors) without discovery becoming execution? | `/sdk` v0.3, `/nomenclature`, `/experiments`, `/research`, `/code/{module}` | GET sweep unchanged; every src/circle module has a descriptor whose hash matches |
| 7 Program model | What is the exact relation SEURL ↔ PURL? Is either direction lossless? | round-trip experiment with measured loss | σ (SEURL→record) injective on canonical programs; π (record→SEURL) loses exactly the record fields; SEURL→value address loses the verb labels (PERTURB vs WRITE flip) |
| 8 Dogfood | Can the development loop become an observed transition without the environment writing code? | `POST /dev/iterations` records (git transition + conformance evidence); self-* definitions | each code change of this phase recorded as a dev iteration with evidence |
| 9 Closure experiment | Do typed / constitution-aware transformers raise closure and execution validity without losing coverage? | pre-registered SPEC; runs 1 and 2 | falsification conditions in the SPEC |
| 10 Observation arrow | Why did no participant report R9? | pre-registered 2×2 experiment (surface pre/post F-R4 × prompt neutral/eliciting) with server-side access logs | causes separated by what was *requested* vs what was *reported* |
| 11 Cold reconstruction | Does everything rebuild from GitHub with local caches deleted? | cold reports from origin, before and after deleting caches | 0 failures, or recorded failures |
| 12 STASIS-3 | Only if 11 passes | `stases.json` STASIS-3, checkpoint, snapshot | — |

Authority boundaries known in advance (not crossed): adopting constitution
amendments (K-13: human commit), resolving ACSP proposals, writing to live ACSP,
deploying publicly (needed for Q-014), and automating other providers.
