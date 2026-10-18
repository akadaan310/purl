# Optional external OIDC provider: Auth0

Observation date: **2026-10-18 UTC**. Read-only review of public official documentation; no Auth0 account, credentials, tenant, or application was accessed or changed.

## Recommendation and boundary

**Keep Auth0 as a managed fallback if the existing Supabase OAuth server cannot satisfy the final identity contract.** A single Auth0 tenant, Universal Login, one shared identity connection, and two distinct first-party clients support central browser SSO across independently deployed products and domains. Auth0 describes this central-cookie redirect flow explicitly. This does not require moving either product's application database or hosting. It would, however, introduce a new identity issuer and require an explicit account mapping or migration decision; enabling the existing provider may be simpler. [Auth0 SSO](https://auth0.com/docs/authenticate/single-sign-on)

Important commercial boundary: Auth0's native OIDC Back-Channel Logout is **Enterprise-only**. Ordinary OIDC RP-Initiated Logout ends the central Auth0 session; it does not by itself invalidate both products' existing local sessions. Use the Enterprise feature or implement an application-owned revocation mechanism before promising coordinated sign-out. [Back-Channel Logout configuration](https://auth0.com/docs/authenticate/login/logout/back-channel-logout/configure-back-channel-logout), [RP-Initiated Logout](https://auth0.com/docs/authenticate/login/logout/log-users-out-of-auth0)

## Minimal external configuration

Substitute the deployed origins and agreed route paths below; no production origins were assumed during this research.

| Item | Required setting |
| --- | --- |
| Tenant | One production Auth0 tenant; use the **same exact HTTPS issuer/domain in both products**, including the trailing slash when validating `iss`. Use a separate tenant for non-production. |
| Login | Universal Login; enable the **same** database or trusted upstream identity connection for both clients. Use top-level browser redirects for SSO. A custom domain is optional for the basic redirect flow. |
| Application A | First-party client named `newPURLs`; its own generated `client_id`. |
| Application B | First-party client named `CGIT Hub`; a different generated `client_id`. |
| App type | `Regular Web App` when a server performs the exchange and holds secrets; `Single Page App` for a browser-only client, without a client secret. Do not weaken a confidential app to a public client just to add PKCE. |
| Grants | Enable `Authorization Code`; enable `Refresh Token` only if required. Disable Implicit, Password/ROPC, and other unused grants. Require PKCE for both designated client IDs with a Post-Login Action; Auth0's normal code flow otherwise accepts requests without PKCE. Check `code_challenge` exists and `code_challenge_method === "S256"` on authorization-code transactions. |
| URLs per client | Allowed Callback URLs: that product's exact `https://<origin>/<callback-route>`; Allowed Logout URLs: that product's exact approved post-logout URL. No wildcard or production localhost entries. For an SPA, set Allowed Web Origins / CORS to its own exact origin as needed. |
| Identity scopes | `openid profile email`; `offline_access` only if issuing refresh tokens. No custom API is necessary solely to log in and receive standard identity claims. |
| Verification | Enable verification emails for the shared database connection, configure a production email provider, and attach a Post-Login Action denying access unless `event.user.email_verified === true` for these clients. Requesting the `email` scope alone does not enforce verification. Handle denial in each callback and provide a verification/retry flow. |
| Refresh tokens | If used, enable per-client rotation, reuse detection, and finite idle/maximum expiration. Store confidential-app refresh tokens only in the backend. Revoke using the issuing client's `/oauth/revoke` operation. |
| Logout | Discover `end_session_endpoint`; invoke it with the app's `id_token_hint` and allowlisted `post_logout_redirect_uri`, and destroy the initiating product's local session. For central coordinated logout on Enterprise, register one public HTTPS Back-Channel Logout URI per client. |

Configuration evidence: [Application settings](https://auth0.com/docs/get-started/applications/application-settings), [PKCE enforcement, updated 2026-05-04](https://support.auth0.com/center/s/article/Enforce-PKCE-with-Actions), [PKCE login tutorial](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/add-login-using-the-authorization-code-flow-with-pkce), [verified-email enforcement, updated 2026-10-05](https://support.auth0.com/center/s/article/implement-email-verification-to-prevent-access-with-unverified-emails-in-auth0), [refresh rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation), [refresh revocation](https://auth0.com/docs/secure/tokens/refresh-tokens/revoke-refresh-tokens).

## Application obligations and identity compatibility

- Use the validated **`(iss, sub)` pair** as the external identity key. The same user in the same tenant/connection has the shared Auth0 identity, while ID token `aud` remains specific to its client. Email is a mutable profile attribute, not an identity key. Auth0 IDs are unique within a tenant, not across tenants. [Identify users](https://auth0.com/docs/manage-users/user-accounts/identify-users), [ID token structure](https://auth0.com/docs/secure/tokens/id-tokens/id-token-structure)
- Auth0's `sub` is not automatically an existing Supabase UUID. Preserve an already-established immutable platform UUID with an explicit server-owned mapping from `(issuer, subject)`; do not replace existing account foreign keys or automatically link accounts solely because emails match. Account linking requires deliberate handling of the primary account and authentication of both identities. [Account linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking)
- Each client validates signature/JWKS, issuer, its own audience, expiry, state, nonce, and PKCE transaction binding, then issues its own Secure, HttpOnly, SameSite cookie backed by a revocable server session. Never exchange one product's ID token as the other product's login credential.
- Back-channel handlers must validate Logout Tokens and revoke their local sessions indexed by `sid` (and `sub` where appropriate). Delivery is asynchronous. Already-issued access tokens can outlive logout until expiry; choose short lifetimes and enforce local revocation for protected app requests. [Back-Channel Logout behavior](https://auth0.com/docs/authenticate/login/logout/back-channel-logout), [access-token logout limit](https://support.auth0.com/center/s/article/Invalidate-the-API-token-after-user-logout)

These are proposed configuration and implementation requirements, not assertions about any live Auth0 tenant. No provider switch is necessary merely because this fallback exists.
