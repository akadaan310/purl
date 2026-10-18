# Research handoff — PURL × CGT × GiN

**Researcher / commissioner:** Abed Kadan. **Prepared for:** 7u and an independent engineering/research session. **Date:** 2026-10-18. **Status:** independently reasoned, read-only source investigation + isolated toy experiments. **No GitHub mutation, deployment, or production execution.**

## Decision in one paragraph
Use existing PURL/0.1 as the **discovery, continuity and authority** shell, not as a claimed general-purpose program executor. Add a small typed/effect-checked *mission graph* and pure computation registry in a separate PURL research branch. Borrow CGT's move semantics and composition laws and GiN's value/representation separation and precise failure categories. Do **not** turn SEURL's seven labels into arbitrary capabilities or treat compressed traces as executable scripts. A URL can enable a fresh session to discover a task, but cannot confer hidden credentials, tools, physical resources, or previous conversational state.

## Verified source scope

| Repository | Examined ref | What was read | Status |
|---|---|---|---|
| `akadaan310/purl` | `3df4452a3624b3f5492bf23c2dacc49d8d2b33c7` | README, SPEC, PRINCIPLES, ARCHITECTURE, SECURITY, operation store/registry, projection, grammar compression, selected tests | Public reference implementation, not verified on this local machine |
| `akadaan310/seurl` | `620ff955b87857c3eb7a7700a81b6a4d0217400a` | README, NAI-CI, static-page inventory | Historical prototype; no tested general runtime found |
| `akadaan310/substrateIO` | `7ace119a544fc736f0d4ec1d72cded9dad0a83e3` | PROTOCOL, ONTOLOGY, `substrate/purl.py` | Pure address-computation experiment, distinct from PURL/0.1 |
| `akadaan310/NetGovComEduGovOrgEduGovComNet` | `9fcf2e1da3ce01a4e66eb5be5e2249b1f211878b` | ACSP PROTOCOL, operation registry | Continuity/auth prototype with different contracts from PURL/0.1 |
| `akadaan310/computationalgrammartheory` | `bfe32fc37f7fa61d50da50ecd2aa7fa97c0dd5a1` | DEFINITIONS, FORMAL_MODELS, RESULTS | Working mathematical manuscript; self-checked, not peer-reviewed |
| `akadaan310/grammarinnumbers` | default `2a94f8a6be686078a9dad88863be9aafc5e6379b`, plus prior PR #1 head `5c96ddca7b032ff76ab11d1c8306d2aef4bcf211` | Definitions, arithmetic and CGT concept map; separate THE NUMBER lane source from prior PR inspection | Default still older milestone; edition 1.0 and research lane on unmerged PR at inspection |

Source links are provided in `PURL_CGT_GIN_THEORY_MAP.md` and JSON. Inspected GitHub content, **not independently executed the six repositories' test suites** in this commission. Previous session reported PURL 58 tests and GiN 75; those are *reported*, not newly verified here.

## Three findings that matter most

1. **PURL already does useful work.** The reference source declares per-resource operation discovery, schemas, `expected_version`, grants, event replay and GET-safe reads. This solves part of the continuity problem, but not typed general program execution.
2. **Projection must preserve transitions before it is compilable.** If two states look identical after projection but an operation distinguishes them afterward, no deterministic operator can exist on projected states alone. This is a classical quotient/congruence condition; see `PURL_INDEPENDENT_DISCOVERIES.md` and toy counterexample.
3. **One URL does not carry authority.** The public address supports discovery. Execution depends on an authenticated principal, current rights, tool permissions, worker availability, versions and captured dependencies. A fresh session can reconstruct an external mission specification, not the predecessor's private reasoning or identity.

## Working files

- `PURL_CGT_GIN_THEORY_MAP.md` — source-grounded theory/code crosswalk and claim status.
- `PURL_FORMAL_SEMANTICS.md` — typed terms, effects, transitions, counterexamples, mission schema.
- `PURL_TRANSITION_LANGUAGE.md` — toggle, 007 cycles, time, expressivity, congruence, replay.
- `PURL_GRAMMAR_RECOMMENDATIONS.md` — compiler decisions, SEURL mapping, decision matrix.
- `PURL_EXPERIMENTS.md` — preregistered toy checks E1–E7, results and limitations.
- `PURL_OPEN_CONJECTURES.md` — falsifiable open questions and negative controls.
- `PURL_INDEPENDENT_DISCOVERIES.md` — two key counterexamples, proofs and security boundaries.
- `PURL_NEW_RESEARCH_DIRECTIONS.md` — integration architecture and research priorities.
- `PURL_BOOK_PROPOSALS.md` — at most two scoped publication candidates.
- `PURL_REVIEW_HANDOFF.json` — machine-readable inventory, next tasks, evidence status.
- `PURL_MISSION_EXAMPLE.json` — schematic typed mission, explicitly nonlive and not executable.
- `PURL_NEXT_SESSION_SEED.md` — a ready-to-copy continuation mission.
- `experiments/commission_checks.py`, `experiments/results.json` — isolated Python/stdlib checks; 17/17 pass locally.

## Reproduce isolated results

```sh
python experiments/commission_checks.py --write
python -m unittest discover -s experiments -p 'commission_checks.py' -v
```

The toy code is independent, with deliberately limited domain models. It is neither a PURL SDK test nor a simulation of authorization or HTTP infrastructure.

## Release gate

No merge, deployment or public claim of cross-provider continuity without (1) real server + worker integration; (2) test of typed effects, authority and version conflicts; (3) independent fresh-session experiment; (4) replay inputs captured or documented irrecoverable; (5) external provenance anchor or equivalent trust model; (6) user-controlled confirmation of any external act.
