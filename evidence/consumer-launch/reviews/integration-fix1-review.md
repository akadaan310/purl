# Scoped integration fix re-review

Spec: **PASS** for the reviewed fix. Quality: **APPROVED, conditional on the planned actual container smoke**.

The prior P2 heartbeat mismatch is **addressed**. `service/launch/worker-main.js:7` now defaults to `/tmp/purl-worker-heartbeat.json`, matching `deploy/healthcheck.js:5`. Both still honor the explicit deployment override `/tmp/purl-launch-worker.json`.

Repeated only the small offline healthcheck-body probe, using actual source and an injected read-only filesystem interface. No files, network connections or worker processes were created. Results:

```text
default: workerWrites=/tmp/purl-worker-heartbeat.json healthReads=/tmp/purl-worker-heartbeat.json exitCode=0
explicit-override: workerWrites=/tmp/purl-launch-worker.json healthReads=/tmp/purl-launch-worker.json exitCode=0
```

The Dockerfile addition at line 12 creates `/app/.purl` and assigns it to `node` before `USER node`. This supports development file storage and initial named-volume ownership without changing the production Supabase default, process privileges, health command or preserved legacy CMD. No new defect was found in this minimal change.

No auth/HTTP/SDK changes were reported since the original integration review; those unchanged areas were not reopened. No covered suites, image build or container tests were rerun, and no implementation or deployment changes were made by this reviewer. Root's planned fresh-image worker/default-health smoke and final integrated tests remain required verification; actual container volume writability and worker health are **Cannot verify** from this static/offline check alone.
