# PURL language and interpreter, version 1

The product service implements a bounded typed dataflow language, `purl/1`, in `service/compiler.js`. The original continuity protocol remains a separate resource/event system. A source program is data, not JavaScript, Python, a fetched URL, or text evaluated as code.

## Source forms

The canonical source is a JSON AST:

```json
{
  "language": "purl/1",
  "input": "number",
  "steps": [
    {"op": "math.add", "args": {"value": 2}},
    {"op": "math.multiply", "args": {"value": 3}}
  ]
}
```

Its readable pipeline form is:

```text
input number | math.add 2 | math.multiply 3
```

Both normalize to the same plan and derivation ID; input `4` produces `18`. `language` defaults to `purl/1`; `input` defaults to `json`. The header is optional, but a numeric operator needs a statically numeric predecessor. Unknown fields, versions and operators reject. Positional DSL arguments are JSON scalars/arrays and become `args.value`; a JSON object supplies named arguments. Strings need JSON quotes. Quoted pipes and nested JSON delimiters are data. A version can be pinned as `math.add@1.0.0 2`.

```ebnf
pipeline = ["input", type, "|"], stage, {"|", stage};
stage = operator, ["@", version], [json-argument]
      | "repeat", bounded-count, "{", pipeline, "}";
```

An input-only header is an identity program. Branching and explicit composition use the JSON form:

```json
{
  "input": "number",
  "steps": [
    {"branch": {
      "when": {"op": "math.greaterThan", "args": {"value": 0}},
      "then": [{"op": "math.multiply", "args": {"value": 2}}],
      "else": [{"op": "math.abs"}]
    }},
    {"repeat": {"count": 3, "steps": [{"op": "math.add", "args": {"value": 1}}]}},
    {"compose": [{"op": "identity"}]}
  ]
}
```

`when` accepts one term or a pipeline and must produce `boolean`. It observes the current input; the selected arm receives that original input. Both arms must produce the same type. Effects and requirements from both arms join conservatively, including arms that a particular input will not select. A repeated body must preserve its input type, including for count zero. Composition flattens in source order; execution never sorts or commutes operations.

## Types and effects

Types are `json`, `number`, `integer`, `string`, `boolean`, `null`, `array`, `object`, `graph` and `artifact`. `json` is the top type. `integer` is a safe-integer refinement of `number`; `graph` and `artifact` are checked object shapes. `graph` contains unique JSON `nodes` and directed two-element `edges` whose endpoints occur in `nodes`. `artifact` contains `media_type`, `content` and `content_id`. Arrays have no static element parameter; array-consuming primitives check element types at runtime. `json.get` with an explicit `type` performs a checked projection, never an unchecked cast.

Only finite plain JSON values are admitted. Symbols, functions, undefined, cycles, sparse/decorated arrays, getters, hidden properties and custom prototypes reject. Numbers use IEEE 754 arithmetic: all numbers must be finite and every integral value must be a safe integer. This is not exact real/rational arithmetic. Canonical JSON sorts object keys and identifies negative zero with zero. Unicode strings are preserved without normalization.

Every trusted descriptor includes input/output types, argument schema, effects, required rights, determinism, version, implementation/dependency digest, provenance, availability and test pointers. Discover the actual registry through `operators()` or `GET /api/operators`.

| Effect row | Meaning | Interpreter policy |
|---|---|---|
| `[]` | Pure deterministic computation | Available; no capability required |
| `["local"]` | Local artifact persistence | Descriptor only; no adapter available |
| `["external-read"]` | Environment-dependent read | Descriptor only; no adapter available |
| `["mutation"]` | Durable shared-state change | Descriptor only; no adapter available |

`pure` is represented by the empty row, never a positive permission. `network.fetch` requires `external:read`, `artifact.write` requires `artifact:write`, and `state.commit` requires `state:write`. Compilation with those capability names checks obligations but does not create an execution adapter or grant rights. The bounded interpreter always rejects their execution. Live API authority, authenticated principals and dedicated worker policies remain separate from source compilation.

## Bundled primitives

The initial registry contains 71 descriptors, 68 available pure primitives and three unavailable effect descriptors. Its machine-readable discovery is authoritative.

| Family | Examples and behavior |
|---|---|
| Composition | `identity` preserves type; `constant {"value":...}` replaces input and infers its JSON type |
| Math | `add`, `subtract`, `multiply`, `divide`, `mod`, `power`, `abs`, `sqrt`, `floor`, `ceil`, `round`, `negate`, array `sum/mean/min/max`, comparisons, `clamp`, integer `gcd` |
| JSON | `parse`, canonical `stringify`, typed `get {"path":["key"],"type":"number"}`, `keys`, `values`, `entries`, `pick`, shallow `merge`, canonical `equal` |
| Boolean | `not`, `and`, `or` |
| Strings | `trim`, `uppercase`, `lowercase`, Unicode code-point `reverse/length/slice`, `concat`, `includes`, literal `split/replace` |
| Arrays | `join`, `length`, `reverse`, `take`, canonical `unique`, numeric/string `sort` |
| Parsing | Strict decimal `parse.number`; bounded quoted-field `parse.csv` |
| Graph | Directed `graph.bfs {"start":...}` and cycle-rejecting `graph.toposort` |
| State machines | Numeric `state.toggle` on `{0,1}`; exact-string `state.cycle007` on `{"007","070","700"}`; finite partial `state.transition` table |
| Binary strings | `bits.not/and/or/xor/concat/hash`; 1..4096 bits, equal-width Boolean operands, SHA-256 over ASCII bits rendered as 256 bits |
| Artifacts | `artifact.json` and `artifact.text` produce in-memory content-addressed values; `content.hash` produces a content ID |

