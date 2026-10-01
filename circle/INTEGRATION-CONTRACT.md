# Integration contract

What each system promises the others at its boundary. Machine-readable form:
`bridge-manifest.json`. A boundary not listed here does not exist.

## Epistemic ledger
* **Implemented and tested:** every row marked ✓ (test names in the manifest).
* **Declared only:** rows marked ◇ (no mechanical check).
* **Simulated:** all evidence comes from local processes and test actors.
* **Unresolved:** see §4.

## 1. Directions of dependency

```
circle ──HTTP──► substrate (python)      circle never imports substrate code
circle ──PurlClient──► PURL/0.1          circle never imports continuity/ or transport/  (layer test)
circle ──HTTP──► ACSP/0.1                ACSP is unaware of the circle
Golden Surface ──http URL──► circle      the circle is unaware of Golden Surface except via its adapter
substrate ◄── reads ── ACSP event lists  substrate never calls ACSP; it receives documents
```

No system's protocol was changed to make the bridge work. Added: ACSP
`scripts/serve-local.ts` (same handler); substrate `/term`, `/observations`,
`/projections` endpoints and id fields (additive).

## 2. Promises

| Boundary | Promise | ✓/◇ | Check |
|---|---|---|---|
| substrate `GET /term/<a>` | pure; returns kind, steps, derivation_id; never evaluates | ✓ | `test_purl_terms.py::test_parse_evaluates_nothing` |
| substrate `GET <a>` | pure; deterministic; identity.value_id is the canonical value id, or null if not materialized | ✓ | `test_purl_terms.py`, independent hash oracle |
| substrate `POST <a>` | append-only record; rerun compares; `reproduced` iff same deterministic hash | ✓ | `test_purl.py`, E2E `rerun: reproduced` |
| substrate `POST /observations` | applies a *declared* projection; epistemic status comes from the caller's declared origin, never inferred | ✓ | `test_acsp_events.py` |
| PURL/0.1 | scrolls/checkpoints/runs are resources with hash-chained logs; public `reader`; forks copy entries but not grants | ✓ | `scroll_log_verifies`, `scrolls_publicly_readable` |
| ACSP prepare (`GET ?action=prepare_propose`) | changes nothing; returns `validation` | ✓ | `acsp_prepare_changes_nothing` |
| ACSP propose (`POST /operations`) | exactly one event; proposal `pending`; no TOK created | ✓ | integration test (version +1, 0 TOKs) |
| circle GET | changes nothing anywhere | ✓ | `get_sweep_changes_nothing` (also re-run after the fresh-agent sessions) |
| circle POST | needs a declared session; never a credential; credentials in URLs refused | ✓ | K-02, K-06 checks |
| circle TALK | reaches `submitted` at most | ✓ | `talk_stage_never_committed` |
| circle ↔ unreachable system | `503 unavailable_here`, no substitute | ✓ | `dead_adapter_is_explicit` |
| Golden Surface relay | seat drives only own tabs; any seat may read any tab; non-web schemes refused | ✓ (FakePhone) | `experiments/golden/record-1.json` |
| third-party providers | never automated | ◇ | K-16 human-reviewed |

## 3. Identity across the boundaries (never folded together)

| Identity | Where it is minted | Survives into |
|---|---|---|
| address_id, derivation_id | substrate (term) | Scroll state (`term.derivation_id`), ACSP TOK refs |
| value_id | substrate (value) | build records, aliases, ACSP TOK content |
| environment_id | substrate | build records, checkpoints |
| execution hash / execution_id | substrate (record) | build records |
| scroll id + version | PURL | ACSP TOK refs (URL), checkpoints |
| proposal id, event version | ACSP | Scroll `talks`, observations |
| observation id | substrate | Scroll `observations` |
| checkpoint content_id | circle (hash of state) | PURL resource |
| session id | the participant (declared) | every record, as `asserted` |
| view | none (documents are not persisted) | — |

## 4. Unresolved
* Real Android WebView reading a circle URL (FakePhone only so far).
* `seurl://` scheme resolution in any browser.
* Whether `owner-latency` on ACSP should be relieved by a delegated `append`
  capability (owner's decision; MIGRATION-FROM-RELAY.md §8).
* Live ACSP: the circle has never TALKed to `acsp-one.vercel.app`. Doing so
  creates a real pending proposal on the field-trial resource. Run it only on
  explicit request (`ACSP_BASE=https://acsp-one.vercel.app ACSP_RESOURCE=8N2RXG1MW79S`).
