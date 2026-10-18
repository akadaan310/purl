# Task03 — DONE_WITH_CONCERNS

Implemented private owner-scoped memory and a functional closed-operator catalog without changing shared HTTP, UI, registry, package files, migrations, or peer modules. No commits, dependency installs, external writes, or helper agents.

## Files

- `service/launch/memory.js`: `MemoryService({store,baseUrl,clock})`, standard async `handle(...)`, `snapshot(actor)`, `readPassport(id,{scopes})`, `cognition()`.
- `service/launch/catalog.js`: `CatalogService({store,memory,gateway?,cgit?,constellations?,baseUrl})`, standard async `handle(...)`, `catalog()`; also exported standalone `catalog()`.
- `service/launch/catalog-operations.js`: 32 different executable deterministic operations with schemas, algorithms, samples, expected assertions, bounded validation and SHA-256 receipts.
- `test/launch/memory.test.js`, `test/launch/catalog.test.js`.
- `evidence/consumer-launch/03-memory-catalog/`: initial missing-implementation red runs, behavioral boundary red runs, green runs and final `verification.txt`.

## Exact integration contract

Memory routes:

- `GET /api/memory`, `GET /api/memory/export` return owner-only `{facts,relations,passports,publications,version,identity,limits,retention,external_provider_consent}`; export adds format/time. Guest verified status is always false.
- `POST /api/memory/create {text,kind?,provenance?,tags?,occurred_at?}` → 201 `{fact,version}`. Kinds are `sourced_fact`, `user_assertion`, `inference`; sourced facts and inferences require `provenance.source`.
- `POST /api/memory/:id/update {text,expected_version,reason?}` → `{fact,version}`. Expected version is **fact.version**, not aggregate memory version. Corrections retain old text/time/version/reason.
- `POST /api/memory/:id/delete {expected_version}` removes the fact, its history and incident relations.
- `POST /api/memory/relations/create {from,to,type}` → `{relation,version}`. Both endpoints must exist in the same current owner scope.
- `POST /api/memory/relations/:id/delete {expected_version}`.
- `POST /api/memory/passports/create {consent:true,fact_ids,purpose,expires_at,allowed_scopes}` → 201 `{passport,version}`; allowed scopes `memory:read` and optional `memory:relations:read`; expiry must be future, at most 90 days. Passport includes `url`.
- `GET /api/passports/:id` is a public unpredictable live-read capability. It returns selected current facts only, no mutation authority, and `Cache-Control:no-store`, `Referrer-Policy:no-referrer`. Preserve those headers; avoid logging capability tokens. Direct `readPassport` permits requesting allowed relation-read scope.
- `POST /api/passports/:id/revoke {}` is owner-only; future reads return 410. Expired reads return 410. Edits and deletions are visible on the next read.
- `POST /api/memory/publish {consent:true,fact_ids,purpose}` → 201 `{publication,version}`; explicit opt-in only.
- `POST /api/memory/publications/:id/revoke {}` is owner-only.
- `GET /api/cognition` → `{partitions,namespace:'explicit-opt-in-public',private_pool:false,limit:200}`. Selected current facts and same-selection edges only. Public facts omit correction histories.

Scopes: memory reads require `memory:read`; writes `memory:write`; passports `memory:share`; public publication `memory:publish`. `*` is accepted for internal explicitly authorized actors. Body-selected owner/scope/tenant and prototype keys are rejected.

Catalog routes:

- `GET /api/catalog` → `{catalog,counts}`.
- `GET /api/catalog/:id` → `{experience}` including schemas, actual graph, effects, permissions, state, limits, provenance, sample input/expected assertions and limitations.
- `POST /api/catalog/:id/run {input:descriptor.tests[0].input}` requires `catalog:run` plus descriptor permissions; returns `{result,graph,receipt,purl}`. Receipt contains input/output/graph SHA-256 hashes, effects, execution time, replay explanation and owner persistence declaration.
- Graph protocol is `purl-catalog-graph/1`: one closed registered domain operator with exact input/output schemas and algorithm metadata. Execution dispatches to that actual operator. This is **not** represented as old compiler DSL.
- Computation runs are not persisted. Memory Passport declares state writes and creates an actual owner passport. Its input selects all currently matching explicit tags: `{consent:true,tags:['research'],purpose:'Selected continuity',expires_in_hours:24}`. Direct memory API permits individual fact selection.
- Memory descriptor sample assertions state an explicit fixture: one fact tagged `research`, `decision`, `business`, no relations. Other owners receive their actual state; no fake fixture is inserted.

## Catalog counts and honesty

**40 working entries**: 8 owner-memory workflows, 32 different deterministic text/data/math/graph/calendar/research workflows. **11 limited entries**. All 20 required consumer titles are present. Every working entry has a differentiated graph, executable sample and expected assertions. Names such as Never Start Over, Business Context and Team Decision Memory describe literal deterministic owner-memory views; limitations explicitly exclude inference, team authorization and provider-private memory access. Reproducible Research seals supplied data/parameters/results; it does not claim to rerun an experiment.

