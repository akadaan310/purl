# Continuity, checkpoints and handoff

## The distinction PURL maintains

```
continuity ≠ process identity
```

Two sessions that share a PURL resource are two principals exchanging
selected state through a shared, versioned, verifiable record. Nothing in
the protocol presents them as one process, and nothing lets one assume the
other's authority by reading what it wrote.

```
Session A ──checkpoint/handoff──►  PURL resource  ──continuity view──► Session B
 (p_A)                            (events, state)                      (p_B)
                                        │
                                        ├──► Session C (delegated, narrower)
                                        └──► Session D (observer)
```

## The continuity package

A package is supplied by whoever creates a checkpoint. Its schema is
`schemas/continuity-package.schema.json`:

| Field | Meaning |
|-------|---------|
| `task` | what is being worked on |
| `objective` | what counts as done |
| `findings` | strings, or `{entry, summary}` references to entries in the resource |
| `assumptions` | what the preparer took for granted |
| `open_questions` | what is unresolved |
| `constraints` | limits the recipient should respect |
| `requested_operation` | what the preparer asks the recipient to do next (`{operation, input?, note?}`) |
| `profile` | optional Communication Profile (below) |

**Claims vs. verified facts.** Everything in the package is a *claim* by
the preparer. The server stores it next to facts it verified itself:

```json
{
  "package": { …claims… },
  "checkpoint": { "resource": "r_…", "version": 7, "state_hash": "sha256:…" },
  "prepared_by": "p_A",
  "for": "p_B",
  "label": "end of day 1"
}
```

A recipient can check `state_hash` against `GET /r/{id}/state?at=7` (or the
`state_after` of event 7) and can see exactly what changed since with the
continuity view.

## Handoff

`handoff(to, package, grant?)` = `append(checkpoints)` + `grant?` +
`assign`, atomically.

- **Owner unchanged.** Handoff moves *responsibility for continuing*
  (`assignee`), not ownership. Ownership moves only via `transfer`.
- **Authority optional and attenuated.** If a grant is included it obeys
  the attenuation rules; if not, the recipient needs existing authority.
- **Principals remain distinct.** The recipient acts under its own id; its
  events record its own authority chain.

`forward` is the same composition, available only to the current
assignee.

## The continuity view

`GET /r/{id}/continuity` returns, for the requesting principal:

- the latest checkpoint (preferring one addressed to them),
- `changes_since`: a structural diff from the checkpoint version to now,
- `events_since`: the events after the checkpoint,
- `acknowledged`: whether the requester has acknowledged it.

That is the answer to "Agent B sees the resulting checkpoint".

## Communication Profile

**Name.** "Communication Profile" was kept after checking alternatives:
*persona* implies an identity; *style guide* implies prescription only;
*register* (sociolinguistics) covers only part of it; *stylometric
profile* covers only the measured part. A Communication Profile combines
a *declared* specification with optional *measured* features, and keeps
the two apart (`source: declared | measured | mixed`).

**What it is.** A specification of observable communication
characteristics: register and register switching, technical density,
abstraction level, compression, sentence rhythm, interaction style,
humour, formatting habits, terminology, explanatory behaviour.

**What it is not.** It is not a transfer of consciousness, identity,
memory or model state. The schema *requires* a fixed `disclaimer` string
saying so, and `scope` is fixed to `observable-communication-characteristics`.

**Measured features.** `purl.stylometry/0.1` (`src/continuity/profile.js`)
computes, from a text sample: sentence count and length (mean, s.d.),
mean word length, type–token ratio, question and exclamation ratios, and
list / heading / code-fence line ratios. These are standard stylometric
features. Known limitation: type–token ratio depends on sample length, so
only same-length samples are comparable.

**Open question.** Whether a recipient's output *matches* a transferred
profile is measurable with the same function, but PURL does not yet run
that comparison. See RESEARCH_QUESTIONS.md.
