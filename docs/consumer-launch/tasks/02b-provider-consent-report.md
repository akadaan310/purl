# Task 02b — Supabase login and explicit consent adapter

Implemented `service/launch/provider-consent.js` and `test/launch/provider-consent.test.js`. This is an adapter for the established Supabase Auth account/password/OAuth service. It does not issue OAuth codes, maintain passwords, or replace the existing product OIDC code/PKCE callback. Root owns HTTP routing and the central consent frontend.

No deployment, Auth configuration, client registration, signup/email dispatch to production, or shared Site URL change was performed. A read-only production discovery check on 2026-10-18 returned HTTP 404 with `feature_disabled`, `OAuth server is disabled`. Response evidence is in `evidence/consumer-launch/02b-provider-consent/live-discovery-{headers.txt,body.json}`. Real provider signup, verification delivery and SSO remain blocked.

## Export and HTTP contract

`new ProviderConsentService({store,identity,baseUrl,env,fetch})` exports `handle(method,path,body,context)`, returning `{status,body,headers}` or `null` for another route/method. Errors carry `status`, `code`, `message`; upstream private response bodies are never forwarded. All successful responses carry `Cache-Control: no-store`.

All paths below start with `/api/identity/provider`.

| Method/path | Request | Successful response |
| --- | --- | --- |
| GET `/config` | Public | `{available,blockers,authorization_path:'/oauth/consent',email_redirect_available}` |
| POST `/signin` | `{email,password}` + identity bootstrap CSRF | 200 `{user:{id,email,email_verified:true},csrf_token,expires_at}` and provider session cookie |
| POST `/signup` | `{email,password,authorization_id?}` + identity bootstrap CSRF | 202 `{verification_required:true,message,authorization_id?}`; no local session |
| POST `/recover` | `{email}` + identity bootstrap CSRF | 202 `{message}`; account existence is not disclosed by the successful response |
| GET `/me` | Provider session cookie | Safe live provider user, session CSRF and expiry, same shape as signin |
| POST `/authorization` | `{authorization_id}` + provider session CSRF | `{authorization_id,client:{id,name},scope,scopes,redirect_uri,review_expires_at}` |
| GET `/authorization?authorization_id=...` | Provider session cookie | Previously staged review; 409 if missing, mismatched or expired |
| POST `/consent` | `{authorization_id,approve:boolean}` + provider session CSRF | `{redirect_url}` after provider approval/denial and strict callback validation |
| POST `/logout` | Provider session CSRF | `{logged_out:true,provider_revoked:boolean}` and expired cookie |

All writes require exact Origin and the correct browser-bound bootstrap or provider-session CSRF. Existing `IdentityService` GET `/api/identity/config` supplies the bootstrap token/cookie; provider GET `/config` never creates cookies or store records. Following root's explicit integration decision, authenticated reads use cookie authentication and the browser same-origin policy, require no Origin/CSRF header, and never change application records. This allows GET `/me` to restore the CSRF token after a browser refresh. Root must preserve no cross-origin credentialed reads/CORS. Cached GET authorization never invokes the provider's authorization-details endpoint. GET `/me` and cached GET authorization perform live read-only provider `/user` verification.

## Provider REST contract verified against official source

Supabase Auth `master` was read at commit `ce9a8eee0cc042be8c7a42981a7ddae631e41d91`, matching the reconstruction pin. The adapter calls only the configured `SUPABASE_URL` origin, prepending `/auth/v1`, with `apikey: SUPABASE_PUBLISHABLE_KEY`, no redirect following and a ten-second timeout.

| Operation | Upstream request |
| --- | --- |
| Readiness | GET `/.well-known/oauth-authorization-server`; require exact issuer, `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo` and S256 |
| Password login | POST `/token?grant_type=password`, JSON `{email,password}` |
| Account signup | POST `/signup?redirect_to=<exact central consent URL>`, JSON `{email,password}` |
| Recovery request | POST `/recover?redirect_to=<exact central consent URL>`, JSON `{email}` |
| Current identity | GET `/user`, provider access-token bearer |
| Local provider logout | POST `/logout?scope=local`, provider bearer |
| Authorization details | GET `/oauth/authorizations/{authorization_id}`, provider bearer |
| Explicit consent | POST `/oauth/authorizations/{authorization_id}/consent`, JSON `{action:'approve'}` or `{action:'deny'}`, provider bearer |

Official references:

