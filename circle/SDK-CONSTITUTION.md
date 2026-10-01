# SDK constitution (human-readable view)

Machine-readable source: `circle/constitution/sdk-constitution.json`
(`constitutional-artifact/1`), served at `GET /sdk/constitution`. Its content id
is published in `GET /sdk` (`constitution.content_id`). This page restates it.
If the two disagree, the JSON wins.

| Field | Value |
|---|---|
| identity | circle SDK, `circle-sdk/0.2`, address `/sdk` |
| purpose | let any HTTP-capable participant learn what this environment is and act in it, without a provider-specific prompt |
| boundaries | inside: the routes listed at `/sdk` and the documents the circle returns. Outside: substrate/PURL/ACSP internals, third-party providers, credentials |
| permitted transitions | GET any listed route; POST a listed POST route with a declared session; classify a prompt |
| forbidden transitions | mutation through GET; acting on a credential in a URL; adopting or editing a constitution; publishing beyond an ACSP pending proposal; executing a prompt as a side effect of classifying it |
| observable effects | COMMIT → PURL scroll; BUILD → substrate executions + PURL append; TALK → one ACSP proposal; transform → PURL scroll with `derived_from`; checkpoint → PURL checkpoint; conformance → PURL run + test scrolls |
| non-effects | reading records nothing; classification records nothing; `/observatory` and `/tests` store nothing |
| validation | `POST /conformance/runs` |
| evidence requirement | a run in which every mechanical invariant's check passed against a live circle |
| version | 1 |
| related terms | C-043, C-047, C-048, C-052, C-053 |
| implementation | `src/circle/bridge.js`, `src/circle/server.js` |
| tests | `test/circle.test.js`, `src/circle/conformance.js` |

| Invariant | Check | Kind |
|---|---|---|
| SDK-1 every served route is listed, including `/sdk` and its constitution | `sdk_describes_itself` | mechanical |
| SDK-2 GET never changes state | `get_sweep_changes_nothing` | mechanical |
| SDK-3 no provider is assumed | — | human-reviewed |
| SDK-4 a prompt is a program only under the contract; classification never executes | `prompt_conversation_not_executed` | mechanical |
| SDK-5 provenance is served with the SDK | `sdk_describes_itself` | mechanical |

Known gap: SDK-1's check verifies that listed GET routes do not 404 and that an
unlisted path does, but it does not enumerate the router's branches. A route
added to `server.js` without a `ROUTES` entry would pass unnoticed. Recorded
as **UNRESOLVED**. Closing it would need a table-driven router.
