# Minimal cold discovery and SDK CSRF review

**PASS. Both reported defects are addressed; no new finding in this narrow diff.**

Reviewed `git diff 7076f3c -- service/launch/resources.js sdk/launch.js test/launch/http.test.js test/launch/sdk.test.js`, plus the existing endpoint/security interfaces needed to check the added links and CSRF selection. No covered suites were rerun, and no implementation changes, commits, network requests or deployments were made.

- The resource manifest now advertises its four already implemented child collections: `executions`, `artifacts`, `builds` and `releases`. URLs use the existing resource root and URL helper. This adds discovery only; collection authorization, data selection and mutation rules are unchanged. The strengthened HTTP test follows all four advertised links, requires HTTP 200 and array results, and retains its final store-equality assertion for read purity.
- The SDK keeps bootstrap CSRF separately from session CSRF. Canonical identity-config responses update `bootstrapCsrf`; guest/session responses update `csrf`. Login, guest and recovery requests select the bootstrap value, while resource mutations continue using the session value. Thus repeated preview and later config discovery no longer replace the token bound to the active session cookie. Exact-origin checking, manual redirect denial, cookie handling and bearer handling are unchanged. The strengthened real HTTP/SDK scenario repeats preview, fetches config, then successfully forks and completes the existing build/run/publish/checkpoint flow.

Inspected `evidence/consumer-launch/http/red-cold-discovery-csrf.log`: **6 passed, 2 failed**, specifically missing collection links and `403 csrf_required`. Inspected `green-cold-discovery-csrf.log`: **8 passed, 0 failed**. These are retained implementation-team results, not fresh reviewer execution.

The diff changes manifest metadata and the shipped client only; it does not change worker execution, queue semantics or stored program formats. Two API redeployments can ship the updated manifest/client without redeploying the worker for this fix. Root owns deployment and public cold-session readback; no claim about those future results is made here.
