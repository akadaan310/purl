## System Reconstruction Report

### What Systems Exist

The HTTP service at 127.0.0.1:8606 hosts a **circle/0 (provisional)** computational research substrate with the following architecture:

**Four Adapter Systems:**
1. **substrate** (http://127.0.0.1:43006) - Pure computational evaluator
   - Resolves value addresses and derivation paths
   - Supports Elementary Cellular Automaton (ECA) rules
   - 21 available operations: state transitions, damage propagation, tracing, orbit analysis
   - All operations are pure (deterministic, no mutations)
   - Execution records include provenance, environment_id, code_hash, timing measurements

2. **ACSP** (http://127.0.0.1:43106) - Agent Continuity & Session Protocol
   - Append-only event recording for session continuity
   - Continuity resource K0Z4ATDBMZ51 exists for EXP-R9-instance-6 (created 2026-10-01T16:36:25Z)
   - Supports observe, propose, and checkpoint operations
   - Carries 4 core invariants: Continuity ≠ identity; Reference ≠ ownership; Awareness ≠ authority; Handoff ≠ merger

3. **purl** (http://127.0.0.1:42573) - Persistent URL resource store
   - Stores scrolls, amendments, programs
   - Supports transformations and closures
   - Currently empty (0 scrolls, 0 programs, 0 checkpoints)

4. **golden_surface** - NOT configured (would provide browser-like automation)

### How Systems Relate

```
HTTP Client → circle/0 (entry point)
             ├→ substrate (value resolution)
             ├→ ACSP (session continuity records)
             ├→ purl (program storage)
             └→ IDE orchestration (discovery, parse, type, plan, build, execute, observe, record)
```

The circle acts as a coordinator that:
- Accepts GET requests (pure, read-only) that show what operations would do
- Accepts POST requests (with ?session=<id>) that perform mutations
- Records all activity through ACSP continuity resources
- Enforces K-01 through K-09 constitutional clauses

### What I Can Do

1. **Resolve Values**: GET /v/{derivation_path} - pure evaluation of computational expressions
2. **View Programs Without Executing**: GET /term/{address} - shows typed terms
3. **Prepare Programs**: GET /seurl/{moves} - prepares SEURL programs
4. **Transform Programs**: POST /programs/transform?source=...&t={transformer}&session={id}
5. **Run IDE Stages**: GET /ide?program={seurl} shows 8 stages: DISCOVER→PARSE→TYPE→PLAN→BUILD→EXECUTE→OBSERVE→RECORD
6. **Record Observations**: POST /acsp/r/{id}/observe?session={id}&origin=harness
7. **Test Conformance**: POST /conformance/runs?session={id}
8. **Test Program Closure**: GET /programs/closure?source=...&depth=n

### Current State

**Research Hypotheses:** 15 tracked (6 UNRESOLVED, 4 EXPERIMENTALLY_SUPPORTED, 2 SIMULATED, 2 DERIVED, 1 ESTABLISHED)

**Open Work (15 questions):**
- 8 READY: Q-001, Q-002, Q-003, Q-005, Q-007, Q-011, Q-013, Q-015
- 6 BLOCKED: Q-004 (blocks Q-006, Q-008), Q-009 (hardware requirement), Q-012 (no export), Q-014 (localhost only)

**Available Work Examples:**
- Q-001: Replicate Markov-order shift under transition recoding (DISC-001)
- Q-002: Replace 'spread' metric with damage-support width and light-cone speed; rerun EXP-D
- Q-003: Build tiny register machine interpreter (4 registers × 8 bits, ~8-instruction ISA)
- Q-005: Functional graphs on X_n as states; single-edge rewires as transitions
- Q-013: Computational address equivalence classes and fast navigation

**System Status:**
- No experiments created
- No programs or scrolls in storage
- 54 computational nomenclature terms (C-001 through C-054)
- Constitution v1 active with 10 documented clauses
- Substrate has executed successfully (verified via test value /v/map/eca/90/8/state/5/next)

### What I Did

1. Probed the circle entry point and SDK to understand protocol and available endpoints
2. Examined research state, hypotheses, and open questions
3. Reviewed available systems and their states
4. Successfully created an ACSP observation record (O-000001) documenting the system reconstruction
5. Recorded findings on continuity resource K0Z4ATDBMZ51 with observation ID O-000001

**Observation Record Created:**
- ID: O-000001
- Resource: K0Z4ATDBMZ51
- Recorded: 2026-10-01T16:38:20Z
- Finding: System reconstruction complete; documented systems, endpoints, state
- Available at: /observations/O-000001

### What Could Not Be Determined

1. **F-002 and EXP-D references** - Nomenclature contains only C-terms (computational); F-002 metric and EXP-D experiment not yet created or stored
2. **Git commit history** - The /dev/iterations endpoint requires real git commit hashes, but no git service endpoint is discoverable; research state likely maintained in external git repo
3. **Golden-surface capabilities** - System requires browser automation infrastructure not available in current environment
4. **Hardware access** - Q-009 (real hardware SEU experiments) blocked by lack of physical hardware access
5. **Scroll/Program source code** - No existing programs to inspect for patterns and best practices

### Recommended Next Steps

1. Select one of the 8 ready questions (Q-001 or Q-013 are high-impact) and construct computational programs to work on them
2. Create new programs using /seurl/START/... paths with appropriate transformations
3. Measure empirical outcomes and record observations using the ACSP continuity resource
4. Document findings in the nomenclature if new terms are needed
5. Create amendment proposals if the constitution needs updates

**Continuity is preserved:** All work is recorded to continuity resource K0Z4ATDBMZ51 and can be resumed by any subsequent session using this resource ID.
