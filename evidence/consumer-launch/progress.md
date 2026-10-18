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
