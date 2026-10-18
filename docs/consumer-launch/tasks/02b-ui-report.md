# Task 02b — Central provider-consent frontend

Status: **DONE_WITH_CONCERNS**. Additive UI and local protocol verification are complete. Live Supabase OAuth enablement, email delivery and a real verified human login remain blocked dependencies; none is claimed by fixture results.

Owned files:

- `web/identity/index.html`, `app.js`, `style.css`
- `test/launch/provider-ui.spec.js`
- `evidence/consumer-launch/02b-ui/*`

No existing PURLs/CGIT frontend, existing tests/config, server file, dependency, provider setting or external account was modified. No commits.

The isolated PURL Identity page at `/oauth/consent` uses the existing self-hosted fonts, ivory/violet branding, keyboard focus progression, responsive forms and explicit three-stage account/request/choice flow. Provider availability and the exact returned blockers govern sign-in. Signup and recovery remain disabled unless the backend reports the exact central email redirect as allowlisted. Signup/recovery responses never create a verified badge; the provider must return a safe live verified user.

Account sign-in uses bootstrap CSRF from `/api/identity/config`. Password fields are cleared before awaiting the request and temporary payload fields are erased afterward. No password, provider token, cookie or session/CSRF value is saved to localStorage/sessionStorage or written to test evidence. The app restores a verified provider session with read-only `/provider/me`, without implicitly requesting authorization details. All protected POSTs use provider CSRF after sign-in. Backend peer/root corrected the original GET/me Origin/CSRF requirement: browser same-origin GET omits Origin, and safe cookie-authenticated GET/me must recover CSRF after a reload.

Review is a distinct, explicit POST `/api/identity/provider/authorization`. Only then are the actual client name/ID, exact requested scopes, registered callback and review expiry displayed. Allow and Deny are separate explicit choices. Failed/repeated reviews invalidate local staged details. A consumed or failed consent attempt requires review again. Upstream existing-grant/implicit-approval409 is shown as a failure without following its redirect.

The final redirect must be absolute HTTP(S), have no URL credentials or fragment, match exactly a configured PURLs or CGIT origin from `/api/config`, and use exactly `/auth/callback`. Credential query parameters are rejected. Arbitrary URL return destinations are never consumed. Fragment contents are discarded without parsing before initialization and never establish a session; sensitive query parameters are also removed. Client, user and permission text is escaped.

Verification:

- `node --check web/identity/app.js` — PASS.
- `node --check test/launch/provider-ui.spec.js` — PASS.
- `npx playwright test --config evidence/consumer-launch/02b-ui/playwright.config.js` — **28/28 PASS**, desktop and Pixel 5, **8.8 seconds**; `playwright.txt`.
- 26 route-intercepted protocol cases cover unavailable provider, immediate password clearing, no browser storage, no implicit Review/approval, exact bootstrap/provider CSRF, explicit Allow/Deny, client-name HTML injection, four unsafe callback forms, signup verification, email redirect gating, fragment rejection, upstream implicit-approval409, and missing authorization IDs.
- Two additional cases use actual HTTP browser requests, actual IdentityService + ProviderConsentService + MemoryLaunchStore, and a local HTTP GoTrue-compatible protocol fixture. Actual HttpOnly session cookies, real CSRF checks, page reload/session restoration, provider UserInfo verification, explicit authorization review, approve adapter request and validated callback are exercised. Persisted store data is checked for absence of plaintext fixture password/access/refresh values. These exercise real backend adapters against a **local fake provider**, not live Supabase. Safe method/path/status traces are in `http-protocol-{desktop,mobile}.json`; no request headers/bodies/cookies/passwords are written.
- Axe WCAG A/AA/2.1 and no-horizontal-overflow checks pass on provider-unavailable, consent-review and actual-HTTP consent-review screens on both viewports; screenshots retained. No browser page errors.
- Initial missing-UI baseline is retained in `baseline.txt`; the first run's two strict text-selector failures (a decorative checkmark affected exact text matching) are retained in `initial-selector-failure.txt`. Corrected assertions verified the actual visible verified badge. No security behavior was weakened.
- Playwright trace capture is disabled. All account data and credentials in tests are explicit synthetic fixtures. No real signup, recovery email, password submission, provider approval or external account mutation occurred.

Sources read:

- Current Supabase changelog: https://supabase.com/changelog.md (saved locally); reviewed relevant Auth/TLS breaking-change entry https://supabase.com/changelog/cbc-tls-ciphers-deprecated. The UI makes no direct Supabase SDK or TLS configuration changes.
- Official OAuth server setup/authorization UI guide: https://supabase.com/docs/guides/auth/oauth-server/getting-started.md (saved locally). It specifies the central authorization path, preserved `authorization_id`, authenticated client/scope review and explicit approve/deny. Actual REST adapter implementation/research belongs to the backend peer's report.

Root integration requirements:

- Serve `web/identity/index.html` specifically for `/oauth/consent`; serve `/identity/app.js` and `/identity/style.css` plus existing `/assets/*` fonts.
- Route `/api/identity/provider/*` to ProviderConsentService before general identity fallback; preserve HttpOnly Set-Cookie headers. Keep safe GET/me restoration and Origin+bound-CSRF checks on POST.
- `/api/config` must provide exact product base URLs, and provider config must report `available`, `blockers` and `email_redirect_available` honestly.
- Existing production Supabase Auth Site URL/default redirects stay unchanged. Enabling OAuth, configuring exact central email redirect allowlisting and proving real email verification remain operator/provider tasks. A password recovery request is only the provider's supported initiation endpoint; this UI does not invent password-reset authority from link fragments.
