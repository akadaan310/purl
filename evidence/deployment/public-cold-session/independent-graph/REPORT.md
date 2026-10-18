# Independent public graph check

Public program `godseed-mission` version 1, source revision 1.

Graph: 52 nodes, 65 edges, 65 explicit dependencies. Status totals: {'NOT_RUN': 52}.

Ready frontier: mission. A non-PASS node is ready when every explicit dependency resolves to status PASS; zero dependencies pass vacuously.

Structural result: acyclic; 52 nodes topologically processed; no duplicate IDs, dangling references, duplicate edge pairs, or dependency/edge mismatches were found.

Persisted source: `input json | mission.inspect`. Public registry advertises `mission.inspect@1.0.0`, deterministic, available, empty effects and requirements. No execution was performed.

Limitations:
- This check validates public response graph structure and calculates readiness from recorded statuses; it does not validate the truth or completeness of mission requirements, proofs, tests, or evidence.
- No native mission.inspect execution or original mission program run was requested or performed. Its advertised metadata and persisted source/build were inspected only.
- Every node is NOT_RUN with empty evidence in this snapshot; readiness of the mission root is an execution ordering result, not completion.
- Recorded state.evidence_class is LIVE_LOCAL and completion is NOT_RUN/unverified; the check does not relabel these claims.
- Observations cover the public snapshot retrieved at the response metadata timestamps, not future state.

Discovery: entry HTTP Link → /.well-known/purl → mission manifest → inspect/source link → public program JSON. The manifest also links /api/operators. All five GET requests returned HTTP 200 and were spaced more than one second apart. No credentials were used.

Artifacts: raw response bodies and response metadata, graph.json, source.purl, node-status-dependencies.json, analysis.json, and reproducible analyze.py.