Math names use the `math.` prefix and other families use their table prefix. Arithmetic binary operators take `args.value`. Historical aliases `add`, `multiply`, `id`, `literal`, `toggle`, `cycle007`, `string.upper/lower` normalize to canonical names. JSON paths cannot traverse `__proto__`, `prototype` or `constructor`. Sorting uses a fixed numeric or code-unit comparison, never host locale. Replacement is literal with a nonempty search string; user regexes and executable callbacks are unsupported.

## Compilation and execution contracts

```js
compile(source, {capabilities: []})
// {ok, diagnostics:[{stage,code,message,path}], plan, derivation_id}

execute(plan, input, {seed: 0})
// {value, trace, value_id}; runtime violations throw LanguageError
```

Diagnostics identify `parse`, `type`, `effect`, `capability` and `normalize` stages, plus projection/identity/runtime stages where relevant. An unsuccessful compile returns `plan:null` and `derivation_id:null`. The versioned `purl-ir/1` plan includes normalized steps, input/output types, joined effects/rights, operator names/versions/digests, registry ID, worst-case step cost and enforced limits. At execution it is recompiled and compared in full, so modifying a stored plan, metadata, capability row or operator digest cannot bypass checking. Hashes are content identifiers, not a trust boundary.

Current limits are 64 KiB source, a conservative 1 MiB value budget, arrays of 10,000 items, JSON depth 32, 512 syntax nodes, program nesting 24, repeat count 0..1000, 10,000 expanded runtime steps, 16 MiB cumulative input/argument processing budget, 4 MiB transition records, 1,000 graph nodes and 10,000 edges. String amplification is checked before replacement/join allocation. Budget charges are conservative and may reject a smaller serialized value. These are interpreter quotas, not an OS-level memory or scheduling isolation boundary. They do not authorize arbitrary authored code; the separate isolated worker has its own policy.

Replay metadata records initial input, safe-integer seed, normalized derivation ID, runtime/architecture, registry/dependency versions, quotas, every executed primitive with its arguments/input/output value IDs and declared/observed effects, final value ID and a deterministic receipt ID. Branch and repetition order appear in step paths. The seed is captured even though the current pure library has no random primitive. The receipt identifies deterministic replay content; the domain service assigns a separate unique execution resource ID for each submitted run. Hash receipts do not prove external historical authenticity.

## Transition admission

`checkProjection(spec)` accepts a declared **complete finite model**, not a sampled trace:

```json
{
  "domain": [[0,0],[0,1],[1,0],[1,1]],
  "domain_complete": true,
  "projection": {"op":"json.get","args":{"path":[0],"type":"number"}},
  "operations": [{"name":"swap","operator":{"op":"array.reverse"}}]
}
```

The example rejects with a witness: `[0,0]` and `[0,1]` project to `0` but their next projected values differ. The checker exhausts every listed state, requires closure, and compares enabledness, observed effect rows and projected successors on each fiber. Each operation supplies a known typed pure operator or a table with exactly one `{from,to,effects:[]}` row per state; disabled rows use `{from,enabled:false}`. Domain completeness is an explicit caller assertion about the modeled universe, not a proof that external reality has no hidden state. Limits are 256 states and 16 operations.

`compileTrace` supports two explicit modes:

```js
compileTrace({operator:{op:'state.cycle007'}, trace:['007','070','700','007']});
// Validate known versioned semantics; never infer a new operator from samples.

compileTrace({
  domain:[0,1], domain_complete:true, projection:{op:'identity'},
  operations:[{name:'flip',operator:{op:'state.toggle'}}],
  trace:[0,1,0,1], labels:['flip','flip','flip']
});
// Exhaustive quotient admission, then pure transition-table compilation.
```

The resulting programs replay the labeled operation sequence on admissible initial states. Trace states must satisfy every declared transition; effects must be pure. A bare `[0,1,0]` sample, effectful table, incomplete domain, nonclosed domain, mismatched trace or noncongruent projection rejects. Evidence is labeled `known-operator-replay` or `complete-finite-domain` and states its scope. Exact finite toggle/007 cycles establish periodic finite-state behavior, not universal computation.

## Historical SEURL migration

`mapSeurl(verb,context)` returns a decision, candidates, selected operation when disambiguated, caveats and `lossless:false`. `START` splits create/reopen; `SWITCH` splits assignment/handoff/client focus; `WRITE` splits append/update; `COMMIT` splits checkpoint/transaction; `BUILD` requires an isolated adapter; `TALK` annotation does not authorize external communication; `PERTURB` admits only an explicitly numeric pure perturbation. No seven-label universal protocol or automatic equivalence is claimed. Source-specific parsing and pinned compatibility adapters live separately in `service/adapters.js`.

## Executable mission inspection

`input json | mission.inspect` consumes `{graph:{nodes:[{id,dependencies,status}]}}`, validates bounded unique IDs, dependency existence and acyclicity, and computes ready/completed/waiting node IDs. The result preserves `verified:false`: graph evaluation does not turn recorded PASS claims into verified requirement truth.
