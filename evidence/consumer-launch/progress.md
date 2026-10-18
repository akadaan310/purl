# SDD ledger — plan: docs/superpowers/plans/2026-10-18-consumer-launch.md

Base d6fbc666890f85913fac3553be055a44cb9ec620. Existing linked worktree /workspace/purl now isolated branch codex/purls-cgit-consumer; old branch/default preserved. User-supplied eight numbered documents/master are binding spec. Baseline197/197 PASS,0skip/fail. SourceZIP SHA256d3e2b0ad1a9f3a5885462a37dc554d0ab9a99a3c842e2cc9e1f7051c872a0a93.

Ruling: execute the supplied architectural spec continuously without another design/plan approval gate — user explicitly commands CODEX_MASTER execution/build/test/launch; developer directs complete authorized reviewable work. Cost if wrong: reversible featurebranch rework, no production mutation until testedrollout.
Ruling: parallelize disjoint implementation modules with explicit shared contracts — active developer multi-agent direction supersedes skill's generic sequential-implementer constraint. Cost if wrong: integration fixes; ownership/root-only sharedfile edits limit conflicts.
Ruling: preserve existing Auth SiteURL/defaults and legacy CAS document; deploy additive products and per-tenant data — reconstruction confirms shared existing app and slow5.46MB global reads. Cost if wrong: extra service footprint; avoids destructive replacement.

| Tasks | Shared interface / self-consistency | Finding |
|---|---|---|
|1–5,7–8|store read/list/scan/commit/resolveHandle/erase and tombstoneversions|fixedin spec/briefs, no crossscope authorization parameter fromclient|
|2/3/4/5/7|actorid/scopes/products and HTTPcontext|identity authenticates; downstream owns authorization; rootvalidatesOrigin/CSRF|
|3/5|gatewaycomplete and explicit selectedmemory|injection; no privatepool or fakefreeavailability|
|4/5|commitArtifact steward|requires separate CGITconsent, immutablecommit|
|2/6/7|POSTlogin/callback and HttpOnlycookie|GET callbackpage pure; codeexchangePOST,state+PKCE+nonce|
|1|Memory/File/Supabase limits andCAS tests|no originalmigrationedits, actualSQL required|
|2|OIDC readiness vsproviderdisabled|BLOCKEDactualSSO untiloperatorenable/clientconfig; nofakepass|
|3|40–60 distinctcatalog vsmodelunavailable|workingcount measured, limitedentries explicit|
|4|AST index versussemantic/compression claims|JS/TSboundedparser, actualpin/license, unsupportedlanguagesinventory|
|5|free/paid economics,3participants,recovery|providerkeynotassumed; mockprotocoltests scopedandrealstudyNOT_RUN ifblocked|
|6|consumerUX versusdeveloperIDE|distinctfrontends; no defaultmanualsyntax|
|7–11|legacypublicisolation andnewmission|oldURL/data preserved, newnativehandoff includes fullmission/evidence/authority|

## Verification checkpoint, 2026-10-18 17:15 UTC

- Store: independent PASS WITH NITS; read-filter Unicode nit corrected, 19 local tests pass. Earlier real PostgreSQL/PostgREST 22 tests plus rollback, RLS and process restart passed. Full queue backlog latency remains unmeasured.
- Additive hosted schema applied successfully. Four tables have RLS, no anon/authenticated table grants. Legacy `godseed-v3-production` remains revision70, 5,462,714bytes, MD5 `4d8b98fcf8a4d6bf0a6aed1cb60d6fcd`.
- Memory/catalog18 tests and CGIT22 tests pass; independent scoped fix review PASS. 40 working catalog entries; 11 limited integrations. Public AST proof is pinned and licensed; token figures are estimates for the measured repository only.
- Models/Constellations27 tests pass; second scoped fix review PASS. Real model inference and equal-budget comparison remain NOT_RUN because no operator inference key is configured; actual provider spend $0.
- Identity initial38 tests pass, both P1 findings addressed; review exposed quota-edge deletion regression. Follow-up underway. Real SSO is BLOCKED by disabled provider and missing registered clients; shared Auth SiteURL preserved.
- Frontends: real local HTTP Playwright18/18 pass across desktop/Pixel5, 250 responses, zero unexpected HTTP/page/request errors. Traces disabled to avoid credential capture.
- Root HTTP6/6 and SDK2/2 pass, including cold URL-only fork/build/run/publish/checkpoint/replay. Native proposals and execution-fencing follow-up underway.
- First digest-pinned Node22.14 container built with network disabled, using seven integrity-pinned official dependency archives. That frozen checkpoint passed351/351 tests with network disabled. Final source will be rebuilt and reverified after pending changes.
- Railway additive `purls` service/domain allocated, no application deployed yet. CGIT and launch-worker creation workflows still applying; do not report them live. Legacy API/worker deployments unchanged.
