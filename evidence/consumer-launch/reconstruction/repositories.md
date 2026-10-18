# Consumer mission repository reconstruction

Read-only observation on 2026-10-18. All `00_START.md`–`07_ACCEPTANCE.md` and `CODEX_MASTER.md` were read. No implementation, commits, branch changes, fetch/checkout, database writes or deployment occurred. The only files written are this report and `repositories.json`. No AGENTS.md was found in the inspected workspace repositories; substrateIO's CLAUDE.md, PROTOCOL.md and HANDOFF.md were read.

## Safest starting point

Preserve the deployed PURL/0.2 product and start additive consumer work in an isolated new branch/worktree from `d6fbc666890f85913fac3553be055a44cb9ec620` (`codex/godseed-v3`). Do not reset to the GitHub default branch, which is the older research implementation. Do not merge the circle/composition research branches wholesale. Existing public program URLs, authoritative Supabase document, private artifact bucket and original checkouts must stay intact.

The first coherent slice is established-provider account verification + immutable subject + unique public handle + explicitly consented CGIT profile provisioning, with reciprocal product access and tested tenant boundaries. CGIT must be an independently usable product with its own profiles/scopes/quotas; its initial implementation is new work. New consumer mission material should become a separate versioned executable mission, preserving the previous published God Seed.

## Exact local state and live branch inventory

All five local checkouts were clean at both inspections. Authenticated read-only GitHub branch queries matched every local remote-tracking branch below; no fetch was needed.

| Repository / branch | SHA | Meaning |
|---|---|---|
| PURL product `/workspace/purl`, `codex/godseed-v3` | `d6fbc666890f85913fac3553be055a44cb9ec620` | Current product baseline |
| PURL original `/workspace/repos/purl`, default `claude/purl-protocol-research-bxevq5` | `3df4452a3624b3f5492bf23c2dacc49d8d2b33c7` | PURL/0.1 reference |
| PURL `claude/acsp-purl-composition-adsbn6` | `18c85bf2960685ce8903937598e3ac0506409673` | Pinned binary composition DAG + ACSP bridge |
| PURL `ccr-d0887a23-30wf63` | `83d6bcaf8b811e9d2744fb15a6d42ae5d899de1c` | Seven-verb circle runtime |
| ACSP original/default `claude/agent-continuity-protocol-doi4bn` | `9fcf2e1da3ce01a4e66eb5be5e2249b1f211878b` | ACSP/0.1 continuity |
| ACSP `ccr-d0887a23-30wf63` | `e8d989afee2025e2315605b4349ccfa833db13bf` | Original protocol + local server/snapshot docs |
| ACSP `claude/acsp-program-001-k616hw` | `417da6c740de22aaa497e10a09251c4c2af7b948` | Agent identities, embodiments, immutable Scrolls, transitions |
| ACSP `claude/acsp-purl-composition-adsbn6` | `edd1963750d1fc839cc350797b6a9bc9da8f6a20` | ACSP/0.2 operation records/extensions |
| SEURL original/default `master` | `620ff955b87857c3eb7a7700a81b6a4d0217400a` | Static halt page; no runtime |
| SubstrateIO original/default `claude/research-substrate-bootstrap-bfd02a` | `7ace119a544fc736f0d4ec1d72cded9dad0a83e3` | Python research instruments + Program001 export reader |
| SubstrateIO `claude/acsp-program-001-k616hw` | `5073595f1c7197392d77b7fb612479084ad5a268` | Already included in default HEAD |
| SubstrateIO `ccr-d0887a23-30wf63` | `165712038643f306f3ec882d9c50da84477de534` | Adds parse-only terms, observations/projections |

PURL composition and circle share original `3df4452` but neither includes the other. Product `d6fbc66` also descends from original; it preserves the original `src/` and uses explicit bounded compatibility adapters. ACSP Program001 and composition diverge at `14b314712c0819ea7e0cfc1d7675a5f6475c125b`; neither is a drop-in superset of the other. Their two `0003_*.sql` migrations are tracked by full filename, but successful SQL application would not establish a correct semantic merge.

## Implemented PURL API and data flow

Primary code: `service/http.js`, `service/domain.js`, `service/domain/support.js`, `service/repository.js`, `service/worker.js`, `service/compiler.js`, `service/language/*`, `service/registry.js`, `sdk/client.js`, `web/app.js`. `service/CONTRACTS.md` documents most program routes; actual source additionally supports TypeScript and optional auth/compatibility/compiler endpoints.

`manifest discovery → source parse → type/effect/capability check → versioned IR/operator digests → immutable tested build → durable queue → worker lease + authority/environment recheck → bounded execution → private immutable object → artifact/receipt → checkpoint → replay`.

