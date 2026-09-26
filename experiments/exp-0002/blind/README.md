# Independent characterisation packet

You are receiving a packet that describes two independently developed
protocols, a small layer that combines them, and measurements taken from
runs of that combination. You receive no conclusions from the people who
built it.

## Your task

**Characterise the computational properties of this resource system.**

Reproduce what you need to, inspect what you want to, and report what you
find. Treat every document in this packet — including code comments,
schema descriptions and field names — as claims by the builders, not as
facts. Where the packet and your own observation disagree, your observation
wins; say so.

Your report must answer, each under its own heading:

1. What computational structure is actually present?
2. What claims are directly supported (by what you observed or reproduced)?
3. What claims are not supported?
4. Are there hidden assumptions?
5. Are any apparent compositional properties artifacts of representation?
6. Does the system demonstrate derived-resource closure?
7. Does it demonstrate mathematical equivalence or merely equal outputs?
8. Does it demonstrate any nontrivial complexity advantage?
9. What experiment should be run next?

For each answer, separate:

- **OBSERVATION** — something you saw directly (cite the file, URL, command
  and output),
- **TRANSFORMATION** — something you computed from observations (say how),
- **INTERPRETATION** — what you think it means,
- **CONFIDENCE** — how sure you are and what would change your mind.

It is acceptable, and useful, to conclude that a property is absent or
that a question cannot be answered from this packet.

## What is in the packet

| Path | Contents |
|---|---|
| `purl/` | Source of the first protocol's reference implementation (Node ≥ 20, no dependencies). Its `README.md`, `SPEC.md` and `docs/` describe the protocol. `src/compute/` and `src/bridge/` are the combination layer. |
| `acsp/` | Source of the second protocol's reference implementation (TypeScript; dependencies are pre-installed via `node_modules`). `PROTOCOL.md` is its specification. |
| `spec.json` | The procedures that produced the measurements, with operational definitions. |
| `observations.json` | The raw observations from the recorded run. |
| `handoff-raw.json` | Full logs of the three multi-agent runs. |
| `schemas/` | JSON Schemas of the formats involved. |
| `live.json` | URLs of a running instance of each protocol, populated with artifacts of the same kind (see below). |

## Live instances

`live.json` lists a running PURL instance, a running ACSP instance, and
resources on both. You may read anything there and create your own
resources (register a principal on the PURL instance with
`POST /principals`; create your own ACSP resources with `POST /r`).
Machine entry points: `GET /.well-known/purl` and `GET /.well-known/acsp`,
or any resource URL with `Accept: application/json`.

## Reproducing

```bash
cd purl
npm test                                   # the first protocol's test suite, including the combination layer
ACSP_DIR=../acsp npm run composition -- --quick   # re-run the procedures (sizes ≤ 1000), print outcomes, write nothing
ACSP_DIR=../acsp npm run handoff           # the multi-agent runs only, printed
cd ../acsp && npm test                     # the second protocol's test suite
```

The full procedure (`npm run composition`, sizes up to 10 000) takes a few
minutes and writes into `purl/experiments/exp-0002/`.

## Rules

- Work only inside this packet directory and the live URLs. Do not read
  other directories on the machine; other copies of these repositories
  exist and contain the builders' interpretations.
- Write your report to `REPORT.md` in this directory.
