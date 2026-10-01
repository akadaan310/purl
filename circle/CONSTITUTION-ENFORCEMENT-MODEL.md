# Constitution / enforcement / evidence / implementation / authority

Status of each claim is marked. Records: `experiments/axes/record-1.json`
(**invalid run**, kept) and `record-2.json` (valid). Route: `GET /constitution/model`.

## 1. Five things, five identities (DERIVED from how each one changes; checked against history)

| Thing | Identity | Changes when | Who may change it | Observed in history |
|---|---|---|---|---|
| constitution | `constitution_id = H(constitution-v1.json)`, `version` | a clause, source or amendment rule changes | amendment only: a human-authored commit (K-13) | unchanged since STASIS-1 (`sha256:319402d8…`) |
| enforcement | `enforcement_id = H(enforcement.json)` | a check is attached to a clause | any commit (verification is not governance) | changed 4 times in STASIS-2/3 without a constitution change |
| implementation | `implementation_id = H(file hashes of src/circle)` | code changes | git push rights | changes every code commit; now recorded in every conformance run |
| evidence | `evidence_id = H(conformance-run state)` | a conformance run is recorded | anyone who can POST a run | one per run; failed runs kept |
| authority | **none in the bridge** | — | held by ACSP capabilities, PURL grants, Golden Surface seats, git rights | the bridge records the authority an operation needed and whether it was present, but never holds it |

**Why they stay separate (A-001's question, now answered with evidence).** If
checks lived inside the constitution, every new check would change
`constitution_id`. That would be a governance change made for a verification
reason. STASIS-2 and STASIS-3 added 4 + 1 checks while the constitution stayed
byte-identical. That is only possible because the identities are separate. A
candidate `constitution-v2.candidate.json` + `enforcement-v2.candidate.json`
applies A-001 (19 checks moved out, clause ids/texts/sources identical,
verified by script). It is **not adopted**: adoption is a human commit (K-13),
an authority boundary this work does not cross.

## 2. Conformance and authority are independent axes (OBSERVED, `record-2.json`)

The model would be falsified if any quadrant could not be produced by a real
operation. All four were produced:

| | authority granted | authority refused / absent |
|---|---|---|
| **conformant** | TALK = ACSP propose: stage `submitted`, `talk_stage_never_committed` passes | a **valid** prepared ACSP append (validation.valid = true) POSTed without a capability → **401 authentication_required** |
| **non-conformant** | the PURL **owner** rewrites a scroll's program in place → PURL **200**; `scroll_program_immutable` FAILS (`r_G5F23X02CK@v3`); K-12 forbids it | `POST /constitution` → 405 (K-13); a COMMIT carrying `?cap=` → 400 (K-06) |

Consequences:
* *Conformance ≠ authorization.* PURL authorised a transition the bridge
  constitution forbids. ACSP refused a transition that broke no clause. Neither
  system is wrong. They answer different questions.
* This **restates K-18** (MUSA "nothing waits for approval" vs ACSP owner
  resolution) as a point in a two-axis space. Under MUSA's article, *conformance*
  never waits. Under ACSP's model, *authority* over a shared record may wait. The
  two are compatible as axes, which is A-002. They are still an UNRESOLVED
  conflict as constitutions until a human adopts a reading.

## 3. A third axis: evidence currency (OBSERVED, `record-2.json`)

Before the tamper, the check passed. After the owner's in-place rewrite, **the
latest recorded run still said "passed"**: the evidence was stale. A new run
found the change. Conformance is a claim about a tuple (constitution,
enforcement, implementation, **data**) at a time, not a property of the
artifact. Statuses therefore need three coordinates:

`conformance` (TESTED/FAILED/…) × `authority` (granted/refused/not required) ×
`evidence` (current / stale / none). The route `/constitution/model` reports
`stale` for implementation changes. **Data staleness is not detected
automatically** (UNRESOLVED): it needs the run to record a data fingerprint.
Its first ingredient is recorded now (`implementation_id`).

## 4. What went wrong first (kept)

`record-1.json` reported all four quadrants produced, but its
`scroll_program_immutable` failed on *every* scroll ("no-anchor"), including
before the tamper. The check read `state?at=v` one level too shallow (the
response is the whole resource record). The quadrant was "produced" by a
broken check, so record-1's verdict is **invalid**. The fix is in the same
phase. Differential: the old check fails on clean data, the new check passes on
clean data and fails on tampered data (`record-2.json` before/after).
