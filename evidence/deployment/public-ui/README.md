# Live public browser verification

**PASS** — 2026-10-18, source `0670baddefba9635af8fc71c3b96c85960227315`, Chromium `156.0.8078.4`, against <https://purl-api-production.up.railway.app>.

Desktop (1440 × 1000) and Chromium Pixel 5 Android emulation each passed:

- Native clipboard copy from the capsule surface, Enter and Space; Android verified an actual `touch` pointer event. Copy preserved navigation, and the separate Open control preserved a clipboard sentinel.
- Native clipboard permission denial through Chromium `Browser.setPermission`, followed by a visible manual-copy dialog with the full canonical URL selected. No clipboard API mock was used.
- One private program created, compiled, built with its declared test passing, executed by the public worker with output `18`, published as an immutable release, and checkpointed. Graph, history and result artifact controls also passed.
- `/`, `/explore`, `/create`, `/p/godseed-mission`, `/observatory`, and `/docs`: zero axe violations and no horizontal overflow on each device. Reduced motion was enabled. No page or console errors occurred.

The run made **14 POSTs**, serially, with **zero HTTP errors or 429 responses**. The discovery document reported Supabase persistence and arbitrary-code execution disabled. Existing UI screenshots, visual baselines, product code and tests were not modified.

| Observation | Desktop | Android emulation |
| --- | ---: | ---: |
| Landing first contentful paint | 292 ms | 564 ms |
| Landing load event | 283.7 ms | 572 ms |
| Run click to observed successful worker output | 12,144 ms | 33,613 ms |

These are single navigation samples from an unthrottled browser with a warm connection, not cold-start, load-test or performance-advantage measurements. Android emulation does not establish physical handset behavior. The worker timings include public network, queue, persistence and polling delays.

`report.json` contains exact program/build/execution/artifact/release/checkpoint IDs and per-route measurements. `raw-http.jsonl` preserves public HTTP responses with credential fields redacted; Authorization headers were never recorded. `output.txt` records the harness result. PNGs show the public landing, IDE, mission and native-denial fallback on both devices. `manifest.json` hashes the evidence files.

The two browser-created programs are private and owned by the test guest principals. The evidence records their observed responses without retaining browser bearer tokens.

The harness is `verify.mjs`. To reproduce, preserve this completed directory first, then run `node evidence/deployment/public-ui/verify.mjs` from the repository root. It creates two new private resources and needs the deployed API and worker. It does not compare the changed public dataset with local visual baselines.