- Discovery: `GET /.well-known/purl`, `/api/operators`, `/api/templates`, `/api/openapi`, `/api/runtime`, `/api/registry`.
- Identity: `GET|POST /api/session`; optional `/api/auth/config`, `POST /api/auth/start`, `POST /api/auth/session`.
- Programs: `GET|POST /api/programs`; inspect/manifest/history/continuity/replay/diff/mission reads under `/api/programs/:id`; explicit POST source/compile/build/run/publish/fork/checkpoint/propose/commit/grants/revoke/mission. Game join/move are separate typed operations.
- Immutable reads: `/api/executions/:id`, `/api/artifacts/:id`, `/api/releases/:id`, inheriting program visibility/authority.
- Pure tools: `POST /api/compiler`, `/api/transitions/check`, `/api/transitions/compile`; compatibility routes parse SEURL/Substrate addresses and independently recompute supplied binary snapshots.

GET/HEAD do not mutate. Credentials travel in headers. Existing-program mutations require current `expected_version`; persisted payload-bound idempotency checks live authority before replaying a prior response. Delegated grants attenuate; owner alone accepts proposals. Workers recheck run authority on claim and result commit and use fenced expiring leases. Authored-code execution stays unavailable without the explicit verified sandbox adapter.

A fresh read-only in-process smoke confirmed 71 operator descriptors, 68 available pure operators, 6 templates, successful arithmetic compilation and `4 → 18` with no observed effects. `network.fetch`, `artifact.write`, `state.commit` remain unavailable. Operator count is not consumer-experience count. SEURL `COMMIT` leaves actual state WRITING and reports would_reach COMMITTED; the Substrate adapter returns evaluated:false and value_id:null.

## Actual gaps and extension points

The current consumer shell is Explore/Workspace/Observatory/Docs with a source editor, not the new Claim Your PURL/Memory/My AIs/Constellations/CGIT flow. There is no 40–60-experience catalog, handle claim/rename, independent CGIT product, memory atlas/passport, model Constellation orchestration, model gateway/billing, or public GitHub AST/dependency lens.

Optional auth verifies a Supabase `/auth/v1/user` response server-side and maps `(issuer, subject)` deterministically to a stable PURL principal. The browser currently receives an OTP fragment access token, exchanges it, then clears the fragment. This is not Authorization Code+PKCE or cross-product OIDC SSO. `auth.js` does not explicitly require confirmed email, and minted PURL bearer tokens lack an exposed expiry/logout/revocation API. Self-declared human/agent labels still confer no verified identity or authority.

| Existing seam | Safe extension |
|---|---|
| `service/http.js` | Add consumer and CGIT APIs using bounded requests/credential/origin checks; arbitrary user URLs are not fetched today |
| `service/domain.js`, `domain/support.js` | Keep grants/version/replay contracts; add explicit account/product/tenant authorization |
| `service/registry.js`, `domain/seed.js` | Curated experiences reference tested immutable releases and declare outcome, state, effects, limits, provenance and availability |
| `service/language/registry.js`, `compiler.js` | Add versioned bounded typed contracts; model/network execution requires explicit effect adapters and authority |
| `service/repository.js`, `supabase/migrations/*` | Preserve Supabase authority and private objects; add explicit reversible domain schemas |
| `service/worker.js`, `domain.workOnce` | Reuse durable lease fencing; external/model jobs need costs, effect identity, retry semantics and isolation |
| `web/app.js` | Add human consumer navigation while stable `/p/:id` manifests/program URLs remain supported |
| `domain/seed.js`, `reference/godseed/*` | Create a separate consumer mission with source hashes/dependencies/evidence/fresh-context continuation |

Persistence is a coarse global CAS JSON document plus transactional projections and private Storage objects. The projection schema accepts only principal/program/execution/artifact; releases/idempotency/registry are document-only. Full document copies, version snapshots and shared serialization are explicit limits. New memory/account/CGIT data cannot silently assume existing normalized tables or high-throughput fairness. Production infrastructure/current readiness is covered by the separate production reconstruction; older architecture prose about hosted deployment blockers is not evidence of today's live state.

## Protocol and research compatibility

- Original PURL/0.1 ports use `/r/:id/ops/:name` plus expected_version. Binary DAG operands pin resource/version/state_hash; HASH consumes ASCII bits and returns 256 bits. Current product import verifies supplied snapshot hashes/values, without claiming original event-chain truth, authority or identical derivation identity.
- `seurl/master` has 36 HTML lines and no script/parser/server. The actual FSM is `purl@83d6bca:src/circle/seurl.js`, vendored in `service/compat/seurl.js`. Its COMMIT/BUILD/TALK are prepared values on read. `service/language/seurl.js` gives contextual migration guidance with lossless:false, not verb equivalence or permission.
- ACSP/0.1 supplies typed TOKs, proposals, owner commitment, checkpoints, history and capability authority via a Next-mounted Fetch handler. Program001 adds `/transitions` and immutable Scrolls. Separate ACSP/0.2 accepts both envelope versions and adds addressable operation records. Preserve both histories and test a deliberate merge before deployment.
- Original SubstrateIO reads Program001 transition-history export; ccr's plain-events projection is a different format. ccr adds `/term`, `/observations`, `/projections` and identity decomposition. Product's mapping is syntax-only and does not establish cross-parameter validity or actual availability.
- Circle uses one server-held PURL principal and asserted session strings; it is not suitable as public tenant authorization. Multi-system operations can partially succeed. The substrate HTTP server is an unauthenticated localhost research tool; public use needs a bounded authenticated broker.
- Substrate research labels bit perturbation SIMULATED, not physical observation. Some universal history-prediction hypotheses were disproven. Current trace compiler correctly requires a known versioned pure operator or a complete closed finite model; sampled histories do not infer reusable semantics.

