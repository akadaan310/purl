"""Measure information loss of each bridge projection with substrateIO's own functions.
stdin: {"boundaries": [{id, pairs: [[y, x], ...], ...meta}]}; loss = H(X | Y) in bits (source given output).
Imports substrate.info from ../substrateIO (read-only)."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'substrateIO'))
from substrate import info  # noqa: E402

req = json.load(sys.stdin)
out = []
for b in req['boundaries']:
    pairs = [(json.dumps(y, sort_keys=True), json.dumps(x, sort_keys=True)) for y, x in b['pairs']]
    n = len(pairs)
    hx = info.entropy(x for _, x in pairs)
    hy = info.entropy(y for y, _ in pairs)
    loss = info.conditional_entropy_pairs(pairs)        # H(X | Y)
    spurious = info.entropy(pairs) - hx                  # H(Y | X): output entropy not explained by the source (should be 0 for a function)
    out.append({k: v for k, v in b.items() if k != 'pairs'} | {
        'n': n, 'H_source_bits': round(hx, 4), 'H_output_bits': round(hy, 4),
        'loss_H_source_given_output_bits': round(loss, 4), 'H_output_given_source_bits': round(spurious, 4),
        'injective_on_sample': loss < 1e-12, 'functional_on_sample': spurious < 1e-12,
        'mm_bias_bound_bits': round(info.miller_madow_bias(len(set(x for _, x in pairs)), n), 4) if n else None,
        'measured_by': 'substrateIO substrate.info.conditional_entropy_pairs'})
json.dump(out, sys.stdout, allow_nan=False)
