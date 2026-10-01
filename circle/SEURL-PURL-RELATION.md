# SEURL ↔ PURL: the relation, as implemented and tested

## Epistemic ledger
* **Established:** none of this is literature-backed. SEURL is a local design.
* **Implemented:** `src/circle/seurl.js` (pure FSM), compiled by `server.js` to value addresses, PURL resources and ACSP intents.
* **Observed (tests, runs):** `test/circle.test.js` (5 FSM tests + integration), `experiments/e2e/record-*.json`.
* **Hypothesized:** that seven verbs suffice for agents to program the environment (see FRESH-AGENT-EXPERIMENT.md for the evidence gathered so far).
* **Unresolved:** `seurl://` as a scheme (see §4). Whether TALK should reach targets other than ACSP.

## 1. What SEURL is here

A SEURL path *is* the program. The session's whole state is a function of the
path. This follows url-machine.md §5: "Session keeps: its url. Nothing else."

```
/seurl/START/map/eca/90/8/state/5/WRITE/next/PERTURB/0/WRITE/damage/16/COMMIT/BUILD/TALK/acsp/Y29DNZA2593N
       └─ bind ──────────────────┘└ write ──┘└ perturb┘└ write ─────┘└────── prepared mutations ───────────┘
```

| Verb | url-machine.md | Here | Effect class |
|---|---|---|---|
| START addr | IDLE → BOUND | bind to a value address | pure |
| SWITCH addr | BOUND → BOUND | rebind (clears the program) | pure |
| WRITE ops | BOUND → WRITING | append operation segments to the program | pure |
| PERTURB bit | any → any, logged | append `flip/{bit}` (a recorded SIMULATED intervention in the substrate) | pure value; logged in the Scroll as a PERTURB step |
| COMMIT | WRITING → COMMITTED | persist the program as a PURL/0.1 `scroll` resource | **mutation**: GET prepares, POST performs |
| BUILD | COMMITTED → BUILT/FAILED | record an execution of every step in the substrate | **mutation** |
| TALK acsp id | any → any, harness-routed | ACSP `propose` carrying a TOK projected from the Scroll | **mutation**, stops at `submitted` |

## 2. The relation (tested)

```
SEURL path ──parse/FSM──► value address ──/term──► typed term ──GET──► value     (substrate-purl/0, pure)
          └─COMMIT──► PURL/0.1 scroll resource (record) ──BUILD──► substrate execution records
                                                        └─TALK──► ACSP pending proposal ──► substrate observation
```

SEURL is **not** a replacement for PURL. It has no resources, no authority and
no storage. It is a surface syntax that *compiles to* PURL operations:
`compiles_to` in every `/seurl/…` document shows the value address, the Scroll
that COMMIT would create, and the ACSP operations TALK would prepare. SEURL is
**not** ACSP. TALK goes through the ACSP adapter and inherits all of ACSP's
authority rules.

## 3. What testing changed

* **FSM strictness is real.** `START/x/COMMIT` (BOUND → COMMIT) and
  `WRITE/next` (from IDLE) are refused with the legal set. url-machine.md §4
  does not list `WRITING --WRITE--> WRITING`. Allowing it is an
  *interpretation* (needed for programs longer than one write), recorded in
  `seurl.js`.
* **Grammar defect found by test.** Upper-case tokens were taken to be verbs,
  but ACSP resource ids are upper-case Crockford tokens and can spell a word
  (`ABC`). Fixed by fixed arity: TALK always consumes exactly two raw tokens.
  The closed-vocabulary rule (K-14) still holds everywhere else.
* **"Prepared ≠ performed" fits SEURL naturally.** A GET of a path ending in
  COMMIT shows `prepared … would_reach COMMITTED` and changes nothing. The same
  URL with POST performs it. This is ACSP's operation-intent design applied to
  SEURL.

## 4. `seurl://` and `purl://`

seurl's README reserves `seurl://` for URL-programs and says `purl://` "belongs
to Abed's substrate work". Neither scheme is resolvable by any existing
browser: Golden Surface's routing seam refuses non-web schemes by its owner's
spec (observed: 422 "scheme not supported"). The circle therefore serves SEURL
over http at `/seurl/…`. A `seurl://X` URL maps one-to-one to `http(s)://<circle>/seurl/X`.
That mapping is a **proposal**, not implemented in any browser, and is listed
as unresolved.
