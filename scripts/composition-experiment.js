// npm run composition            run exp-0002 and write experiments/exp-0002/{record.json,data/*}
// npm run composition -- --quick sizes 1..1000 only, no files written (smoke test)
//
// Runs every section, evaluates the pre-registered criteria mechanically,
// and writes a record whose sections keep observation, transformation,
// hypothesis and uncertainty apart. It writes no interpretation and no
// conclusion.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { hashOf, roundDeep, sha256 } from '../src/core/canonical.js';
import { loadProtocolSchemas } from '../src/core/schema.js';
import { COMPUTE, describeAlgebra } from '../src/compute/algebra.js';
import * as S from './lib/composition.js';
import { handoffExperiment, handoffOutcomes, acspAvailable, DEFAULT_ACSP_DIR } from './lib/handoff.js';

export { handoffOutcomes };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'exp-0002';
const DIR = join(ROOT, 'experiments', ID);

function git(dir) {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0;
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { commit, branch, dirty_worktree: dirty };
  } catch {
    return { commit: null, branch: null, dirty_worktree: null };
  }
}

// ---- hypothesis evaluation ---------------------------------------------------------------------
const H = (id, status, evaluation) => ({ id, status, evaluation });

function evaluate(o, sizes) {
  const out = [];
  {
    const apps = Object.entries(o.examples.nodes).filter(([name]) => /^C[123] /.test(name));
    const fails = apps.flatMap(([name, n]) => {
      const c = n.closure;
      const bad = [];
      if (c.document_kind !== 'resource') bad.push('document kind');
      if (!c.substrate_verify_valid) bad.push('verify');
      if (!c.used_as_operand) bad.push('not used as operand');
      if (!c.cone_verify_valid) bad.push('cone verification');
      return bad.map((b) => `${name}: ${b}`);
    });
    const vocab = o.examples.vocabulary_hash === o.examples.baseline_vocabulary_hash;
    out.push(H('H1', fails.length === 0 && vocab ? 'supported' : 'not_supported', { nodes_checked: apps.map(([n]) => n), failures: fails, vocabulary_hash_unchanged: vocab }));
  }
  out.push(H('H2', o.determinism.identical ? 'supported' : 'not_supported', { identical: o.determinism.identical, events_compared: o.determinism.events_compared }));
  out.push(H('H3', o.equivalence.E1_same_expression_twice.equal.state_hash ? 'supported' : 'not_supported', { equal: o.equivalence.E1_same_expression_twice.equal, differing_record_paths: o.equivalence.E1_same_expression_twice.differing_record_paths }));
  out.push(H('H4', o.equivalence.E5_serialisation.equal_state_hash && o.equivalence.E5_serialisation.bodies_differ ? 'supported' : 'not_supported', o.equivalence.E5_serialisation));
  out.push(H('H5', o.equivalence.E6_irrelevant_metadata.equal_state_hash ? 'supported' : 'not_supported', { equal_state_hash: o.equivalence.E6_irrelevant_metadata.equal_state_hash, differing_record_paths: o.equivalence.E6_irrelevant_metadata.differing_record_paths }));
  {
    const eq = o.equivalence.E3_commutative_permutation.equal;
    const any = ['resource_id', 'state_hash', 'merkle_by_value', 'merkle_by_identity'].filter((f) => eq[f]);
    out.push(H('H6', any.length ? 'supported' : 'not_supported', { identifiers_equal: any, all: eq }));
  }
  {
    const e = o.equivalence.E8_extensional;
    const fields = ['resource_id', 'state_hash', 'merkle_by_value', 'merkle_by_identity'];
    const capturing = fields.filter((f) => e.identifier_equal_in_every_assignment.X1_X2[f] && !e.identifier_equal_in_every_assignment.X1_X3[f]);
    const ok = e.X1_X2_extensionally_equivalent && !e.X1_X3_extensionally_equivalent;
    out.push(H('H7', !ok ? 'indeterminate' : capturing.length ? 'supported' : 'not_supported', { X1_X2_equivalent: e.X1_X2_extensionally_equivalent, X1_X3_equivalent: e.X1_X3_extensionally_equivalent, identifiers_capturing_equivalence: capturing, equality_per_identifier: e.identifier_equal_in_every_assignment }));
  }
  {
    const s = o.sharing;
    const ok = s.shared.resources === 8 && s.shared.evaluations.XOR === 1 && s.pins_of_X.identical;
    out.push(H('H8', ok ? 'supported' : 'not_supported', { resources: s.shared.resources, distinct_nodes: 8, xor_evaluations: s.shared.evaluations.XOR, pins_identical: s.pins_of_X.identical }));
  }
  {
    const g = o.equivalence.H9_triples.groups_with_equal_triple;
    out.push(H('H9', !g.length ? 'indeterminate' : g.every((x) => x.equal_state_hash) ? 'supported' : 'not_supported', { groups: g.length, groups_with_different_state_hash: g.filter((x) => !x.equal_state_hash).length, other_inputs_to_state_hash: o.equivalence.H9_triples.state_hash_inputs_of_an_application.other }));
  }
  {
    const u = o.update['path-copy'];
    const a = JSON.stringify([...u.dependents_via_inbound_index.found].sort()) === JSON.stringify([...u.ground_truth_dependents].sort());
    const b = !u.W_stale && !u.transitively_stale_before_recompute.includes('W');
    const c = u.recompute.created === u.ground_truth_dependents.length && u.original_nodes_still_verify_at_their_versions;
    const d = u.value_unchanged_but_state_hash_changed.length > 0;
    out.push(H('H10', a && b && c && d ? 'supported' : 'not_supported', { a_dependents_match: a, b_W_unaffected: b, c_path_copy_one_per_dependent_and_originals_verify: c, d_value_kept_hash_changed: u.value_unchanged_but_state_hash_changed, locally_stale: Object.entries(u.stale_before_recompute).filter(([, v]) => v.length).map(([k]) => k), transitively_stale: u.transitively_stale_before_recompute }));
  }
  {
    const rows = (f) => o.counts[f].filter((r) => r.n >= 10);
    const lookup = ['chain', 'tree'].every((f) => o.counts[f].every((r) => r.lookup_by_id.reads === 1));
    const ratios = Object.fromEntries(['chain', 'tree'].map((f) => [f, rows(f).slice(1).map((r, i) => r.verify_memo.reads / rows(f)[i].verify_memo.reads)]));
    const ratioOk = Object.values(ratios).flat().every((x) => x >= 8 && x <= 12);
    const treeUpd = rows('tree').map((r) => ({ n: r.n, affected: r.leaf_update_path_copy.affected, expected: Math.ceil(Math.log2(r.n)) }));
    const chainUpd = rows('chain').map((r) => ({ n: r.n, affected: r.leaf_update_path_copy.affected, expected: r.n }));
    const updOk = treeUpd.every((x) => x.affected === x.expected) && chainUpd.every((x) => x.affected === x.expected);
    const complete = sizes.includes(10_000);
    out.push(H('H11', !complete ? 'indeterminate' : lookup && ratioOk && updOk ? 'supported' : 'not_supported', { lookup_one_read_at_every_n: lookup, verify_read_ratios_per_10x: ratios, tree_leaf_update: treeUpd, chain_leaf_update: chainUpd }));
  }
  {
    const t = o.timing;
    if (!t || !sizes.includes(10_000)) out.push(H('H12', 'indeterminate', { reason: 'timing not run at n = 10 and 10000' }));
    else {
      const res = {};
      let ok = true;
      for (const f of ['chain', 'tree']) {
        const rs = t[f].filter((r) => r.n >= 10);
        const at = (n) => rs.find((r) => r.n === n);
        const lookupRatio = at(10_000).lookup_direct_map.median_ms / at(10).lookup_direct_map.median_ms;
        const scan = S.logLogSlope(rs.map((r) => r.n), rs.map((r) => r.dependents_scan.median_ms));
        const index = S.logLogSlope(rs.map((r) => r.n), rs.map((r) => r.dependents_inbound_index.median_ms));
        res[f] = { lookup_ratio_10000_vs_10: lookupRatio, scan_slope: scan, index_slope: index, lookup_ok: lookupRatio <= 3, scan_ok: scan >= 0.8, index_ok: index <= 0.2 };
        ok = ok && res[f].lookup_ok && res[f].scan_ok && res[f].index_ok;
      }
      out.push(H('H12', ok ? 'supported' : 'not_supported', res));
    }
  }
  {
    const p = o.persistence;
    out.push(H('H13', p.state_hashes_identical_after_reload && p.all_nodes_verify_after_reload && p.dependents_identical_after_reload ? 'supported' : 'not_supported', p));
  }
  {
    const hs = o.handoff_outcomes;
    if (!hs) out.push(H('H14', 'indeterminate', { reason: 'ACSP checkout not available; handoff not run' }));
    else {
      const honest = hs.find((r) => !r.fault);
      const A = honest.agents.A;
      const B = honest.agents.B;
      const checks = {
        separate_processes: A.separate_process && B.separate_process,
        B_recomputed_all_checkpoints: B.checkpoints_recomputed.every(Boolean),
        B_verified_A: B.verified && B.verifications.some((v) => v.source === 'session-a' && v.ok),
        B_continued_with_new_node: B.performed.length === 1 && B.performed[0].status === 200,
        ownership_unchanged: honest.owner.owner_session === 'session-owner',
        B_events_capability_only: JSON.stringify(honest.owner.assurance_by_session['session-b']) === '["capability"]',
        B_impersonation_refused: B.impersonation.status === 403,
        faults_detected: hs.filter((r) => r.fault).every((r) => r.agents.B.verified === false && r.agents.B.performed.length === 0 && r.owner.results.some((x) => x.annotations.some((a) => a.kind === 'dispute' && a.by === 'session-b'))),
      };
      out.push(H('H14', Object.values(checks).every(Boolean) ? 'supported' : 'not_supported', checks));
    }
  }
  return out;
}

