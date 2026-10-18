# PURL Identity — One Account, Two Products

Implement **Single Sign-On** with an established OIDC provider, OAuth Authorization Code + PKCE, secure sessions, verified email and explicit consent. Check the actual capabilities of Supabase Auth or an appropriate supported identity provider before selecting. Do not invent a homegrown OAuth server.

PURLs signup offers an optional **Activate CGIT Hub** checkbox. Idempotently provision a CGIT profile/namespace after consent. CGIT-first registration gives reciprocal access to PURLs with the same credentials. Shared immutable subject ID, distinct per-product profiles, scopes, quotas and authorization. Account linking must require verified ownership; never merge on unverified email alone. Support logout, revocation, account export/deletion, handle rename, account recovery, rate limits and redirect/CSRF defenses.

AI principal identity is distinct from human identity, with delegated scopes, owner, attestation status, revocable expiring credentials and audit trail. A session claiming to be ChatGPT or Claude is not thereby provider-verified. Test signup both directions, opt-in provisioning, duplicate signup, expired token, consent removal, account isolation and cross-product artifact access.
