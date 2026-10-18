# Security model

This extension retains the original PURL safe-GET and separate-authority principles. The historical security document remains in `docs/legacy/SECURITY.md`. This file describes the product boundary and its tested limits.

## Implemented boundaries

- Read-only GET/HEAD; explicit POST mutation; JSON body/size checks; same-origin browser mutation checks; header-only bearer credentials; no cookies granting ambient write authority. CSP permits same-origin scripts and self-hosted assets.
- Server-issued random bearer tokens stored as hashes. Guest/AI labels are self-declared. Optional Supabase Auth verifies the provider subject server-side; editable user metadata never grants authority. Browser-initiated email flows bind an unguessable nonce for ten minutes and reject unsolicited callback tokens.
- Resource visibility, live scoped grants, delegation attenuation/revocation, version conflicts and payload-bound persisted idempotency. A revoked grant cannot recover a cached successful mutation response as fresh authority.
- Strict bounded stateless product schema validation with own-property checks, valid keyword shapes, canonical JSON const/enum equality and boolean schemas. References and arbitrary regular expressions are rejected. The historical reference validator is preserved for its original protocol; the product uses the stricter wrapper.
- Closed pure operator registry, bounded repetition/values/work/allocation, normalized plans checked again before execution. URLs are never treated as process strings, imports or network fetch permissions.
- Durable job authority/build/environment checks, leases and claim fencing. Immutable Storage writes occur before successful job acknowledgement. Replay checks hashes and bindings and recomputes the deterministic recorded fragment without reissuing external effects.
- Restricted Docker authored-code adapter: pinned images, UID10001, read-only filesystem,16MiB temporary filesystem, no network/host mounts, dropped capabilities, no-new-privileges,32PIDs,128MiB RAM,0.5CPU, bounded wall time/output. Docker proxy environment is cleared inside the sandbox. Default deployment profiles disable authored code and mount no Docker socket.

## Verified locally

The evidence includes nine actual Docker checks for Python/JS results, host-file/root-write denial, metadata-network denial, absent cloud credentials, privilege/PID limits, CPU timeout, output termination and default-disabled behavior. HTTP/domain checks cover forged principals, revoked grants, stale versions, private artifacts, idempotency, multiplayer races and interrupted jobs. Independent review found schema/cache, quota, account-callback and replay issues; regression tests and a scoped re-review record their remediation. Browser tests include denial fallback, keyboard/touch/native clipboard, account-callback rejection, accessibility and responsive layouts.

These are specified attack tests and bounded code review. They are not an independent penetration-test certification or a proof that Docker/kernel/container escape is impossible. Public unrestricted execution remains disabled.

## Remaining limits

- No hosted Railway deployment, real provider sign-in, hosted Storage persistence/backup restore, Oracle/ARM execution or cross-provider AI trial was verified.
- Docker shares its host kernel and the worker's orchestration process needs access to its own daemon when authored code is enabled. Use a dedicated execution host and vetted microVM/container isolation before admitting arbitrary public workloads.
- Build/replay endpoints have bounded aggregate work but no mature multi-tenant billing, distributed abuse protection, admission scheduler or dependency-install supply-chain service. Strict guest quotas and trusted primitives are the supported surface.
- Hashes are not signatures or external timestamps. Server administrators retain control of database and Storage credentials. Separate backups and an external trusted checkpoint/witness are needed for stronger authenticity.
- Self-declared agents are not authenticated model identities. A bare public URL does not confer mutation rights, private context or third-party automation permission.

Production requires a dedicated reviewed Supabase project, server-only secrets, verified isolation policy, restore rehearsal and deployment smoke evidence. The repository deliberately refuses production filesystem persistence.
