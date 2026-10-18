# Exported snapshot restore verification

Run from the repository with Node 20 or newer:

```sh
node evidence/infrastructure/snapshot-restore/harness.mjs
```

The harness requires implementation revision
`d45fcc214350c8380b369ea97f0add9a6643c442` and an unused loopback port 18182.
It copies `examples/live-session.snapshot.json` into a new temporary directory,
starts distinct API and worker processes with development file persistence and
authored execution explicitly disabled, and uses only the temporary copy.

It reads the published mission, prior execution, checkpoint and immutable release
identified by `evidence/dogfood/live-local.json` and `handoff.json`. A fresh agent
session forks the public pure mission, builds its inspector and queues a run that
must compute 52 nodes and 65 dependency edges. Replay and an immutable artifact
are checked. All original program, execution, checkpoint, release and artifact
records must remain unchanged. Prior principal IDs must not authenticate.

`report.json` records each check; `raw-http.jsonl` preserves HTTP responses with
credentials redacted; `api.log` and `worker.log` preserve the two process logs.
The harness stops only processes it created and removes its temporary copy.
It does not use the live `.purl` directory, port 8080, previous bearer tokens,
Docker execution, hosted Supabase, Railway or Oracle.

This verifies local snapshot portability and fresh credential continuation.
It does not establish independent research truth, hosted restore durability or
public deployment. Mission completion remains `NOT_RUN` and `verified:false`.