## CGT, GiN and CGIT discovery

Authenticated GitHub owner enumeration returned 91 repositories. Public research repositories `akadaan310/computationalgrammartheory` and `akadaan310/grammarinnumbers` exist. No case-insensitive CGIT repository name appeared; `GET /repos/akadaan310/CGIT` returned HTTP 404. This establishes no visible owned repo by that name, not global absence or absence of differently named embedded code. The complete non-truncated trees and pinned README/spec files were inspected without cloning or writing to either repository.


| Public research repository | Default / live SHA | Other live branches |
|---|---|---|
| `computationalgrammartheory` | `ccr-04ad16b1-q42wck` / `bfe32fc37f7fa61d50da50ecd2aa7fa97c0dd5a1` | None |
| `grammarinnumbers` | `claude/happy-newton-r2t17c` / `2a94f8a6be686078a9dad88863be9aafc5e6379b` | `ccr-95868bff-zq7rqu` / `7c8dc9429ee53927a5a7b6f099665d8571253717`; `research/the-number-edition-1-completion` / `5c96ddca7b032ff76ab11d1c8306d2aef4bcf211` |

CGT implements stdlib Python `cgtsdk`: operational grammars, distinct syntax/semantic/execution outcomes, explicit costs, compiled move words and minimal-DAG sharing. `GRAMMAR_AS_A_SERVICE.md` defines local reference `cgt-gaas/0.1` at localhost:8765 with `/v1/health`, `/v1/capabilities`, `/v1/execute`, canonical request/result SHA-256 and versioned registered operations. It explicitly has no hosted endpoint. `CGT_SDK_SPEC.md` §6 says it is not a performance library; local server has no authentication or algorithm preemption. This is an experimental integration source, not an existing production service to expose directly.

GiN default contains `ginsdk` 0.1.0 with numeral grammars, affine compilation, expression evaluation, converse admissibility, machine models and bit costs. The seven-commit-ahead ccr branch and eleven-commit-ahead number-edition branch differ from default; the latter README describes SDK 1.0/a 42-chapter book and explicitly says its website is not deployed. `CGT_CONCEPT_MAP.md` §2.4 connects positional notation with compression of unary terms; §2.6 retains Θ(k) bits for k-digit compiled words; §4 says GiN does not reproduce GaaS.

CGT `RESULTS.md` THM-005/OBS-008 measures DAG/explicit size ratios 0.0042 for template forests, 0.44 for random labelled forests, 0.0004 for full binary trees, and 1.0 for unary paths. Rank access costs 16–22 counted steps versus explicit-array 1, and 32,710 for the unary path. A height-15 full binary DAG grows from 16 to 1,521 nodes after 200 random relabels. `EXPERIMENTS.md` EXP-004 leaves tree SLP/top-tree compression unimplemented and lacks dead-rule GC beyond counting live nodes. These results do not establish arbitrary URL/payload compression or improved token/task performance on repository navigation. Pin the research revision and benchmark retrieval/task success before product claims.

Neither default recursive tree contains a LICENSE/COPYING file and GitHub license metadata is null. CGT's package says “See repository”; GiN package metadata says “MIT.” Preserve this actual provenance distinction before reusing or publishing imported material. Source attribution and imported-repository license are also required for the new GitHub lens.

Evidence reads were `GET /repos/akadaan310/{repo}`, `/branches?per_page=100`, `/git/trees/{SHA}?recursive=1`, and `/contents/{path}?ref={SHA}`. CGT pinned paths: README.md, CGT_SDK_SPEC.md, GRAMMAR_AS_A_SERVICE.md, RESULTS.md, EXPERIMENTS.md, COUNTEREXAMPLES.md, sdk/README.md, sdk/pyproject.toml. GiN pinned paths: README.md, CGT_CONCEPT_MAP.md, NUMBER_GRAMMAR.md, sdk/pyproject.toml, sdk/src/ginsdk/numerals.py, sdk/src/ginsdk/expr.py. Full repository/branch details are in the JSON twin.

## Verification limits

Inspection used Git object reads, branch ancestry checks and authenticated GitHub GETs only. Full suites were not rerun because they can write files and this task only authorizes report writes. Existing committed reconstruction/test evidence remains historical evidence, not a new passing claim. The pure smoke imported modules and evaluated in process without file or network writes. All five local checkouts remained clean and at their starting SHAs.
