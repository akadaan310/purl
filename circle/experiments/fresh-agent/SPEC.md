# EXP-CIRCLE-FRESH — pre-registration (written before any run)

## Question
Can an AI session with no conversation context discover and use the circle from
its entry URL, without a long natural-language prompt?

## Participants and their limits (stated up front)
Participants are subagents spawned from the session that built the circle. They
share its model family and tool set, but **none of its conversation**. That makes
them fresh in context, not fresh in provenance. This is the weakest form of the
experiment. A cross-provider participant (e.g. a ChatGPT or Gemini session
opening the URL through its own browser) would be stronger, and was **not** run
here (directive §28: no automated third-party sessions).

The participants run in the same container as the repositories. Reading the
repository files instead of using the URL would contaminate the result.
Condition B forbids it; condition A cannot (forbidding it would be explanatory
prose). Each participant must report every non-HTTP action, and the server side
is checked independently.

## Conditions
* **A (URL only):** the prompt is the URL and nothing else.
* **B (URL + one line):** the URL, plus: "Use only HTTP requests to this URL
  and the URLs it gives you. Find out what this is, build and test something
  reusable in it, persist it, and report exactly what you did, including every
  failure."
* **C (browser-only):** the URL, plus: "You can only open URLs (HTTP GET, no
  other methods). Prepare a program in this environment and an ACSP operation
  for it, and hand them to the human who can execute them. Report the exact
  URLs."

No participant is rescued mid-run. Each participant's report is recorded verbatim.

## Measures (14 discoverables, from directive §24)
D1 what environment it entered · D2 what it is (systems) · D3 operations exist ·
D4 programs/Scrolls exist (or that none do) · D5 language constructs (the verbs) ·
D6 its capabilities/authority (none held; session is asserted) · D7 the
governing constitution · D8 how to construct · D9 how to test · D10 how to
persist · D11 how to create reusable artifacts · D12 prepared vs performed
(GET/POST) · D13 ACSP continuity target · D14 checkpoint/resume.

Each D is scored 1 only if the report states it correctly **and** (where it
implies an action) the server state shows it: scrolls whose author is the
participant's session, builds, talks, checkpoints. Scoring is by the operator
from the report and the server state, with the evidence quoted for each score.

## Hypothesis and falsification
H-FRESH: in condition B the participant discovers ≥ 10/14 and produces a BUILT
scroll that it authored, with no write outside the circle's POST surface.
**Falsified** if, in condition B, it scores < 7/14, or produces no BUILT scroll,
or any GET it made changed state (the conformance check `get_sweep_changes_nothing`
is rerun after the session).

Condition A has no threshold. It is exploratory: does the participant act at
all from a bare URL?

H-BROWSER (condition C): the participant hands off (i) a SEURL program URL that
validates (GET 200, state WRITING or later), and (ii) an ACSP prepare URL whose
intent has `validation.valid = true`. **Falsified** if either is missing or
invalid. The operator then performs the handed-off POST unchanged and records
the result.
