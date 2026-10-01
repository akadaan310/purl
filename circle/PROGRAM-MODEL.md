# Program model: SEURL program ↔ circle Scroll record

Experiment: `experiments/program-model/` (SPEC pre-registered in 716edfa; ten
records, all kept). Script: `scripts/program-model.js`. Labels per
BRIDGE-NOMENCLATURE.md §0.

## 1. The model (DERIVED; each arrow tested)

```
            σ = COMMIT (RECORD)                   τ = TALK (PUBLISH)
 program ───────────────────────▶ record ───────────────────────▶ ACSP TOK (pending proposal)
    ▲   ◀───────────────────────    │  ◀── by reference only (scroll URL in the TOK)
    │        π = state.seurl        │
    │                               ▼ derived_from {source text, transformer@version, params, build_id}
 transformer t (BUILD) ◀───────── lineage
```

* **program**: a SEURL move word with the mutating verbs removed. Identity `content_id = H(text)`.
* **record**: a circle Scroll (`scroll@circle`). Identity `id@version` (PURL); it holds the program plus provenance (`author`, `parent`, `derived_from`) and appended builds and talks.

## 2. Results (records 9 and 10 final; 7 and 8 agree)

| | prediction | result | label |
|---|---|---|---|
| M1 | π∘σ = id | holds on **all 147 programs σ accepts** (loss 0, n=147). σ refused 108 of 255: 12 not in WRITING (a word of PERTURBs only stays BOUND; COMMIT is illegal there), 96 ill-typed (after `orbit` the value is an orbit, and `next`/`flip` are not defined on it). The prediction as written ("for every program of the declared space") **over-claimed σ's domain** | OBSERVED; domain DERIVED from FSM + typing |
| M2 | σ not a function | holds: the same program committed twice gives distinct ids and one `content_id` (3/3 pairs; the sampler yields 3, not the 5 it was written for) | OBSERVED |
| M3 | the verb label survives σ | holds: 42 groups (126 records) with the same address; within each, the same `derivation_id` and distinct `content_id` | OBSERVED |
| M4 | lineage is reconstructible from records | holds on 8/8 committed transformations: source text + transformer@version + params recompute the record's program and `build_id`. 4 were refused as ill-typed and nothing was committed | OBSERVED |
| M5 | τ keeps the program and loses the record | holds 4/4: the program is recoverable from the TOK's `SEURL:` line, and author and parent are absent. They are recoverable only by following the scroll URL the TOK carries | OBSERVED |

**σ's domain** = programs that are FSM-legal in WRITING and well-typed by the
substrate. σ is partial, π is total on records, and π∘σ = id on dom(σ). This is
the program/record relationship stated exactly.

**Minimal loss boundary.** Programs lose nothing through σ, π or τ: loss 0 at
`PM-σπ`; at `PM-τ` the program is recovered every time. What is lost is
always the **record's own fields** (id, author, parent, version), and only
when the reference (scroll URL) is not followed. So the minimal boundary that
loses information is *record → anything that is not the record*. That loss is
exactly the provenance and clock of the system that owns the record (C-050).
This agrees with TRANSITION-MODEL.md §4 ("every lossless crossing is lossless
by reference") and supports its open hypothesis on three more boundaries
(INFERRED; τ measured on n=4 only).

The verb label is the clearest case. The **value address** loses the
difference between `PERTURB/b` and `WRITE/flip/b` (TRANSITION-MODEL B1). The
**record** keeps it (M3). So a perturbation must be identified from the record
or the program, never from the address.

## 3. What the experiment found in the bridge (each: failure → diagnosis → fix → differential → new result)

| # | failure | diagnosis | fix | differential |
|---|---|---|---|---|
| PM-F1 | record-1: COMMITs refused as `502 purl_refused` | PURL's write limit (429) mapped to a gateway error; `retry_after` lost (K-10) | `purlFailure`: 429 → `429 purl_limited` + `retry_after_seconds`; `purlList` no longer substitutes `[]` on error | `test/purl-limit.test.js`: old 502, new 429 |
| PM-F2 | record-3: a TALK reported `prepared`, no proposal | ACSP refused the submit (record-4: 422, 100 pending); the circle labelled an attempted, refused submission `prepared` (K-08) | stage `refused` with `refusal {status, code, message}` | `talk-refused.test.js` #1: old `prepared`, new `refused` |
| PM-F3 | record-4: 100 pending proposals in one run | a multi-step POST failed part-way and the error did not say what had happened, so resending it repeated COMMIT and TALK | the error lists `performed_steps`, `step_effects` (e.g. the ACSP proposal) and a `retry_note` | `talk-refused.test.js` #2: old bare error, new partial report |
| PM-F4 (post-hoc) | TOK cites v3; the scroll is at v6 after TALK | the TOK cited the COMMIT version, which holds no build | cite the current version (holds the build) | `talk-refused.test.js` #3: old cites v1 (no build), new cites the build version |

Also kept, in the experiment's own code: the retry loop that caused PM-F3's
duplicates was the experiment's error (it resent non-idempotent POSTs). It now
resends only when the error says nothing was performed. A first reading of
PM-F4's test looked at the wrong field and "refuted" the defect. It was re-run
on the right field and the defect confirmed. Both are in the git history.

## 4. Open
* τ measured on n=4 programs only. The provenance loss is shown by presence flags, not by entropy (the 4 records are all distinct, so the plug-in loss is 0).
* The live ACSP was not used (authority boundary): limits there (anon 60/h, pending 100) are read from the code, not observed.
* Whether σ should accept BOUND programs (commit a bare binding) is a design question for the SEURL specification owner (MUSA url-machine.md), not decided here.
