#!/usr/bin/env python3
"""Isolated toy-model experiments for the PURL x CGT x GiN commission.
Python standard library only. These are NOT tests of the actual PURL service.
Run: python experiments/commission_checks.py --write
     python -m unittest discover -s experiments -p 'commission_checks.py' -v
"""
from __future__ import annotations
from dataclasses import dataclass
from collections import Counter
import hashlib
import itertools
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parent

def canon(x):
    return json.dumps(x, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def digest(x):
    return hashlib.sha256(canon(x).encode()).hexdigest()

def toggle_trace(start: int, steps: int):
    assert start in (0, 1) and steps >= 0
    return [start ^ (i % 2) for i in range(steps + 1)]

def cycle_trace(start: str, steps: int):
    states = ('007', '070', '700')
    assert start in states
    p = states.index(start)
    return [states[(p + i) % 3] for i in range(steps + 1)]

@dataclass(frozen=True)
class Op:
    name: str
    source: str
    target: str
    effect: frozenset[str] = frozenset()
    rights: frozenset[str] = frozenset()

@dataclass(frozen=True)
class Prog:
    source: str
    target: str
    names: tuple[str, ...]
    effect: frozenset[str]
    rights: frozenset[str]

def lift(op: Op):
    return Prog(op.source, op.target, (op.name,), op.effect, op.rights)

def ident(t: str):
    return Prog(t, t, (), frozenset(), frozenset())

def then(x: Prog, y: Prog):
    if x.target != y.source:
        raise TypeError(f'cannot compose {x.target} -> {y.source}')
    return Prog(x.source, y.target, x.names + y.names, x.effect | y.effect, x.rights | y.rights)

def authorised(program: Prog, granted: set[str]):
    return program.rights <= frozenset(granted)

OPS = (
    Op('parse', 'Raw', 'AST'),
    Op('typecheck', 'AST', 'Checked'),
    Op('eval', 'Checked', 'Value'),
    Op('persist', 'Value', 'Value', frozenset({'mutation'}), frozenset({'write'})),
    Op('render', 'Value', 'View'),
)

def compile_ops(ops):
    if not ops:
        raise ValueError('empty program needs explicit identity type')
    out = lift(ops[0])
    for op in ops[1:]:
        out = then(out, lift(op))
    return out

# A deterministic reducer can replay a set of events if its semantics and inputs are known.
def reduce_event(state: int, event: dict):
    if event['op'] == 'add':
        return state + event['amount']
    if event['op'] == 'mul':
        return state * event['amount']
    raise ValueError('unknown or external operation: replay cannot be certified')

def replay(initial, events):
    state = initial
    for event in events:
        state = reduce_event(state, event)
    return state

def projection_congruence(states, delta, proj):
    """Necessary & sufficient condition for a deterministic quotient transition."""
    failures = []
    for s in states:
        for t in states:
            if proj(s) == proj(t) and proj(delta(s)) != proj(delta(t)):
                failures.append([list(s), list(t)])
    return not failures, failures

# Static resource manifestation; does not make a real HTTP request.
MISSION = {
    'protocol': 'commission-toy/0',
    'kind': 'mission',
    'id': 'toy-mission',
    'source': {'kind': 'typed-ast', 'steps': ['parse','typecheck','eval','persist']},
    'state': {'version': 4, 'completed': ['parse','typecheck'], 'next': 'eval'},
    'operations': [
        {'name': op.name, 'source': op.source, 'target': op.target,
         'effects': sorted(op.effect), 'requires': sorted(op.rights)}
        for op in OPS],
    'checkpoint': {'version': 4, 'claim': 'ready-to-eval'},
    'authority': {'public_can': ['discover'], 'writer_requires': 'write'},
    'artifacts': [{'type': 'test-output', 'hash': 'example:toy-unverified'}],
}

def fresh_client(manifest):
    assert manifest['kind'] == 'mission'
    names = {o['name']: o for o in manifest['operations']}
    next_op = manifest['state']['next']
    desc = names[next_op]
    return {'id': manifest['id'], 'version': manifest['state']['version'],
            'next': next_op, 'next_source': desc['source'],
            'requirements': desc['requires'], 'artifact_count': len(manifest['artifacts']),
            'authenticated': False}

def run_experiments():
    # E1: for each fixed n, initial toggle bit determines the entire trace.
    toggle_counts = {str(n): len({tuple(toggle_trace(s,n)) for s in [0,1]}) for n in range(9)}
    # Independent, externally supplied binary delta labels can distinguish 2^n histories per initial state.
    annotated_counts = {str(n): 2*(2**n) for n in range(9)}
    # E2: one of three start states completely determines a fixed-length trace.
    cycle_counts = {str(n): len({tuple(cycle_trace(s,n)) for s in ('007','070','700')}) for n in range(9)}
    # E3: enumerated typed composition. This is a reference toy checker vs a permissive baseline.
    triples = list(itertools.product(OPS, repeat=3))
    well_typed = []
    ill_typed = []
    for ts in triples:
        try:
            prog = compile_ops(ts)
            well_typed.append({'sequence':[op.name for op in ts], 'needs': sorted(prog.rights)})
        except TypeError:
            ill_typed.append(tuple(op.name for op in ts))
    valid_but_missing_rights = sum(bool(x['needs']) for x in well_typed)
    # E4: address/source/runs are not value identities.
    examples = []
    for expr,path,run in [(('add',1,2), '/x/add/1/2','run-A'),(('add',2,1), '/x/add/2/1','run-B')]:
        examples.append({'address_id':digest(path), 'derivation_id':digest({'term':expr,'semantics':'toy-v1'}),
                         'value_id':digest({'type':'int','value':sum(expr[1:])}),
                         'execution_id':digest({'run':run,'term':expr,'environment':'toy-v1'})})
    # E5: replay counterexample: external read not deterministic from op label alone.
    pure_events=[{'op':'add','amount':4},{'op':'mul','amount':3}]
    # E6: one-machine-readable-object offline reconstruction only.
    client=fresh_client(MISSION)
    # Projection obstruction: keep first bit only; swap is not well-defined on quotient.
    states=list(itertools.product((0,1),repeat=2))
    congruent,bad_pairs=projection_congruence(states,lambda s:(s[1],s[0]),lambda s:s[0])
    # Compare good projection for bitwise first-bit toggle.
    congruent_good,bad_good=projection_congruence(states,lambda s:(1-s[0],s[1]),lambda s:s[0])
    # Rehashed tampered event chain can internally validate: no external trust anchor.
    history=[{'version':1,'payload':'alpha','prev':None}]
    history[0]['hash']=digest({k:v for k,v in history[0].items() if k!='hash'})
    bad_history=[{'version':1,'payload':'beta','prev':None}]
    bad_history[0]['hash']=digest({k:v for k,v in bad_history[0].items() if k!='hash'})
    return {
      'scope':'toy-model checks; not production repository test execution',
      'E1':{'fixed_n_toggle_traces':toggle_counts, 'binary_external_annotation_upper_family':annotated_counts,
            'observation':'unbounded trace lengths do not make a bare toggle Turing-complete'},
      'E2':{'fixed_n_three_cycle_traces':cycle_counts, 'sample':cycle_trace('007',6)},
      'E3':{'tested_op_triples':len(triples),'well_typed':len(well_typed),'ill_typed':len(ill_typed),
            'well_typed_needing_write':valid_but_missing_rights,
            'permissive_baseline_false_acceptances_vs_declared_types':len(ill_typed),
            'reference_typed_checker_false_acceptances_vs_declared_types':0,
            'limitation':'the declared type rules also define the test oracle; no production comparison'},
      'E4':{'expressions':examples,'same_value_id':examples[0]['value_id']==examples[1]['value_id'],
            'same_derivation_id':examples[0]['derivation_id']==examples[1]['derivation_id']},
      'E5':{'initial':2,'pure_trace':pure_events,'replay_result':replay(2,pure_events),
            'external_read_replayable_without_input_capture':False},
      'E6':{'offline_client_view':client,'cross_provider_http_trial':'NOT RUN',
            'reason':'no live program URL, identity registration, independent provider test or permissioned worker supplied'},
      'E7':{'baseline':'blind acceptance of all operation sequences',
            'checker':'type/rights declaration model; measured in E3',
            'production_accuracy_and_cost':'NOT RUN'},
      'extra':{'projection_quotient_congruent_swap_first':congruent,
               'obstructing_pair_count':len(bad_pairs),
               'first_obstructing_pair':bad_pairs[0],
               'projection_quotient_congruent_first_bit_toggle':congruent_good,
               'hash_chain_rewritten_has_different_root':history[0]['hash']!=bad_history[0]['hash'],
               'rewritten_chain_locally_valid':bad_history[0]['hash']==digest({k:v for k,v in bad_history[0].items() if k!='hash'})}
    }

class CommissionChecks(unittest.TestCase):
    def test_toggle_periodic(self):
        for s in (0,1):
            for n in range(101):
                self.assertEqual(toggle_trace(s,n)[-1],s^(n%2))
    def test_two_fixed_length_toggle_traces(self):
        for n in range(20):
            self.assertEqual(len({tuple(toggle_trace(s,n)) for s in (0,1)}),2)
    def test_007_cycle(self):
        self.assertEqual(cycle_trace('007',6),['007','070','700','007','070','700','007'])
    def test_007_cycle_fixed_count(self):
        for n in range(20):
            self.assertEqual(len({tuple(cycle_trace(s,n)) for s in ('007','070','700')}),3)
    def test_composition_associativity(self):
        for a,b,c in itertools.product(OPS,repeat=3):
            if a.target == b.source and b.target == c.source:
                self.assertEqual(then(then(lift(a),lift(b)),lift(c)),then(lift(a),then(lift(b),lift(c))))
    def test_identity(self):
        for a in OPS:
            self.assertEqual(then(ident(a.source),lift(a)),lift(a))
            self.assertEqual(then(lift(a),ident(a.target)),lift(a))
    def test_bad_composition_rejected(self):
        with self.assertRaises(TypeError): then(lift(OPS[0]),lift(OPS[-1]))
    def test_rights(self):
        p=compile_ops((OPS[2],OPS[3]));self.assertFalse(authorised(p,set()))
        self.assertTrue(authorised(p,{'write'}))
    def test_effects_union(self):
        p=compile_ops((OPS[2],OPS[3],OPS[-1]));self.assertEqual(p.effect,frozenset({'mutation'}))
    def test_equal_values_not_equal_terms(self):
        ex=run_experiments()['E4'];self.assertTrue(ex['same_value_id']);self.assertFalse(ex['same_derivation_id'])
    def test_pure_replay(self):
        events=[{'op':'add','amount':4},{'op':'mul','amount':3}];self.assertEqual(replay(2,events),18)
    def test_replay_unknown_rejected(self):
        with self.assertRaises(ValueError):replay(0,[{'op':'external_fetch','url':'x'}])
    def test_bootstrap(self):
        view=fresh_client(json.loads(canon(MISSION)));self.assertEqual(view['next'],'eval')
        self.assertFalse(view['authenticated'])
    def test_projection_not_congruent(self):
        X=list(itertools.product((0,1),repeat=2))
        c,_=projection_congruence(X,lambda s:(s[1],s[0]),lambda s:s[0]);self.assertFalse(c)
    def test_projection_congruent(self):
        X=list(itertools.product((0,1),repeat=2))
        c,_=projection_congruence(X,lambda s:(1-s[0],s[1]),lambda s:s[0]);self.assertTrue(c)
    def test_local_rehash_not_independent_authentication(self):
        a={'prev':None,'payload':1};a['hash']=digest(a)
        b={'prev':None,'payload':2};b['hash']=digest(b)
        self.assertNotEqual(a['hash'],b['hash'])
        self.assertEqual(b['hash'],digest({k:v for k,v in b.items() if k!='hash'}))
    def test_determinism(self):
        self.assertEqual(canon(run_experiments()),canon(run_experiments()))

if __name__=='__main__':
    if '--write' in sys.argv:
        result=run_experiments()
        dest=ROOT/'results.json'
        dest.write_text(json.dumps(result,indent=2,ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
        print(f'Wrote {dest} ({len(result)} categories)')
    else:
        unittest.main()
