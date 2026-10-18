# Provider consent independent review

Verdict: **FINDING — one P2 expiry-boundary defect.** The remaining reviewed adapter controls pass source review within the stated scope. This is not approval of live launch: the remote OAuth feature remains disabled, and the documented existing-grant automatic-approval limitation remains unresolved.

Scope: `service/launch/provider-consent.js`, its tests, task brief/report, retained official research and 13-pass evidence. No source changes, network activity, remote changes, or covered test reruns. One small offline uncovered probe was run outside the source tree. HTTP routing, CORS configuration, UI, and product callback implementation are outside this review.

Reviewed module SHA-256: `66ff7421b43eab4407b5eeb2704cd4695f9d776726017c4aa5e421ab8c7b4576`. Reviewed test SHA-256: `41ac30d7601b0f43630a15c4feca35a01af10dabc4014eecfb9b20b007119f28`.

## P2: Recheck local expiry after live identity verification

Location: `service/launch/provider-consent.js:127–135`, downstream effect at `:219`.

`loadSession` checks the stored expiry before awaiting `verifiedUser`. A slow provider `/user` request can cross that expiry; the function still returns the session. `POST /authorization` then invokes the provider's mutating authorization-details endpoint and stores a review whose deadline has already elapsed. This is observable when the local one-hour cap expires before a longer-lived provider access token. Provider token expiry cannot enforce the shorter local deadline.

Concrete proof: `node /workspace/consumer-review/provider-expiry-probe.mjs`, retained output `/workspace/consumer-review/provider-expiry-probe.json`. Synthetic stored session expired at `00:00:05Z`; mocked read-only `/user` advanced the clock to `00:00:06Z`. The adapter dispatched `/auth/v1/oauth/authorizations/fixture-id` **1000 ms after local expiry**, returned HTTP 200, and persisted/returned `review_expires_at: 00:00:05Z`. The mock fetch performs no network access. It leaves repository source untouched.

Impact: authority for an expired local session reaches an upstream mutation. This is more than returning an expired display record: the pinned upstream authorization-details handler associates the user and can automatically approve an existing grant. Ordinary explicit `/consent` has an additional review-deadline check, so this proof does not claim that its normal expired-review path succeeds.

Correction: reject expiry after live verification completes and before returning the authenticated session; preserve the existing preflight check. A regression should advance the clock inside `/user`, require `provider_session_expired`, and assert that no upstream authorization-details request or local review mutation occurs.

## Controls assessed

- Identity comes from authenticated live provider `/user`, checks immutable subject continuity and authoritative `email_confirmed_at`, and checks the existing issuer/subject deletion marker. Embedded signin users and editable metadata do not confer authority.
- Passwords are forwarded only to trusted configured provider endpoints. The module has no password store or logging. Access/refresh tokens and provider CSRF are AES-GCM sealed with session-specific authenticated data; browser cookies are opaque, hashed for indexing, Secure on HTTPS, HttpOnly, host-only and SameSite=Lax. Public/service-role key separation is enforced for the supported key forms.
- Entry writes require identity bootstrap and exact Origin; subsequent writes require exact Origin plus provider-session CSRF. GET `/me` and cached GET `/authorization` perform live identity reads and no application-record mutation. They rely on same-origin response confidentiality; root must not add credentialed cross-origin reads.
- The ordinary authorization-details response must match configured client ID, exact callback, user and authorization ID. Only unique `openid`, `email`, `profile` scopes are accepted, with `openid` required. Explicit decisions require boolean approval, a staged five-minute/session-bounded review and CAS consumption. Returned callbacks require matched origin/path, allowed unique query fields, state, and code or `access_denied` as appropriate.
- Session lifetime is bounded to upstream absolute/relative expiry and one hour at issuance. Local logout erases authority before remote logout and reports provider failure. Deleted or provider-rejected users fail closed. Live remote revocation behavior is exercised by the synthetic fixture's `/user` rejection, not proven against the disabled hosted service.
- Request fields are bounded; provider response size is checked before JSON parsing, transport has a ten-second timeout and redirect following disabled, and mutation rate/source-map bounds exist. The 64-KiB response check occurs after buffering; it is not a streaming memory ceiling. No claim of an aggregate expired-session garbage collector is made.

## Official-source and evidence assessment

Read retained `evidence/consumer-launch/02b-provider-consent/official-source-excerpts.txt`, reconstruction `identity-provider.md`, and task report. Auth pin is `ce9a8eee0cc042be8c7a42981a7ddae631e41d91`. The cached full authorization source hash matched its retained excerpt declaration (`882e7defed1260bd61d7f1b1af05a64b85418709429713b84fd13354efbc8d0b`). Routes, singular `scope`, consent `action`, redirect query parameter and response fields agree with retained official evidence. Retained changelog research includes the relevant upcoming TLS change.

The upstream source at `internal/api/oauthserver/authorize.go:228–269` confirms existing consent can auto-approve during details lookup. The adapter catches a returned `redirect_url` only afterward and withholds it. That does not undo approval, guarantee fresh consent, or allow repeated SSO flows to complete under the current local policy. This is already accurately documented; do not turn the 13 local passing fixtures into a claim of completed strict fresh-consent enforcement or live SSO.

The retained `test-green.txt` records **13 passed, 0 failed**. Source review confirms broad useful negative coverage. The newly demonstrated asynchronous expiry-crossing case is absent. Live verification email delivery, recovery completion, exact hosted revocation behavior and successful product SSO remain unproven as reported.
