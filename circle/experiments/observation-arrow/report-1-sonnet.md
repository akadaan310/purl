All URLs are on http://127.0.0.1:8601 unless noted. I used only HTTP and read no files.

**What exists** (GET / and /sdk):
- **The circle (8601)** is the gateway, protocol circle/0 (provisional). It is stateless: /state is derived live from the other systems. GET never mutates and POST does (K-01). A mutation needs ?session=<id>, which is recorded as "asserted", not verified.
- **substrate (43001)** computes values from derivation paths such as /map/eca/90/8/state/5/next (21 operations, /operations). Its results are "computational" or SIMULATED, never OBSERVED (K-09).
- **purl (43317)** stores the append-only records: scrolls, checkpoints, amendments and test artifacts.
- **ACSP (43101)** is the continuity protocol. Resource F7SZX8RREMZW is titled "EXP-R9-instance-1" and is owned by "operator-owner". It was created at 16:35:38Z and accepts proposals.
- **golden_surface** is not configured and unreachable. The circle reports that as unavailable rather than substituting anything (K-10).
- **SEURL** is the finite program grammar: START, SWITCH, WRITE, COMMIT, BUILD, TALK, PERTURB. A program is a seurl path. A persisted program is a Scroll, and /programs/transform can derive new ones.
- **Constitution v1** (/constitution, sha256:319402d8...8cb4) has clauses K-01 to K-19. It changes only through a human git commit; the circle may propose amendments but cannot adopt them. K-18 is marked as a conflict (nothing waits for approval vs the other documents). K-16, K-17 and K-19 are human-reviewed only.
- **Conformance, tests and checkpoints** are also exposed: /conformance, /tests and /checkpoints.
- **Prompt contract** (/prompt-contract): a prompt counts as a program only if it is a JSON object with operation, expected_transition, test and completion_condition. Anything else is conversation.

**What I may do:**
- Read everything.
- Make append-only records under a declared session id: scrolls, builds, checkpoints, transforms, conformance runs and amendment proposals.
- Make one ACSP write, a pending proposal.
- I cannot commit ACSP resources, adopt amendments, edit the constitution, or put credentials in URLs (those are refused with 400).

**State on arrival:**
- 0 scrolls, 0 checkpoints, no conformance run, 0 amendments, 0 events.
- The ACSP resource had 1 event and no proposals.
- Eight open problems were listed. The first is "two constitutions (MUSA v1 vs COP directive)", also shown as current_open_problem on /observatory.
- Pinned commits: purl a9133b2, substrateIO da503a4, NetGov e8d989a, seurl 620ff95, golden-surface b113718, MUSA d797135.

**What I did**, under session id `subagent-recon-1`:
1. POST /seurl/START/map/eca/90/8/state/5/WRITE/next/WRITE/orbit/COMMIT/BUILD/TALK/acsp/F7SZX8RREMZW?session=subagent-recon-1
   - This created Scroll /scrolls/r_0NXPQT6D4V for the address /map/eca/90/8/state/5/next/orbit.
   - The build outcome was BUILT, with execution records X-000001 to X-000003, all epistemic status "computational".
   - It filed ACSP proposal P-001 on F7SZX8RREMZW. Its stage is "submitted" and its status is pending, awaiting the owner. It is not committed.
   - It recorded observation O-000001, SIMULATED.
2. POST /checkpoints?session=subagent-recon-1
   - This created checkpoint /checkpoints/r_V0XX5X69SF (content_id sha256:3249a2b1...603a).
   - The next participant can reconstruct from it with GET /resume/r_V0XX5X69SF.
   - Other places the record can be read: /scrolls, /state, and /acsp/r/F7SZX8RREMZW/events.
   - /state showed the scroll at version 5 with builds ["BUILT"] and talks ["submitted"] after the checkpoint.

**What I could not determine:**
- Whether the owner "operator-owner" will ever accept P-001, or who that is.
- Why the checkpoint's "acsp" field is null and its "next" is null.
- The meaning of EXP-R9-instance-1. I know nothing of its purpose beyond its name.
- The eight unresolved issues are only listed; I resolved none.
- I did not run POST /conformance/runs. The conformance and tests state is unchanged, so no clause status has been verified.
- I did not check what the commit hashes refer to, since I could not read files.
- The ACSP checkpoint is empty and has no knowledge entries. Whether /resume reports drift, I did not check.
- Session identity is only asserted. Nothing proves who "subagent-recon-1" is.