- [Supabase OAuth server setup and consent implementation](https://supabase.com/docs/guides/auth/oauth-server/getting-started): documented `scope` singular, `redirect_url`, Site URL plus Authorization Path, provider ownership of OAuth tokens.
- [Pinned Auth routes](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/api.go#L447) and [pinned authorization handlers](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/oauthserver/authorize.go#L176): actual routes, request/response fields, subject binding, registered redirect and provider consent behavior.
- [Pinned password grant implementation](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/token.go), [signup](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/signup.go), [recovery](https://github.com/supabase/auth/blob/ce9a8eee0cc042be8c7a42981a7ddae631e41d91/internal/api/recover.go).
- [Official auth-js request adapter](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/lib/fetch.ts): `redirectTo` is the `redirect_to` query parameter. [Official OAuth methods](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/GoTrueClient.ts#L6369) confirm authorization routes and `action` field.
- [Current changelog](https://supabase.com/changelog.md) and [upcoming TLS cipher change](https://supabase.com/changelog/cbc-tls-ciphers-deprecated): relevant October Auth breaking-change notice concerns old TLS ciphers; Node's current fetch/TLS implementation is used.

Downloaded source excerpts with line numbers and hashes are retained in `evidence/consumer-launch/02b-provider-consent/official-source-excerpts.txt`. An initially guessed deeper authorization documentation URL returned 404; implementation uses the fetched setup guide and pinned Auth source above.

## Security behavior and provider limitation

Provider session cookies are opaque, host-only, HttpOnly, SameSite=Lax and Secure on HTTPS. They use the distinct name `purl_provider_session`. Only their SHA-256 hash addresses a dedicated `__provider_session:<hash>` namespace; no global credential array or 4096-entry namespace is introduced. Access/refresh credentials and CSRF are AES-GCM encrypted using the existing `identity-crypto.js` helpers and `PURL_IDENTITY_ENCRYPTION_KEY`, with session-specific authenticated data. Passwords are sent directly to the provider, never persisted or included in responses/logs.

Session expiry is bounded by the exact provider expiry, returned relative lifetime and one hour. No token refresh is attempted; expiry requires a new signin. Each use checks live `/user`, the immutable provider subject, `email_confirmed_at` from the live response, and the existing identity deletion marker. Editable metadata and the signin response's embedded user do not establish verification. Expired, erased, corrupted, revoked, unverified or deleted sessions fail closed. Logout erases the local namespace before attempting remote logout; provider failure is reported without restoring local authority. Expired unused namespaces are not proactively garbage-collected by this adapter; application maintenance may erase them later without granting access.

Product client IDs are matched to their configured exact `/auth/callback` URI. Only `openid`, `email`, `profile` scopes are accepted and the precise provider scope string/list is displayed. Website/logo URIs and other private metadata are omitted. Review lasts at most five minutes and the remaining session lifetime. Approval/denial consumes the staged review using store version CAS before contacting the provider, preventing duplicate local decisions. An error after consumption requires a new review. Provider redirects require exact matched origin/path, no credentials/fragment, a state value, and only the corresponding code or access-denied query fields. Product BFF state/PKCE/nonce validation remains independently required.

**Upstream limitation:** the provider's details endpoint is a mutating GET: it associates a user and, when an existing grant covers the request, can issue an authorization code automatically. There is no non-mutating details variant in the verified API. Therefore only an explicit, CSRF-protected user POST to Review authorization may invoke it. The frontend must explain that reviewing can reuse existing provider consent. A redirect-only response is rejected with 409 `provider_implicit_approval`; this adapter never follows or exposes its code. This rejection cannot undo the upstream approval that already occurred. Repeated flows with existing grants require an operator/provider solution that guarantees fresh consent; this is a launch limitation, not completed strict fresh-consent enforcement.

## Required operator configuration and blockers

The code does not change these settings. Root/operator must supply:

1. Exact central consent origin served at the existing Supabase Site URL plus `/oauth/consent`, or an approved narrow reverse proxy that preserves that existing Site URL. Changing the shared Site URL is outside this work.
2. Trusted `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and the existing 32-byte base64 `PURL_IDENTITY_ENCRYPTION_KEY`. Secret/service-role keys must never substitute for the publishable user-auth key.
3. `PURLS_BASE_URL`, `CGIT_BASE_URL`, and separate `PURLS_OIDC_CLIENT_ID`, `CGIT_OIDC_CLIENT_ID`. `PURL_OIDC_CLIENT_ID` is a fallback only for the running `PURL_PRODUCT`. Callbacks must be registered exactly at each configured product `/auth/callback`; no wildcards.
4. `SUPABASE_AUTH_REDIRECT_ALLOWLIST`, either comma-separated or a JSON string array, containing the exact central `<consent-origin>/oauth/consent`. Root/operator must independently confirm that same exact URL is accepted by the provider; this environment declaration cannot inspect or modify hosted Auth configuration. Signup/recovery fail before sending email when absent. User-supplied redirects/provider origins are ignored. Optional signup authorization ID is returned for the UI to preserve; it is not added to the email redirect URL.
5. Authorized enabling of the remote OAuth server and configuration of the authorization path/client records, without changing shared defaults. Current server remains disabled. Preserve separate product BFF secrets and code/PKCE implementation.
6. Real verification and recovery delivery checks using authorized test accounts after email/SMTP readiness. The implemented `/recover` requests provider recovery instructions; consuming recovery tokens and changing a password requires an established provider-owned recovery UI, which this adapter does not implement. Confirmation/recovery token consumption was not tested against the live provider and is not claimed ready.

Production requires HTTPS. `NODE_ENV !== production` with `PURL_IDENTITY_ALLOW_HTTP=true` permits loopback HTTP provider fixtures. Mutating endpoints have bounded per-source rates and a bounded source map. No dependencies were added.

## Verification evidence

`node --test test/launch/provider-consent.test.js` → **13 passed, 0 failed, 0 skipped**. Final output: `evidence/consumer-launch/02b-provider-consent/test-green.txt`.

The tests run a real local HTTP server and native fetch, exercise the actual REST paths/fields, key/bearer headers, verified/unverified live identity, forbidden Origin/CSRF, signin rejection, exact email redirects, explicit review/approve/deny, safe metadata, client/subject/scope/callback rejection, provider implicit approval, review replay/expiry, session corruption/deletion/revocation/logout, encrypted persistence, GET purity/refresh restoration, config validation, rate limits, provider outage, and exact provider expiry despite processing time. Fixture credentials are synthetic. These are protocol fixtures, not a real Supabase tenant or proof of real email delivery.

Test-first evidence: `test-red.txt` captures eight expected assertion failures before implementation; `read-session-red.txt` captures missing browser-refresh support; `expiry-red.txt` captures the timing regression before its fix. The final expiry implementation uses a single issuance timestamp to prevent processing time extending provider lifetime.

An earlier mandated `npm test` run recorded **363 tests, 362 passed, 1 failed** in `full-suite.txt`: `test/launch/resources.test.js:157`, “owner revoked during execution is rechecked before result publication; malformed worker expiry cancels”, expected `cancelled`, got `succeeded`. Root confirmed that another agent was actively developing that regression at the time. No peer files were changed; root owns the final full-suite run after all sources freeze.

## Independent review correction — asynchronous expiry boundary

The independent review at `/workspace/consumer-review/provider-review.md` identified one P2: a session could expire while awaiting live `/user` verification, after the original preflight check but before the provider's mutating authorization-details request. Its offline probe showed a request dispatched one second after the five-second local lifetime ended. That finding was reproduced before changing production code.

The adapter now rechecks local expiry after live verification, immediately before dispatching mutating provider authorization/consent/logout operations, and after receiving authorization details before staging a local review. The consent recheck occurs after its awaited CAS consumption, covering a persistence delay across the expiry boundary. If logout's local erase crosses expiry, local logout still succeeds and no provider logout is dispatched. An operation legitimately dispatched before expiry can still complete upstream after expiry; these checks cannot undo an already dispatched remote mutation.

Three added deterministic regression tests advance the identity clock by six seconds with five seconds left: during `/user` for authorization review and consent, and during CAS for a consent decision. The first two assert 401 `provider_session_expired`, only the read-only `/user` request, and unchanged local records. The CAS case asserts the same expiry rejection and no upstream decision; the already consumed review remains consumed. REST/API/UI contracts are unchanged.

`node --test test/launch/provider-consent.test.js` now reports **16 passed, 0 failed, 0 skipped**; `node --check service/launch/provider-consent.js` passes. Evidence is `async-expiry-red.txt` (13 baseline tests pass, three new cases fail before the fix), `async-expiry-green.txt` (16 pass), and `async-expiry-fix.diff` (narrow source/test diff against the reviewed hashes). No external network, configuration, peer file, dependency or commit changes were made for this correction. Root owns the final integrated suite and re-review.
