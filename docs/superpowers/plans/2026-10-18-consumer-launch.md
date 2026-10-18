# PURLs × CGIT Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkboxes. User directs continuous execution of supplied CODEX_MASTER; no additional design gate is inferred.

**Goal:** Two independently usable consumer products, shared established OIDC identity, durable memory/artifacts/computation, executable URL-only mission continuation.
**Architecture:** Preserve legacy deployment. Add tenant-row storage, modular identity/memory/catalog/CGIT/models/Constellations and separate PURLs/CGIT frontends with a worker. Established OIDC provider/code+PKCE; disabled dependencies remain visibly unavailable.
**Tech Stack:** Node22.14, exact openid-client6.8.8 and Babelparser7.29.9 with lockfile/vendor tarballs, SupabasePostgres/Storage, Railway, nativebrowserJS/CSS, Playwright/axe.
**Spec:** docs/superpowers/specs/2026-10-18-consumer-launch-design.md and preserved reference/consumer-launch/00..07.

## Global Constraints

- Preserve existing production rows/public URLs/default branches; no Oracle wipe or destructive migration.
- PURL means Programmable URLs, pronounced pearl. Consumer hero “Claim your PURL”; promise “Your AI, uninterrupted.”
- Established OIDC AuthorizationCode+PKCE only; no homegrown OAuthserver, fakeemailverification or label-as-authority.
- Private tenantdata and keys never public; APIservice only persistence access; authored code disabled unless independently verified isolation.
- Forty to sixty functioning differentiated experiences are a quality target; report verified count, actualstatus and unavailabledependencies.
- New mission embeds every numbered document, typed executablegraph/evidence/checkpoints/nextsteps; GET never mutates application state.
- Costs/usage measured; no unlimitedfree claim, paidcharges or15%feeactivation without approval.

## Review Focus

- Cross-tenant IDs, renamed handles and deleted records cannot expose private data or resurrect sessionauthority.
- OIDC code/state/nonce/PKCE/audience/expiry and unverified email fail closed, preserving existing shared Authdefaults.
- Concurrent spending/job leases/branchhead/profileconsent mutations remain atomic and idempotent under retries/restarts.
- URL/path/file/parser/AST limits prevent SSRF, traversal, codeexecution and unbounded allocation.
- Provider-unavailable/model-failure/clipboard-denial/mobilekeyboard paths show truthful actionable states, never fake success.

## Execution tasks

Each task's exact files/interfaces/assertions are in docs/consumer-launch/tasks/NN-*-brief.md.
For each: write meaningful failing behavior test, preserve RED, implement owned files, run covering GREEN, report exactresults, review spec+quality, fix findings, root commits scopedchange.

1. [ ] Durable scoped store: task01 brief. Verify Memory/File contract and actual PostgreSQL/PostgRESTCAS, quotas, role denial/restart.
2. [ ] Shared identity: task02 brief. Verify real mockOIDCprotocol flow bothdirections and session/tenant/consent/expiry/revocation defenses. Realprovider setup separateBLOCKED untilconfigured.
3. [ ] Memory/catalog: task03 brief. Verify privacy/corrections/share/revoke/export and distinctexecutablecatalogsamples/types/quota.
4. [ ] CGIT/lens: task04 brief. Verify immutablehistory/branchforkdiff/tamper/import/export and actualreadonlypublicGitHubpinnedASTindex.
5. [ ] Models/Constellations: task05 brief. Verify encryption/budgets/providerfailure/threefreshcontexts/interruption/fencing/steward; realproviderstudyifcredentialsavailable.
6. [ ] Consumer interfaces: task06 brief. Verify actualAPIflows and accessible desktop/mobile with screenshotreceipts.
7. [ ] Root integration: service/launch/{http,main,worker-main,resources}.js; additive npmdeps/vendor/Docker; HTTP tests health/config/origin/CSRF/bodylimit/staticrouting/legacyisolation.
8. [ ] Native mission: reference-backed fullmissiongraph and typedresource endpoints; testcompile/run/checkpoint/fork/proposals/provenance/read-onlyreconstruction. Fresh agent seesonly URL.
9. [ ] Verification/review: full npmtest, allcatalogsamples, actualSQL, pinnedcontainer+restart/coldrestore, securityreview, browserjourneys. Preserve errorsandNOT_RUN/providerlimits.
10. [ ] Reversible deployment: newRailway services/worker, additiveSupabase migration aftertests, sameprojectprivatebackend; verifySUCCESS/liveHTTP/oldfingerprint, recordSSO/model/Oracleblockedconditions.
11. [ ] Delivery: incrementalcommitsfeaturebranch, exactacceptancecounts/URLs/screenshots/costs/evidence,nextsteps, liveexecutablemissionURL plus portablearchive/sourcehistory.
