# Cold-session PURL reconstruction

Observed starting URL: http://127.0.0.1:8080/p/godseed-mission. Discovery began with no predecessor conversation. PURL domain knowledge came only from HTTP responses at this origin; local application source and other reports were not read.

The permitted useful step succeeded: POST http://127.0.0.1:8080/api/programs/godseed-mission/propose returned HTTP 200 and created pending proposal `proposal_9bbbad2c2f504b6ede9a3939` under principal `principal_fd0463188d69b44918cce672`. The program advanced from version 1 to 2. Executable source remains `input json`, source revision 1, and mission completion remains NOT_RUN / verified=false.

The page is available as HTML and as `application/purl+json`. The HTML response links `/.well-known/purl`; discovery then exposes manifests, SDK, source, continuity, history, replay, operations and mission graph. Current protocol is PURL/0.2; OpenAPI is 3.1.0 and API version 0.2.0. The service describes itself as LIVE with development-file persistence.

The stored directive describes the full PURL product and its twelve requirements, ten experiments, mathematical contract, design contract, infrastructure, delivery artifacts and reconstruction. A Railway-first / Oracle-later amendment is included. These are stored requirements; they supply neither verified implementation evidence nor authorization to deploy or contact third parties.

The mission graph is `purl.mission-graph/1`: 52 nodes, 65 edges, ten directive sections, twelve feature requirements, ten experiments, nineteen artifacts and one amendment. All 52 nodes are NOT_RUN with empty evidence. Each declares dependency, evidence and test predicates. Local structural checks of the captured graph found unique IDs, no missing references, matching edges and an acyclic graph. This establishes graph structure only.

The program itself has no program-level dependencies and its active seed build contains zero operators, zero execution steps and no effects. It is a bounded-pure identity source, not an executor of all mission tasks. The seed build reports tests_passed=true with an empty tests list.

Current authority is separate from identity: anonymous clients have read/run/propose rights from wildcard grant `grant_seed_godseed-mission`, but mutations require authentication. Anonymous GET /api/session returned 401 authentication_required. Creating a self-declared agent session returned 201; identity_verified=false. The authenticated manifest exposed read operations plus run, fork and propose, while original checkpoint/edit/commit/publish/grant operations remained unavailable. No denied mutation was attempted.

The discovered SDK at http://127.0.0.1:8080/sdk/client.js was fetched via HTTP and used for session creation and the proposal. It implements same-origin operation links, bearer authentication, explicit expected_version and Idempotency-Key. The proposal used expected_version=1 and Idempotency-Key `cold-session-reconstruction-2026-10-18-v1`. The token stayed in process memory and was redacted before capture. Idempotency replay/conflict behavior was not tested.

Fresh authenticated GETs found the pending proposal and a new propose event; a fresh anonymous negotiated GET found version 2. History now has two events. Replay reports valid=true, version=2 and no executions. Checkpoint remains null. Neither proposal nor replay validity establishes mission completion.

| Identifier | Observed value |
| --- | --- |
| Program | `godseed-mission` |
| Owner | `principal_purl_seed` |
| Directive content | `sha256:1819920b23dcf16f5bbfe901d66f4919b3772e602c43c39213bf408417e3f315` |
| Active build record | `build_seed_godseed-mission` |
| Build digest | `sha256:9b3414eeaae63856498e58ab6f016322741a1b7c244c9d38fee92d6c53d53f34` |
| Source content | `sha256:fac4766c8b5b4e8a47c9d303bbe0fd586f108c22513c38390b2591407c0e4037` |
| Derivation | `derivation:120bf9285f30f0d527a9de4cce12a59adb94f5dea6b2138f367c88f3e3b36da7` |
| Registry | `content:af7936be1685a74fd4b02e075673a0d652b5eb1b4a68da7286b03789945b6464` |
| Environment | `sha256:cdbc504f820ea904474b3e8e357e5cea5610b3cee05c654db293d5ccd316f966` |
| Initial event | `event_156ad2b6b3ecfd5c0ad3b1dc` |
| Proposal event | `event_71b84ff34e1c19076a355607` |
| New replay head | `sha256:47ea188e67bb2ce4418cc6dfd74cb8f888d50f45d23dd46fef635e6bf6fc95dc` |
| New state hash | `sha256:7a034a5b8e12f7352b2bc9c2922e9f73e27311e9d7ee63f7f9f9572f06780eb4` |

The build environment reports purl-bounded-interpreter runtime version 1, IR purl-ir/1, x64, Node 24.19.0, network=false and external_effects=false. These describe the served build record, not a newly tested worker. Registry discovery lists 70 operators, 67 available. network.fetch, artifact.write and state.commit lack approved adapters. Discovery reports arbitrary_code_execution=false and sandbox_adapter=null.

The preserved reference describes PURL/0.1 at repository SHA `3df4452a3624b3f5492bf23c2dacc49d8d2b33c7`, branch `claude/purl-protocol-research-bxevq5`. It is explicitly separate and unavailable at the product origin, and tokens/grants are not imported. That SHA does not identify the current product revision, which was not exposed.

What can happen next follows the current grant: continue public reads; create another self-declared session for run/fork/propose; obtain a current checkpoint grant for the original or fork under owned authority before checkpointing. Owner review is needed to commit the pending proposal. Stored instructions do not authorize deployment or external contact.

Requested HTTP URLs and response statuses:

