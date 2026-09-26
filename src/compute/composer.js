// Composition over PURL resources. A literal is a resource holding a value;
// an application is a resource holding an operation, a pin per operand and
// the value its creator computed, linked (rel "references") to each operand
// at the pinned version. The server never evaluates anything: correctness of
// a value is established only by re-evaluation from pinned operands, which
// `verify` does.
//
// Works over either port (in-process Store or HTTP); every method is async so
// the same code drives both.
import { loadProtocolSchemas } from '../core/schema.js';
import { err } from '../core/errors.js';
import { COMPUTE, evaluate } from './algebra.js';
import { NODE_TYPES } from './ports.js';

export const EVALUATOR = 'purl.compute/0.1 reference evaluator (src/compute/algebra.js)';
const NODE_SCHEMA = 'urn:purl:schema:compute-node';
const schemas = loadProtocolSchemas();

const key = (resource, version) => `${resource}@${version}`;

export function nodeErrors(state) {
  return schemas.validate(NODE_SCHEMA, state);
}

export class Composer {
  /**
   * @param port   StorePort or HttpPort
   * @param opts.link  record a `references` link per operand (default true); the
   *                   link is what populates the substrate's inbound index
   */
  constructor(port, { link = true, evaluator = EVALUATOR } = {}) {
    this.port = port;
    this.link = link;
    this.evaluator = evaluator;
    this.evaluations = {};
  }

