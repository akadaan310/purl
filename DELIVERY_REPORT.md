**The full public PURL mission is BLOCKED.** Railway is now connected: project/services and a domain are configured, and hosted Supabase PURL resources are migrated. Live startup awaits the server-only backend credential in Railway. The allocated domain is not yet a verified working deployment. The current application is local at http://127.0.0.1:8080, with the mission at http://127.0.0.1:8080/p/godseed-mission. The active Supabase project now has additive isolated PURL resources; its original application rows and ACSP history were preserved. [ACCEPTANCE.json](ACCEPTANCE.json) and [handoff.json](handoff.json) distinguish local results from the remaining public requirements.

The local implementation includes the typed compiler/interpreter, IDE, discovery/SDK, authority and continuity, durable jobs, restricted authored runtimes, examples and executable mission inspector. All twelve feature groups have local PASS records; public service, hosted accounts/persistence and worker placement remain BLOCKED. The mission inspector evaluates a 52-node/65-edge graph and reports its frontier; it does not establish the truth of the mission requirements. Recorded mission completion remains `NOT_RUN`, `verified:false`.

Current verification and its boundaries:

| Check | Recorded result | Evidence |
| --- | --- | --- |
| Current host suite, after PID 1 reuse fix | **187 passed, 0 failed, 0 skipped** | [final-tests.txt](evidence/final-tests.txt) |
| Pinned Node 22 container suite | **187 passed, 0 failed, 0 skipped** | [node22-tests.txt](evidence/infrastructure/node22-tests.txt) |
| Clean committed checkout | Revision `d45fcc214350c8380b369ea97f0add9a6643c442`: **187 passes**, dependency install and independent HTTP cold client PASS | [cold-rebuild/latest.json](evidence/cold-rebuild/latest.json) |
| Browser | **12/12 PASS** in Chromium desktop and Pixel 5 Android emulation; six routes per viewport, zero axe violations | [ui/latest.json](evidence/ui/latest.json), [desktop](evidence/ui/landing-desktop.png), [Android](evidence/ui/landing-android.png) |
| Restricted Docker runtime checks | **10 PASS**, including JS/erasable TS/Python results and the specified file/network/process/quota probes | [sandbox/latest.json](evidence/sandbox/latest.json) |
| Local database and API adapter | PostgreSQL 17.7/PostgREST 13.0.4 migration, CAS, RLS/grant and adapter checks PASS; hosted services remain untested | [deploy verification](deploy/verification/results.json) |
| Separate API/worker containers and recovery | Local development-file queue, artifact/restart and Compose checks PASS | [container-smoke.json](evidence/infrastructure/container-smoke.json), [local-compose.json](evidence/infrastructure/local-compose.json) |
| Live application restart | Restarted local API/worker retained the published mission execution, 52-node result and checkpoint | [live-restart.json](evidence/infrastructure/live-restart.json) |
| Original mathematical handoff | **17/17 PASS**; rerun results byte-identical, 16 source files unchanged | [rerun-evidence.json](evidence/research/rerun-evidence.json), [research audit](evidence/research/AUDIT.md) |

The completed host, pinned Node 22 and clean-checkout evidence agrees with the updated acceptance/handoff records. The verified runtime image is `sha256:0512076d9f6c28f11d2b3f8a760add7ed30c06a31703fed05b656e64d8348401`. The x64 Node 22/24 portability comparison covers three pinned pure programs, with different environment hashes; ARM remains NOT_RUN. See [portability.json](evidence/infrastructure/portability.json). The final stable-hostname Compose repeat also passed: its retained named volume still served the earlier execution value18, both non-root services were healthy, authored execution was disabled, and cleanup retained the volume.

All ten preregistered experiments have **locally scoped PASS** records in [the exact run](evidence/experiments/runs/2026-10-18T14-32-25.207Z/results.json), indexed by [latest.json](evidence/experiments/latest.json):

| Experiment | Local result |
| --- | --- |
| E01 — Identity and canonical hashing | PASS |
| E02 — Grammar, typing, composition and effects | PASS |
| E03 — SEURL reconciliation | PASS |
| E04 — SubstrateIO projection and counterexamples | PASS |
| E05 — AI-authored program and reuse | PASS |
| E06 — Authority and specified isolation attacks | PASS |
| E07 — Session continuation and reconstruction | PASS |
| E08 — Multiplayer game validation and replay | PASS |
| E09 — God-seed mission graph and continuation | PASS |
| E10 — Local cold rebuild, persistence and UI | PASS |

These are bounded local experiments, registered in a local file before the harness run, not externally timestamped trials. Hosted Auth/Storage/backup recovery and public deployment subchecks remain BLOCKED/NOT_RUN. Cross-provider blinded trials and measured token/cost advantage remain NOT_RUN. The run records **PASS 10, FAIL 0, BLOCKED 0, NOT_RUN 0** at local scope, pins source revision `d45fcc214350c8380b369ea97f0add9a6643c442` and source-manifest digest `85e37e46046175ba0ecda2908fd5711b008cb2e1b9aa8294fd0d84e39a33e65c`; those identify that recorded run.

