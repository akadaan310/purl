# Product API contract PURL/0.2

All bodies and responses use JSON. Authorization is `Bearer` in a header, never a query. Errors are `{error:{code,message,...}}` with an HTTP status. `handle(method,path,body,{token,idempotencyKey})` returns `{status,body,headers?}`. Paths may include a query string.

- `GET /.well-known/purl`: protocol, live capabilities, endpoints including SDK, templates, programs and mission.
- `POST /api/session`: `{label,kind}` => `{principal,token}`. Anonymous principals are self-declared guests, not verified accounts.
- `GET /api/session`: authenticated principal, rights disclaimer.
- `GET /api/programs`: `{items:[program summaries]}`; list public plus owned/explicitly granted; unlisted only by known URL.
- `POST /api/programs`: `{title,kind?,language:'purl'|'javascript'|'python',source,input_schema?,output_schema?,tests?:[{input,expected}],visibility:'public'|'private'|'unlisted'}` => `{program}`. `kind` can be `program`, `mission`, `game`.
- `GET /api/programs/:id`: `{program}` including source, version, builds, state, history refs and canonical URL. Public resources reveal no secrets.
- `GET /api/programs/:id/manifest`: `{protocol,program,operations:[{name,method,href,available,requires,effects,input_schema}],links,continuation}`.
- `GET /api/programs/:id/history`: `{events}`; `/continuity` => `{program_id,version,checkpoint,next_operations,authority,...}`; `/replay` => `{valid,...}`; `/diff?from=1&to=2` => state/source diff.
- `POST /api/programs/:id/source`: `{expected_version,source}` updates source as a new version and invalidates prior active build.
- `POST /api/programs/:id/compile`: `{expected_version}` => compiler result plus program version. May persist diagnostics; explicit mutation.
- `POST /api/programs/:id/build`: `{expected_version}` => `{build,program}`; tests are executed for pure PURL builds; unsupported authored-code execution clearly blocked.
- `POST /api/programs/:id/run`: `{expected_version,input,seed?}` => `{execution}` (202 queued). Worker completes it.
- `POST /api/programs/:id/publish`: `{expected_version}` => `{release,program}` only after passing build/tests; immutable release URL.
- `POST /api/programs/:id/fork`: `{expected_version,title?}` => `{program}` with lineage, new owner, no copied grants.
- `POST /api/programs/:id/checkpoint`: `{expected_version,summary,next?,evidence?}` => `{checkpoint,program}`.
- `POST /api/programs/:id/propose`: `{expected_version,source?,summary}` => `{proposal,program}`.
- `POST /api/programs/:id/commit`: `{expected_version,proposal_id}` owner accepts proposal, rechecks version.
- `POST /api/programs/:id/grants`: `{expected_version,principal_id,rights}` => `{grant,program}`. Rights vocabulary `read,edit,build,run,publish,checkpoint,propose,grant,play`; no escalation by self-reported principal.
- `POST /api/programs/:id/revoke`: `{expected_version,grant_id}` => `{program}`.
- `POST /api/programs/:id/move`: `{expected_version,cell}` validates current authenticated game player and winner/turn atomically. Game owner is X; joining assigns O through `/join` with expected_version.
- `GET /api/executions/:id`: `{execution}` with logs, captured environment, input/seed, status and artifact refs; permission inherited from program.
- `GET /api/artifacts/:id`: immutable artifact `{artifact}` after program access check.
- `GET /api/releases/:id`: immutable `{release,program}` after visibility check.
- `GET /api/operators`: `{items}` trusted typed registry.
- `GET /api/templates`: `{items:[{id,title,kind,language,source,input,tests,...}]}`.

POST mutations require expected_version on existing programs. Idempotency keys are principal+route scoped, payload-bound, persisted and checked after live authentication/authority. Reads do not create resources or history. All `program` responses include `id,title,kind,language,source,version,visibility,url,owner,builds,state`.
