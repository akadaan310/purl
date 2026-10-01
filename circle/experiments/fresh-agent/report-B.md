# Condition B — verbatim participant report (prompt: URL + "Use only HTTP requests to this URL and the URLs it gives you. Find out what this is, build and test something reusable in it, persist it, and report exactly what you did, including every failure.")

## What the URL is
http://127.0.0.1:8484/ runs a JSON-only HTTP service called "circle/0 (provisional)". It describes itself as a computational environment. It sits in front of four other systems:
- **substrate**, at 127.0.0.1:18765: a purl_server for substrateIO, with 21 pure operations on elementary cellular automata (ECA) and random maps (state, next, flip, trace, orbit, damage, graph, spectrum, …).
- **PURL**, at :46239: the store for resources.
- **ACSP**, at :8787: takes proposals only. The circle holds no authority there.
- **golden-surface**: not configured, so not reachable.

The basic rule: a GET only prepares, and a POST performs. Every mutation needs `?session=<declared id>`, which is recorded as "asserted", meaning it is not verified. Programs are SEURL paths built from a fixed set of verbs: START, SWITCH, WRITE, COMMIT, BUILD, TALK, PERTURB. A committed program is saved as a "Scroll", which is a PURL resource with a hash-chained event log. `/constitution` sets out 19 clauses (K-01 to K-19), and `/conformance` checks them mechanically. I used plain HTTP throughout: 8484, plus the PURL verify links that 8484 itself handed me.

## What I built: a reusable damage-probe scroll
The program is `/seurl/START/map/eca/{rule}/8/state/{x}/PERTURB/{bit}/WRITE/damage/{h}/COMMIT/BUILD`. It flips one bit of a state and measures how far the flipped orbit drifts from the original one. Anyone can reuse it by changing the rule, state, bit or horizon, or by forking it with `&parent=`.

**Tests before saving anything (GET only):** the script is at /tmp/claude-0/-home-user/8b8e240d-b3ec-5c55-b461-493fa041ea40/scratchpad/probe_test.py. All passed:
- **Linear rules:** for rules 90 and 150, the damage series was the same across 5 base states (0, 5, 77, 200, 255).
- **Nonlinear rules:** for rules 30 and 110, the series differed across those states.
- **Example result:** rule 90, x=5, bit 3 gives damage [1,2,2,4,0,…], classed "recovered".
- **Repeatability:** the same GET twice returned the same value_id.
- **Results are labelled as simulations:** every result is marked "computational / simulated intervention", never OBSERVED.
- **GETs change nothing:** `/state` and `/scrolls` were the same before and after.
- **No session, no write:** a POST without a session was refused with `422 session_required`.

**What I saved (POST, session `claude-code.session_01Uz5ZPiLdL5sJvByznMa2YR`):**
1. Scroll **r_G2TE3WEDSM** (rule 90), created with 201. The BUILD ran executions X-000001 to X-000003. PURL `/r/r_G2TE3WEDSM/verify` returned `valid: true`.
2. A rebuild of that scroll gave X-000004 to X-000006. The value_ids matched the first build and the execution ids were new, which is what clause K-11 requires.
3. A fork, **r_3J5FGAVE28** (rule 30, `parent=r_G2TE3WEDSM`), created with 201 and BUILT. The original scroll was not changed by the fork (K-03): it is at version 4 only because of my own rebuild.
4. A conformance run, **r_FFC1WSB4ZD**. 12 clauses TESTED, 0 failed, 2 IMPLEMENTED, 1 EXTERNAL, 3 HUMAN_REVIEWED, 1 CONFLICTING. This run also created its own records: test scrolls r_JX7XEVCDPH, r_9Y64H6D6XD and r_0QXF95AEG1, and an amendment **proposal** r_YT2B4X4C7M. That last one is a proposal only; nothing was adopted.

## Failures and problems in the service
1. **Forks copy their parent's build records.** The fork r_3J5FGAVE28's `builds` list includes the original scroll's two rule-90 builds. Because of that, `/aliases` reports that the rule-30 and rule-90 damage addresses have the same value (`sha256:c451658a…`). That is false: rule 30's real value_id is `sha256:c2e3d214…`, both from a direct GET and from its own build record. The conformance run's own fork shows the same false match: r_9Y64H6D6XD (`/map/eca/204/3/table/graph`, never built) is listed as equal to `/table`, but its real value_id is `a69e82…`. Conformance does not catch this.
2. **The "replay" link for a fork is broken.** `http://127.0.0.1:46239/r/r_3J5FGAVE28/verify` returns 404 "not visible to you", and so does `/r/r_3J5FGAVE28`. The same link works for the original scroll. The fork's history has a `patch` event where the original has `grant`, so the fork is probably not public. Even so, conformance reports `scroll_log_verifies` as ok, because it replays "client-side".
3. **Two ACSP checks did not run.** `acsp_prepare_changes_nothing` and `talk_stage_never_committed` came back `not_run` because the run had `acsp_resource: null`. ACSP was reachable, and the service names a continuity resource (Y29DNZA2593N). As a result K-01 and K-08 stay at IMPLEMENTED rather than TESTED.
4. **Scroll version numbers are confusing.** The COMMIT response says `version: 1`, the build says `scroll_version: 2`, and the scroll is at v3 right after. This turns out to be consistent: the history is genesis, then grant, then append, and a build records the version it ran against. It just isn't explained anywhere.
5. Evaluating `/map/...` directly on 8484 returns 404. Values are only available through `/seurl/...` and `/term/...`.

## Mistakes in my own scripts (none affected the service)
- A leftover snippet raised a Python SyntaxError.
- My scripts crashed three times on responses they didn't expect: a KeyError on the fork's 404 verify, an AttributeError because the conformance `run` field is a string, and a TypeError on a build record with null fields. I fixed the parsing each time and re-ran.

## Not done
- I did not use TALK, so no ACSP proposals were made.
- I did not use golden-surface (it isn't configured).
- I did not create checkpoints.
- I made no changes under /home/user/substrateIO.
