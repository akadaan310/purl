# Projection into SubstrateIO

SubstrateIO stays the instrument. The circle gives it documents. It never gives
it application semantics. Code: substrateIO `substrate/acsp_events.py`
(P-ACSP-EV-1), `substrate/purl_store.py` (`observe`), `tools/purl_server.py`
(`/projections`, `/observations`). Report: substrateIO
`research/reports/instrument-circle-bridge.md`.

## Epistemic ledger
* **Implemented and tested:** P-ACSP-EV-1, plus build records as substrate execution records.
* **Observed:** the live field-trial events (snapshot) project consistently (`test_acsp_events.py`).
* **Simulated:** projections of local-ACSP events (actors = test code) are labelled SIMULATED.
* **Unresolved:** the status of live-service measurements (OP-010, Q-015). They are labelled UNRESOLVED until decided.

## The two projections in use

### P-ACSP-EV-1: ACSP event list → transition sequence

| Declared | Value |
|---|---|
| source | ACSP/0.1 `event_list` (`GET /r/{id}/events?format=json`) |
| transformation | event → (t = version, label = operation, actor = session_id, assurance, request_hash) |
| representation | label sequence in logical time + transition system over labels |
| information lost | payload data and summaries, agent_id and actor kind, capability_id, on_behalf_of, request bodies, wall clock (from hashes) |
| clock | logical: t = event version. Wall: occurred_at, carried, never hashed |
| resolution | one event |
| measurement | label counts, bigrams, session switches, chain consistency |
| status | declared by the caller's origin: `harness` → SIMULATED, `service` → UNRESOLVED |

### Build → execution record (the substrate's own ledger semantics)

| Declared | Value |
|---|---|
| source | each step address of a Scroll |
| transformation | resolution of the address by the substrate (pure), recorded |
| representation | execution record: derivation_id, value_id, environment_id, execution hash, code hash, git |
| information lost | nothing about the value (it is recomputable from the address). The Scroll's authorship lives in PURL, not here |
| clock | logical: execution sequence (X-n). Wall: excluded from verdicts |
| resolution | one address |
| measurement | rerun comparison (`reproduced`, `same_value`, `value_not_comparable`) |
| status | `computational`; perturbation steps `simulated intervention on a computational model` (never OBSERVED: K-09 TESTED) |

## What the substrate is not asked to do
It does not know what a Scroll is, who authored it, or what ACSP decided. The
alias measurement (C-044) runs in the circle over PURL records. The substrate
contributes only value_ids.
