# PURL/0.1 — Specification

Status: **draft, reference-implemented**. The key words MUST, MUST NOT,
SHOULD and MAY are used as in RFC 2119. Where this document and the JSON
Schemas in [`schemas/`](schemas/) disagree, the schemas win and this
document has a bug.

## 1. Scope

PURL specifies how a URL identifies a **stateful resource** such that a
client with no prior knowledge can discover, from the resource itself:

| Question | Answered by |
|----------|-------------|
| What is this? | `kind`, `type`, `protocol` fields of every document |
| What protocol does it implement? | `protocol: "PURL/0.1"`; `/.well-known/purl` |
| What operations are available? | resource manifest `operations[]` |
| What arguments do they take? | `operations[].request_schema` (JSON Schema) and `example` |
| What authority is required? | `operations[].requires` |
| Am I allowed? | `operations[].available`, `via`, `reason` (evaluated for the requester) |
| What will change? | `operations[].effects`, `composed_of` |
| What is its current state? | resource representation |
| What happened? | event log (`/events`), hash-chained |
| What is its lineage? | `/lineage`, `derived_from`, `relations` |
| What was delegated to me? | `you.sources[]`, continuity view |

It has three separable layers: **Transport** (§3–4), **Continuity**
(§5–9) and **Research** (§10). A conforming *server* implements §3–9. §10
describes the research substrate shipped with the reference implementation;
it is not required for protocol conformance.

## 2. Terminology

See [NOMENCLATURE.md](NOMENCLATURE.md). Key terms: *resource*, *principal*,
*right*, *grant*, *authority source*, *delegation chain*, *event*,
*primitive*, *operation*, *invocation*, *projection*, *checkpoint*,
*continuity package*, *communication profile*.

## 3. Transport

### 3.1 URLs

```
/.well-known/purl                 instance manifest          GET
/principals                       register a principal       POST
/principals/me | /principals/{p}  principal info             GET
/r                                search | create            GET | POST
/r/{id}                           resource representation    GET
/r/{id}/manifest                  resource manifest          GET
/r/{id}/{projection}              status, events, state, diff, lineage, verify, continuity, transitions   GET
/r/{id}/ops/{operation}           invoke an operation        POST
/schemas/{name}                   JSON Schemas               GET
```

The choice of path operations over query parameters, capability URLs and
signed URLs is argued in [ADR 0001](docs/decisions/0001-url-form.md).

### 3.2 Safety

- `GET` and `HEAD` MUST NOT change resource state.
- A server MUST reject `GET /r/{id}?action=<mutating operation>` and
  `GET /r/{id}/ops/{operation}` with `405`, an `Allow: POST` header, and
  the operation's descriptor in the problem body.
- Safe `?action=` aliases (`inspect`, `retrieve`, `status`, `manifest`,
  `events`, `history`, `synchronize`, `lineage`, `verify`, `continuity`)
  MAY be answered with `303` to the canonical projection URL. Redirect
  targets MUST be server-constructed same-origin paths.

### 3.3 Representations and discovery

- Every document MUST carry `protocol` and `kind`.
- A resource URL MUST serve `application/purl+json` (also accepted as
  `application/json`) and SHOULD serve `text/html`. Selection is by
  `Accept` (q-values honoured); `?format=json|html` MAY override. When
  `Accept` is absent or `*/*`, JSON is served.
- HTML representations MUST embed the JSON representation in
  `<script type="application/purl+json" id="purl-document">`, and MUST
  include `<link rel="describedby" type="application/purl+json">` to the
  manifest and `<link rel="alternate" type="application/purl+json">`.
- Responses SHOULD carry an RFC 8288 `Link` header with
  `rel="service-desc"` (instance manifest) and, for resources,
  `rel="describedby"` (resource manifest).
- The HTML representation MUST NOT offer an affordance absent from the
  manifest. (The reference console builds its forms from the manifest.)

### 3.4 Manifests

- **Instance manifest** (`/.well-known/purl`, RFC 8615):
  [`schemas/instance-manifest.schema.json`](schemas/instance-manifest.schema.json).
  Contains endpoints, media types, authentication, concurrency,
  idempotency, error format, schema locations and the full `vocabulary`
  (layers, invariants, rights, roles, primitives, lifecycle, operations).
