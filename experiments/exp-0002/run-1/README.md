# exp-0002, run 1 (superseded by run 2, kept unchanged)

`record.json` is the first full run of the pre-registered procedure, exactly
as the runner wrote it (commit b486ac3). Its `raw_data.handoff.file` field
says `experiments/exp-0002/data/handoff.json`; `data/` is ignored by git in
this repository, so that file was not committed with the record. It is now
committed here as `raw/handoff.json`, byte-identical: its SHA-256 equals the
record's `raw_data.handoff.sha256`
(`4cb4f79b18b1de7dc8554cbf03f20538a76667f88ddf6702ef7abe4b17b6733b`).

Run 2 (`../record.json`) was made after two defects in the measuring code —
not in either protocol — were found while writing the report:

1. `observations.update.<mode>.recompute.evaluations` was read after two
   verification passes, so it counted 3 recomputation evaluations plus 7
   verification re-evaluations (10). Recomputation alone performs 3.
2. In-place recomputation re-linked operands that were already linked. Each
   repeated `link` appends a PURL event (exploratory observation E9 in run 2),
   so run 1's in-place writes (9) and final versions (7) include three
   redundant events.

No hypothesis criterion reads either field. The independent agent analysed
run 1's observations (the blind packet was built before the defects were
found). Run 1 and run 2 are compared in `../REPORT.md`.
