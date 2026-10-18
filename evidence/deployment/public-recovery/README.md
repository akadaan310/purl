# Public Railway migration and recovery

This verifier performs only public GET requests. It uses no bearer token,
environment variable or server credential. The live transport is
`https://purl-api-production.up.railway.app`.
The harness invokes curl for proxy-aware managed network routing without reading
or logging environment configuration. The initial native Node fetch failure is
preserved in `failed-runs/`; it produced no HTTP response.

```sh
node evidence/deployment/public-recovery/verify.mjs migration
node evidence/deployment/public-recovery/verify.mjs capture-native PROGRAM_ID EXECUTION_ID
# Root restarts the Railway API and worker, then confirms completion.
node evidence/deployment/public-recovery/verify.mjs after-restart
```

Migration compares unchanged public fingerprints for arithmetic and mission
programs, executions, releases, checkpoints and artifacts created through the
earlier local production-configured control plane against actual hosted Supabase.
The historical `hosted-backend/report.json` and its42/42passing assertions are
preserved. Root's actual private Storage byte-download and isolated document
restore proof is separately recorded in `../hosted-storage/report.json`.

Historical execution traces captured Node24. Railway runs Node22. Strict replay
compares captured runtime/environment and trace, so it may correctly return an
environment mismatch even while every immutable stored record survives unchanged.
Reports retain the actual old execution replay response and do not claim it passed
unless its response actually says so. A frozen new public native Node22 execution
is captured separately and must pass strict replay before and after restart.

Each phase writes its own report, redacted raw HTTP response log and console
output. Mission graph inspection does not establish research requirement truth.
