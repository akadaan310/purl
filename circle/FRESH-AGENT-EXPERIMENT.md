# EXP-CIRCLE-FRESH — fresh participants entering through one URL

Pre-registration: [experiments/fresh-agent/SPEC.md](experiments/fresh-agent/SPEC.md), committed (`c14f827`)
before any run. Verbatim reports: `experiments/fresh-agent/report-{A,B,C}.md`.
Apparatus: circle at `purl` commit `09d13b6`, substrate `b94e3c0`, ACSP `29b4911`
(local, in-memory), continuity resource `Y29DNZA2593N`, created by the operator as
owner. No participant was rescued or messaged during its run.

## Epistemic ledger
* **Observed (this repository's runs):** what each participant did, read from its report and checked against server state. Each check is quoted below.
* **Simulated:** everything the participants computed (model executions in the substrate).
* **Hypothesized and tested:** H-FRESH and H-BROWSER, with outcomes below.
* **Not established:** that this generalizes. The participants share the builder's model family and container (see Limits).

## Results

### Condition A — the URL and nothing else
The participant acted (24 s, 4 tool uses). It stayed read-only, and it read the
entry document and 12 linked pages. **It also used non-HTTP means**: it reported
the server's PID, start command, environment variables and log path, which come
from the process table and file system, not from the URL. That is the
contamination the SPEC anticipated for condition A. It did not construct
anything, and said so: "The request was only the URL, so I just checked what is
there." Exploratory, with no threshold. **Finding:** a bare URL is read as a
request to *inspect*, not to *program*. The halt page's "What's next?" stance
did not, by itself, produce action.

### Condition B — URL + one line (H-FRESH)

| | Discoverable | Score | Evidence |
|---|---|---|---|
| D1 | environment entered | 1 | "JSON-only HTTP service called circle/0 (provisional)" |
| D2 | what it is (systems) | 1 | names substrate, PURL, ACSP (proposals only), golden-surface (not configured) |
| D3 | operations | 1 | "21 pure operations" |
| D4 | programs/Scrolls | 1 | listed and created scrolls; server shows `r_G2TE3WEDSM` |
| D5 | language constructs | 1 | the seven verbs |
| D6 | capabilities/authority | 1 | session "asserted, not verified"; "circle holds no authority" at ACSP |
| D7 | constitution | 1 | 19 clauses; ran conformance `r_FFC1WSB4ZD` |
| D8 | how to construct | 1 | parametric SEURL program |
| D9 | how to test | 1 | its own GET test suite + conformance run |
| D10 | how to persist | 1 | COMMIT/BUILD; server: scroll v3, builds X-000001..6 |
| D11 | reusable artifacts | 1 | parameterised template + fork with `&parent=` (server: `r_3J5FGAVE28`) |
| D12 | prepared vs performed | 1 | "a GET only prepares, and a POST performs" |
| D13 | ACSP continuity target | 1 | names ACSP and the continuity resource `Y29DNZA2593N` (did not TALK) |
| D14 | checkpoint/resume | 0 | "I did not create checkpoints"; resume not mentioned |

**13/14, BUILT scroll authored by its session, GET sweep after the session:
80 URLs, state hash unchanged (`18f9a601a18990c3` before and after).
H-FRESH is not falsified.**

### Condition C — browser-only (H-BROWSER)
The participant handed off (i) a SEURL program URL, whose GET returned
`prepared … would_reach BUILT`, and (ii) an ACSP prepare URL whose intent
reported `validation.valid = true`. It also warned that running both its routes
would create two proposals. The operator then performed the hand-off
**unchanged**:

* program POST → `COMMIT committed, BUILD BUILT`. Final value_id
  `sha256:762d4aca…`, **identical to the value_id the participant predicted from
  GETs alone**.
* ACSP request from the prepare URL POSTed as-is → proposal `P-001`, resource
  version 1 → 2, pending the owner.

**H-BROWSER is not falsified.**

## Defects the participants found (all verified on the server, then fixed)

Condition B found four defects that the conformance suite had passed:

| # | Defect (reported by B) | Verified | Root cause | Fix | New check |
|---|---|---|---|---|---|
| F-C1 | A fork lists its parent's builds, so `/aliases` claimed rule 30 and rule 90 damage have one value (false) | yes: fork `builds` = 2× parent + 1 own; false equivalence listed | PURL `fork` copies collection entries (by design); the circle read them as the fork's own | builds, talks and observations are attributed by their `scroll` field; equivalences use only a scroll's own last build | `fork_does_not_inherit_records`, `aliases_only_from_own_builds` |
| F-C2 | A fork's replay/verify link is 404 for anyone but the circle | yes: original 200, fork 404 without a token | PURL forks do not copy grants (by design); the circle never re-granted public read | grant `reader` to the public on every fork | `scrolls_publicly_readable` |
| F-C3 | Conformance skipped the two ACSP checks although a continuity resource was configured | yes: `acsp_resource: null` in run `r_FFC1WSB4ZD` | the runner looked only at a test-only setting | default to the configured continuity resource | (K-01/K-08 move from IMPLEMENTED back to TESTED when ACSP is configured) |
| F-C4 | Values not reachable directly on the circle; version numbers unexplained | `/v/<addr>` existed but was not advertised | documentation in the entry | entry grammar lists `/v/` and `/term/`; scrolls state version semantics | `every_document_has_moves` unchanged |

The suite's `scroll_log_verifies` passed through F-C2 because it replayed with
the owner's token. *An implementation-defined oracle missed what an outside
participant saw.* The new `scrolls_publicly_readable` check reads without
credentials, as an outsider does.

## Limits
* Same model family and same container as the builder: fresh in context, not
  in provenance.
* B and C both used a session id of the form `claude-code.…01Uz5ZPiLdL5sJvByznMa2YR`.
  That id is not served by the circle, so they took it from their own
  environment. Neither says how.
* No cross-provider participant (directive §28). This remains the strongest
  test not yet run. The way to run it is a human opening the entry URL in
  another provider's browser session and pasting back the report.
