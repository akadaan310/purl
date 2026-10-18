# Fresh URL-only protocol check

PASS: fresh URL-only protocol continuation; overall launch remains incomplete

Entry: https://purls-production.up.railway.app/p/resource_95a5662789076892fe698316
Continuation: https://purls-production.up.railway.app/p/resource_c98b3e62ff35baae17fd81d0

Started 2026-10-18T17:53:22.543Z; completed 2026-10-18T17:55:45.621Z.

Only the entry PURL, its HTML-linked consumer client, manifest/API hyperlinks, and linked SDK supplied mission information. No existing local repository, report, conversation, or GitHub source was read. Runtime environment policy was checked only to preserve managed transport. Node 24.19.0 used NODE_USE_ENV_PROXY=1 with inherited proxy and TLS verification.

Observed: all nine embedded document SHA-256 hashes match. The graph has 38 unique nodes, 59 dependency edges, no missing dependencies or cycles. Recorded statuses: 25 PASS, 12 BLOCKED, 1 NOT_RUN. All nodes mark evidence_verified=false. These are recorded claims, not certified mission acceptance.

The compiler description returned 200 and declares bounded native PURL compilation, no execution effects, and authored code disabled. Manifest links for executions, artifacts, builds, and releases returned 200. Anonymous proposal listing returned 401 authentication_required.

The linked SDK created an explicitly unverified guest with resources:write authority. After identity config refresh it retained actual session CSRF, and the subsequent fork succeeded without refreshing identity/me again. Session secrets remained in memory and were excluded from evidence.

The own fork compiled successfully, passed 1/1 declared build test, and completed a worker execution. Execution and artifact were inspected through manifest collection links. Replay reported valid history and a valid, replayable execution. Checkpoint and publication succeeded; a separate anonymous client read the version-7 public manifest and persisted checkpoint and called replay. Original source, state, checkpoint, and version 13 remained unchanged.

- Principal: guest_eSKao4qpwVqGBtKSPcbDvEiHcU5Z1mrRywA4fzwD0hc
- Build: build_919e2733388bd54169ab99a9
- Execution: execution_3e569712addd0c1accf1da84
- Artifact: artifact_a60afe2218a793b502b7cf8d
- Artifact content: sha256:9fbb1d79de3aa8543e8fb1fec41600907f341464f5e3a6f480f950a46e3d06fe
- Receipt: sha256:d85d2bb5097f04184a7c054aca16a7d7f4304c385697284477c19e75e24ac1c7
- Checkpoint: checkpoint_4a17e1af6910458d0fa56f3e
- Release: release_03bb192131947df6648b5223

Recorded blockers, not independently re-proved:

- sso: Supabase OAuth server explicitly disabled (404 feature_disabled); established-provider code+PKCE and central consent adapters are implemented and locally tested, but live signup, verified email, registered product clients and shared login are not proved. Preserve existing shared Auth SiteURL; do not claim metadata alone means readiness.
- provider-inference: No actual operator model API key configured. No paid inference dispatched; real three-context study and equal-budget baseline NOT_RUN. Hosted model access disabled; 15% markup remains a proposal only.
- oracle: Gateway returned zero connected servers. No Oracle host was accessed or cleared. Docker worker migration uses the same Supabase backend and durable leases.
- authored-execution: Public authored JavaScript/Python execution remains denied until independent sandbox isolation verification. Bounded pure native PURL compilation/build/execution is implemented.

Current identity discovery directly reports available=false with missing OIDC issuer/client ID/client secret configuration. Inherited limitations also include recovery password UI, strict fresh consent, physical cleanup, and unverified ARM parity. Runtime execution retained completion=NOT_RUN and verified=false.

Observed errors:

- Initial harness attempted to assign read-only globalThis.crypto; corrected local helper name before any authenticated requests.
- An active principal is required (HTTP 401)
- Unexpected end of input Oversized interactive report-generation command exceeded terminal input length; report generation moved to a separate local script.

The initial harness globalThis.crypto assignment failed before authenticated requests and was corrected. Parallel collection responses were each inspected after the expected anonymous proposals denial. No other network call failed.

No real email/provider login, paid calls, infrastructure mutations, original mutations, deletion, implementation edits, or commits occurred.

Document hashes:

| Document | SHA-256 | Match |
| --- | --- | --- |
| 00_START.md | 8a3aa0bdc24596dfc895c757df3dd0cc99c53fcb064a73ef692f8199de8887c6 | true |
| 01_CONSUMER.md | 3d91afbd4c651bc8413e0ada71c37d8b24aa4b889e4f7ec96f3a5cbdaef2badf | true |
| 02_IDENTITY.md | d557c95c8a8eb9eea998d7b93154c4220d1cdbf5a106508e2a7aba4fd778d457 | true |
| 03_PROTOCOLS.md | 6787ffc3c87a328949257a70b62651e74ef5cbb2a47dba683e7368c54ecf3bea | true |
| 04_MEMORY_CONSTELLATIONS.md | 1ff54dbe10a2c0a451ecbbda97f2df754b321866d308b7866054940b8952419a | true |
| 05_CGIT.md | fac0c9c351ff85270f3bb1e09253c2b4a405576446c567bd8c2d22969ddf28c9 | true |
| 06_MODELS_RUNTIME.md | a4f80be5020a58629b378fcaf7537b865f37dd055cb7b90ece72894b6962cc38 | true |
| 07_ACCEPTANCE.md | 780f117b48d6847dac4301661507293de2a2e99ff75315e4caf13353c41bd95b | true |
| CODEX_MASTER.md | 5ffd2530421a7416449923c498b6524a1b97f7d67e129db3c0c2176641413c2d | true |

Network statuses, URLs, IDs, compiler and collection descriptions, blocked nodes, and operation results are saved in consumer-protocol-cold-final.json.