- **Resource manifest** (`/r/{id}/manifest`):
  [`schemas/resource-manifest.schema.json`](schemas/resource-manifest.schema.json).
  Contains the requester's authority sources and every operation
  **evaluated for the requester**: `available`, and `via`/`grant` or
  `reason`.

Each operation descriptor gives: `name`, `category`, `classification`
(primitive / composition / alias / projection), `alias_of`,
`composed_of`, `safe`, `idempotent`, `description`, `effects`,
`requires {rights, owner_only, conditional_rights, precondition,
authentication}`, `lifecycle` (statuses in which it is permitted),
`method`, `href` or `href_template` (RFC 6570), `request_schema`,
`example`.

### 3.5 Authentication

- Principals obtain a bearer token from `POST /principals`.
- Tokens MUST be sent in `Authorization: Bearer <token>`. A server MUST
  reject requests carrying credentials in query parameters (`token`,
  `access_token`, `key`, …) with `400 token-in-url`.
- A token identifies a principal *on this instance*. It asserts nothing
  about the person, agent or model behind it.

### 3.6 Errors

Errors are RFC 9457 problem details (`application/problem+json`) with
`type: "urn:purl:problem:<code>"`. Codes: `bad-request`, `invalid-input`
(422, with `errors[]`), `unauthenticated` (401), `forbidden` (403, with
`missing[]`), `not-found` (404), `unknown-operation` (404),
`version-conflict` (409, with `current_version`), `lifecycle-conflict`
(409), `merge-conflict` (409, with `conflicts[]`), `invariant-violation`
(422), `limit-exceeded` (429), `unsupported-media-type` (415),
`not-acceptable` (406), `method-not-allowed` (405), `token-in-url` (400).

A requester without `observe` on a resource MUST receive `404`, not `403`,
so existence is not disclosed.

## 4. Invocation

```
POST /r/{id}/ops/{operation}
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <optional>

{"expected_version": <int>, "input": {…}}
```

1. Unknown operation names → `404 unknown-operation`. Operation names are
   looked up in a fixed registry; they are never evaluated.
2. `input` MUST validate against the operation's input schema → else 422.
3. `expected_version` MUST equal the current version → else 409 with
   `current_version`. `If-Match: "<version>"` MAY substitute when the body
   omits it.
4. The operation MUST be permitted in the current lifecycle status → else
   409 `lifecycle-conflict`.
5. The operation is compiled to primitive events (§6).
6. **Authorisation:** a single authority source (§7) MUST cover the union
   of the rights of all planned primitives and MUST permit the operation
   name. Rights from different sources MUST NOT be combined.
7. All events of one invocation are applied **atomically**; a failure in
   any aborts all.
8. The response is an `operation-result` document: `operation`,
   `invocation`, `resource {id, version, href}`, `events[] {version, kind,
   hash, authority}`, `result`. Creation of a new resource (e.g. `fork`)
   returns `201` with `Location`.
9. With `Idempotency-Key`, a repeated identical request returns the
   original result with `idempotent_replay: true`; a different request
   under the same key is `400`.

## 5. Resource model

The canonical resource state
([`schemas/resource.schema.json`](schemas/resource.schema.json)):

| Field | Meaning |
|-------|---------|
| `protocol`, `id`, `type` | identity; `type` is application-defined |
| `version` | number of events applied; ETag |
| `created_at`, `created_by`, `updated_at` | timestamps and creator |
| `owner` | exactly one principal; changes only by `transfer` |
| `assignee` | who is responsible for continuing; independent of owner |
| `lifecycle {status, previous}` | active · closed · completed · cancelled · archived |
| `state` | free-form JSON object; mutated only by JSON Merge Patch |
| `collections` | named append-only lists of immutable entries |
| `grants` | authority records (§7), never deleted |
| `relations` | typed links to other resources (`references`, `supersedes`, `merged_from`, `parent`) |
| `derived_from` | `{resource, version, state_hash}` if created by fork |

Entries: `{id, author, at, version, body, supersedes, about, origin}`.
Entries are immutable. `superseded_by` and `current` are computed views.

The **representation** served over HTTP adds `resource {id, type,
version, head}`, `you {principal, rights, sources, is_owner,
is_assignee}`, `operations[]` (short form), `links`, `notice`, and
`redacted[]` — the list of fields withheld because the requester lacks
`read`. A server MUST list redacted fields explicitly.

## 6. Events and primitives

An event ([`schemas/event.schema.json`](schemas/event.schema.json))
records one primitive transition:

