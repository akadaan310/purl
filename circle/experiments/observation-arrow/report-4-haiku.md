## System Reconstruction Report

### System Architecture

The service at **http://127.0.0.1:8608/** is a **circle/0 (provisional)** computational substrate and research laboratory. It consists of four main adapter systems:

#### 1. **Substrate** (http://127.0.0.1:43008)
- **Role**: Computational environment for deriving values from PURLs (Programmable URLs)
- **Data Model**: Values are addressed by derivation paths (e.g., `/map/eca/110/4/state/3/next`)
- **Execution**: 21 pure operations registered, entirely deterministic
- **Operations Include**: 
  - Root constructors: `space/{n}`, `map/eca/{rule}/{n}`, `map/increment/{n}`, `map/random/{n}/{seed}`, `map/permutation/{n}/{seed}`
  - State operations: `state/{x}`, `next`, `flip/{bit}`, `trace/{steps}`, `orbit`, `damage/{horizon}`
  - Map operations: `table`, `graph`, `cycle/{k}`, `power/{k}`, `rewire/{src}/{dst}`, `project/{observable}`, `spectrum`
  - Trace operations: `transitions`, `at/{t}`

#### 2. **ACSP** (http://127.0.0.1:43108) - Agent Continuity & Session Protocol/0.1
- **Role**: Append-only record storage for continuity resources
- **Primary Resource**: `NAM4WPTZKK8B` (titled "EXP-R9-instance-8", created by session "operator-owner" at 2026-10-01T16:36:44.590Z)
- **Lifecycle**: Active, version 1, with 1 event and 1 checkpoint
- **Authority Model**: The circle holds no ACSP capability and can only submit proposals (not committed changes)
- **Key Invariants**:
  - Continuity does not imply identity
  - Reference does not imply ownership
  - Awareness does not imply authority
  - Handoff does not imply merger

#### 3. **PURL** (http://127.0.0.1:46097) - Programmable URL Protocol/0.1
- **Role**: Stateful resource addressing with full history and lineage
- **Status**: Reachable and configured
- **Manifest**: 37 operations, 9 primitives, 8 rights, 10 invariants

#### 4. **Golden Surface** (Not configured)
- **Role**: Browser automation and interaction relay
- **Status**: Disabled - requires golden-surface relay (aiohttp), seat token (GOLDEN_TOKEN_R), and connected phone/FakePhone
- **Limitation**: Read returns text only; seurl:// and purl:// schemes not supported

### Environment State

**Substrate Environment ID**: `sha256:4f7acc8629fe88becd52674c02c56a662bca0d9161a5078872ffffc5438275dc`
**Adapters Reachable**: substrate (yes), acsp (yes), purl (yes), golden_surface (no)

### Data Flow & Record Transitions

I identified the complete path records take between systems via the `/transitions/coverage` endpoint:

**Transition Matrix** showing information loss at each boundary:

1. **ACSP Events** (1 recorded)
   - Source: `acsp:NAM4WPTZKK8B@0` → Target: `acsp:NAM4WPTZKK8B@1`
   - Operation: `create`
   - Actor: `operator-owner`
   - Clock: Present (ACSP:NAM4WPTZKK8B, position 1)
   - Content ID: `sha256:83ff1d2939d8b1c976f1ca276783879d81179c94bd20c2d25a7179de1848085d`

2. **Git Commits** (3 recorded - purl, substrateIO, NetGovComEduGovOrgEduGovComNet repos)
   - All by actor: "Claude"
   - **Information Lost**: Clock domain position drops to null (Lamport clock not preserved in git)
   - Content captured as git-tree hashes

3. **Golden Actions** (8 recorded, all from seat:r)
   - Health checks, tab creation, URL navigation, reads
   - **Information Lost**: source_ref, target_ref, clock, content_id all absent
   - No recordable state changes captured

### Research Artifacts

**10 Experiments** exist as purl circle:
- `axes`: 2 records
- `dogfood-3`: SPEC.md + 1 record
- `e2e`: 3 records
- `fresh-agent`: SPEC.md + 3 reports (no records)
- `golden`: 1 record
- `observation-arrow`: SPEC.md + cells.json
- `program-closure`: SPEC.md + 4 records (including post-hoc check PH1)
- `program-model`: SPEC.md + 10 records
- `reconstruction`: SPEC.md + 3 reports + 1 get-safety.json
- `transitions`: 1 coverage record