// ---- transformations ------------------------------------------------------------------------------
function transformations(o) {
  const e = o.equivalence;
  const cmp = (x) => x.equal;
  const commitmentMatrix = {
    'E1 same expression built twice': cmp(e.E1_same_expression_twice),
    'E2 operand resources renamed': cmp(e.E2_operand_renaming),
    'E3 commutative permutation': cmp(e.E3_commutative_permutation),
    'E7 construction order (Y)': { resource_id: e.E7_construction_order.equal.Y.id, value: e.E7_construction_order.equal.Y.value, state_hash: e.E7_construction_order.equal.Y.state_hash, merkle_by_value: e.E7_construction_order.equal.Y.merkle_by_value },
    'E8 extensionally equivalent open expressions (all assignments)': e.E8_extensional.identifier_equal_in_every_assignment.X1_X2,
  };
  const slopes = {};
  for (const f of ['chain', 'tree']) {
    const rs = o.counts[f].filter((r) => r.n >= 10);
    const xs = rs.map((r) => r.n);
    const sl = (sel) => S.logLogSlope(xs, rs.map(sel));
    slopes[f] = {
      construction_writes: sl((r) => r.construction.writes),
      construction_hash_ops: sl((r) => r.construction.hash_ops),
      storage_log_bytes: sl((r) => r.storage.log_bytes),
      verify_memo_reads: sl((r) => r.verify_memo.reads),
      verify_memo_hash_ops: sl((r) => r.verify_memo.hash_ops),
      provenance_reads: sl((r) => r.provenance_reconstruction.reads),
      dependents_index_reads: sl((r) => r.dependents_inbound_index.reads),
      dependents_scan_scanned: sl((r) => r.dependents_scan.scanned),
      leaf_update_affected: sl((r) => Math.max(r.leaf_update_path_copy.affected, 1)),
      bytes_per_node: rs.map((r) => ({ n: r.n, bytes_per_node: r.storage.log_bytes / (r.application_nodes + r.literal_nodes), events_per_node: r.storage.events / (r.application_nodes + r.literal_nodes) })),
      structural_duplicate_fraction: rs.map((r) => ({ n: r.n, fraction: 1 - r.structural_duplicates.distinct_merkle_by_value / Math.max(r.structural_duplicates.applications, 1) })),
    };
  }
  const timingSlopes = {};
  if (o.timing) for (const f of ['chain', 'tree']) {
    const rs = o.timing[f].filter((r) => r.n >= 10);
    const xs = rs.map((r) => r.n);
    const sl = (sel) => S.logLogSlope(xs, rs.map(sel));
    timingSlopes[f] = {
      creation_total: sl((r) => r.creation.total_ms),
      creation_per_node: sl((r) => r.creation.per_node_ms),
      lookup_direct_map: sl((r) => r.lookup_direct_map.median_ms),
      lookup_head_with_state_hash: sl((r) => r.lookup_head_with_state_hash.median_ms),
      retrieval_replay_at_version: sl((r) => r.retrieval_replay_at_version.median_ms),
      retrieval_http_state: sl((r) => r.retrieval_http_state.median_ms),
      validation_single_node_log: sl((r) => r.validation_single_node_log.median_ms),
      validation_full_cone: sl((r) => r.validation_full_cone_ms),
      provenance_reconstruction: sl((r) => r.provenance_reconstruction_ms),
      dependents_inbound_index: sl((r) => r.dependents_inbound_index.median_ms),
      dependents_scan: sl((r) => r.dependents_scan.median_ms),
      hash_index_lookup: sl((r) => r.hash_index_lookup.median_ms),
      search_by_value_scan: sl((r) => r.search_by_value_scan.median_ms),
      update_path_copy: sl((r) => r.update_path_copy_ms),
    };
  }
  return {
    category: 'transformation',
    catalogue: [
      { id: 'identifier-equality', name: 'equality of resource id, value, value hash, PURL state hash, merkle-by-value, merkle-by-identity and head event hash between paired nodes', ref: 'src/compute/commitments.js' },
      { id: 'record-diff', name: 'JSON Pointer paths at which two resource records differ', ref: 'src/compute/commitments.js#differingPaths' },
      { id: 'state-hash-inputs', name: 'partition of an application record into fields fixed by (operation, operand pins, value) and all other fields covered by the state hash', ref: 'src/compute/commitments.js#stateHashInputs' },
      { id: 'log-log-slope', name: 'least-squares slope of log10(metric) on log10(n) over n ≥ 10; slope ≈ 0 constant, ≈ 1 linear, ≈ 2 quadratic', ref: 'scripts/lib/composition.js#logLogSlope' },
      { id: 'structural-duplicates', name: 'fraction of application nodes whose merkle-by-value hash equals an earlier node\'s (what a hash-consing index would deduplicate)', ref: 'scripts/lib/composition.js' },
    ],
    outputs: { commitment_matrix: commitmentMatrix, count_slopes: slopes, timing_slopes: o.timing ? timingSlopes : null },
  };
}

