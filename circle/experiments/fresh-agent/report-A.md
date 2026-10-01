# Condition A — verbatim participant report (prompt: the URL only)

The circle server at http://127.0.0.1:8484/ is up and healthy. I only sent GET requests, so nothing was changed.

**What it is:** a Node process running `node scripts/circle.js` from /home/user/purl, PID 5342, started at 10:51. Its log is at /tmp/claude-0/-home-user/8b8e240d-b3ec-5c55-b461-493fa041ea40/scratchpad/circle.log. It was started with:
- `SUBSTRATE_DIR=/home/user/substrateIO`
- `ACSP_BASE=http://127.0.0.1:8787`
- `ACSP_RESOURCE=Y29DNZA2593N`
- `PURL_DATA_DIR` set to a `fresh-purl` folder in the scratchpad

The root URL returns a JSON entry document. Its protocol is "circle/0 (provisional)" and it lists seven verbs: START, SWITCH, WRITE, COMMIT, BUILD, TALK, PERTURB. The rule it states: GET any URL to see what it would do, POST the same URL to do it, and any change needs `?session=<id>`.

**Backends:**
| Backend | Address | Process | State |
|---|---|---|---|
| substrate | 127.0.0.1:18765 | `python3 -m tools.purl_server` (PID 5349), store at /tmp/circle-substrate-rcDs0n | answers 200 |
| ACSP | 127.0.0.1:8787 | `tsx scripts/serve-local.ts` in /home/user/NetGovComEduGovOrgEduGovComNet | answers 200 |
| purl/0.1 | 127.0.0.1:46239 | — | listed only |
| golden-surface | — | — | listed only, marked `configured: false` |

**Read-only pages:** all 12 return 200 with valid JSON:
- `/constitution` (version 1, `sha256:319402d8…`)
- `/operations`
- the START session page
- the example program page (`/seurl/START/map/eca/90/8/state/5/WRITE/next/WRITE/orbit/COMMIT/BUILD`)
- `/scrolls`, `/aliases`, `/state`, `/conformance`, `/checkpoints`, `/adapters`
- `/naici/legal?url=/`
- `/acsp/r/Y29DNZA2593N`

**Not yet run:** no conformance check has been recorded (`/conformance` says `"run": null`). It would be run with `POST /conformance/runs?session=<id>`, which creates test artifacts.

The request was only the URL, so I just checked what is there. If something else was meant, such as running conformance or a POST program, it needs a session id.