**7 Substrate Experiments** (EXP-A through EXP-G):
- All with SIMULATED epistemic status (model executions, not physical observations)
- Range from one-bit deterministic transitions to cross-layer propagation

### Research Hypotheses & Questions

**15 Hypotheses** tracked with statuses:
- DISPROVEN (H-001, H-002)
- UNRESOLVED (H-003, H-007, H-008)
- DERIVED (H-004, H-011)
- ESTABLISHED (H-006)
- EXPERIMENTALLY_SUPPORTED (H-005, H-012, H-013)
- SIMULATED (H-010, H-014)
- OBSERVED (H-015 - notably: "The research process itself can be represented with the laboratory's transition-graph machinery")

**9 Open Research Questions** (Q-001 through Q-009+):
- Q-001-Q-003, Q-005, Q-007: Ready (no blockers)
- Q-004, Q-006, Q-008-Q-009: Blocked on Q-003 or Q-004

### Programming Interface (SEURL)

Programs are constructed via SEURLs with verbs:
- **START**: Initialize with a value address
- **WRITE**: Apply an operation
- **PERTURB**: Inject a state perturbation
- **COMMIT**: Persist to storage
- **BUILD**: Compile/materialize
- **TALK**: Submit to ACSP
- **SWITCH**: Change execution path

Example: `/seurl/START/map/eca/110/4/state/3/WRITE/next`
- Resolves value at `/map/eca/110/4/state/3/next`
- Returns full execution context with identity hashes

### Constitution & Governance

**Version**: 1 (content_id: sha256:319402f8...)
**Status**: Implemented, awaiting conformance test run
**Amendment Process**:
- Prepare via POST `/constitution/amendments?session=...`
- Attach evidence
- Human-authored git commit to adopt
- Run `/conformance/runs?session=...` to verify

**8 Core Clauses**:
- K-01: GET never changes state (pure)
- K-02: Continuity does not imply identity (session_id asserted)
- K-03: Reference does not imply ownership (forks are independent)
- K-04: Awareness does not imply authority (circle has no ACSP capability)
- K-05: Handoff does not imply merger (external, ACSP's responsibility)
- K-06: URLs never carry credentials
- Plus implementation and security clauses

### Unresolved Issues in System

The `/state` endpoint lists 8 open issues:
1. Two constitutions mismatch (MUSA v1 vs COP directive)
2. Luna-foundry GET mutates ident
3. Golden-surface shared sessions vs no ambient authority
4. MUSA automation against google.com vs directive 28
5. Deterministic_sha256 mixes address and value
6. Program-001/417da6c/browser-hand referenced but absent
7. Golden-surface commits Android build output
8. PURL names both resource addresses and value addresses (naming conflict)

### What Has Not Yet Been Determined

1. **What work is in-flight**: No scrolls, no active checkpoints, no pending ACSP proposals
2. **Human identity**: Owner of continuity resource is "operator-owner" (asserted session_id, no human attribution)
3. **Recent activity timeline**: Cannot determine from GET-only inspection - would need event streaming or git log inspection
4. **Golden surface configuration status**: Not enough to determine if phone/relay is available elsewhere
5. **Why fresh-agent experiment has reports but no records**: Possible intentional (reports-only run) or incomplete
6. **The full content of experiment records**: JSON payloads not fetched (can read if needed)
7. **Constitution amendment history**: No prior versions visible
8. **Conformance test details**: No test run recorded yet
9. **Scrolls (persistent programs)**: None exist yet
10. **Whether the circle can be extended**: Protocol allows amendment but actual extensibility untested

### Data Integrity Notes

- All experiments marked "failed and invalid runs are kept beside valid ones"
- Records are content-addressed and never rewritten
- Git commits to registries use content hashes for provenance
- No circular dependencies in hypothesis evidence tracking (graph is acyclic at revision level)

### Next Steps Possible

1. Run conformance tests: `POST /conformance/runs?session=<id>`
2. Create a checkpoint to save current state: `POST /checkpoints?session=<id>`
3. Submit an ACSP observation: `POST /acsp/r/NAM4WPTZKK8B/observe?session=<id>&origin=<o>`
4. Build a program with materials: `POST /seurl/START/.../COMMIT?session=<id>`
5. Inspect specific experiment records by reading `/experiments/{name}/records/{record}.json` from PURL
6. Review git history to understand evolution: repos at `purl`, `substrateIO`, `NetGovComEduGovOrgEduGovComNet`