| Method | URL | Status |
| --- | --- | --- |
| GET | http://127.0.0.1:8080/.well-known/purl-reference | 200 |
| GET | http://127.0.0.1:8080/.well-known/purl | 200 |
| GET | http://127.0.0.1:8080/api/openapi | 200 |
| GET | http://127.0.0.1:8080/api/operators | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/continuity | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/diff | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/history | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/manifest | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/mission | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/mission/E09 | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/mission/feature-11 | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/mission/formal-contract | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/mission/reconstruction | 200 |
| GET | http://127.0.0.1:8080/api/programs/godseed-mission/replay | 200 |
| GET | http://127.0.0.1:8080/api/templates | 200 |
| GET | http://127.0.0.1:8080/docs/SDK.md | 200 |
| GET | http://127.0.0.1:8080/healthz | 200 |
| GET | http://127.0.0.1:8080/p/godseed-mission | 200 |
| GET | http://127.0.0.1:8080/sdk/client.js | 200 |
| GET | http://127.0.0.1:8080/api/session | 401 |
| POST | http://127.0.0.1:8080/api/session | 201 |
| POST | http://127.0.0.1:8080/api/programs/godseed-mission/propose | 200 |

Mission dependencies (every listed node remains NOT_RUN; all evidence lists are empty):

| Node | Dependencies |
| --- | --- |
| `mission` | none |
| `reconstruction` | `mission` |
| `formal-contract` | `reconstruction` |
| `features` | `reconstruction` |
| `cinematic-design` | `reconstruction` |
| `experiments` | `reconstruction` |
| `infrastructure` | `reconstruction` |
| `work-plan` | `reconstruction` |
| `deliverables` | `reconstruction` |
| `execution` | `reconstruction` |
| `feature-1` | `feature-3`, `feature-8` |
| `feature-2` | `formal-contract` |
| `feature-3` | `formal-contract` |
| `feature-4` | `feature-1`, `feature-3` |
| `feature-5` | `feature-2`, `feature-3`, `feature-9` |
| `feature-6` | `feature-3` |
| `feature-7` | `feature-3` |
| `feature-8` | `feature-2` |
| `feature-9` | `infrastructure`, `feature-8` |
| `feature-10` | `feature-3`, `feature-8` |
| `feature-11` | `feature-2`, `feature-8` |
| `feature-12` | `feature-8`, `feature-9` |
| `E01` | `feature-3` |
| `E02` | `feature-3` |
| `E03` | `reconstruction`, `feature-3` |
| `E04` | `feature-7` |
| `E05` | `feature-5` |
| `E06` | `feature-2`, `feature-9` |
| `E07` | `feature-11` |
| `E08` | `feature-10` |
| `E09` | `feature-10`, `feature-11` |
| `E10` | `feature-1`, `feature-4`, `feature-8`, `feature-9` |
| `artifact-readme` | `reconstruction` |
| `artifact-architecture` | `reconstruction` |
| `artifact-formal-semantics` | `reconstruction` |
| `artifact-language-spec` | `reconstruction` |
| `artifact-sdk` | `reconstruction` |
| `artifact-nomenclature` | `reconstruction` |
| `artifact-constitution` | `reconstruction` |
| `artifact-security` | `reconstruction` |
| `artifact-deployment` | `reconstruction` |
| `artifact-reconstruction` | `reconstruction` |
| `artifact-migrations` | `reconstruction` |
| `artifact-experiments` | `reconstruction` |
| `artifact-acceptance-json` | `reconstruction` |
| `artifact-program-graph-json` | `reconstruction` |
| `artifact-handoff-json` | `reconstruction` |
| `artifact-playwright-screenshots` | `reconstruction` |
| `artifact-example-purls` | `reconstruction` |
| `artifact-build-hashes` | `reconstruction` |
| `artifact-deployed-url` | `reconstruction` |
| `deployment-amendment` | `infrastructure` |

Limitations:

- Cold session was independent of predecessor conversation and local application source, but used the same agent platform and local service. This is not an independent cross-provider test.
- All PURL domain knowledge came from HTTP responses at 127.0.0.1:8080. Only this session's captured response files were read; no application files or predecessor reports were inspected.
- Service LIVE, development-file persistence, build immutability, replay validity, runtime versions and capabilities are server reports unless separately described as directly exercised. No current repository/deployed source commit was exposed. Program source_revision 1 is not a Git commit.
- No external repositories or research handoff were accessed. Their claims, mathematical proofs, migration compatibility, and current deployed infrastructure remain unverified.
- No deployment, third-party contact, arbitrary code, compile/build/run, UI automation, persistence restart, sandbox attack, revocation, stale-version rejection or idempotency replay/conflict tests were performed.
- The pending proposal contains unchanged executable source and reconstruction text. It is not a checkpoint, committed implementation, verified mission evidence, or completed mission node.
- The original mission still lacks a checkpoint grant for this principal. An authorized owner or delegated principal must checkpoint the original; this session could instead fork under its own authority but did not do so.
- Session bearer token was kept only in process memory and redacted before capture. No reusable credential is included in the report.
- Build tests_passed=true accompanies tests=[] on the seed build; this does not establish behavioral coverage. Every mission node contains a declarative test assertion, not an observed passing result.
- SDK same-origin and URL credential guards were observed in served SDK code. Server-side SSRF defenses were not established by that inspection.
- Mission graph operations and predicates are declarations. The current executable source is input json with zero plan steps; fetching or running this source does not execute the full mission graph.

Machine-readable details, complete graph texts/predicates, exact operation URLs, request payload, response metadata and body SHA-256 digests are in `report.json`. Captured HTTP payloads and the redacted action trace are in `http/`.
