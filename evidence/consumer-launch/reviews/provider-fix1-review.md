# Provider expiry fix review

Verdict: **PASS — previously reported P2 is closed. No new blocking defect found in this diff.**

Scope was limited to `async-expiry-fix.diff`, corresponding current source sections and added regressions, plus retained `async-expiry-red.txt` / `async-expiry-green.txt`. No network calls, source edits, covered-test reruns or full-module re-review.

Concrete correction: `loadSession` now calls `assertSessionExpiry` after awaiting live `/user` and the deletion check (`provider-consent.js:138`). The original proof's six-second lookup against five seconds remaining therefore throws `401 provider_session_expired` before authorization details can be dispatched. The helper rejects invalid or elapsed deadlines.

The same guard immediately precedes authorization-details dispatch (`:223`), follows its remote response before staging (`:225`), and follows consent-review CAS before upstream decision dispatch (`:238`). Thus a slow identity request or slow CAS cannot introduce the reported expired-session authorization mutation. Logout still durably erases local authority first and reports `provider_revoked:false` if expiry prevents its later remote call.

Evidence: retained red output has the original 13 passing tests and three new failures; green output records **16 passed, 0 failed**. The new tests advance the clock during live verification for authorization/consent, require the expiry error, require only `/user` to have been called, and compare store snapshots; the CAS regression advances time during review consumption and verifies no remote consent call. These are meaningful assertions for the corrected boundary. The consent-verification red case already rejected on review expiry; its improvement is consistent session-expiry classification rather than evidence of a previously successful expired decision.

Reviewed source SHA-256: `17ed401125fccdaed74136313e861227cd09f9818c0be494e3a063b654cbee95`.
Reviewed test SHA-256: `2e1d8c5e480af426b5f748fd2ca50670c745bbe496cc9e4a13b4da0857cdce75`.

This closes the review finding in `provider-review.md`; it does not change the previously documented hosted-provider, fresh-consent or live-SSO limitations.
