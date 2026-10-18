# Scoped independent re-review: memory/catalog and CGIT fixes

Spec: **PASS** for the three reviewed findings. Quality: **APPROVED** for this fix patch.

All three prior findings are **addressed**. No new blocking defect was found in the changes. This verdict covers `/workspace/consumer-review/memory-cgit-fix1.patch` and the changed behavior only; it is not a new full-product or production acceptance claim.

## Scope and evidence

Read the frozen fix patch, latest task03/task04 reports, changed implementation/test code, and retained red/green evidence. Reconstructed the seven changed files from the original frozen patch plus this fix patch and compared them with current source: **all seven match exactly** (`Frozen fix matches source: 7 files`). No implementation edits, covered test reruns, network requests, external mutations or helpers were used.

The retained memory/catalog output at `evidence/consumer-launch/03-memory-catalog/review-verification.txt` records **18 passed, 0 failed**. The retained CGIT/lens output at `evidence/consumer-launch/04-cgit/23-green-typescript-import-equals.txt` records **22 passed, 0 failed**. These are inspected implementation-team results, not tests rerun by this reviewer. Their source assertions directly exercise the reported failures rather than merely checking changed constants.

## Prior findings

| Prior finding | Result | Concrete evidence |
| --- | --- | --- |
| Global pointer quota and failed publication consuming owner share allowance | **Addressed** | Passports now use one unpredictable capability scope per lookup (`memory.js:5`, `:37`, `:110`). A lookup reservation precedes the owner write; failed reservation cannot increment owner shares, and failed owner writes attempt lookup cleanup (`:111`–`:113`). A dangling reservation grants no content because reads still require a matching live owner passport (`:38`–`:40`). Publication indexes now live in the owner's scope and are committed atomically with authority (`:116`); revoke tombstones the index in the same owner transaction (`:122`, `:124`). The inspected real-store regression fills both old global scopes to 4096 records, then creates/read-checks fresh-tenant shares successfully. Separate fault-injection cases assert zero consumed owner shares after reservation failure and zero active lookup/index after known owner-write failure. |
| Valid combined catalog output rejected by the 20,000-character input schema | **Addressed** | `outputString` has a separate 250,000-character bound (`catalog-operations.js:7`), used by canonical JSON output and Never Start Over context. The original 20,000-character input text limit remains in place. The regression runs real catalog handlers with two 15,000-character JSON strings and six 4,000-character memory facts, asserting the complete canonical result and all six context lines. Both previously failing cases pass in the retained 18-test output. The memory aggregate's existing byte bound also bounds its combined context below the new output text maximum. |
| TypeScript import-equals silently omits dependencies | **Addressed** | The collector handles Babel's `TSImportEqualsDeclaration` → `TSExternalModuleReference` → `StringLiteral` shape (`structural-index.js:28`–`:29`), records the `'*'` import and actual local alias, and feeds the existing resolver under its existing 80-import bound. The regression covers `.ts` and `.cts`, local resolution, an external package and a qualified namespace alias that correctly adds no file dependency. The retained actual-AST proof returns `dependencies:["src/util.ts"]` and `{imported:"*",local:"util"}` for the original failing example. |

The retained red evidence independently records the original quota failure, consumed allowance (`1 !== 0`), canonical-output rejection and empty TypeScript dependency list. The green assertions address each original mechanism.

## Fix-induced behavior checked

- Publication scans request only `memory/publication/` rows with active status, use the returned row's owner scope, and recheck live publication authority before returning selected facts. They retain the explicit 200-active-result limit. Revoked rows no longer consume that active-result window, and owner erasure also erases its publication index.
- Passport lookup reservations contain only an owner pointer; uncommitted, erased or revoked owner authority cannot expose fact content. Failure cleanup does not target another tenant's scope because each reservation uses a freshly generated capability ID.
- New literal `consent:true` requirements are enforced before writes and appear in the catalog Memory Passport schema/sample. The catalog forwards supplied consent. Retained tests cover absent/false consent, zero implicit persistence and successful explicit consent for humans and authorized unverified guests. This is a deliberate contract change recorded in task03's report; frontend/HTTP integration remains root-owned.
- The output-schema adjustment changes the two combined output fields without relaxing input validation. The import-equals change leaves qualified TypeScript aliases excluded and does not introduce code execution or network access.

**Cannot verify from this scoped patch:** production deployment, migration of any already-persisted pre-fix share indexes, frontend rollout of the new consent field, or live provider/HTTP behavior. The new pointer layout has no legacy lookup fallback in this patch; if any pre-fix memory shares were deployed, their migration must be handled before rollout. No evidence supplied for this re-review establishes such deployed data, so this is an integration prerequisite conditional on actual persistence rather than a new module defect. Existing saved CGIT lenses require reindexing to gain the newly collected edges, as task04's report explicitly states.
