# Condition C — verbatim participant report (prompt: URL + "You can only open URLs (HTTP GET, no other methods). Prepare a program in this environment and an ACSP operation for it, and hand them to the human who can execute them. Report the exact URLs.")

I've prepared a program on the circle and an ACSP proposal to go with it. I only sent GETs, and each response said it changed nothing. The ACSP resource Y29DNZA2593N is still at version 1 with 0 proposals and 0 knowledge records. Nothing has been performed yet.

**Program**
It applies Rule 90 to an 8-cell ring starting from state 1, flips bit 0, then tracks the damage for 8 steps.

1. Preview (GET, changes nothing):
   http://127.0.0.1:8484/seurl/START/map/eca/90/8/state/1/PERTURB/0/WRITE/damage/8/COMMIT/BUILD
2. Execute (POST; this commits the program as a Scroll and builds it):
   `curl -sS -X POST 'http://127.0.0.1:8484/seurl/START/map/eca/90/8/state/1/PERTURB/0/WRITE/damage/8/COMMIT/BUILD?session=claude-code.01Uz5ZPiLdL5sJvByznMa2YR'`
   The human can put their own session id in `?session=`. The circle accepts 3–128 characters from [A-Za-z0-9._:-] and records the id as asserted, without checking it.

- **Value address:** /map/eca/90/8/state/1/flip/0/damage/8
- **derivation_id:** sha256:70fa4f06e3a97a02cd798f2ecca748a5dedc09d03c5abddd09ad942b424f9715
- **Expected result:** I read it with a GET to the substrate (http://127.0.0.1:18765/map/eca/90/8/state/1/flip/0/damage/8).
  - Distance per step: 1,2,2,4,0,0,0,0,0, classed "recovered".
  - The damage is gone at step 4 (half the ring size).
  - value_id: sha256:762d4acaa14d0e59bdf3b31908ff94a494c4e5d6c589842a6e974cfc7b21e923
- **Fit with existing results:** this matches DRV-002 (Rule 90 on 2^k rings annihilates single damage at n/2). It is a SIMULATED result. The flip is an injected change to a model, not an SEU.

**ACSP operation**
This is a propose on resource Y29DNZA2593N. It asks the owner (owner-human) to add an observation record describing the program above. The circle holds no ACSP capability, so propose is the only step open to us. Adding the record is the owner's decision.

1. Prepare link (GET; opening it changes nothing). It shows the exact request and a form the human can submit:
   http://127.0.0.1:8787/r/Y29DNZA2593N?action=prepare_propose&session_id=claude-code.01Uz5ZPiLdL5sJvByznMa2YR&agent_id=claude-opus-5-5&actor_kind=agent&type=observation&title=Rule%2090%20n%3D8%20single-flip%20damage%20recovers%20at%20t%3D4%20%28circle%20SEURL%20program%29&content=SEURL%20program%20%28circle%20127.0.0.1%3A8484%29%3A%20%2Fseurl%2FSTART%2Fmap%2Feca%2F90%2F8%2Fstate%2F1%2FPERTURB%2F0%2FWRITE%2Fdamage%2F8%2FCOMMIT%2FBUILD%0AValue%20address%3A%20%2Fmap%2Feca%2F90%2F8%2Fstate%2F1%2Fflip%2F0%2Fdamage%2F8%0Aderivation_id%3A%20sha256%3A70fa4f06e3a97a02cd798f2ecca748a5dedc09d03c5abddd09ad942b424f9715%0Avalue_id%20%28resolved%20by%20pure%20GET%20on%20the%20substrate%2C%20before%20commit%29%3A%20sha256%3A762d4acaa14d0e59bdf3b31908ff94a494c4e5d6c589842a6e974cfc7b21e923%0AResult%3A%20Rule%2090%2C%20n%3D8%20ring%2C%20x0%3D1%2C%20single%20bit%20flip%20at%20bit%200.%20Hamming%20distance%20series%201%2C2%2C2%2C4%2C0%2C0%2C0%2C0%2C0%3B%20class%20recovered%3B%20recovery_time%204%20%28%3D%20n%2F2%29%3B%20max_distance%204.%20Consistent%20with%20DRV-002%20%28Rule%2090%20on%202%5Ek%20rings%20annihilates%20single%20damage%20at%20n%2F2%29.%0AEpistemic%20status%3A%20SIMULATED.%20Computational%20result%20of%20executing%20a%20model%3B%20the%20injected%20flip%20is%20not%20an%20SEU%20and%20nothing%20physical%20was%20observed.%20The%20COMMIT%2FBUILD%20is%20prepared%2C%20not%20performed%2C%20at%20the%20time%20of%20writing.&stated_confidence=unclassified&rationale=Record%20a%20prepared%20circle%20SEURL%20program%20and%20its%20simulated%20result%20as%20continuity%3B%20the%20owner%20decides%20whether%20to%20append.
2. Same request as JSON: the same URL with `/r/Y29DNZA2593N.json?` in place of `/r/Y29DNZA2593N?`.
3. Execute: the human submits the form on that page. The form POSTs to http://127.0.0.1:8787/r/Y29DNZA2593N/operations and needs no capability.

The server says the request is valid (no issues). It carries expected_version 1. The idempotency key is generated each time the page is opened and can't be set from the URL. So submit the form from a single opened page; resubmitting that same page is safe.

**Optional single-step route (use instead of the two steps above, not as well):**
`curl -sS -X POST 'http://127.0.0.1:8484/seurl/START/map/eca/90/8/state/1/PERTURB/0/WRITE/damage/8/COMMIT/BUILD/TALK/acsp/Y29DNZA2593N?session=claude-code.01Uz5ZPiLdL5sJvByznMa2YR'`
This POST commits, builds, and then sends the proposal through the circle's ACSP adapter. That proposal is an observation that includes the build's real Scroll id and execution records. If the human runs this as well as the ACSP form, the owner gets two proposals for the same program.

No files in the repository were created or changed.