Fresh AI continuation was actually exercised. The [cold reconstruction](evidence/cold-session/report.md) began with only the PURL, discovered protocol/SDK/state/authority through HTTP and submitted a permitted pending proposal. Its initial identity source was subsequently extended to `input json | mission.inspect`; the historical report remains preserved. A separate [fresh reuse session](evidence/fresh-reuse/report.md) then discovered and anonymously inspected the published arithmetic source, created a public local fork, built it, ran it to **18**, published it and wrote a discoverable checkpoint: **21 checks** recorded. The fork is http://127.0.0.1:8080/p/program_6ea22ff8dea86c69b61f7f47; build `build_4afe12056c5527d568b6e14a`, execution `execution_b6af8705b14c8bed7e5c972b`, checkpoint `checkpoint_563dfaf45cfb8e98483fc511`. Public visibility here means readable through the local service. Sessions were fresh same-provider agents/processes, with self-declared identities; no private model memory transfer or cross-provider study is claimed. Checkpoint evidence remains `evidence_verified:false`.

The distributable SDK/compiler package is [purl-0.2.0.tgz](artifacts/purl-0.2.0.tgz). A clean consumer imported the SDK, compiled arithmetic and produced 18; it was not published to npm. Package checksum, integrity and file inventory are in [sdk-package.json](evidence/sdk-package.json). Actual local authored-program and mission execution/release/checkpoint IDs are retained in [live-local.json](evidence/dogfood/live-local.json) and [handoff.json](handoff.json).

Original repository baselines are retained with exact source SHAs and logs in [reconstruction/summary.json](evidence/reconstruction/summary.json):

| Source | Recorded baseline |
| --- | --- |
| Original PURL | 58 passed, 0 skipped |
| Composition PURL | 76 passed, 1 skipped |
| Circle PURL | 80 passed, 3 skipped |
| Original substrateIO | 58 passed; validator 0 violations |
| Circle substrateIO | 78 passed; validator 0 violations |
| Original PURL plus compatibility adapters | 66 passed, 0 skipped |

All those runs exited 0. ACSP build/typecheck/tests were NOT_RUN in reconstruction; SEURL has no test harness. Optional/dependency skips, original socket warnings and the initial archive-without-Git-metadata failure remain documented in [RECONSTRUCTION.md](RECONSTRUCTION.md). Original repositories, legacy documentation, Git ancestry, failed runs and continuity histories are preserved; live ACSP data was not mutated.

Deployment and recovery instructions are concrete but remain unexecuted on hosted targets:

- [MIGRATIONS.md](MIGRATIONS.md) documents the pinned CLI, apply/dry-run, private object backups and restore verification. The exact additive migration is [20261018134521_purl_durable_repository.sql](supabase/migrations/20261018134521_purl_durable_repository.sql); [supabase/README.md](supabase/README.md) records backend setup. Use a dedicated project. Hosted restore must include actual Storage bytes, not only database metadata. Application rollback retains the schema/history and restores the previous compatible image; there is no destructive down-script.
- [DEPLOYMENT.md](DEPLOYMENT.md) documents distinct Railway API/worker services, shared canonical URL and Supabase authority, health/restart verification, and later Oracle placement. Exact files are [current API/worker configuration map](deploy/railway-services.json) and [historical config references](deploy/reference/README.md) and [Oracle worker Compose](deploy/oracle-worker.compose.yaml). Oracle migration must retain the same backend and respect execution leases; Oracle inventory/ARM checks remain pending.
- The recorded local session snapshot is [examples/live-session.snapshot.json](examples/live-session.snapshot.json). Restore instructions are in [handoff.json](handoff.json): in a separate local checkout, create `.purl`, then copy the snapshot to `.purl/state.json` before starting API and worker. Preserve any existing state first. The export strips prior token hashes; fresh principals can fork public programs. The experiment source manifest records hashes/revision, not a standalone restorable source archive. A local snapshot is development state and must not become a competing production authority.

Remaining limitations are explicit: TypeScript supports erasable syntax stripping, without semantic `tsc` analysis or dependency installs; Julia and Octave adapters are unavailable. Shared-kernel Docker and the specified attack checks do not certify hostile multi-tenant/kernel isolation. Default public deployment profiles keep authored execution disabled. Hosted Supabase Auth sign-in, Storage HTTP persistence and backup/restore drills remain pending, as do Railway public smoke/restart checks, Oracle/ARM placement, cross-provider trials and external authenticity anchoring. Internal hashes, replay and graph predicates establish narrower integrity properties; they do not independently authenticate a full-history rewrite or prove all mission claims. No deployment mutation was performed for this handoff.

Deployment update: [provisioning.json](evidence/deployment/provisioning.json) records actual Railway IDs, allocated domain and hosted migration/RLS/private-bucket checks. Supabase free quota rejected both a dedicated project and ACSP restore; isolated new PURL resources were therefore added to the existing healthy project under the user’s delegated destination authority. Both Railway roles reference one shared server credential. No hosted execution or public SUCCESS is claimed while that credential is missing. The exported development snapshot also passed30 restore/discovery/fork/build/run checks in a disposable service: [snapshot restore](evidence/infrastructure/snapshot-restore/report.json).