The 11 limited entries are AI Inbox, Constellation Debate, Evidence Jury, Code Review Constellation, Program Forge, GitHub Computational Lens, Architecture Map, Structural Diff, CGIT Steward, Bring Your Own Model, Personal AI Workspace. Runs return 503 with the exact dependency/consent/workflow limitation. Model-gateway and constellation callbacks were coordinated with task05; no synthetic model outputs. CGIT wrappers remain limited pending actual wrapper integration tests; task04 owns their working separate API. Constructor injection points are preserved. Hosted inference availability is not inferred from constructor presence.

## Verification

Final command:

```sh
node --test test/launch/catalog.test.js test/launch/memory.test.js
```

**18 tests, 18 passed, 0 failed** (fresh post-review output `evidence/consumer-launch/03-memory-catalog/review-verification.txt`; original 11-test output retained separately). This includes all 40 working catalog samples, required-title/status checks, schema rejection for each working entry, real shared `MemoryLaunchStore` service restart, two-account isolation, absent scopes, guest share denial, prototype-input denial, quota 200 facts, current revisions, relation endpoint ownership, selected-only passport reads, live corrections/deletion, owner revocation, expiration, opt-in public graph and omission of private correction history. Independent assertions cover CSV quoted delimiters/escaped quotes/duplicate headers; Unicode/empty text; duplicate lines; independent known SHA-256 null vector; JSON pointer escaping/missing paths; multiset and table behavior; graph cycles/unreachable nodes/disconnected nodes/closure; actual statistics/loan math; impossible dates/weekends; expected exposure; unsupported/contested evidence; repeated/missing citations; completed-action overdue exclusions; zero-conversion and invalid trial counts.

Behavioral red runs caught three actual bugs and are retained: projection series output bound (1200 months), normalized URL deduplication, and impossible date rejection. Final rerun passed after fixes. Full suite intentionally delegated to root while peer modules are being built, per task brief.

## Limits and remaining integration work

- This meets the numerical 40 working target with explicit deterministic tools, **not** 25–30 autonomous AI superpowers. Real hosted inference and end-to-end required model workflows remain launch dependencies.
- Root must mount both service handlers, preserve auth/CSRF/rate controls and no-store headers, and implement `/p/:id` native wrapper using returned schemas/graph/descriptor. No HTTP/UI code was changed here.
- Memory aggregate row is capped at 250,000 JSON bytes, at most 200 facts, 400 relations, 100 passport records and 100 publication records. These per-kind share limits include revoked records. Long facts may reach byte quota before count quota. Correction history is capped at 20 prior revisions per fact; error explains export/replace.
- Passport lookup records use one `memory:capability:<unpredictable-id>` scope per capability, so no fixed shared scope accumulates all tenants’ metadata. The lookup reservation happens before owner state; failed reservations do not consume the owner passport allowance. Failed owner writes attempt reservation cleanup; if cleanup also fails, the dangling pointer still has no owner authority and returns no content. Live reads always recheck owner state. Publication active-index rows use `memory/publication/<id>` keys in the authenticated owner scope and commit atomically with publication authority.
- Public cognition uses `store.scan({prefix:'memory/publication/',statuses:['active'],limit:200})` with an explicit 200-active-result bound. Revocation tombstones the publication index atomically with owner revocation, so revoked publications never occupy future active scans. Erasing an owner scope also erases that owner’s publication indexes. Pagination beyond 200 active publications remains unimplemented. No private memory is scanned or pooled.
- Export/revocation warnings explicitly explain that exported third-party copies cannot be withdrawn. Separate external-provider consent remains required in gateway workflows.
- No production database, deployment, external provider, accessibility or browser claim is made by this task; root owns those checks.


## Independent-review fixes (2026-10-18)

The independent review identified two real P2 defects: a shared 4096-lifetime-pointer capacity limit, and the reuse of 20,000-character input text bounds for combined output text. Both were reproduced before edits and their red evidence retained in `review-regressions-red.txt`.

The new real-store capacity regression fills both legacy global namespaces with 4096 pointer records, then successfully creates live passports and public publications for two fresh tenants. Active publication scans include each created publication and exclude it immediately after revocation. Additional real-store fault injection proves failed capability reservation consumes no owner allowance; failed owner commits leave no active capability lookup; failed public owner commits leave neither authority nor an active index. Real owner and delegated-agent scope erasure yields no future passport or public content. Identity owns erasing all delegated scopes when deleting a human owner.

Canonical JSON output and Never Start Over context use a separate explicit 250,000-character output text bound; input text remains capped at 20,000 characters. A real catalog run with two accepted 15,000-character JSON strings returns a correct canonical result, and six accepted 4,000-character owner facts return the full context. All 40 working descriptors/samples still pass.

Root additionally required explicit consent on every actor’s share/publication create. Both routes now require literal `consent:true`; omission/false fails before writing. Catalog Memory Passport requires the same flag in its public input schema and forwards only supplied consent. Tests cover humans and authorized unverified guests, absent/false consent, no implicit share persistence, and successful explicit consent. All GET operations remain pure. Frontend and identity owners were notified of the exact flag.

Fresh post-fix command: `node --test test/launch/catalog.test.js test/launch/memory.test.js` → **18 passed, zero failures**. `node --check` passed for all three owned production modules. No shared/peer files, dependencies, commits or external systems were changed during this review fix.
