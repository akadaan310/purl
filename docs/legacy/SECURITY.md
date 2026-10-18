# Security

Programmable URLs are dangerous by default: a URL that *does* something
turns every link preview, crawler, prefetcher, chat log and curious agent
into an actor. PURL's position is that **opening a URL never implies
authority**, and that discoverability, authentication, authorisation and
execution are four separate steps.

This document is a threat model for the reference implementation. Each
threat lists the mitigation **as implemented** and what remains open.

To report a vulnerability, open a private security advisory on the
repository.

## Separation of steps

| Step | Mechanism |
|------|-----------|
| Discoverability | Manifests are public for anything you can observe. Knowing an operation exists grants nothing. |
| Authentication | `Authorization: Bearer` only. No cookies, no tokens in URLs. |
| Authorisation | One authority source must cover all rights of the planned primitives *and* permit the operation name. |
| Execution | `POST` only, with an `expected_version` precondition, schema-validated input, atomic apply. |

## Threats

### Unauthorised state mutation via GET / link prefetch
- **Mitigation:** the router has no path from `GET` to `store.invoke`.
  `?action=<mutation>` and `GET …/ops/{op}` return `405`. Tested in
  `test/http.test.js` ("GET is safe").

### CSRF
- **Mitigation:** there are no cookies or ambient credentials; tokens are
  sent explicitly in a header that browsers never attach automatically.
  Mutations additionally require `Content-Type: application/json` (HTML
  forms cannot send it cross-origin without a CORS preflight), else `415`.
- CORS allows `*` origins because no ambient credential exists for another
  origin to ride on. If cookie auth is ever added, this must change.

### Capability leakage (tokens in URLs, logs, Referer, transcripts)
- **Mitigation:** requests with `token`, `access_token`, `auth`, `key`,
  `api_key`, `apikey`, `bearer` or `password` query parameters are rejected
  with `400 token-in-url`. `Referrer-Policy: no-referrer` on all responses.
  Tokens are stored only as SHA-256 hashes; shown once at registration.
  The browser console keeps its token in `sessionStorage` (tab-scoped),
  not `localStorage`.
- **Open:** bearer tokens are still bearer tokens — anyone holding one is
  that principal. Proof-of-possession (DPoP, HTTP message signatures) is
  not implemented.

### Replay
- **Mitigation:** every mutation must state `expected_version`. A captured
  request cannot be replayed once the resource has moved on (`409`).
  `Idempotency-Key` makes intentional retries safe and rejects a different
  body under the same key.
- **Open:** a request captured and replayed *before* the resource changes
  would still apply once; TLS is assumed to prevent capture.

### Privilege escalation through delegation
- **Mitigation:** attenuation is enforced on every grant event
  (rights ⊆, operation allow-list ⊆, expiry ≤ the delegator's); the `own`
  power (ownership transfer) is not a grantable right; public grants are
  capped at observe/read; revocation cascades down the chain.
  Tested in `test/authority.test.js`.

### Confused deputy
- **Mitigation:** grants are bound to a specific principal id, not to a
  bearer capability, so a deputy cannot be tricked into exercising a
  capability it was merely shown. Each invocation is authorised by one
  source, recorded on the event, so any action can be traced to the chain
  that permitted it. Composite operations require the *union* of their
  primitives' rights, so composition cannot launder authority.
- **Open:** an agent acting on behalf of several principals must hold a
  separate token per principal; PURL does not yet model "acting for".

### SSRF and malicious redirects
- **Mitigation:** the server never dereferences a client-supplied URL.
  `link` targets are local resource ids that must be observable by the
  caller; there are no webhooks (subscription is SSE, pulled by the
  client); the only redirects (`303` for safe `?action=` aliases) are
  server-constructed same-origin paths.
- **Open:** cross-instance references are not supported partly for this
  reason (see RESEARCH_QUESTIONS.md).

### Operation injection
- **Mitigation:** operation names are looked up in a fixed registry
  (`Map`), never evaluated or used to build paths; unknown names → `404`.
  Inputs are validated against JSON Schemas with
  `additionalProperties: false`. The schema validator rejects unsupported
  keywords at load time so no schema silently validates less than it
  claims.

### Untrusted content and agent instructions (prompt injection)
- **Mitigation:** every representation carries a `notice` that state,
  collections and entry bodies are data written by principals, not
  instructions, and grant no authority; the manifest repeats this as
  `content_trust`. Continuity packages are labelled *claims by the
  preparer; not verified by the server*, next to server-verified facts.
  HTML escapes all content; JSON embedded in HTML escapes `<`, `>`, `&`,
  U+2028/9. A strict CSP (`script-src 'self'`, no inline script) applies
  to all pages.
- **Open:** labels cannot force a downstream agent to respect them. An
  agent that follows instructions found in `state` is still vulnerable;
  PURL only makes the provenance of that text explicit (who wrote it,
  under which authority, at which version).

### Existence disclosure
- **Mitigation:** a requester without `observe` gets `404` for both
  missing and hidden resources; `link` to an unobservable target fails
  with the same `404`; search lists only observable resources.

### Resource exhaustion
- **Mitigation:** 64 KiB request bodies; per-resource limits on events
  (5 000), entries per collection (1 000) and state size (256 KiB);
  instance limits on resources and principals; token-bucket rate limiting
  per principal (mutations) and per IP (registration); at most 100
  concurrent SSE streams; listing pages capped at 1 000 events.
- **Open:** limits are in-process; there is no distributed quota.
  Principal registration is open (rate-limited only).

### Tampering with history
- **Mitigation:** per-resource hash chain over events, plus state hashes
  before/after each event; `GET /r/{id}/verify` replays and checks; the
  persisted log refuses to load if the chain is broken. Clients can
  verify independently (`src/client/client.js#reconstruct`).
- **Open:** the chain is not signed; a server operator could rewrite the
  whole chain consistently. Signed events and external anchoring are
  future work.

### Authority re-evaluation on long-lived connections
- **Mitigation:** SSE streams re-check the subscriber's rights on every
  push and close when `observe` is lost (e.g. after revocation).

## Things PURL deliberately does not claim

- A principal is an account on an instance, not a verified identity.
- A Communication Profile is a style specification; it does not
  authenticate or identify anything.
- Hash chains prove internal consistency, not truth of content.
