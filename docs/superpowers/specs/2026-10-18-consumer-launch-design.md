# PURLs × CGIT Hub consumer launch design

The binding product specification is reference/consumer-launch/00_START.md through
07_ACCEPTANCE.md and CODEX_MASTER.md, preserved verbatim. This document fixes
integration boundaries. The existing PURL product and all original research/history
remain intact; the starting runtime/doc branch is d6fbc666890f85913fac3553be055a44cb9ec620.

## User outcome and preservation

PURLs is the human-facing home for memory, continuity and computational experiences.
CGIT Hub is an independently addressable artifact repository/IDE and public GitHub
structural lens. Both authenticate with an established OIDC provider using code+PKCE;
immutable provider subject, separate product profiles and authorization. PURL is
Programmable URLs, pronounced pearl. The supplied hero is “Claim your PURL” and
promise “Your AI, uninterrupted.” A guest preview never claims verified human identity.

Existing Railway API/worker URLs, Supabase authoritative document rev70 and its
immutable programs/artifacts remain available. New products are additive services,
new data is in per-scope rows, and old default branches are preserved. Existing
Supabase Auth Site URL and redirect defaults must not be overwritten to activate SSO.
Provider/OAuth/email readiness is a real deployment dependency, not a fake login.

## Persistence and module boundaries

service/launch/store.js exports MemoryLaunchStore, FileLaunchStore,
SupabaseLaunchStore, createLaunchStore. A record is {key,version,value}; absent read
returns null and tombstones retain their version. Store methods are async:
read(scope,key); list(scope,{prefix,limit}); scan({prefix,statuses,limit});
commit(scope,changes,{idempotencyKey,payloadHash,handle}); resolveHandle(handle);
erase(scope). Changes: [{key,expectedVersion,value}], with value:null a tombstone.
commit returns {revision,records,duplicate}; stale versions/changed idempotency
payloads/occupied handles reject atomically. Scope is an internal authenticated
principal namespace, never a user-controlled authorization parameter. A handle
reservation {name} is atomic with profile changes; old aliases retain stable identity.
Use new purl_launch_* tables/RPCs, invoker permissions, RLS and service-role-only
access. Preserve original applied migrations. Bound row JSON to256KiB, write batches
to32, active tenant data to10MiB and reads to200. Queue scans use an indexed status
projection. File persistence is explicitly development-only; production fails closed.

Each domain service exposes handle(method,path,body,actor,context) returning
{status,body,headers?} or null for an unrecognized route. actor is
{id,kind,verified,product,scopes,credentialId,expiresAt}; context contains query,
headers, requestOrigin, idempotencyKey. HTTP security/routing is owned by root.
Errors expose status/code/message, never credentials or upstream private bodies.

IdentityService owns /api/identity/* and /api/agents/* and authenticate(context).
It uses openid-client6.8.8, exact configured redirects, S256 PKCE, state, nonce,
secure HttpOnly SameSite sessions, server-side expiry/revocation and verified email.
GET /auth/callback serves a page only; its JS submits code/state to a protected POST
callback, then clears the address bar. /api/identity/login is POST. New AI principals
are self-declared unless attested, have owner/scopes/expiry and revocation. Profile
claim/rename and optional reciprocal CGIT provisioning require explicit consent.
Guest preview credentials may use bounded tools; verified identity is never inferred
from a guest, an email string or a public URL. Secret material uses server AES-GCM.

MemoryCatalogService owns /api/memory/*, /api/passports/*, /api/cognition/*,
/api/catalog/* and exports catalog descriptors. Sourced assertions, inferences,
relationships and corrections stay private by default. Selected live-memory shares
are explicit, scoped and revocable for future reads; export warns about past copies.
Catalog entries carry input/output schemas, distinct executable graphs, audience,
state/effects/permissions, limits, sample tests, provenance and honest status. Target
40–60 working differentiated experiences; no padding and no labeling deterministic
text processing as model inference. Required experiences appear with real integration
or precise limited/blocked status. C1–C8 are contracts, not consumer jargon.

CgitService owns /api/cgit/* and commitArtifact(actor,payload). It implements owned
repos, typed content-addressed blobs, branch heads, parented immutable commits,
structural diffs, forks/releases and import/export with quotas and explicit deletion.
CGIT access needs the separate consented profile. Git-compatible imports preserve
source attribution; native artifact commits must not be mislabeled Git-wire support.
GitHub fetch accepts only public https://github.com/owner/repo, pins actual SHA,
uses fixed GitHub API/raw origins, no execution/SSRF/redirect following, bounded
files/bytes/rate, and Babel parser7.29.9 for JS/TS AST/symbol/import graphs. Other
languages are explicitly inventory-only. Structural queries are deterministic;
semantic claims and measured token/task comparisons are separate evidence.

ModelGateway owns /api/models/* and /api/chat/*, encrypted BYOK credentials,
allowlisted provider endpoints, explicit selected-memory consent, context/output/rate
bounds and atomic per-owner spending reservations. No available operator model key
means free/hosted inference is unavailable. Actual upstream usage and cost are stored;
missing usage is conservative, idempotent calls do not duplicate charges. Pricing
provider cost +15% remains a proposal; no payment collection is enabled by this mission.
ConstellationService owns /api/constellations/*, creates three independent contexts,
attributed contributions/disagreements, persisted jobs/checkpoints/replay and an
optional consented CGIT steward commit. workOnce uses leases/fencing/CAS, no secret
in participant context, and resumes only persisted steps. Equal-budget single-model
baseline is measured when real inference exists; otherwise explicitly NOT_RUN.

Root owns service/launch/http.js, main.js, worker-main.js and resources.js. Two
frontends in web/consumer and web/cgit serve independently, same backend contracts.
Legacy IDE/API remain separate and usable. Native resource negotiation returns
self-describing typed manifests; GET does not mutate application state. Mission data
contains every supplied document, dependency graph, completion tests, evidence,
progress and next steps. It is natively compiled/executed/checkpointed, public reads
carry no mutation authority, and fresh-context continuation is a required real check.

## Verification and rollout

Use test-first domain/security cases and actual disposable PostgreSQL/PostgREST.
Independent review checks auth/tenant boundaries and real behavior. Preserve failed
runs. Root runs complete legacy+new suite, all catalog samples, fresh model-context
harness where credentials permit, desktop/mobile Playwright/axe, restart/interrupted
job/replay/export/restore, clean checkout and public smoke. Build a pinned non-root
image with vendored integrity-pinned production npm tarballs for offline builds.
Deploy additive new services first, preserve old deployments, apply additive schema
only after real SQL checks, read back all settings and require Railway terminal
SUCCESS. No public unrestricted code, no Oracle wipe, no unapproved charges, no
assumed provider credentials. The mission-PURL handoff records exact remaining
blockers and authorized next operations; full acceptance cannot be claimed around
missing verified human login or unavailable inference.
