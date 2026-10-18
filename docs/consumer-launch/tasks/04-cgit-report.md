# Task04 CGIT implementation report

Status: DONE_WITH_CONCERNS. Independent domain implementation is complete and its 22 scoped tests pass. Root owns HTTP/product integration, deployment, full-suite verification and production persistence validation. No commits, dependency edits, shared HTTP/UI edits, peer-file edits, upstream writes or code execution occurred.

## Delivered files

- `service/launch/cgit.js`: scoped product authorization, owned repositories, SHA-256 typed immutable blobs and parented commits, CAS branch heads, branches, forks, immutable release versions, artifact/code structural diffs, exports, validated recoverable imports, resumable explicit deletion, GitHub-lens persistence/query/diff and indexing quotas.
- `service/launch/github-lens.js`: fixed GitHub API/raw HTTPS read-only fetch, strict public URL/ref validation, public metadata/license attribution, actual commit-SHA pinning, manual redirect rejection, bounded streamed responses/deadlines and source inventory.
- `service/launch/structural-index.js`: pinned Babel 7.29.9 JS/JSX/TS/TSX parsing, bounded AST traversal, symbol positions/import aliases/CommonJS/dynamic imports/local dependency resolution, explicitly labeled unknown-language inventory, deterministic queries/diffs and a documented compact navigation grammar.
- `test/launch/cgit.test.js`, `test/launch/github-lens.test.js`.
- `evidence/consumer-launch/04-cgit/`: preserved red/green outputs and read-only real-public-repository proof.

Read `04-cgit-brief.md` first, then binding design, `05_CGIT.md` and reconstruction repository report. CGT/GiN code was not copied; their missing/ambiguous licensing and limited research evidence do not justify implementation reuse or compression claims.

## Contracts for integration

Construct `new CgitService({store,baseUrl,fetch,githubToken?})`; call `handle(method,path,body,actor,context={query,headers,requestOrigin,idempotencyKey})`. Unrecognized routes return null; errors carry status/code/message. Authenticated principal ID alone determines storage scope; body owner/scope never grants access.

`commitArtifact(actor,{repoId|repositoryId,branch:'main',expectedHead:null|sha256,message?,artifacts:[{path,type,content,provenance?,consent?}]})` returns `{repository,commit,resumeCursor:{repositoryId,branch,head}}`. Omitting repository ID creates one using `name` or `Artifacts`. Conversation artifacts require `consent:true`; types also include code, research, proof, program, decision, trace, checkpoint. JSON content is supported. Native SHA-256 hashes are explicitly separate from Git SHA-1; `gitWireProtocol:false` is enforced.

Separate CGIT consent accepts the binding-brief `actor.products.cgit===true`, the live identity `actor.products.includes('cgit')`, or persisted active `profile:cgit` with versioned consent (plus legacy `profile/cgit` consent compatibility). Every call independently requires `cgit:read` or `cgit:write`; cross-product steward writes require CGIT consent plus `cgit:write`. Guest actors remain unverified.

Routes:

- GET `/api/cgit/repos` → `{repositories,cursor:null}`; POST `/repos/create` `{name}` → `{repository}`.
- GET `/repos/:id` optionally query `branch` → `{repository,head,artifacts,resumeCursor}`.
- POST `/repos/:id/commit` uses commit payload above → `{repository,commit,resumeCursor}`.
- POST `/repos/:id/branch` `{name,from?}`; `/fork` `{name?}`; `/release` `{name,commit}`; `/delete` `{confirm:true}`.
- GET `/repos/:id/diff?from=sha256&to=sha256` → `{from,to,changes:[{path,kind,from,to,structure?}]}`. JS/TS code changes include deterministic added/removed syntax symbols.
- GET `/repos/:id/export` → complete `cgit-export/1` snapshot; POST `/api/cgit/import` `{snapshot}` → `{repository}`.
- POST `/api/cgit/github/index` `{url,ref?}` → `{lens}`; GET `/api/cgit/lenses/:id` → `{lens}`.
- POST `/api/cgit/lenses/:id/query` `{kind:'symbol'|'name'|'dependencies',name}` → `{kind,name,matches,deterministic:true}`.
- POST `/api/cgit/lenses/:fromId/diff` `{to:toLensId}` → `{from,to,changes}` with per-file hashes, algorithms and added/removed symbols. These query/diff POSTs require read scope and do not mutate.

Lens source includes canonical repo URL, actual commit SHA, SPDX license or UNKNOWN, attribution and a license notice. Indexed files have SHA-256 text hashes, upstream Git blob SHA-1, line positions, syntax summaries/symbols/imports/dependencies. Unfetched/unknown-language files expose inventory and upstream Git blob hashes rather than implying AST analysis.

## Verification and exact evidence

Final command: `node --test test/launch/cgit.test.js test/launch/github-lens.test.js` → 22 passed, 0 failed. Complete final output: `evidence/consumer-launch/04-cgit/23-green-typescript-import-equals.txt`. `node --check` on each of the three production modules exited 0. Full project suite intentionally left to root while parallel modules are under construction, as directed by the brief.

