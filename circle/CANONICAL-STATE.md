# Canonical state audit (2026-10-01)

"Canonical" here means what each artifact *is*, with no assumption that the
default branch, the research branch and the deployment agree. They do not.

## 1. Branches per repository

| Repo | Default branch (GitHub HEAD) | Default head | Active research branch (this work) | Research head | Other live lines | Deployed |
|---|---|---|---|---|---|---|
| substrateIO | `claude/research-substrate-bootstrap-bfd02a` | `7ace119` | `ccr-d0887a23-30wf63` | `60ce712` (+ this phase) | `claude/acsp-program-001-k616hw` @`5073595` (ancestor of research) | not deployed |
| purl | `claude/purl-protocol-research-bxevq5` | `3df4452` | `ccr-d0887a23-30wf63` | `1acfb0c` (+ this phase) | `claude/acsp-purl-composition-adsbn6` @`18c85bf` (+10 on default, divergent) | not deployed |
| ACSP (NetGovComEduGovOrgEduGovComNet) | `claude/agent-continuity-protocol-doi4bn` | `9fcf2e1` | `ccr-d0887a23-30wf63` | `29b4911` | `claude/acsp-program-001-k616hw` @`417da6c` (+6 on `62aee37`); `claude/acsp-purl-composition-adsbn6` @`edd1963` (+8 on `14b3147`) | **`9fcf2e1`** |
| seurl | `master` | `620ff95` | `ccr-d0887a23-30wf63` | `620ff95` (no changes) | — | content = `620ff95` (no git metadata) |
| golden-surface | `main` | `b113718` | `ccr-d0887a23-30wf63` | `b113718` (no changes) | `claude/golden-surface-locked-tabs-yf57of` @`48e995d` (+2: engine) | VM relay `40.64.120.87:8490` per docs: **unreachable from here** |
| MUSA | `master` | `d797135` | `ccr-d0887a23-30wf63` | `d797135` (no changes) | `claude/golden-surface-locked-tabs-yf57of` @`6337fd0` (+1: attribution) | not deployed |
| luna-foundry | `claude/golden-surface-locked-tabs-yf57of` | `6a260ef` | — | — | — | `6a260ef` |

## 2. Deployments

| Endpoint | Source repo | Branch | Commit | Provenance of the mapping | Protocol | Storage generation | Schema |
|---|---|---|---|---|---|---|---|
| https://acsp-one.vercel.app | ACSP | `claude/agent-continuity-protocol-doi4bn` | `9fcf2e1` | Vercel `githubCommitSha` (dpl_HbHo4evVewQDkM9WD7gq1kENBp3A, production, yul1) | ACSP/0.1 (`/protocol.json`); no `/substrates` (404), no `/transitions` (404) | Supabase Postgres (README); live data generation = relay gen 1 (`8N2RXG1MW79S` @ v12) | migrations 0001–0002 at that commit (**inferred**: the DB itself is not inspectable from here) |
| https://seurl.vercel.app | seurl | — | none recorded | **content hash only**: served bytes sha256 `84d91f68…` = `index.html` at `620ff95` | static | — | — |
| https://lunar-foundry.vercel.app | luna-foundry | `claude/golden-surface-locked-tabs-yf57of` | `6a260ef` | Vercel metadata | Luna URL | Vercel Blob (idents) | — |
| http://40.64.120.87:8490 | golden-surface | unknown (main or engine) | unknown | **not mappable**: unreachable from this container | relay | SQLite `store/golden.db` | migrations 002/003 (main) or 004 (engine) |
| localhost circle / substrate / local ACSP | purl / substrateIO / ACSP | session branches | see §1 | started from the working tree by `scripts/circle-lib.js`, which records `git rev-parse` | circle/0, substrate-purl/0, ACSP/0.1 | temporary dirs | — |

## 3. Does production correspond to the research state?

**No.** Production ACSP is the base protocol (`9fcf2e1`). Every integration (the
circle, the composition bridge, program-001, the transitions export the
substrate reads) lives on unmerged branches. A participant who opens the public
URL meets STASIS-0 behaviour.

## 4. Divergences that block a straightforward merge (recorded, not resolved)

1. ACSP `program-001` and ACSP `0.2` both add migration **`0003`** with different
   contents (`0003_program_001.sql` vs `0003_operation_records.sql`).
2. "Scroll" is defined three times: ACSP program-001 (immutable versions in an
   agent identity), the circle (a PURL resource holding a SEURL program), and
   luna-foundry (a text window). MUSA's "golden scroll" is a fourth use.
3. SEURL is defined twice: move words (circle) and `seurl://golden` resource addresses (golden-surface engine).
4. Two bridges: circle (PURL session branch) and composition (PURL + ACSP 0.2).

## 5. Open problems from this audit
* **OP-B1** Golden Surface's deployed relay cannot be mapped to a commit from here.
* **OP-B2** seurl's deployment has no git provenance. Only a content match is possible.
* **OP-B3** Which ACSP line is canonical (0.1+program-001, or 0.2) is an owner decision. The bridge must work against 0.1, because that is what is deployed.

## 6. Correction recorded at the STASIS-2 close (the table in §1 is kept as written)

§1 lists `ccr-d0887a23-30wf63` as the research branch of **seurl, golden-surface and
MUSA**. On GitHub that branch does not exist for those three (`git ls-remote`,
2026-10-01). The local `origin/ccr-…` refs came from the environment's setup and
were never pushed, because these repositories were never changed. Their canonical
state is their default branch (`master`, `main`, `master`) at the same commits
(`620ff95`, `b113718`, `d797135`). Found by the first cold reconstruction from
origin (`cold/report-2.json`), which failed to clone them. The script now falls
back to the default branch and records the ref it used.