```
{ protocol, id, resource, version, kind, op, invocation, actor,
  authority {via, grant, chain[], rights[]}, at, payload,
  prev, state_before, state_after, hash }
```

- `hash = sha256(canonical JSON of the event without hash)`; canonical
  JSON is RFC 8785-compatible for PURL's value space.
- `prev` is the previous event's hash (null for genesis) — a per-resource
  hash chain.
- `state_before`/`state_after` are hashes of the canonical resource state.
- The resource state at version *n* MUST equal the left fold of the
  reducer over events 1…n. Servers MUST be able to serve `state?at=n`
  and `verify`.

The nine primitives and the operation algebra (compositions, aliases,
projections, lifecycle machine) are specified in
[docs/operations.md](docs/operations.md).

## 7. Authority

Specified in [docs/authority.md](docs/authority.md). Normative summary:

- Rights: `observe`, `read`, `append`, `update`, `assign`, `link`,
  `lifecycle`, `grant`. Ownership transfer is owner-only and not a right.
- Authority sources: `owner`; `grant` (with `chain` to the root);
  `public` (grantee `*`, max `observe`,`read`); `admin` (instance-scoped:
  `observe`, `archive`, `restore`, `revoke`; never content).
- Delegation MUST attenuate: rights ⊆ delegator's; operation allow-list
  ⊆ delegator's; expiry ≤ delegator's. The new grant's `parent` MUST be
  the delegator's grant.
- A grant is effective iff it and all ancestors are unrevoked and
  unexpired. Revocation MUST NOT modify descendant grant records.
- `revoke` MUST be available in every lifecycle status.
- Every event MUST record the single authority source that authorised its
  invocation, including the full chain.

## 8. Continuity

Specified in [docs/continuity.md](docs/continuity.md). Normative summary:

- A checkpoint entry MUST store the preparer's `package` separately from
  the server-verified `checkpoint {resource, version, state_hash}`,
  `prepared_by` and `for`.
- `handoff` = `append(checkpoints)` + optional `grant` + `assign`,
  atomically. It MUST NOT change `owner`.
- `GET /r/{id}/continuity` returns the latest checkpoint (preferring one
  addressed to the requester), whether its state hash matches the log,
  the package marked as unverified claims, and all changes since.
- A Communication Profile, if included, MUST carry the fixed `scope` and
  `disclaimer` values of
  [`schemas/communication-profile.schema.json`](schemas/communication-profile.schema.json).

## 9. Structure

- `fork` creates a new resource owned by the caller, with
  `derived_from {resource, version, state_hash}`; requires only `read` on
  the source; MUST NOT emit events on the source; MUST NOT copy grants.
- `merge` requires a direct fork relationship; performs a three-way merge
  over `state` (conflicts → 409 with `conflicts[]`, resolved by
  `input.resolutions`), a union by entry id over collections (preserving
  author and `origin`), and records `merged_from`.
- `supersede` appends an entry with `supersedes`; the original MUST
  remain unchanged.
- `link` targets MUST be observable by the caller; the target MUST NOT be
  modified. Inbound links are reported as declarations of the linking
  resource.

## 10. Research substrate (informative)

- **Projection:** a named, documented function from an event list to a
  symbol sequence with times (`kind`, `authority`, `actor_change`).
  `GET /r/{id}/transitions?projection=` serves the projection and its
  order-1 transition graph, labelled `category: transformation`.
- **Experiment record:**
  [`schemas/experiment-record.schema.json`](schemas/experiment-record.schema.json).
  Sections by epistemic category; `interpretation.entries` and
  `conclusions.entries` MUST be empty in runner output; `output_hash`
  covers raw-data hashes, outputs (floats rounded to 10 significant
  digits) and hypothesis outcomes.
- Measures: [docs/research/MEASURES.md](docs/research/MEASURES.md).

## 11. Self-description

The instance MUST expose its vocabulary at `/.well-known/purl`. The
reference implementation also exposes it as an ordinary public PURL
resource, `/r/purl-protocol`, whose event log records protocol changes.
Rationale and limits: [ADR 0004](docs/decisions/0004-self-description.md).

## 12. Security

See [SECURITY.md](SECURITY.md).

## 13. Versioning

`protocol` strings are `PURL/<major>.<minor>`. A client MUST reject
documents with an unknown major version. Additive fields do not change
the minor version; clients MUST ignore unknown fields.
