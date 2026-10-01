"""Measure how well the proposed 12-field term schema fits the actual substrateIO registry.
Writes circle/nomenclature/schema-fit.json. Read-only over ../substrateIO."""
import json, os, re, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = os.path.join(ROOT, '..', 'substrateIO', 'research', 'registries', 'nomenclature.json')
terms = json.load(open(REG))
def nonempty(v): return v not in (None, '', [], {})
# directive field -> registry field(s) that could carry it
MAP = {
 'NAME': ['canonical_name'], 'DOMAIN/DERIVATION': ['source_disciplines', 'parent_concepts'], 'DEFINITION': ['definition'],
 'OPERATION': [], 'INPUT': [], 'OUTPUT': [], 'INVARIANTS': [], 'VALIDATION METHOD': [],
 'EVIDENCE': ['evidence'], 'IMPLEMENTATION': [], 'HISTORY': ['first_introduction', 'revision_history'],
 'RELATED TERMS': ['related_concepts', 'competing_terms', 'established_terms'],
 # fields the registry has that the schema lacks
 'notation': ['notation'], 'examples': ['examples'], 'counterexamples (non-examples)': ['counterexamples'], 'status': ['status'], 'term_class': ['term_class'],
}
by_cat = collections.defaultdict(list)
for t in terms: by_cat[t.get('category', '?')].append(t)
def cover(ts, fields): return round(sum(any(nonempty(t.get(f)) for f in fields) for t in ts) / len(ts), 3) if fields else 0.0
out = {'registry_terms': len(terms), 'categories': {c: len(v) for c, v in sorted(by_cat.items())},
       'coverage_all': {k: cover(terms, f) for k, f in MAP.items()},
       'coverage_by_category': {c: {k: cover(ts, f) for k, f in MAP.items()} for c, ts in sorted(by_cat.items())},
       'unmapped_schema_fields': [k for k, f in MAP.items() if not f]}
# operational content hidden in free text: how many definitions/notes name an operation, a route or a check?
op_re = re.compile(r'(/[a-z]+/|POST|GET|\(\)|test_|check|route)', re.I)
out['terms_whose_text_mentions_an_operation'] = sum(bool(op_re.search((t.get('definition','') or '') + ' ' + (t.get('note','') or ''))) for t in terms)
# purl NOMENCLATURE.md uses a different schema: type · scope · definition · relation · motivation · example · non-example
md = open(os.path.join(ROOT, 'NOMENCLATURE.md')).read()
out['purl_nomenclature_entries'] = len(re.findall(r'^### ', md, re.M))
out['purl_nomenclature_with_relation'] = len(re.findall(r'\*\*Relation:\*\*', md))
json.dump(out, open(os.path.join(ROOT, 'circle', 'nomenclature', 'schema-fit.json'), 'w'), indent=1)
print(json.dumps({k: out[k] for k in ('registry_terms', 'categories', 'coverage_all', 'unmapped_schema_fields', 'terms_whose_text_mentions_an_operation', 'purl_nomenclature_entries', 'purl_nomenclature_with_relation')}, indent=0))
