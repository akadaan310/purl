// Materialise the datasets named in an experiment definition.
import { generate } from '../../src/research/generators.js';
import { projectEvents } from '../../src/research/projection.js';
import { purlWorkload } from './workload.js';

export function materialise(def) {
  const out = {};
  const workloads = new Map();
  for (const [name, spec] of Object.entries(def.datasets)) {
    if (spec.source === 'purl-workload') {
      const key = JSON.stringify([spec.params, spec.seed]);
      if (!workloads.has(key)) workloads.set(key, purlWorkload({ ...spec.params, seed: spec.seed }));
      const w = workloads.get(key);
      const headers = w.events.map(({ payload, ...h }) => h);
      const p = projectEvents(headers, spec.projection);
      out[name] = { ...p, source: { kind: 'purl-workload', params: spec.params, seed: spec.seed, projection: spec.projection, tally: w.tally, log_verified: w.verify.valid }, raw_events: headers.map((e) => ({ version: e.version, kind: e.kind, op: e.op, actor: e.actor, invocation: e.invocation, at: e.at })) };
    } else {
      out[name] = { ...generate(spec), source: { kind: 'generator', generator: spec.generator, params: spec.params, timer: spec.timer ?? null, timer_params: spec.timer_params ?? null, seed: spec.seed } };
    }
  }
  return out;
}
