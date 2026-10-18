# God Seed V3 experiments

The ten protocols are registered in `experiments/godseed-v3/protocol.json`, saved before the integrated experiment harness was first run. This is a local preregistration record, not an external timestamp or independent preregistration service. Every run preserves its result directory, Git base revision, source-file SHA256 manifest and source snapshot digest.

Run `npm run experiments:godseed`. It combines `scripts/math-experiments.js` with a real temporary HTTP service, separate durable worker process, actual Docker-backed authored performers and isolated credentials. The latest machine-readable record is `evidence/experiments/latest.json`; previous failed/incomplete runs remain under `evidence/experiments/runs/`.

| Experiment | Measurement and negative control |
|---|---|
| E01 Identity | Same value from distinct programs; seven identity namespaces;100 reordered-key canonicalization cases. No semantic-equivalence claim. |
| E02 Grammar |25 independently specified operator pairs; valid/invalid types, missing capability, unknown operator, repetition bounds, exact replay,40 toggles and three007 labels. Bounded corpus only. |
| E03 SEURL | All seven contextual mappings preserve ambiguity; actual pinned historical FSM prepares effects; invalid move rejects; typed Substrate parse and compatibility sources. |
| E04 Projection | Exhaustive finite positive quotient and negative hidden-bit swap; enabledness/effect witnesses; incomplete domains/unknown sampled semantics reject. Completeness remains an explicit finite-model premise. |
| E05 Self-extension | Real PURL/JavaScript/TypeScript/Python create→compile→test/build→run→publish; fresh process discovers SDK from PURL; separate client forks/builds/runs each performer. No external provider trial implied. |
| E06 Security | Forged identity, revoked grants/queued jobs/idempotency, stale versions, GET safety, SSRF compilation refusal; actual sandbox file/network/privilege/resource tests. Scoped attack evidence only. |
| E07 Continuity | Three isolated HTTP credentials plus independent process; attenuated proposal/checkpoint, owner commit, forbidden commit and reconstruction. Clients are programmatic; fresh AI evidence is separately labeled. |
| E08 Game | Two authenticated players, concurrent version race, illegal turn/winner checks, exact replay after reopening persisted state. |
| E09 God-seed | Full directive/amendment bytes,52-node/65-edge graph, SDK discovered from one URL, executable mission dependency inspector, fork/run/checkpoint and plain-text structural control. No randomized efficiency advantage claimed. |
| E10 Cold/UI | Clean Git clone, committed lockfile, tests, fresh API/worker, cold discovery; real schema/REST and container restart evidence; desktop+Android Playwright flow, native clipboard/touch/keyboard/fallback, accessibility, screenshot comparison and measured local timings. Hosted verification remains separate. |

`evidence/cold-session/` records an actual fresh same-provider AI agent with no parent transcript or source-file inspection. It discovered the mission through HTTP and submitted one permitted pending proposal. This establishes that observed local reconstruction/action only; it does not establish cross-provider performance, prior-memory transfer or all mission requirements.

`scripts/cold-client.js` instead measures an independent Node process. Reports distinguish that from an AI session. Authored-language replay verifies recorded receipt/artifact integrity and never silently reissues effects. Pure replay checks the captured deterministic fragment and environment; differing environments are explicit.

## Preserved negative evidence

- The first mathematical harness used an invalid historical SEURL path; its failed record is preserved in `evidence/experiments/pre-integration/` and corrected against the actual FSM.
- The first integrated run's game assertion assumed which concurrent move would win. The harness now derives the winner from the accepted response and preserves the failed run.
- Early hot-code dogfooding failed plan-integrity validation when API and worker had different loaded registries. Frozen revisions and rebuilt processes avoid silently accepting that drift.
- Initial Playwright targeting clicked a text element covered by the intended full-surface copy button and timed out. The corrected test sends a real surface pointer/touch event and keeps the failed screenshots/traces.
- Independent code review found real schema/cache, quota, callback and replay defects. Reports and red/green regression tests remain in `evidence/` and `test/product/security-regression.test.js`.

The original research suite is preserved unchanged and independently reproduced17/17. It is mathematical toy evidence, not a substitute for these ten product experiments. The original PURL58 tests and alternate-branch baseline results are pinned in RECONSTRUCTION.md.