// ---- runner ------------------------------------------------------------------------------------------
export async function executeComposition({ quick = false, handoff = true, timing = true } = {}) {
  const def = JSON.parse(readFileSync(join(DIR, 'definition.json'), 'utf8'));
  const sizes = quick ? def.graphs.sizes.filter((n) => n <= 1000) : def.graphs.sizes;
  const log = (m) => process.stderr.write(`[${ID}] ${m}\n`);
  const o = { category: 'observation' };
  log('examples');
  o.examples = await S.examples();
  log('determinism');
  o.determinism = await S.determinism();
  log('equivalence and invariance');
  o.equivalence = await S.equivalence();
  log('shared subexpression');
  o.sharing = await S.sharing();
  log('dynamic update');
  o.update = await S.dynamicUpdate();
  log('restart persistence');
  o.persistence = await S.persistence();
  log(`operation counts at n = ${sizes.join(', ')}`);
  o.counts = await S.scalingCounts(sizes, def.seed);
  if (timing) {
    log('timing');
    o.timing = await S.timing(sizes, def.seed);
  }
  let handoffRaw = null;
  if (handoff && acspAvailable()) {
    log('ACSP handoff (three runs, separate agent processes)');
    handoffRaw = await handoffExperiment();
    o.handoff_outcomes = handoffOutcomes(handoffRaw);
  } else o.handoff_outcomes = null;

  const hypotheses = evaluate(o, sizes).map((h) => {
    const d = def.hypotheses.find((x) => x.id === h.id);
    return { category: 'hypothesis', id: h.id, statement: d.statement, criterion: d.criterion, status: h.status, evaluation: h.evaluation };
  });
  const tf = transformations(o);
  const excluded = ['observations.timing', 'transformations.outputs.timing_slopes', 'hypotheses[H12].evaluation', 'data/handoff.json (raw agent logs: ports, random ids, times)'];
  const hashed = {
    observations: { ...o, timing: undefined },
    transformations: { ...tf.outputs, timing_slopes: undefined },
    hypotheses: hypotheses.map((h) => (h.id === 'H12' ? { id: h.id } : { id: h.id, status: h.status })),
  };
  const norm = (v) => roundDeep(JSON.parse(JSON.stringify(v ?? null)), 10);
  const outputHash = hashOf(norm(hashed));
  const sectionHashes = Object.fromEntries([...Object.keys(o).filter((k) => k !== 'category' && k !== 'timing').map((k) => [`observations.${k}`, hashOf(norm(o[k]))]), ['transformations', hashOf(norm(hashed.transformations))], ['hypotheses', hashOf(norm(hashed.hypotheses))]]);
  const acspDir = process.env.ACSP_DIR ?? DEFAULT_ACSP_DIR;
  const record = {
    schema: 'purl.composition-record/0.1',
    experiment_id: ID,
    title: def.title,
    question: def.question,
    run: { timestamp: new Date().toISOString(), quick },
    repositories: { purl: { url: def.repositories.purl, ...git(ROOT) }, acsp: { url: def.repositories.acsp, ...git(acspDir), local_path_used: handoffRaw ? acspDir : null } },
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    protocol_versions: { purl: 'PURL/0.1', acsp: 'ACSP/0.1', compute: COMPUTE, task: 'purl.compute.task/0.1', result: 'purl.compute.result/0.1' },
    definition: { file: `experiments/${ID}/definition.json`, sha256: 'sha256:' + sha256(readFileSync(join(DIR, 'definition.json'), 'utf8')), preregistered_in_commit: '007558f' },
    hypothesis: def.question,
    operational_definitions: def.operational_definitions,
    configuration: { seed: def.seed, sizes, graphs: def.graphs, algebra: describeAlgebra(), design_constraints: def.design_constraints, inputs: { examples: 'literals 0 and 1', shared_dag: 'A=0, B=1, C=0, D=0', tree_leaves: `mulberry32(seed + n) < 0.5 ? "0" : "1"`, handoff: 'A=0, B=1; steps C = XOR(A,B), D = XOR(C,B)' } },
    observations: o,
    transformations: tf,
    hypotheses,
    interpretation: { category: 'interpretation', entries: [] },
    uncertainty: {
      category: 'uncertainty',
      notes: [
        'Timing is from one machine and one process, with a shared garbage-collected heap; medians of repeated calls reduce but do not remove noise. Timing is excluded from the output hash and only H12 depends on it.',
        'Operation counts (reads, writes, hash operations, nodes visited, events, bytes) are deterministic for this code; they describe this implementation, not every implementation of the protocols.',
        'Hash operations are counted process-wide via Hash.prototype.digest, so they include hashing done by the PURL store (event hashes, state hashes) as well as by the composition layer.',
        'The in-process StorePort and the HTTP port make the same protocol calls; examples and the E5 serialisation test go over HTTP, the scaling sections go in-process to keep HTTP overhead out of the counts.',
        'The handoff agents are deterministic programs, not language models. They show what the substrate permits and refuses; they say nothing about whether an LLM agent would follow the same procedure.',
        'Merkle-by-value, merkle-by-identity and the hash-consing index are baselines computed outside PURL; they are not PURL properties.',
      ],
    },
    conclusions: { category: 'conclusion', entries: [] },
    independent_agent_analysis: { category: 'interpretation', status: 'pending', file: `experiments/${ID}/independent-analysis.md`, note: 'Attached after the run by a separate agent that receives only the blind packet (experiments/exp-0002/blind/).' },
    unresolved_questions: [],
    raw_data: handoffRaw ? { handoff: { file: `experiments/${ID}/data/handoff.json`, sha256: 'sha256:' + sha256(JSON.stringify(handoffRaw) + '\n'), note: 'SHA-256 of the file bytes' } } : {},
    reproducibility: {
      output_hash: outputHash,
      section_hashes: sectionHashes,
      hashed_sections: ['observations (except timing)', 'transformations.outputs (except timing_slopes)', 'hypothesis statuses (except H12)'],
      excluded_sections: excluded,
      commands: ['npm run composition', 'npm run reproduce -- exp-0002'],
    },
  };
  const errors = loadProtocolSchemas().validate('urn:purl:schema:composition-record', record);
  if (errors.length) throw new Error(`record does not match schema: ${JSON.stringify(errors.slice(0, 5))}`);
  return { record, handoffRaw };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const quick = process.argv.includes('--quick');
  const t0 = Date.now();
  const { record, handoffRaw } = await executeComposition({ quick, handoff: !process.argv.includes('--no-handoff') });
  if (!quick) {
    mkdirSync(join(DIR, 'data'), { recursive: true });
    const prior = (() => { try { return JSON.parse(readFileSync(join(DIR, 'record.json'), 'utf8')); } catch { return null; } })();
    if (prior?.unresolved_questions?.length) record.unresolved_questions = prior.unresolved_questions;
    if (prior?.independent_agent_analysis?.status && prior.independent_agent_analysis.status !== 'pending') record.independent_agent_analysis = prior.independent_agent_analysis;
    writeFileSync(join(DIR, 'record.json'), JSON.stringify(record, null, 1) + '\n');
    if (handoffRaw) writeFileSync(join(DIR, 'data', 'handoff.json'), JSON.stringify(handoffRaw) + '\n');
  }
  console.log(`${ID}: ${((Date.now() - t0) / 1000).toFixed(1)} s, output_hash ${record.reproducibility.output_hash}`);
  for (const h of record.hypotheses) console.log(`  ${h.id.padEnd(4)} ${h.status.padEnd(14)} ${h.statement}`);
}
