// exp-0002: mechanical evaluation of the pre-registered criteria in
// experiments/exp-0002/definition.json against the observations. Kept apart
// from the runner so that a blind copy of the apparatus can omit it.
import * as S from './composition.js';

const H = (id, status, evaluation) => ({ id, status, evaluation });

export function evaluate(o, sizes) {
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

