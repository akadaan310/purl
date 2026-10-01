# PURL ↔ ACSP bridge

Code: `src/circle/adapters.js` (`AcspAdapter`), `server.js` (`talk`, `scrollTok`, `acspView`).

## Epistemic ledger
* **Implemented and tested:** both projections below, the prepared/submitted stages, and the authority limits.
* **Observed (local runs):** proposal created, version +1, nothing committed. Condition C's hand-off performed unchanged produced P-001 on `Y29DNZA2593N`.
* **Simulated:** the local ACSP's actors are test code. The live field trial was only read (GET), never written by the circle.
* **Unresolved:** live TALK (deliberately not run); owner resolution (never the circle's).

## 1. PURL artifact → ACSP continuity record

A Scroll (PURL/0.1 resource) and its builds are projected into one ACSP TOK,
carried by a **proposal**:

| Scroll field | TOK field | Lost |
|---|---|---|
| id, version, URL | `refs: [{url}]`, title | the PURL event log (it stays in PURL; the URL points to it) |
| SEURL program, value address, derivation_id | `content`, `refs: [{citation}]` | — |
| last build: per-step value_id and epistemic status | `content` lines | execution ids, environment, code hash (in the substrate store) |
| author session (asserted) | ACSP `actor.session_id` | — |
| — | `type: observation`, `stated_confidence: unclassified` | — |

Stages, reported on every TALK (K-08):

```
prepared   GET /r/{id}?action=prepare_propose   (ACSP: "Opening this document changed nothing")
submitted  POST /r/{id}/operations  operation=propose   → P-n, pending
committed  only if the resource owner resolves P-n as accepted   ← never reachable by the circle
```

The adapter refuses to submit anything but `propose` (`adapter_refuses_non_propose`).
It holds no ACSP capability. When the test acts as the owner to create a resource,
the owner capability in the response is dropped unread.

## 2. ACSP resource/checkpoint → computationally addressable representation

`GET /acsp/r/{id}` (read-only):

```
address        /acsp/r/{id}                              the record's address in the circle
identity.record           {resource_id, version, address_id}   RECORD identity: changes by events
identity.checkpoint_values [{number, version, value_id = ACSP snapshot sha256}]   VALUE identity per checkpoint
identity.view             "this document; ephemeral, not persisted"
authority      "Reading confers nothing. The circle holds no capability for this resource."
moves          events (GET), project (POST → SubstrateIO observation), source (ACSP)
```

The distinctions the directive asks to preserve, as kept here:
*value* (checkpoint snapshot hash) ≠ *record* (resource@version) ≠ *execution*
(substrate records) ≠ *environment* (environment_id) ≠ *session* (declared actor)
≠ *view* (the response document).

## 3. Evidence
* `test/circle.test.js` "SEURL -> PURL -> ACSP …": version +1, proposal pending with `identity_assurance: asserted`, 0 TOKs.
* Conformance K-04, K-08: TESTED (`CONSTITUTION-CONFORMANCE.md`).
* `experiments/fresh-agent/report-C.md`: a browser-only participant built a valid intent from the prepare URL alone.
