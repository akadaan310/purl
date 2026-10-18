# Hosted backend verification

The root controller configures a local API on port18183 and a separate worker
with production settings, the dedicated hosted Supabase document and its private
artifact bucket. Credentials remain in those server processes. The harness never
reads environment variables or server credential files.

```sh
node evidence/deployment/hosted-backend/harness.mjs
# Root restarts only its API/worker against the same hosted authority.
node evidence/deployment/hosted-backend/verify-restart.mjs
```

The first harness creates a new principal and public pure arithmetic and mission
programs, builds/tests them, queues worker execution, verifies immutable artifact
and receipt integrity, publishes releases and records checkpoints. It checks
arithmetic4→18 and mission52nodes/65edges. Bearers are kept in memory and redacted
from raw HTTP evidence. The second harness needs no token because it verifies
only the newly created public programs, unchanged checkpoints/releases/artifacts
and deterministic replay after the root's separate process restart.

Artifact JSON is fetched through the product API. Its Storage descriptor is
checked against canonical artifact bytes. The API does not expose a route that
downloads underlying private Storage bytes; actual object download must be
verified separately by the root through the server-side repository adapter.

Transport remains loopback. The allocated Railway hostname in canonical program
URLs is not evidence that Railway is deployed or reachable. These checks establish
actual hosted Supabase persistence with local production-configured API/worker
processes; they do not establish public deployment or mission requirement truth.
