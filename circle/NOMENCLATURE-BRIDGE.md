# Nomenclature for the bridge

The registry of record is substrateIO `research/registries/nomenclature.json`
(machine-readable, validated by `tools.validate`). This page maps the bridge's
vocabulary onto it. Every term carries name → domain → definition → operation
→ input/output → invariants → validation → evidence → implementation → status.

## Epistemic ledger
* **Established** terms are established elsewhere and only *recorded* here.
* **Provisional / proposed** terms are working names that have not earned a place yet.
* **Rejected / unresolved** terms are listed so they are not reintroduced silently.

| Term | Registry | Status | Domain | Operation / implementation | Validation & evidence | Maps onto (established) |
|---|---|---|---|---|---|---|
| ground term / derivation path | C-037 | provisional | value addressing | `parse()` → Term | `test_purl_terms.py` | term algebra over a many-sorted signature |
| extensional equality of maps | C-040 | ESTABLISHED | relation | `value_id` on map tables | independent hash oracle | extensionality |
| intension vs extension of an address | C-041 | ESTABLISHED | identity | address_id/derivation_id vs value_id | F-010 regression tests | Frege/Carnap; content addressing |
| Scroll | C-042 | PROVISIONAL | artifact | PURL/0.1 resource `scroll`; COMMIT; forks as versions | `circle.test.js`, E2E records, fresh participant B built one | build recipe / derivation. **Name collides** with luna-foundry ("text window") and MUSA ("golden scroll") |
| SEURL path (move word) | C-043 | PROVISIONAL | representation | `seurl.js` FSM | 5 FSM tests, K-14 | word over a finite alphabet run by a finite-state transducer |
| alias candidate | C-044 | ESTABLISHED (as measurement) | measurement | `GET /aliases` | `aliases_only_from_own_builds` (independent oracle) | sequential pattern mining; library learning |
| Constitution-Oriented Programming | C-045 | HYPOTHESIS | method | constitution-v1.json + enforcement.json + conformance.js | CONSTITUTION-CONFORMANCE.md | traceability matrix + policy-as-code + conformance testing. **Name collides** with "Constitutional AI" (unrelated) and spec-driven-development "constitution" files |
| constitutional recursion | C-046 | UNRESOLVED | method | none | none, not tested | reflective towers, bootstrapping |
| prepared / submitted / committed | (ACSP vocabulary) | in use | continuity | ACSP intents; circle `stage` | K-08 | two-phase intent / proposal |
| circle | — | not registered | — | the bridge layer's working name | — | integration layer; deliberately not proposed as a term |

## Lifecycle actually observed for one term (alias)
`next/next/orbit` appeared in two independently committed scrolls →
`/aliases` listed it as `observed_recurrence` (C-044 stage) → **stopped there**.
Moving it to "candidate concept" needs a formal description and a registry
entry. The environment never names anything itself.

## Terms deliberately not introduced
"agent of agents", "universe", "tabular", "ramz", "¬-unit" (from MUSA). They
are not used by any executable part of the bridge, so they have no evidence
here.
