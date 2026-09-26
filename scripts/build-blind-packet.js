// Assemble the blind packet for an independent agent (exp-0002, deliverable F).
//
//   node scripts/build-blind-packet.js <dir> [live.json]
//
// The packet holds both repositories at their current commits (git archive:
// no history), minus everything that states the builders' hypotheses or
// interpretations: the pre-registered definition, the record, the report,
// the hypothesis evaluator and the composition test files (whose names state
// expected outcomes). It adds a neutral procedure specification, the raw
// observations and raw handoff logs.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ACSP_DIR } from './lib/handoff.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? 'blind-packet');
const live = process.argv[3];
const acspDir = process.env.ACSP_DIR ?? DEFAULT_ACSP_DIR;
const EXP = join(ROOT, 'experiments', 'exp-0002');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'purl'), { recursive: true });
mkdirSync(join(out, 'acsp'), { recursive: true });
execSync(`git archive HEAD | tar -x -C ${JSON.stringify(join(out, 'purl'))}`, { cwd: ROOT, shell: '/bin/sh' });
execSync(`git archive HEAD | tar -x -C ${JSON.stringify(join(out, 'acsp'))}`, { cwd: acspDir, shell: '/bin/sh' });
if (existsSync(join(acspDir, 'node_modules'))) symlinkSync(join(acspDir, 'node_modules'), join(out, 'acsp', 'node_modules'));

const WITHHELD = ['experiments/exp-0002', 'scripts/lib/composition-hypotheses.js', 'test/compute.test.js', 'test/bridge.test.js', 'docs/composition.md'];
for (const p of WITHHELD) rmSync(join(out, 'purl', p), { recursive: true, force: true });

const def = JSON.parse(readFileSync(join(EXP, 'definition.json'), 'utf8'));
const spec = {
  id: 'exp-0002',
  title: 'Procedures that produced observations.json',
  seed: def.seed,
  repositories: def.repositories,
  design_constraints: def.design_constraints,
  operational_definitions: def.operational_definitions,
  graphs: def.graphs,
  procedures: {
    examples: 'Over HTTP to a deterministic PURL store: literals 0 and 1, then C1..C3, CONCAT, HASH, XOR of hashes, NOT, OR. For each node: resource document, manifest, substrate verify, lineage inbound relations, cone verification.',
    determinism: 'The example chain built twice in fresh deterministic stores; node triples and every event hash compared.',
    equivalence: 'E1 same expression twice; E2 distinct operand resources with equal values; E3 operand order swapped; E4 five closed forms of value 1; E5 one literal state submitted as two byte-different JSON bodies to two fresh stores over HTTP; E6 a literal with and without an extra state field; E7 a four-node graph built in two orders; E8 three open expressions over two mutable literals, re-evaluated in place for all four assignments. Identifiers compared: resource id, value, value hash, PURL state hash, merkle-by-value, merkle-by-identity, head event hash. H9_triples groups applications by (operation, operand pin state hashes, value).',
    sharing: 'A,B,C,D literals; X = XOR(A,B); Y = AND(X,C); Z = OR(X,D); W = AND(C,D); compared with the same expressions built with two separate copies of XOR(A,B). Storage, evaluations, pins, verification with and without memoisation.',
    update: 'On the same graph, A is updated from 0 to 1, then dependents are found (inbound index and scan), local and transitive staleness recorded, and dependents recomputed by path copying (new resources, supersedes links) or in place (update + new links).',
    persistence: 'The same graph built on a store persisting to a data directory; a second store loads the directory.',
    counts: 'Deterministic operation counts for chain and tree families at each n: construction, lookup by id, cone verification with and without memoisation, provenance walk, dependents via index and via scan, leaf update by path copying, structural duplicates by merkle-by-value.',
    timing: 'Wall-clock medians for the same families and sizes, one machine, one process.',
    handoff_outcomes: 'Three runs of an owner, Agent A and Agent B (separate OS processes) on one PURL and one ACSP instance: honest; Agent A misreports its value on ACSP; Agent A records a wrong value in its PURL node. Normalised outcomes; raw logs in handoff-raw.json.',
  },
};
writeFileSync(join(out, 'spec.json'), JSON.stringify(spec, null, 1) + '\n');
// The runner reads experiments/exp-0002/definition.json: give the blind copy the neutral spec.
mkdirSync(join(out, 'purl', 'experiments', 'exp-0002'), { recursive: true });
writeFileSync(join(out, 'purl', 'experiments', 'exp-0002', 'definition.json'), JSON.stringify({ ...spec, title: 'exp-0002 (blind copy)' }, null, 1) + '\n');

const record = JSON.parse(readFileSync(join(EXP, 'record.json'), 'utf8'));
writeFileSync(join(out, 'observations.json'), JSON.stringify({ run: record.run, repositories: record.repositories, environment: record.environment, protocol_versions: record.protocol_versions, configuration: { seed: record.configuration.seed, sizes: record.configuration.sizes, algebra: record.configuration.algebra, inputs: record.configuration.inputs }, observations: record.observations, section_hashes_of_recorded_run: Object.fromEntries(Object.entries(record.reproducibility.section_hashes).filter(([k]) => k !== 'hypotheses')) }, null, 1) + '\n');
copyFileSync(join(EXP, 'raw', 'handoff.json'), join(out, 'handoff-raw.json'));
mkdirSync(join(out, 'schemas'));
for (const f of readdirSync(join(ROOT, 'schemas'))) copyFileSync(join(ROOT, 'schemas', f), join(out, 'schemas', f));
copyFileSync(join(EXP, 'blind', 'README.md'), join(out, 'README.md'));
if (live) copyFileSync(live, join(out, 'live.json'));
console.log(`blind packet written to ${out}`);
