# Golden Surface: status and adapter boundary

## Epistemic ledger
* **Observed (source and tests):** the repository is accessible at `b113718`. Relay tests pass with FakePhone (`PHASE 2 OK`). `test_sync_loud` and `test_watchers` fail in this container for environmental reasons (the convergence watcher is not running; Python Playwright is absent).
* **Implemented:** `GoldenAdapter` in the circle (relay client only).
* **Simulated:** every circle↔Golden Surface run used FakePhone. Page text is synthetic.
* **Unresolved:** real WebView behaviour; `seurl://` handling; the authority model's fit with ACSP.

## What exists (from source)

| Area | Status | Where |
|---|---|---|
| browser runtime | Expo React Native, one WebView per tab | `app/src/engine/webview.tsx` |
| tabs, ownership (abed / r / n) | EXISTS | `app/src/state.ts`; relay enforces owner-only driving |
| commands open/read/shot/tap/type/newtab/closetab | EXISTS | `relay/relay.py` `/cmd`; `read` → `{url,title,text}` |
| telemetry | EXISTS | app POSTs state; relay `GET /state` |
| state sync (twin, revs, divergence) | EXISTS | `relay/twin.py`, `docs/SYNC.md` |
| conference bus (Najwa) | EXISTS | `/bus/*` SSE |
| non-web URL schemes | **seam only, by the owner's spec** | `app/src/routing.ts`, `schemes.ts` ("Build nothing behind that seam yet") |
| NAI-CI structures | MISSING | `read` returns text, not affordances/blocks |
| Android/WebView relation | the app is the phone; the relay is a VM service | SPEC.md |
| security boundary | seat tokens, redaction of secret URL params at relay boundary (`6e590b0`), passwords never typed by agents | SPEC.md, relay.py |

## The adapter boundary (implemented)

```
agent ─► circle ─► GoldenAdapter ─HTTP /cmd (Bearer seat token, env only)─► relay ─ws─► phone (FakePhone in tests)
                                                                                     └► WebView opens http(s) circle URL
```

Observed with FakePhone (`experiments/golden/record-1.json`):

| Step | Result |
|---|---|
| newtab as seat r | 200, tab owned by r |
| open circle URL in own tab | 200 |
| read own tab | 200, synthetic text |
| open `seurl://…` | 422 "scheme not supported" |
| drive the pilot's tab | 403 "tab is owned by abed" |
| read the pilot's tab | **200**: relay policy lets any seat read any tab |
| seat token in any URL or response | none |

## Conflicts recorded (not resolved)
1. **Visibility is broader than control.** Any seat reads any tab. This matches
   "awareness does not imply authority", but it is wider than ACSP's per-resource
   capabilities.
2. **Shared sessions by design** (SPEC) versus "no ambient authority" (directive
   §27). A Golden Surface tab can carry the pilot's signed-in sessions. The
   circle never asks the relay to open third-party sites (K-16), and it never
   writes through Golden Surface (K-17).
3. **Fingers are a capability, never a gate** (AMENDMENTS 1) versus ACSP
   owner-resolution. Recorded as constitution clause K-18 (CONFLICTING).

## Hygiene
About 120 Android Gradle build intermediates are committed under
`app/modules/golden-cookies/android/build/`. They are not changed here (not this
bridge's scope). Removing them is a one-line `.gitignore` change for the owner.

## Next
Run the adapter with the real APK and a circle reachable from the phone
(LAN/tunnel). Then decide whether `read` should return NAI-CI structures, or
whether the circle's own `/naici/*` primitives are enough. Fresh participants
B and C needed no NAI-CI calls at all: the JSON `moves` sufficed.
