# ResourceService fix 2 final narrow review

Verdict: **PASS** for the remaining pre-claim quota finding and the narrow helper/caller changes. No unresolved findings remain from this ResourceService review. The ResourceService code-review gate is clear; root retains deployment and broader integration validation.

Reviewed only `service/launch/resources.js:271`–275 (`terminalPendingFailure`) and its permanent-error callers at `:297` and `:300`, the added pre-claim saturation regression, and the corresponding report update. Read retained red evidence `16-red-preclaim-quota.txt` and green evidence `17-green-preclaim-quota.txt`: 27 tests passed, zero failed. No covered suite rerun, implementation edits, network calls, deployment or commits were performed.

The correction resolves the prior P1:

- Permanent rejection when saving the first claim now reaches a compact terminal replacement instead of repeatedly throwing with the job queued. The analogous cancellation branch preserves `cancelled` / `authority_expired` for revoked work.
- The helper uses the originally observed row version in a single CAS update and creates no additional records, resource events or artifacts. A newer competing claim or completion changes that version and prevents stale terminal replacement.
- The replacement drops input/requester/build digest/log metadata, marks `input_omitted:true`, and keeps attempts 0 for work that never claimed. It fits the queued allocation, not merely a larger running allocation. The retained regression exercises actual 10-MiB saturation between admission and first claim with a one-character worker ID, live/revoked authority, terminal size checks and no repeat. The 4096-record case also terminates without new records.
- Transient persistence errors still propagate for later recovery. Existing post-claim lease/token checks remain unchanged. Both callers first exclude ordinary CAS conflicts from the permanent-error path.

One independent uncovered stale-observation probe passed: after observing a queued row, persist a competing running claim and invoke the fallback with the old observation. The helper returned null and preserved the replacement's running status and lease token. Output: `/workspace/consumer-review/resources-fix2-fence-probe.log` (exit 0). This checks the new helper's race fence without rerunning the existing quota tests.

The prior fix-1 conclusions remain: R1 private read scopes, R2 history-cap terminalization, R4 complete resource-specific child selection/replay and R5 continuation schemas are resolved; R3 numeric storage sizing and completion-time terminalization were already resolved and its remaining pre-claim gap is now closed. Physical proposal-shard cleanup remains the explicitly documented root integration obligation, outside this narrow code-review gate.
