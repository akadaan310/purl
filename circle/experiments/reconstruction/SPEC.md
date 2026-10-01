# EXP-BRIDGE-RECON — pre-registration (committed before any run)

## Question
Given only the bridge entry URL, with no conversation and no description of the
architecture, can a computational participant reconstruct the systems, their
responsibilities, their relationships and their current state, and then continue
from that state while leaving a reconstructable record?

It measures **discoverability and reconstructability**. It does not measure truth,
and it does not measure model quality.

## Apparatus
Circle at the purl commit recorded in the run record, started with substrate
and local ACSP spawned from their repositories. The ACSP continuity resource is
created by the operator as owner. Git projections cover the sibling repositories.
The participants receive no files and are told not to read the file system.

## Participants (limits stated up front)
Three subagents of the building session, each with no conversation context,
run on **three different models** of one provider (configured ids: default,
`sonnet`, `haiku`). This is different models but **not independent providers**
(directive §20/§28: no automated third-party sessions). Cross-provider runs
remain Q-014, which needs a human to open the URL.

## Prompt (identical for all, verbatim)
```
http://127.0.0.1:8484/

You have no other context. Use only HTTP requests to this URL and the URLs it
returns; do not read files. Reconstruct what systems exist here, what each is
responsible for, how they relate, what you are allowed to do, and what state
they are in. Then continue the work from the current state in one way of your
choosing that leaves a record the next participant could reconstruct. Report
what you reconstructed, what you did (with the URLs), and what you could not
determine.
```
No participant is rescued or messaged during its run.

## Rubric (14 items; each scored 1 only if stated correctly in the report AND, for actions, visible in server state)
R1 SEURL identified as the move-word program notation (seven verbs) ·
R2 substrate identified as the value/term/execution/observation engine ·
R3 PURL/0.1 identified as the record store (scrolls/checkpoints/runs) ·
R4 ACSP identified as continuity, reachable only by proposal from here ·
R5 Golden Surface identified, and its state stated (not configured / not reachable) ·
R6 SEURL program → value address / typed term relation ·
R7 Scroll = PURL record holding a program (not the value) ·
R8 TALK stops at a pending proposal (prepared/submitted/committed) ·
R9 ACSP events → substrate observation (projection) ·
R10 the constitution exists and conformance is derived from checks ·
R11 history: stases / prior generations ·
R12 continuity: checkpoint and resume ·
R13 GET prepares, POST performs; session is declared, not verified ·
R14 it continued from the current state and left a record (server-side: a record with its session).

Also recorded: misunderstandings (stated claims that the server state contradicts),
what it failed to discover, and every non-HTTP action it reports.

## Hypothesis and falsification
H-RECON: each participant scores ≥ 9/14 and satisfies R14.
**Falsified** for a participant that scores < 9, or that leaves no record. The
experiment as a whole is falsified if fewer than 2 of 3 participants meet H-RECON.
GET-safety is re-checked after all runs (state hash before vs after, over GET-only routes).
