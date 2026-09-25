# Prior art — what PURL borrows, and what (if anything) is new

The brief asked that established concepts be identified rather than
reinvented, and that any novelty be isolated precisely. This is that
accounting.

## Borrowed, used in the established sense

| PURL element | Established concept |
|--------------|---------------------|
| Resources, GET safety, methods | REST (Fielding 2000); HTTP semantics (RFC 9110) |
| Operations listed in representations | Hypermedia controls: HAL, Siren, JSON:API, Hydra; HATEOAS |
| Operation input schemas | JSON Schema 2020-12; comparable to OpenAPI operation objects |
| `/.well-known/purl` | Well-known URIs (RFC 8615) |
| `Link: rel="describedby"`, `service-desc` | Web Linking (RFC 8288), RFC 8631 |
| `href_template` | URI Templates (RFC 6570) |
| Errors | Problem Details (RFC 9457) |
| `update` | JSON Merge Patch (RFC 7396) |
| Canonical hashing | JSON Canonicalization Scheme (RFC 8785) |
| `expected_version` / `If-Match` | Optimistic concurrency, conditional requests (RFC 9110 §13) |
| `Idempotency-Key` | IETF httpapi draft *The Idempotency-Key HTTP Header Field* |
| Event log, replay, projections | Event sourcing; CQRS |
| Hash-chained log | Merkle/hash chains (git, Certificate Transparency) |
| Rights, grants, attenuation, chains | Object-capability security; macaroons; UCAN; SPKI/SDSI |
| Provenance on events | W3C PROV (Entity/Activity/Agent; wasDerivedFrom) |
| Append-only entries, union merge | Grow-only set CRDT (G-Set) |
| Three-way merge | Version control (diff3) |
| Subscribe | Server-Sent Events (WHATWG HTML) |
| Measures in Layer 2 | Information theory, symbolic dynamics, Markov chains, LZ complexity, surrogate data, grammar compression, burstiness (see docs/research/MEASURES.md) |
| Style dimensions of Communication Profiles | Register (sociolinguistics); stylometry |

## Where PURL may be new — stated narrowly

1. **A composition, not a mechanism.** No single mechanism above is new.
   The candidate contribution is putting *all* of: per-requester evaluated
   operation manifests, single-source authority with recorded delegation
   chains, hash-chained per-resource event logs, and continuity packages
   that separate claims from verified checkpoints, behind **one URL that
   also renders for humans from the same document**. We have not found a
   protocol that combines per-requester availability ("may *I* do this
   *now*, and via which grant?") with delegation provenance on every event.
   This is a claim about a combination and should be checked against
   further literature (e.g. Solid/WAC, Hydra, GNAP, Zanzibar-style
   systems) before being relied on.
2. **An explicit Layer 1 → Layer 2 projection.** Treating a protocol's own
   event log as a dataset for symbolic-dynamics measurement, with the
   projection named in every result, is a *new experimental substrate*,
   not new mathematics.
3. **Epistemic categories as a data-format constraint.** The experiment
   record schema forbids the runner from writing interpretations or
   conclusions (`maxItems: 0`). The idea is standard scientific practice;
   encoding it in a schema is an application.

## Where PURL is explicitly *not* new

- Nothing in Layer 2 is new mathematics. exp-0001's positive results are
  textbook behaviours of textbook measures on sources built to have them.
- "Programmable URL" in the sense of *a URL string that carries a program*
  is not something PURL does — deliberately (ADR 0001).
- Continuity between sessions is context transfer; PURL adds verification
  of the state a handoff refers to, not a new form of continuity.
