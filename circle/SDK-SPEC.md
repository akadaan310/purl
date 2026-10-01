# Circle SDK specification (circle-sdk/0.3; §1–5 written at 0.2 and kept, §6 adds 0.3)

The SDK is not a client library. It is the environment describing itself, so
that any participant that can make HTTP requests can act in it. There is no
package to install and no provider-specific prompt.

Epistemic ledger: **implemented** (`src/circle/bridge.js`, `server.js`);
**tested** (`sdk_describes_itself`, `prompt_conversation_not_executed`, circle
tests); **observed** to be sufficient for some participants (EXP-CIRCLE-FRESH B/C,
EXP-BRIDGE-RECON). It is **not** shown to be sufficient for other providers' sessions (Q-014).

## 1. Discovery path

```
GET /            what this is; verbs; grammar; systems; moves (each {rel, method, href, effect})
GET /sdk         the answers below + every route + schemas + constitution + provenance
GET /sdk/constitution   SDK invariants (constitutional-artifact/1)
GET /sdk/schemas/{name} addressed-transition, prompt-contract, test-artifact, perturbation, program-transformation
```

| Question | Answered at |
|---|---|
| What am I? | `/sdk` → a participant named only by the session id it declares |
| What protocol is this? | `/sdk`, `/` |
| What can I inspect? | `/sdk` routes with method GET |
| What can I execute / record? | `/sdk` routes with method POST (each lists its effect) |
| What can I construct? | `/seurl/…`, `/programs/transform` |
| What can I publish? | `…/TALK/acsp/{id}`: a pending proposal |
| What can I test? | `/conformance/runs`, `/tests`, `/programs/closure` |
| What programs exist? | `/programs` (with content_id, lineage) |
| What nomenclature exists? | substrateIO registry (named in `/sdk`) |
| What are the invariants? | `/constitution`, `/sdk/constitution` |
| What is my environment? | `/adapters`, `/state`, `/operations`, `/observatory` |

## 2. The IDE stages (each addressable)

| Stage | Address | Pure? |
|---|---|---|
| source | the SEURL path text; `content_id = H(bytes)` | yes |
| lexical | `parseMoves` (visible as `moves` in `/seurl/…`) | yes |
| parsed | FSM state (`state`, `legal`) in `/seurl/…` | yes |
| typed term | `/term/{address}` (substrate) | yes |
| executable representation | the Scroll's `steps` (prefix addresses) | yes (prepared) |
| execution | `POST /scrolls/{id}/build` → substrate execution records | recorded |
| result | `/v/{address}`; build `records[].value_id` | yes |
| observation | `POST /acsp/r/{id}/observe` (P-ACSP-EV-1); `perturbations` on a scroll | recorded |
| record | PURL resource events (`/naici/trace?url=/scrolls/{id}`) | yes |

A program becomes a new program only through a named transformer
(`/programs/transform`), and the result goes through every stage again.

## 3. Programs as first-class objects

`/programs` lists every program with `content_id`, `derivation_id`, `parent`
(fork), `derived_from` (transformer), and builds. A transformation records
`{source content_id/scroll/version, transformer id + version, params, build_id}`.
A fork copies no grants and no records (F-C1, F-C2 differential). A build does
not change the source (`build_does_not_change_source`).

## 4. Recursion and its limit

`/sdk` lists `/sdk`. The SDK's own constitution is served by a route that
`/sdk` lists. Its provenance (file hashes of `src/circle/*.js`, commit) is
served with it. A check verifies the listing against the router. The recursion
stops there: the SDK cannot change itself through itself (no route writes code
or the constitution). Extending the SDK is a git commit, which is also a
transition the SDK can project (`/git/purl/{commit}`) but cannot perform.

## 5. Versioning
`circle-sdk/0.2` (STASIS-2). 0.1 was the STASIS-1 surface (no `/sdk`). The
version changes when a route, a schema, or an invariant changes.

## 6. circle-sdk/0.3 (STASIS-3 phase 6)

**Greeting** (in `GET /` and `GET /sdk`): *"You have entered a programmable
computational substrate. Everything here is addressable. GET shows what an
operation would do and changes nothing; POST, with your declared session, does
it. Start at /sdk."*

New routes, all `GET` and pure (module `src/circle/ide.js`):

| Route | Exposes | Source of truth |
|---|---|---|
| `/nomenclature`, `/nomenclature/{id}` | terms with status, class, scope | substrateIO `research/registries/nomenclature.json` |
| `/experiments`, `/experiments/{name}` | SPECs and records (invalid and failed ones listed beside valid ones) | `circle/experiments/*`; substrateIO `experiments.json` |
| `/research`, `/research/open` | hypotheses, open problems, research queue | substrateIO registries (read-only view) |
| `/examples` | worked examples, each a URL to GET | `ide.js` |
| `/code`, `/code/{module}` | each module's descriptor: **claims, requires, produces, changes** | `DESCRIPTOR` export of each `src/circle/*.js`, **verified** against the source |
| `/ide?program=…`, `/ide/{stage}?program=…` | the eight stages DISCOVER, PARSE, TYPE, PLAN, BUILD, EXECUTE, OBSERVE, RECORD | computed from the program text alone |

§2's stage table maps to addresses as follows:

| Stage | Address | Effect |
|---|---|---|
| DISCOVER | `/ide/discover` | legal next verbs; where to look |
| PARSE | `/ide/parse` | moves; syntax only |
| TYPE | `/ide/type` | FSM legality + substrate typed term (`derivation_id`) |
| PLAN | `/ide/plan` | FSM state, `would_reach`, prepared mutations |
| BUILD | `/ide/build` | identity transformation: `build_id`, artifact text; other transformers at `/programs/transform` |
| EXECUTE | `/ide/execute` | **pure** value resolution (`value_id`); a *recorded* execution is `POST /scrolls/{id}/build` |
| OBSERVE | `/ide/observe` | the program as addressed transitions |
| RECORD | `/ide/record` | `performed: false` and the POST to send. **Never performed here** |

**Non-opaque code.** A descriptor is a claim, so `/code` accepts it only if
the module's actual exports and relative imports match it (`verifyDescriptors`;
test `sdk-v03.test.js`). `changes` names every store a module can mutate. The
check verifies `produces` and `requires.modules`. It does **not** verify
`claims` or `changes`: those are checked by the conformance checks they name,
or not at all (UNRESOLVED: no static effect analysis).

**Discovery ≠ execution.** Checked by `get_sweep_changes_nothing` (crawls 60 GET
URLs from `/`, which now include the new routes) and by the new
`ide_stages_change_nothing`. That check runs all eight stages on a program
ending in `COMMIT/BUILD`, and the PURL, substrate and ACSP state hashes stay
unchanged. It is attached to K-01 and K-08 in `enforcement.json`. Clause texts
are unchanged, so this is no amendment.

**Fix found while building (kept):** `/constitution/axes` served
`record-1.json`, the invalid probe. It now serves the latest record and lists
every record, with record-1 marked invalid. The EXECUTE stage first read
`value_id` at the top level (null). The substrate returns it at
`identity.value_id`.
