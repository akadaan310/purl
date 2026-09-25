# ADR 0002 — Machine discovery: instance manifest + per-requester resource manifest

Status: **accepted**.

## Question
What must a client read to operate a resource it has only a URL for, and
where should that live? Candidates: `/.well-known/purl` only; a
resource-level `/r/{id}/manifest`; OpenAPI; both.

## Decision
Both, with different jobs:

- **`/.well-known/purl`** — static facts about the instance and the
  protocol: endpoints, media types, auth, concurrency, error format, schema
  locations, and the full vocabulary (operations with classification,
  rights, roles, primitives, lifecycle, invariants). Cacheable; identical
  for everyone.
- **`/r/{id}/manifest`** — the same operation descriptors **evaluated for
  this requester on this resource now**: `available`, `via` (which
  authority source), or `reason` (missing right, lifecycle, precondition),
  plus the requester's authority sources and chains.

## Why not OpenAPI alone
OpenAPI describes an API's shape for all callers. It has no standard way
to say "you, specifically, may call this now via grant g_2, and this other
one is unavailable because the resource is archived". That per-requester,
per-state evaluation is what lets an agent act without trial and error, and
it is the part the brief's discovery questions ("what am I allowed to
do?") need. Operation `request_schema`s are JSON Schema, so an OpenAPI
document could be generated from the vocabulary later.

## Justification of fields
Every field answers one of the brief §7 discovery questions (SPEC §1
table). Fields that answered none (e.g. UI hints) were left out.

## Consequences
- The manifest leaks which operations exist to anyone who can *observe*
  the resource. Accepted: discoverability is not authority (SECURITY.md).
- Availability is advisory; the store re-checks on invocation, so a stale
  manifest can only produce a clean `403`/`409`.
