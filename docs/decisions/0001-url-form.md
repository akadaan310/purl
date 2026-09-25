# ADR 0001 — How operations are represented in URLs

Status: **accepted** for PURL/0.1.

## Question

How should a "programmable URL" express *which resource*, *which
operation*, *with what arguments* and *under whose authority*? The brief
asked us to compare query parameters, path operations, HTTP verbs,
fragments, content negotiation, signed URLs, capability URLs, POST bodies,
URI templates, hypermedia controls and JSON representations.

## Constraints that decide it

1. **Opening a URL must not imply authority** (invariant I4). Browsers,
   link unfurlers, crawlers, prefetchers, antivirus scanners and AI agents
   all issue `GET` to URLs they merely *see*. RFC 9110 §9.2.1 defines GET
   as safe; the whole web infrastructure relies on that.
2. **URLs leak.** They are written to server logs, proxy logs, browser
   history, `Referer` headers, chat transcripts and model context windows.
3. **A client must be able to discover operations** without prior
   knowledge.
4. **Browsers must be able to display the resource.**

## Options evaluated

| Option | Example | Verdict | Reason |
|--------|---------|---------|--------|
| Query parameter action on GET | `GET /r/7F82K?action=handoff` | **rejected for mutations** | Violates GET safety: any link preview or agent "just looking" performs the handoff. Classic CSRF vector. |
| Query parameter on POST | `POST /r/7F82K?action=handoff` | rejected | Works, but arguments then split between query and body; operation names end up in logs with arguments. No benefit over a path. |
| Path operation + POST | `POST /r/7F82K/ops/handoff` | **accepted** | Operation is addressable (manifest can link to it), method is unsafe as it should be, arguments are in the body (not logged), and the URL alone is harmless. |
| HTTP verbs only | `PATCH /r/7F82K`, `DELETE …` | partial | Only ~5 verbs for ~30 operations. PURL uses GET for projections and POST for operations; PATCH-with-merge-patch would duplicate `update`. Not worth two ways to do one thing. |
| Fragment | `/r/7F82K#handoff` | rejected | Fragments never reach the server. Usable only for client-side view state. |
| Content negotiation | `Accept: application/purl+json` | **accepted for representations** | Same URL serves HTML to people and JSON to machines. Not suitable for selecting operations. |
| Capability URL (secret in URL) | `/r/7F82K?cap=…` | **rejected** | Secrets in URLs leak (constraint 2). W3C TAG's *Good Practices for Capability URLs* lists the leakage paths. PURL rejects requests carrying `token`/`access_token`/`key` query parameters with 400. |
| Signed URL | `…?sig=…&exp=…` | deferred | Useful for *time-boxed read* links. Same leakage concern as capability URLs, bounded by expiry. Not needed for the MVP; recorded as open. |
| POST body | JSON `{expected_version, input}` | **accepted** | Carries arguments and the concurrency precondition. |
| URI templates (RFC 6570) | `/r/{id}/events{?since}` | **accepted for safe projections** | Lets the manifest describe parameterised reads without inventing a schema language. |
| Hypermedia controls | `operations: [{name, method, href, input_schema}]` | **accepted** | The manifest and every representation list operations with method, href, input schema, required rights, effects and whether *this requester* may currently invoke them. |
| JSON representation | `application/purl+json` | **accepted** | Stable envelope with `protocol`, `kind`, `resource`, `links`. |

## Decision

```
GET  /r/{id}                      representation (HTML or JSON by Accept / ?format=)
GET  /r/{id}/manifest             operations + schemas + authority, evaluated for the requester
GET  /r/{id}/{projection}         events, state?at=, diff?from=&to=, lineage, verify, continuity, status
POST /r/{id}/ops/{operation}      invoke; body {expected_version, input}
POST /r                           create
GET  /.well-known/purl            instance manifest (RFC 8615)
```

Every HTML page carries `<link rel="alternate" type="application/purl+json">`
and `<link rel="describedby">` to the manifest, plus the JSON representation
embedded in `<script type="application/purl+json">`, and every response
carries an RFC 8288 `Link` header to the same, so a client that only ever
receives HTML still finds the machine interface without parsing layout.

## Consequence: what "programmable URL" means in PURL

A PURL URL is programmable in the sense that it *addresses* a resource
**and its operations**: `/r/7F82K/ops/handoff` names an operation as
precisely as `/r/7F82K` names the resource. It is **not** programmable in
the sense of "the URL string carries the program": doing so is exactly
what makes URLs dangerous. The brief's `?action=` form is honoured for
safe reads only (`?action=inspect|status|manifest|events` are accepted as
aliases on GET); `?action=<mutation>` on GET returns 405 with a pointer to
the correct POST, so a client that guesses the naive form is taught the
right one.
