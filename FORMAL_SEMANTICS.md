# Executable PURL semantics and claim boundaries

This document specifies the implemented bounded `purl/1` fragment. The mathematical handoff remains preserved under `reference/godseed/reference/math_handoff/`; its proposed generic worker calculus is broader than this interpreter. See `LANGUAGE_SPEC.md` for exact syntax and API data shapes.

## Objects and identities

An **address** locates a resource; a **term** is a typed AST; a **denotation** is a possibly partial function on the stated value domain; an **execution** is one authorized resource operation with captured environment and evidence. Possessing an address reveals no bearer credential and confers no write rights.

`identity(kind,value)` domain-separates address, derivation, value, content, environment, build, execution, principal and session IDs. Canonical finite JSON sorts keys, preserves array order/Unicode spelling, rejects unsafe numeric values and normalizes negative zero. Address IDs use a versioned WHATWG HTTP(S) URL policy; credential-bearing URLs reject. Derivation IDs cover the normalized versioned IR, operator implementation/dependency digests and quotas. Value IDs compare only canonical JSON values in this fragment, where integer is a refinement of number rather than a separate representation. Content and environment have separate identity domains. Matching hashes do not establish semantic equivalence, principal authenticity or independent historical provenance.

For example, `input number | math.add 2` on `1` and `input number | math.add 1` on `2` produce equal value IDs and different derivation IDs. An address hash is not a semantic hash. The replay receipt is content-stable for the same captured execution; the surrounding domain service supplies unique submitted execution resource IDs.

## Typing and effect rows

Write `p : A → B ! ε [R]` for an input/output judgment with effect row `ε` and required capability set `R`. Pure is `ε=∅`, not an authority named `pure`. Primitive signatures are closed versioned registry records. `json` is top; integer refines number; graph/artifact refine object. No implicit string-to-number conversion occurs. Runtime shape/domain guards make primitives partial.

Identity is `id_A : A → A !∅ [∅]`. If `p : A→B !εp[Rp]` and `q : B→C !εq[Rq]`, their ordered composition has signature `q∘p : A→C !(εp∪εq)[Rp∪Rq]`. A branch predicate maps A to Boolean; each arm maps the original A to the same B. The signature conservatively joins predicate and both arm requirements, regardless of which arm executes. A bounded repeat body must map A to A and its count must be a permitted nonnegative integer.

Capabilities supplied to the compiler discharge static obligations; they are not grants. Runtime API authority must be checked against current authenticated principals and resource grants. The bounded interpreter implements only pure registry operations. Local, external-read and mutation descriptors are unavailable and throw before I/O even if compilation was given their required capability names.

## Operational interpretation

A configuration is `⟨remaining term, current value, captured environment, work budget, log⟩`. A primitive first consumes step/work fuel, checks its input domain, applies its bundled implementation, checks its output/size domain and appends an ordered transition record. The record includes operator version/digest, arguments, input/output value IDs and effects. A branch evaluates its predicate on the current value and executes the selected arm with the original current value. Repeat evaluates its body in order a bounded number of times. Composition preserves order. Failure yields an explicit error; it does not yield a success receipt or persist a partially completed external effect.

The interpreter has no user code evaluator, network operation, shell, process spawning or external write implementation. Pure artifact operations construct immutable JSON/text values in memory. The surrounding worker/domain transaction owns result persistence. The runtime rejects nonfinite/unsafe integers, prototype-bearing data and executable properties. Source, syntax, depth, steps, values, graphs, cumulative work and receipt size are bounded; expansion-prone string operations check predicted output before allocating it. These mathematical/algorithmic limits supplement rather than replace a dedicated sandbox for authored JavaScript/Python.

## Replay and normalization

Compilation normalizes aliases and explicit composition. It pins source language, IR version, registry/primitive implementation digests, signatures, joined requirements and limits. Execution reconstructs and recompiles the AST and compares all plan fields, so an untrusted serialized plan cannot bypass registry checks by changing its own hash. The environment records Node version, architecture/platform, interpreter/registry versions and limits. Replay records initial input, seed, ordered primitive calls, observed effects and result. There are no clock/network/random observations in the current pure library.

Pure compatible composition is associative as denotation where the same partial evaluations are defined, and identity is neutral. Syntax normalization does not infer arbitrary program equivalence. Commutativity, inverses, idempotence, confluence and authority preservation are not generic consequences. In particular, resource append/grant/revoke/checkpoint operations remain ordered, audited effects outside this pure calculus.

## Finite abstraction admission

Let X be the explicitly declared finite closed state universe, π a total pure observation, and each exposed operation a partial deterministic transition δ with observed effects e. A deterministic projected operation exists only when every x,y∈X with π(x)=π(y) satisfies:

1. δ is enabled at x iff it is enabled at y.
2. Enabled observations have the same effect row e(x)=e(y).
3. When enabled, π(δ(x))=π(δ(y)).

`checkProjection` exhaustively enumerates the listed universe, checks total projection, complete transition coverage, domain closure and these conditions. Comparing every fiber member with its representative suffices by transitivity. A failure supplies the pair of full states, common observation, operation, reason and relevant effects/successors. A successful answer is scoped to the declared complete model; no sample establishes completeness of the external world. Generic functions/callbacks are not accepted as proof obligations or executed by the checker.

The hidden-state counterexample takes X={0,1}², π(a,b)=a and δ(a,b)=(b,a). Both (0,0) and (0,1) project to 0 but their successor observations are 0 and 1. The compiler rejects this quotient. Conversely, identity projection on the complete toggle domain {0,1} is congruent and yields the pure quotient table `0→1,1→0`.

`compileTrace` compiles only a checked complete finite quotient, or validates observations against an already registered typed pure operator. It never synthesizes semantics/effect guarantees from finite samples. Effectful quotient tables can be analyzed for congruence but cannot execute effects by recording their labels. Trace equality, value equality, address equality and semantic equivalence remain distinct.

## Finite-state calibration

The deterministic toggle has exactly two histories at every fixed transition length, one per initial bit. The exact-label cycle `007→070→700→007` has exactly three. Across all finite lengths there are countably many finite records, while each machine has finite state and periodic infinite trajectories. External timestamps/labels add observations from an external channel; they do not add working memory to these machines. `007` is a string label, not an alternate numeric operation or proof of universal computation.

## Evidence

`test/product/compiler.test.js` exercises source parsing/normalization, static/dynamic typing, branch/repeat composition, capability denial, unavailable effects, plan tampering, unsafe values/allocation/work quotas, replay determinism, domain-separated identities, exact toggle/cycle behavior, SEURL caveats, positive finite quotient replay and negative enabledness/effect/successor witnesses. These tests support the implemented fragment, not arbitrary semantic equivalence, cross-provider independence, remote durability, signed provenance or unrestricted sandbox safety.