Preserved red baselines and matching green checks include missing modules (01), actual identity/scopes (03→04), navigation/read-only queries (06→07), native structural diff (09→10), unknown-language inventory diff (11→12), format/date/AST bounds (13→14), hard interruption recovery (15→16), concurrent restore corruption (17→18), and deletion/restore race (19→20). Intermediate positive checks are historical and not substituted for the final command.

Tests cover malicious URL credentials/ports/query/fragments/traversal/encoding, redirects, streamed oversize and upstream rate rejection, unsafe tree paths, tenant separation, separate consent, attenuated scopes, pure reads, missing conversation consent, prototype/traversal paths, immutable release conflict, concurrent stale-head CAS without losing objects, recomputed-wrapper tamper/missing parents, export/recovery, fresh FileLaunchStore instances, JS/TS parser edges/errors, imports/aliases/dependencies, 40-file and 100,000-node quotas, durable lens reads and indexing rate limits. Hard-interruption retries reuse a deterministic private restore namespace; concurrent restores cannot delete another restore's immutable rows. Deletion first persists an unreadable deleting state, can resume by repeating DELETE-as-POST, and blocks restore until cleanup completes.

Read-only proof command: `NODE_USE_ENV_PROXY=1 node evidence/consumer-launch/04-cgit/public-github-proof.mjs`. It performed eight GETs, no upstream writes/execution, against public `sindresorhus/is-plain-obj`, pinned actual SHA `666df7c10035f7e26f27ec214fe5ae3173435f34`, MIT license, 14 inventory files and five parsed JS/TS files. Final proof: `public-github-proof.json`, output `08-public-github-navigation.txt`; initial verbose-map proof also retained. Three simple source lookup tasks matched raw retrieval, 3/3 each. Compact map estimate 437 tokens versus selected raw-source estimate 953, using UTF-8 bytes/4 rather than a tokenizer. Initial verbose map was 1061 versus 953; this negative result is preserved. One tiny repository and three curated tasks establish no general compression or task-success advantage.

## Security bounds and remaining integration concerns

Repository quotas: 20 repositories, 180 immutable objects/repository, 128 paths/tree, 12 artifacts/commit, 200 KiB content/artifact, 32 branches/releases. Shared store enforces 256 KiB row, 32-write batch and 10 MiB principal quota. Import validates format, canonical content hashes, ISO UTC dates, paths/types, complete parent/blob references, acyclic history and authenticated ownership before publishing repository metadata. A process interruption may leave private, unpublished staged objects; retrying the identical snapshot reuses them. Repeated imports of the same snapshot are idempotent and return the already restored repository. Account erasure clears private staging; no background staging garbage collector is claimed.

GitHub quotas: at most 1000 tree entries, 40 selected JS/TS files, 200 KiB/file, 2 MiB selected source, 100,000 AST nodes/file; symbols/imports capped at 80 each with truncation flag. Ten saved lenses/principal, six indexing attempts/minute, twenty/hour; failed attempts count. Responses stream into bounded buffers; each read has a ten-second timeout and the complete network indexing sequence a 45-second deadline. Fixed HTTPS origins and manual redirect denial prohibit caller-controlled destinations. Imported code is never executed or written back. Dependency resolution is deliberately local relative-path/extension/index resolution; package imports remain external and aliases needing project configuration remain unresolved.

Root reports implemented route-specific HTTP limits of 8 MiB for `/api/cgit/import` and 3 MiB for artifact commits, resolving the earlier 256-KiB import-body integration concern. Root is also normalizing HTTP query parameters into the plain object expected by the domain. HTTP's own authentication, Origin/CSRF checks, error serialization, model steward binding and independently hosted CGIT UI remain root/peer work. Query POSTs are pure but still pass normal HTTP CSRF rules as configured by root. No promise of unlimited storage or automated backup is made; exports are independent backups and previously exported private conversations cannot be recalled. Production durability/backup/retention verification and full-suite/public HTTP checks remain root integration work.

## Independent review P2 follow-up: TypeScript import-equals

Addressed `/workspace/consumer-review/memory-cgit-review.md` finding that valid TypeScript `import util = require("./util")` was marked indexed while omitting its module dependency. Verified Babel 7.29.9's actual `TSImportEqualsDeclaration` → `TSExternalModuleReference` → `StringLiteral` AST shape, then added a failing dependency-query regression before implementation. The collector now records `source`, line and `{imported:'*',local:'util'}` using the existing 80-import bound and existing local/external dependency resolution. Qualified aliases such as `import alias = Existing.value` remain correctly excluded from file dependencies.

Regression covers `.ts` and `.cts`, a resolved relative dependency, preserved local aliases, an external package, and a namespace alias without an external module reference. Command `node --test --test-name-pattern='TypeScript import-equals' test/launch/github-lens.test.js` failed with missing imports/dependencies as expected; evidence `22-red-typescript-import-equals.txt`. Final command `node --test test/launch/cgit.test.js test/launch/github-lens.test.js` passes 22/22, retained in `23-green-typescript-import-equals.txt`. `node --check service/launch/structural-index.js` exits 0. A separate actual-AST/query probe is retained in `24-typescript-import-equals-ast-proof.txt`. Only owned index/test/evidence/report files changed; no commits, shared files or network actions. Existing saved immutable lenses require reindexing to include the newly collected edges.