  #evaluate(op, values) {
    const v = evaluate(op, values);
    this.evaluations[op] = (this.evaluations[op] ?? 0) + 1;
    return v;
  }

  async literal(value, extra = {}) {
    const state = { compute: COMPUTE, node: 'literal', value, ...extra };
    const errors = nodeErrors(state);
    if (errors.length) throw err.invalidInput('not a valid literal', { errors });
    return this.port.create(NODE_TYPES.literal, state);
  }

  /** Pin every operand at its current version and state hash. */
  async pins(operandIds) {
    const pins = [];
    const values = [];
    for (const id of operandIds) {
      const h = await this.port.head(id);
      const errors = nodeErrors(h.record.state);
      if (errors.length) throw err.invalidInput(`operand ${id} is not a computation node`, { errors });
      pins.push({ resource: id, version: h.version, state_hash: h.state_hash });
      values.push(h.record.state.value);
    }
    return { pins, values };
  }

  /**
   * Evaluate `op` over the operands' current values and record the result as
   * a new resource. `opts.claim` overrides the recorded value (fault injection
   * for negative controls only).
   */
  async apply(op, operandIds, opts = {}) {
    const { pins, values } = await this.pins(operandIds);
    const computed = this.#evaluate(op, values);
    const state = { compute: COMPUTE, node: 'application', operation: op, operands: pins, value: opts.claim ?? computed, evaluator: this.evaluator };
    let node = await this.port.create(NODE_TYPES.application, state);
    if (this.link) node = await this.#linkPins(node.id, pins);
    return { ...node, value: state.value, computed };
  }

  /** Evaluate without recording anything (used to construct negative controls). */
  async evaluateOnly(op, operandIds) {
    const { values } = await this.pins(operandIds);
    return evaluate(op, values);
  }

  async #linkPins(id, pins) {
    let node = { id };
    const seen = new Set();
    for (const p of pins) {
      if (seen.has(key(p.resource, p.version))) continue; // link is idempotent by (rel, target, version)
      seen.add(key(p.resource, p.version));
      node = await this.port.invoke(id, 'link', { rel: 'references', target: p.resource, version: p.version });
    }
    return node;
  }

  async value(id) {
    return (await this.port.head(id)).record.state.value;
  }

  /**
   * Independent verification of the cone below (id, version).
   *   memo: visit each (resource, version) once and reuse fetched records;
   *         false = naive traversal of every path.
   * Checks per node: schema; the substrate's own log verification; for
   * applications, that each operand's state hash at the pinned version equals
   * the pin, that re-evaluation equals the recorded value, and (when linking
   * is on) that a references relation to each pin exists.
   */
  async verify(id, { version = null, memo = true, recursive = true } = {}) {
    const start = version ?? (await this.port.head(id)).version;
    return this.verifyMany([[id, start]], { memo, recursive });
  }

  /** Verify several roots in one pass; with memo, a node shared between roots is checked once. */
  async verifyMany(roots, { memo = true, recursive = true } = {}) {
    const problems = [];
    const records = new Map();
    const visited = new Set();
    let visits = 0;
    const read = async (rid, v) => {
      const k = key(rid, v);
      if (memo && records.has(k)) return records.get(k);
      const r = await this.port.at(rid, v);
      if (memo) records.set(k, r);
      return r;
    };
    const stack = [...roots].reverse();
    const substrate = new Map();
    while (stack.length) {
      const [rid, v] = stack.pop();
      const k = key(rid, v);
      if (memo && visited.has(k)) continue;
      visited.add(k);
      visits += 1;
      const r = await read(rid, v);
      const s = r.record.state;
      const errors = nodeErrors(s);
      if (errors.length) {
        problems.push({ node: k, problem: 'not a computation node', errors });
        continue;
      }
      if (!memo || !substrate.has(rid)) {
        const ver = await this.port.verify(rid);
        substrate.set(rid, ver.valid);
        if (!ver.valid) problems.push({ node: k, problem: 'substrate log verification failed', details: ver.problems });
      }
      if (s.node !== 'application') continue;
      const values = [];
      for (const p of s.operands) {
        const o = await read(p.resource, p.version);
        if (o.state_hash !== p.state_hash) problems.push({ node: k, problem: `operand ${key(p.resource, p.version)} state hash differs from pin` });
        values.push(o.record.state.value);
        if (this.link && !r.record.relations.some((l) => l.rel === 'references' && l.target.resource === p.resource && l.target.version === p.version)) {
          problems.push({ node: k, problem: `no references relation to ${key(p.resource, p.version)}` });
        }
        if (recursive) stack.push([p.resource, p.version]);
      }
      let recomputed = null;
      try {
        recomputed = this.#evaluate(s.operation, values);
      } catch (e) {
        problems.push({ node: k, problem: `re-evaluation failed: ${e.message}` });
      }
      if (recomputed !== null && recomputed !== s.value) problems.push({ node: k, problem: `recorded value ${s.value} ≠ re-evaluated ${recomputed}` });
    }
    return { roots: roots.map(([r, v]) => key(r, v)), valid: problems.length === 0, problems, nodes_visited: visits, distinct_nodes: visited.size };
  }

  /** Transitive dependents of `id`, found through the substrate's inbound-relation index. */
  async dependents(id) {
    const out = new Set();
    const queue = [id];
    let traversed = 0;
    while (queue.length) {
      const cur = queue.shift();
      traversed += 1;
      for (const rel of await this.port.inbound(cur)) {
        if (rel.rel !== 'references' || out.has(rel.from)) continue;
        out.add(rel.from);
        queue.push(rel.from);
      }
    }
    return { ids: [...out].sort(), traversed };
  }

  /** Baseline: the same answer by scanning every application node (GET /r?type=…) and reading its pins. */
  async dependentsByScan(id) {
    const apps = await this.port.list({ type: NODE_TYPES.application });
    const rev = new Map();
    for (const a of apps) for (const p of a.state.operands ?? []) {
      if (!rev.has(p.resource)) rev.set(p.resource, new Set());
      rev.get(p.resource).add(a.id);
    }
    const out = new Set();
    const queue = [id];
    while (queue.length) for (const d of rev.get(queue.shift()) ?? []) if (!out.has(d)) { out.add(d); queue.push(d); }
    return { ids: [...out].sort(), scanned: apps.length };
  }

  /** Pins whose version is behind the operand's current version. */
  async stale(id) {
    const { record } = await this.port.head(id);
    const s = record.state;
    if (s.node !== 'application') return [];
    const out = [];
    for (const p of s.operands) {
      const h = await this.port.head(p.resource);
      if (h.version > p.version) out.push({ operand: p.resource, pinned: p.version, current: h.version });
    }
    return out;
  }

  /** Dependents of `changed`, ordered so every node comes after the dependents it pins. */
  async #affected(changed) {
    const { ids } = await this.dependents(changed);
    const set = new Set(ids);
    const records = new Map();
    for (const d of ids) records.set(d, (await this.port.head(d)).record);
    const indeg = new Map(ids.map((d) => [d, 0]));
    const users = new Map();
    for (const d of ids) for (const p of records.get(d).state.operands) {
      if (!set.has(p.resource)) continue;
      indeg.set(d, indeg.get(d) + 1);
      if (!users.has(p.resource)) users.set(p.resource, []);
      users.get(p.resource).push(d);
    }
    const order = [];
    const ready = ids.filter((d) => indeg.get(d) === 0);
    while (ready.length) {
      const d = ready.shift();
      order.push(d);
      for (const u of users.get(d) ?? []) {
        indeg.set(u, indeg.get(u) - 1);
        if (indeg.get(u) === 0) ready.push(u);
      }
    }
    return { order, records };
  }

  /**
   * Persistent (path-copying) recomputation after `changed` moved to a new
   * version: every dependent is re-created as a NEW resource pinned to the
   * current operands; old nodes are left untouched and remain verifiable.
   */
  async recomputePathCopy(changed, { supersede = true } = {}) {
    const { order, records } = await this.#affected(changed);
    const replaced = new Map();
    const steps = [];
    for (const d of order) {
      const s = records.get(d).state;
      const operands = s.operands.map((p) => replaced.get(p.resource) ?? p.resource);
      let node = await this.apply(s.operation, operands);
      // Existing PURL vocabulary: the new node declares that it supersedes the old one.
      if (supersede) node = { ...node, ...(await this.port.invoke(node.id, 'link', { rel: 'supersedes', target: d, version: records.get(d).version })) };
      replaced.set(d, node.id);
      steps.push({ old: d, new: node.id, old_value: s.value, new_value: node.value, value_changed: s.value !== node.value });
    }
    return { mode: 'path-copy', affected: order.length, created: steps.length, steps };
  }

  /** In-place recomputation: each dependent's state is patched (operands, value); its version advances. */
  async recomputeInPlace(changed) {
    const { order, records } = await this.#affected(changed);
    const steps = [];
    for (const d of order) {
      const s = records.get(d).state;
      const { pins, values } = await this.pins(s.operands.map((p) => p.resource));
      const value = this.#evaluate(s.operation, values);
      let node = await this.port.invoke(d, 'update', { merge_patch: { operands: pins, value } });
      if (this.link) node = await this.#linkPins(d, pins);
      steps.push({ node: d, old_value: s.value, new_value: value, value_changed: s.value !== value, version: node.version });
    }
    return { mode: 'in-place', affected: order.length, created: 0, steps };
  }
}
