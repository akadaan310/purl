# Open problems (STASIS-3)

Each item: what is open, why it is open (the evidence doesn't decide it, or the
decision belongs to someone else), and what would close it. The research
registry of record is substrateIO `research/registries/open_problems.json`; this
page holds the bridge's items.

| id | problem | why open | what would close it | status |
|---|---|---|---|---|
| OP-S3-1 | **K-18 vs ACSP owner resolution** (MUSA "nothing waits for approval" vs ACSP "owner resolves proposals") | modelled as two axes (conformance × authority; CONSTITUTION-ENFORCEMENT-MODEL §2). They are compatible as axes but conflict as constitutions. Choosing a reading is the owners' decision | a human-authored amendment adopting one reading (K-13) | UNRESOLVED (authority boundary) |
| OP-S3-2 | **A-001…A-004 adoption**: A-001 candidate files exist (`constitution-v2.candidate.json`, `enforcement-v2.candidate.json`) | adoption is a human commit (K-13) | a human commit | CANDIDATE |
| OP-S3-3 | **Data staleness of evidence** | runs record `implementation_id` (now the loaded code, SF-7) but no data fingerprint; SF-3 | a data fingerprint per run plus a staleness check | UNRESOLVED |
| OP-S3-4 | **Undeclared operation constraints** (EXP-PROGRAM-CLOSURE-1 P2 falsified) | the catalog schema cannot express derivation preconditions (`damage` needs a prior flip) or value-dependent bounds (`at/t` < trace length) | catalog fields `requires_derivation`, `bounded_by` (substrateIO owner); then re-run A2, predicting 1.0 | HYPOTHESIS |
| OP-S3-5 | **σ's domain** (COMMIT refuses BOUND programs and ill-typed programs) | whether a bare binding should be committable is a SEURL specification question (MUSA url-machine.md) | the specification owner's decision | UNRESOLVED |
| OP-S3-6 | **ACSP proposal-queue exhaustion** (SF-4) | observed locally only; live behaviour untested (authority boundary) | a test on a resource whose owner consents, or an ACSP-side quota per session | OPEN |
| OP-S3-7 | **ramz seal forgery** (SF-1) | MUSA is a specification artifact; the fix is the owner's | HMAC or a signature in MUSA | OPEN |
| OP-S3-8 | **Owner can rewrite a scroll's program** (SF-2) | PURL has no immutable fields; the bridge only detects it | PURL support for immutable state fields, or a bridge-held hash chain | DETECTED, not prevented |
| OP-S3-9 | **Q-014 cross-provider reconstruction** | automated third-party sessions are prohibited | a human opens the public URL in another provider and returns the artifact (kit: COLD-RECONSTRUCTION.md §Q-014) | WAITING ON A HUMAN |
| OP-S3-10 | **Real Android WebView** | only FakePhone is tested; the relay host is unreachable from here | a device run by the owner | BOUNDARY (not faked) |
| OP-S3-11 | **Relay and seurl deployment provenance** | the relay (40.64.120.87) is unreachable; seurl.vercel.app has no git metadata (mapped by content hash only) | deployment metadata from the owners | OPEN |
| OP-S3-12 | **Status of records from live services** (`origin=service` → UNRESOLVED in P-ACSP-EV-1) | the epistemic vocabulary defines OBSERVED only for hardware and this repository's history | a registry decision (substrateIO) | UNRESOLVED |
| OP-S3-13 | **Live ACSP TALK never performed** | writing to the live ACSP is outside this work's authority | owner consent | BOUNDARY |
| OP-S3-14 | **Which Scroll sense is canonical** (`scroll@acsp-p001`, `@circle`, `@luna-foundry`, `@musa`) | a naming decision belongs to the owners; renaming would erase history | an owners' decision | UNRESOLVED |
| OP-S3-15 | **Effects claims in code descriptors** | `/code` verifies exports and imports, not `claims` or `changes` | static effect analysis, or a conformance check per claim | OPEN |
| OP-S3-16 | **Observation arrow (R9) understood, not just seen** | EXP-R9: every participant was exposed; 3/8 reported it (sonnet 3/4, haiku 0/4). F-R4's "not discoverable" diagnosis is not supported | a presentation test: the arrow as a first-class object (e.g. `/arrows`), re-run on a larger n | OPEN |
| OP-S3-17 | **Intermittent end-to-end failure under load** | `the circle end to end` failed in 2 of 22 dogfood commit runs (bba1b5d, e68f144) and in 1 of 4 local runs, with load average ≥ 4. The two dogfood commits have the same `implementation_id` as neighbours that passed, so it is not attributable to them. In the local run the failing subtest was the NAI-CI trace, which received an error document; the dogfood records keep only the top-level test name | find the root cause: adapter timeouts (15 s) under load are the candidate, untested. A failing test is not dismissed as a flake | OPEN |
| OP-S3-18 | **No circle route lists observations** (EXP-R9 participant) | `GET /observations/{id}` is served only on the substrate's port | a read-only circle route projecting the substrate's observations | OPEN |
