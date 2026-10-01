# Cold reconstruction (STASIS-3)

Procedure: `SOURCE=origin node scripts/bridge-cold-reconstruct.js`. It:
* clones every repository from GitHub (the pushed session branch; the default branch for repositories this work never changed, and says so);
* installs from lockfiles;
* runs every suite;
* re-derives recorded hashes;
* checks that every stasis names reachable commits;
* regenerates the projection matrix and the manifest and compares them with the committed ones;
* restarts the circle from committed snapshots only, replays the STASIS-1 checkpoint, and asks the circle the reconstruction questions;
* reruns EXP-CIRCLE-E2E and compares its deterministic hash.

No conversation history is used. Reports are records (`cold/report-N.json`)
and none are rewritten.

| report | source | caches | result |
|---|---|---|---|
| 1 | local committed HEADs | warm | STASIS-2 (see that report) |
| 2 | GitHub | warm | 23 pass, **6 fail**: kept. Diagnosed: the session branch is absent on origin for 3 repositories; fixed by falling back to the default branch |
| 3 | GitHub | warm | 29 / 29 |
| 4 | GitHub | warm | 29 / 29 (STASIS-3 phase 1, an independent re-run) |
| **5** | GitHub (purl 021605d, substrateIO 1657120) | **warm** | **34 / 34** |
| **6** | GitHub (same commits) | **cleared**: `~/.npm` (259 MB, including the npx cache), `~/.cache/pip`, `~/.cache/node-gyp` deleted first | **34 / 34** |

The checks in reports 5–6 and what each establishes:
* **clone**: six repositories from committed refs. seurl, golden-surface and MUSA come from their default branches; this work never changed them.
* **suites**: substrateIO 78 tests, `tools.validate` 0 violations, 7 run_ids match the registry; ACSP `npm ci` from the lockfile, vitest 24 passed; purl 97 pass.
* **hashes**: the constitution content id is unchanged since STASIS-1; the relay generation-1 snapshot holds 4 files.
* **history**: the STASIS-0, -1 and -2 commits are reachable.
* **derived artifacts**: the projection matrix B1–B6 recomputes identically. B7 depends on git history length, so it is excluded by design. The manifest's 8 components (operations and declared fields) regenerate identically.
* **replay**: the STASIS-1 checkpoint is intact from its committed snapshot. The STASIS-2 checkpoint replays inside the purl suite.
* **questions answered by the circle alone**: what this is, protocols, 64 routes, current state, history, execution (x = 136), observable record kinds, how to continue, tests, how to reproduce, **27 open items**, **54 terms**, and **8 modules with verified descriptors**.
* **E2E**: deterministic hash `sha256:1aad20b2…` equals the one in record-2.

**Status: REPRODUCED from GitHub, with caches warm and with caches cleared**
(OBSERVED of these two runs). Not established:
* reconstruction on another machine or OS image (same container class);
* the relay host (unreachable);
* a real phone;
* cross-provider participants (below).

## Q-014: cross-provider reconstruction kit (human-mediated only)
Automated sessions with other providers are prohibited, so this experiment
needs a human. Nothing here contacts another provider.

1. The circle must be reachable from the human's browser. Today it runs on localhost only, so a deployment or tunnel is needed. Deploying publicly is an external action, **to be confirmed by the owner first**.
2. The human opens a fresh session with the other provider and pastes only the prompt from `experiments/reconstruction/SPEC.md` (verbatim) with the public URL. There is no other context.
3. The human returns the provider's final answer as text, saved as `experiments/cross-provider/report-<provider>.md`.
4. It is scored with the same rubric (R1–R14) and compared on: terminology (nomenclature terms used), architecture, discovered operations, transformations, defects found, the observation arrow (R9; see OBSERVATION-ARROW.md) and the reconstruction.

Status: READY, WAITING ON A HUMAN AND A DEPLOYMENT DECISION (research queue Q-018).
