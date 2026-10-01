# Bridge reconstruction (STASIS-2 start, 2026-10-01)

Written before any modification in this phase. Sources: `git fetch` of every
remote branch, the source on each branch, test runs in this container, Vercel
deployment metadata, and live HTTP requests. Previous summaries, mine
included, were treated as claims to check.

## 0. Corrections to the previous session's record (STASIS-1)

The previous session cloned only the session branch and the default branch, and
it **never fetched all remote branches**. Three of its reconstruction claims were
therefore wrong:

| Previous claim (purl `circle/RECONSTRUCTION.md`, `59f3b10`) | Actual |
|---|---|
| ACSP "program-001" source: "absent from ACSP source on every branch" | **Exists** on `origin/claude/acsp-program-001-k616hw` (6 commits, 2026-09-26/27): agent identity, computational substrates, **Scrolls**, aliases, executions, `/r/{id}/transitions`. 51/51 tests pass here. |
| Commit `417da6c`: "no such object in any of the 7 repos" | **Exists** on that branch: "Validate a proposal's inner payload in prepared intents" (2026-09-27). |
| ACSP has no local server; `serve-local.ts` was new | `harness/serve.ts` (a local HTTP wrapper) already existed on `origin/claude/acsp-purl-composition-adsbn6`. `serve-local.ts` duplicates it. |
| "Golden Surface refuses `seurl://`" | True on `main` only. `origin/claude/golden-surface-locked-tabs-yf57of` resolves `seurl://golden/{map,tab,scroll,open}` in the relay and the app. |
| (unmentioned) | An earlier **ACSP × PURL composition bridge** exists: purl `src/compute`, `src/bridge`, exp-0002, and ACSP/0.2 with exp-0003, on `claude/acsp-purl-composition-adsbn6` in both repos. The circle was built without knowing it. |

The old document is not edited. These corrections are its successor record.

## 1. Six-system matrix

| System | Actual implementation | Claimed role | Dependencies | Evidence | Discrepancies |
|---|---|---|---|---|---|
| **SEURL** | Repo `seurl` @`620ff95`: one static halt page (`index.html`), README, NAI-CI.md. **No executable code.** The seven verbs are executable only in purl `src/circle/seurl.js` (FSM from MUSA `url-machine.md` §4). A second, unrelated SEURL exists as resource addresses `seurl://golden/{map,tab,scroll,open}` (golden-surface engine branch, `relay/seurl.py`) and in luna-foundry NOMENCLATURE. | program / transition notation | none (the page); the circle FSM depends on substrate for typing | `seurl.vercel.app` bytes = `index.html` sha256 `84d91f68…` (content match; the deployment has no git metadata); circle FSM tests 5/5 | Two incompatible "SEURL"s: **move words** (verbs) vs **resource addresses** (no verbs). The `seurl://` scheme resolves only in the golden-surface engine branch, only for `golden`. |
| **PURL** | Repo `purl`: PURL/0.1 resource protocol (core / continuity / research / transport / client, layer-checked). Session branch adds `src/circle` (bridge layer). Composition branch adds `src/compute` (computation nodes as resources) + `src/bridge/acsp.js`. "Value PURLs" are a **different** thing in substrateIO (`substrate-purl/0`). | addressable executable resources, operations, history, authority, replay | none (zero-dep Node); circle adapters reach substrate/ACSP over HTTP | session branch 70/70; composition branch 76 pass / 1 skip / 0 fail | "PURL" names two layers (resources vs values). Two independent bridges (circle; composition) on different branches, neither merged. Default branch `claude/purl-protocol-research-bxevq5` has neither. |
| **ACSP** | Repo `NetGovComEduGovOrgEduGovComNet`: ACSP/0.1 (TS, Next, Postgres/PGlite). Branches: `program-001` (agent identities, substrates, Scrolls, transitions export), `acsp-purl-composition` (ACSP/0.2: operation records, continuation refs, extensions), session branch (local server + migration artifact). | continuity, knowledge, provenance, handoff, checkpoint, delegation, published record | Postgres (Supabase) in production | session 24/24 + harness 13 pass / 3 skip (336 checks); program-001 51/51; composition 39/39; live `acsp-one.vercel.app` = commit `9fcf2e1` (Vercel metadata) | Three divergent lines from a common base; production serves the plainest (0.1, no program-001, no 0.2). substrateIO reads a format (`acsp-transition-history/1`) that only an **unmerged, undeployed** branch produces. |
| **substrateIO** | Repo `substrateIO` @`60ce712`: Python stdlib instrument, registries, the research-continuity protocol, value addresses, typed terms, identity decomposition, the P-ACSP-EV-1 projection. | observation, projection, perturbation, measurement, epistemic status, nomenclature, reproducibility | none | 74 OK, `tools.validate` 0 violations, run_ids = registry | Default branch `claude/research-substrate-bootstrap-bfd02a` is 3 commits *behind* the program-001 branch, which is behind the session branch: three generations of the same repository. |
| **Golden Surface** | Repo `golden-surface`: Expo app + Python relay/twin/store/watchers. `main` = SPEC build (`b113718`). Engine branch (+2): locked tabs, `seurl://golden` addresses, hash-chained surface shard, `structures/act`, **`POST /bridge` observe→decide→execute→record with a pluggable decider**. | embodied shared browser; relay; bus; watchers; Najwa | aiohttp; a phone (or FakePhone); Playwright for the twin test site | main: store ok, relay PHASE 2 OK, sync_loud/watchers fail (environment). Engine branch: test_engine ALL PASSED, test_locked 3/3, test_relay PHASE 2 OK | The engine branch's `/bridge` with a "decider" is an agent loop inside the relay, the pattern this directive excludes (§38). Its existence is recorded, not adopted. ~120 Gradle build intermediates are committed. |
| **MUSA** | Repo `MUSA/luna-agent`: protocol and design documents (`url-machine.md`, NAI-CI, NOT, composition, CAPABILITIES), constitution v1 (`genesis/`), prototypes: `shell/shell.py` (**`POST /exec` runs arbitrary shell commands**, `shell=True`), `browser/loom.py`, `protocols/ramz/ramz.py`. Branch +1: ATTRIBUTION.md. | agent-space / composition environment | stdlib; Playwright for the (absent) browser-hand | no tests in repo; ramz forgery probe (below) | ramz "tamper refused" holds for accidental edits only: the seal key is the public constant `"golden"`, so a **recomputed seal on a changed body was accepted** (probe in this document). The MUSA browser-hand (:8474) source is absent from every branch. The constitution v1 conflicts with ACSP owner-resolution (K-18). |
| (luna-foundry, not in the six) | Lens of structures + idents; deployed `lunar-foundry.vercel.app` = `6a260ef` | NAI-CI lens | — | 9/9 | GET mutates idents (`/i/{id}?name=`) |

