# Task 06 — Frontends

Status: DONE_WITH_CONCERNS (frontend implementation and actual HTTP browser verification complete; real OIDC/provider credentials remain deployment dependencies).

Files owned and delivered:

- `web/consumer/index.html`, `app.js`, `style.css`
- `web/cgit/index.html`, `app.js`, `style.css`
- `test/launch/ui.spec.js`
- `evidence/consumer-launch/06-frontends/*`

PURLs is an ivory/ink/violet editorial consumer experience with the exact hero and promise, actual 40-working/11-limited descriptor-driven capability shelves, schema-based inputs and real sample execution, readable results, receipts, and separate copy/open actions. Discovery does not expose an IDE. Navigation covers Discover, My PURL, Memory, My AIs, Constellations, My Worlds, and the independently configured CGIT origin. Native PURLs read actual manifests and follow same-origin continuity links; public handles fetch the profile endpoint.

Memory provides an interactive private atlas, fact kinds/categories, source cards, correction history, create/edit/delete, typed relationships, explicit selected-memory passports, revocation, export, opt-in public cognition publication/revocation, and copy-denial fallback. Public cognition and provider context both require distinct explicit consent. Export text explains that already copied data cannot be erased by revoking future reads.

Identity uses bootstrap/session CSRF and server HttpOnly cookies. Guest preview is explicitly unverified. Actual OIDC readiness blockers appear rather than a fictitious email login. Callback JS reads code/state, clears the address, and POSTs the protected callback. Verified-only claim, rename, optional consented CGIT activation, sign-out, bounded delegated AI creation/revocation, one-time credential display and redacted provider keys use actual endpoints. No provider key, session or delegated credential is saved to browser storage; provider-key input is cleared before the request finishes. In-memory private metadata is cleared on sign-out.

My AIs and Constellations use real gateway/job endpoints, explicit selected context and provider consent, output-token controls and server spending-cap disclosure. Unavailable inference never displays a fabricated response. Guest inference/credential creation is visibly disabled. Role previews explain the independent-context workflow. Jobs expose start/checkpoint/resume/replay. No paid upstream calls were made.

CGIT has a distinct independent ink/mint workspace: own account/consent flow, repositories, typed artifact editor, immutable commits, complete commit history (via the supported snapshot read), branch creation/selection, diffs, releases, forks, explicit deletion, export/import and bounded public GitHub lens indexing/query. Source URL, real pinned Git SHA, license and per-file SHA256/symbol/dependency information are displayed. Source is escaped and never executed. Other-language inventory and semantic/performance limits are explicit.

Verification performed:

1. `npx playwright test --config evidence/consumer-launch/06-frontends/playwright.config.js` — expected initial red baseline: 10 original cases failed because both root-owned launch ports were unavailable. Output preserved in `baseline.txt`. The suite has since expanded to 18 desktop/mobile cases; final actual HTTP verification is recorded below.
2. `node --check web/consumer/app.js`, `node --check web/cgit/app.js`, `node --check test/launch/ui.spec.js` — PASS.
3. `node evidence/consumer-launch/06-frontends/visual-check.mjs` — PASS, four product/viewport combinations: 1440px desktop and Pixel 5. Actual catalog descriptors; explicitly fixture readiness/API responses. Zero page errors, horizontal overflow or axe WCAG A/AA/2.1 violations. `visual-results.json` and product screenshots preserve evidence.
4. `node evidence/consumer-launch/06-frontends/domain-check.mjs` — PASS, four product/viewport combinations using actual IdentityService/MemoryService/CatalogService/CgitService modules, MemoryLaunchStore and browser requests intercepted at the transport boundary. This verifies browser-to-domain contracts, not root HTTP. Actual cookie/CSRF guest sessions; literal HTML/XSS text; fact create/correct/delete; individual selected read passport and revoked future read 410; denied clipboard fallback; catalog sample/receipt/PURL; independent CGIT guest repository/artifact commit/history. Zero page errors, overflow or axe violations on the resulting memory/editor views. `domain-results.json` includes actual paths/statuses and screenshots. A meaningful initial failure (`crypto.randomUUID` unavailable on a non-secure development origin) is preserved in `domain-initial-failure.txt`; fixed with secure `getRandomValues` fallback.

5. `npx playwright test --config evidence/consumer-launch/06-frontends/playwright.config.js` — final PASS: **18/18 actual HTTP tests**, both products on 8180/8181, desktop and Pixel 5, 9.9 seconds. Output `http-final.txt`. Real catalog sample/receipt, guest memory CRUD, explicit share/revoke410, clipboard fallback, independent CGIT guest repository/commit/history, exact OIDC/inference blockers, no unchecked catalog share POST, and native mission manifest/continuity reads. Each case asserts zero unexpected HTTP errors, page errors or request failures. Per-case `network-*.json` records method/path/status only, never headers or bodies. `network-summary.json` totals the final run. Actual product home screenshots include axe/overflow checks.

Initial actual HTTP failures and subsequent corrections are retained: absent CGIT server during root startup; waiting for async revoke completion and async guest readiness in tests; an availability test incorrectly re-requested bootstrap config and invalidated its own CSRF cookie, correctly denied403. The final test observes the UI config request. Trace capture is disabled and generated trace archives were removed to avoid retaining guest session/CSRF material.

Integration requirements/limits:

- Root now serves agreed `/consumer/*`, `/cgit/*`, `/assets/*`, both SPA routes, and `/auth/callback`; `/account` is included in the CGIT SPA whitelist.
- Root domain context query now exposes named `branch`, `from`, `to` fields (CGIT expects object fields, not only URLSearchParams.get).
- Exact identity contracts consumed: config/me `csrf_token`; me `identity.products` is an array; login `authorization_url`; claim `activate_cgit`; explicit activation `{product:'cgit',consent:true}`. Root/identity peer fixed guest preview domain scopes/activation.
- Import uses actual `/api/cgit/import` (not an invented `/repos/import`). GET memory persists passport IDs but omits its transient creation URL; UI builds the supported same-origin `/api/passports/:id` read URL.
- Operator OIDC and live model provider readiness remain deployment requirements. Real provider login, live BYOK/hosted inference, paid Constellation contributions and measured model performance were not claimed or simulated.
- My Worlds honestly labels collection organization as a navigation preview and opens actual memory, CGIT, and mission destinations. User-selectable monetary cap mutation is not present in the model API; UI displays server caps and lets the user reduce output tokens. No unsupported budget endpoint was invented.
- Delegated AI list endpoint is not currently implemented; newly created public metadata is kept in memory only, with an explicit revoke-by-ID form. No credentials persist across reload.
- No peer files, old frontend, HTTP server, dependencies, migrations or external services were modified. No commits.
