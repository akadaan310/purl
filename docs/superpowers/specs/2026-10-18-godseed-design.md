# PURL integrated God Seed V3 implementation design

The authoritative requested scope is `reference/godseed/GODSEED.md`, amended by Railway first, Oracle later. The user explicitly requests continuous implementation, experiments and honest deployment reporting; this written design records implementation decisions without introducing another approval gate.

## Architecture

Extend the original PURL repository on `codex/godseed-v3`, preserving original source/tests/history. Keep its event-sourced continuity layer as a separately reachable reference interface. Add a product service in `service/`: a bounded typed computation language, immutable builds, versioned resource/event documents, a durable queue and worker, manifest discovery, reusable SDK and browser IDE. New modules must not compromise the existing layer dependency tests.

The API/control plane runs independently of workers. A pure operator interpreter supports safe bounded computation. Authored Python/JavaScript are stored and built but execution is denied unless an explicitly configured isolated worker passes capability checks. Do not substitute Node vm or a normal subprocess for an isolation boundary. Worker jobs and results are persisted before acknowledgement. GET never mutates.

Supabase is the sole production persistence authority: a CAS-protected state document, immutable artifact objects and schema/migration files. Local filesystem persistence is explicitly DEVELOPMENT mode. Production startup must reject filesystem persistence. Railway uses the same image with different API/worker commands; Oracle migration replaces workers while retaining the Supabase project and job leases.

## Shared interfaces

`service/compiler.js` exports `compile(source, {capabilities=[]}={})`, `execute(plan,input,{seed=0}={})`, `operators()`, `checkProjection(spec)`, `compileTrace(spec)`, `mapSeurl(verb,context)`, `identity(kind,value)`. Compile returns `{ok,diagnostics,plan,derivation_id}`; execution returns `{value,trace,value_id}`. A compiled plan is serializable and versioned. Capabilities are names of explicit rights, pure requires none. Language source accepts JSON AST or a small pipeline DSL.

`service/repository.js` exports `MemoryRepository`, `FileRepository`, `SupabaseRepository`, `createRepository(env)`. `read()` returns `{revision,data}`. `transaction(mutator)` calls a synchronous mutator on a fresh cloned document and atomically persists it, returning its result; retries on CAS conflict are bounded. Empty data is `{principals:{},programs:{},executions:{},artifacts:{},audit:[]}`. Transactions must not perform external side effects. File operations use lock+atomic rename with recovery from abandoned locks. Production uses Supabase RPC/CAS and fails closed without configuration.

`service/domain.js` exports `PurlService`, constructed `{repository,baseUrl?,...}`. API uses `service.handle(method,path,body,{token,idempotencyKey})` returning `{status,body,headers?}`. `seed()` initializes public immutable examples and God-seed mission without exposing a write token. `workOnce({workerId,leaseMs?})` claims/executes/commits one job. Workers recheck authority at claim time. State snapshots contain no raw bearer tokens.

API contracts live in `service/CONTRACTS.md`. Program URLs `/p/:id`; manifests `/api/programs/:id/manifest`; API service metadata `/.well-known/purl`. The root controller will own HTTP static routes, security headers and browser integration.

## Evidence and completion

Preserve bundled evidence and failed runs. Pre-register E01–E10 before executing the new experiment harness, pin source revisions and exact thresholds. Report security and cross-provider limitations explicitly. A fresh independent agent must start with a single live local mission PURL and reconstruct without a parent transcript; label its execution class accurately. A local URL is not a public deployment.

Every required artifact receives PASS/FAIL/BLOCKED/NOT_RUN with evidence pointers. No production URL, Supabase durability, arbitrary-code isolation, independent cross-provider continuation or performance advantage may be claimed without the corresponding measurement.