## 2. Claims of the previous report, checked

| Claim | Result | Evidence |
|---|---|---|
| PURL 70/70 | **REPRODUCED** | `npm test`: tests 70, pass 70 |
| substrateIO 74 OK | **REPRODUCED** | `Ran 74 tests`, OK; validate 0 |
| ACSP 24/24 | **REPRODUCED** | vitest 24 passed |
| ACSP harness 13 pass / 3 skip | **REPRODUCED** | "16/16 scenarios passed · 336 checks · 3 skipped" against `serve-local` |
| Golden Surface environmental failures | **CONSISTENT** (not re-run on main this phase) | causes stated in STASIS-1 (no watcher process; no Python Playwright) |
| checkpoint `r_HMGMD46GSD`, content id `ef5ed564…` | **REPRODUCED from committed artifacts** | test "final checkpoint is recoverable from the committed snapshot alone" passes |
| commit `c561e38` | **EXISTS** in purl only, on `ccr-d0887a23-30wf63` | `git log` |
| "commit ccr-d0887a23-30wf63" | **NOT A COMMIT**: it is the session **branch** name, present in all 7 repos | `git branch -r` |
| program-001 / 417da6c absent | **DISPROVEN** | §0 |

## 3. Edges that exist between repositories (by code, not by intention)

| From → To | Edge kind | Where | Merged on default? |
|---|---|---|---|
| circle → substrate | PARSE, RESOLVE, EXECUTE, RECORD, OBSERVE | purl `src/circle/adapters.js` | no (session branch) |
| circle → PURL | RECORD, FORK, REPLAY | `PurlClient` | no |
| circle → ACSP | PUBLISH (propose) | `AcspAdapter` | no |
| ACSP events → substrate | PROJECT | substrateIO `acsp_events.py` | no |
| ACSP program-001 export → substrate | PROJECT | substrateIO `acsp.py` (merged on default via PR #1) | yes (reader); producer unmerged |
| PURL compute ↔ ACSP | PUBLISH, HANDOFF | purl `src/bridge/acsp.js`, ACSP 0.2 | no |
| Golden Surface relay → Lunar Foundry / Luna shell / Loom | RESOLVE, EXECUTE | golden-surface engine `relay/luna.py`, `relay/bridge.py` | no |
| circle → Golden Surface relay | ADDRESS (open a URL in a tab) | `GoldenAdapter` | no |
| MUSA → circle | (documents only: `url-machine.md` semantics) | — | — |

**No cross-repository edge exists on any default branch except the substrateIO
reader of an export that production ACSP does not serve.** Integration exists
only on unmerged branches.

## 4. ramz probe (MUSA claim "tamper refused")

```
original     -> pay 1
naive tamper -> refused: bad seal: envelope refused
forged       -> pay 1000          (seal recomputed from public inputs; accepted)
```
Status: the claim is **DISPROVEN for adversarial tampering** and holds for
accidental corruption. Sealing with a public constant is a checksum, not
authentication (an established distinction: hash vs MAC).
