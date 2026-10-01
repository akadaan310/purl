# Security findings (STASIS-3)

Each finding states what was done to establish it. Nothing here was tested
against a live third-party or production service. Live ACSP
(acsp-one.vercel.app) was only read, never written: that is an authority boundary.

| id | finding | evidence | status | severity (scope) |
|---|---|---|---|---|
| SF-1 | **MUSA ramz seal is forgeable by anyone.** `seal = sha256("golden" \| from \| to \| idstamp \| body)`. The "key" is a public constant, so whoever can read the code can re-seal any edited envelope | reproduced 2026-10-01: an envelope's body changed to `pay 1000` and re-sealed with `_seal` passes `unfold` | OPEN. MUSA is a specification artifact, so the fix (HMAC with a secret, or a signature) is the owner's decision. Not used by the bridge | high for anything relying on it; none for the bridge |
| SF-2 | **Owner authority can rewrite a scroll's program in place.** PURL grants allow it; the bridge constitution (K-12) forbids it | `experiments/axes/record-2.json` (quadrant non-conformant ∧ authorized). Detected only by the conformance check `scroll_program_immutable`, and only on a new run | DETECTED, not prevented: prevention would need PURL support (immutable fields), which is outside the bridge | medium: integrity of recorded programs |
| SF-3 | **Stale evidence looks current.** After SF-2's rewrite, the latest conformance run still said `passed` | axes record-2 (evidence axis) | OPEN: data staleness is not detected automatically. `implementation_id` is recorded; a data fingerprint is not | medium |
| SF-4 | **ACSP proposal-queue exhaustion.** Propose needs no capability; a resource accepts at most 100 pending proposals; anonymous requests are limited per IP per hour. A participant (or a retrying client) can fill a resource's queue and block legitimate proposals until the owner resolves them | observed **locally** by accident: EXP-PROGRAM-MODEL-1 record-4 reached `422 limit_exceeded` through retries. Limits read from ACSP code (`env.ts`) | OPEN; reported, not tested live (authority boundary). The circle no longer resends partial POSTs (PM-F3) | medium (availability of a shared resource) |
| SF-5 | **`GET /ws` on the Golden Surface relay upgrades to a bidirectional command channel**, so "GET is safe" cannot be decided by method alone | route table extracted into the manifest (`components[golden-surface]`) | DECLARED as an exception in the manifest; the relay requires a seat token | low (documented) |
| SF-6 | **Sessions are asserted, not authenticated.** Author attribution of circle records can be claimed by anyone | by design (K-04, recorded as `assurance: asserted`) | ACCEPTED, declared everywhere it appears | low (declared) |
| SF-7 | **Evidence named the wrong code.** `implementation_id` hashed files on disk at request time, not the loaded code | EXP-DOGFOOD-3 record-1 | FIXED (e8eaf36), differential test `implementation-id.test.js` | medium (evidence integrity) |
| SF-8 | **Failures were masked.** A PURL 429 became a 502, and list errors returned `[]` | EXP-PROGRAM-MODEL-1 record-1 | FIXED (bd0d280), `purl-limit.test.js` | low/medium (K-10) |
| SF-9 | **Excluded, not removed:** the golden-surface engine branch has `POST /bridge` with a pluggable decider (an agent loop in the relay) | code reading (STASIS-2) | EXCLUDED from the bridge; not executed | — |

Held boundaries, each with its check:
* credentials never in URLs: `credentials_in_url_refused`;
* capabilities never logged: the circle holds none, and the R9 proxy logs no headers or bodies;
* passwords never leave the phone: the relay `read` returns `{url, title, text}`, with FakePhone-tested scope only;
* TALK stops at propose: `talk_stage_never_committed`;
* no automation of third-party AI providers: Q-014 stays human-mediated.
