// The circle IDE surface (SDK v0.3): read-only access to the research substrate (nomenclature,
// experiments, research state, examples), self-describing code (/code), and the eight IDE
// stages as addressable, separately inspectable steps (/ide/{stage}?program=…).
// Every route here is GET and pure: discovery, classification and planning never execute a
// mutation. RECORD is described as the POST a participant would send; it is never performed here.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, parseMoves, MUTATING } from './seurl.js';
import { sha256 } from './adapters.js';

export const DESCRIPTOR = {
  module: 'src/circle/ide.js',
  claims: ['every route is GET and changes no store (checked by get_sweep_changes_nothing)', 'each IDE stage is computed independently from the program text; no stage depends on hidden state',
    'code descriptors are verified against the module source (exports and imports)'],
  requires: { modules: ['./seurl.js', './adapters.js'], services: ['substrate (TYPE, EXECUTE stages; optional)'], files: ['circle/experiments/*', '../substrateIO/research/registries/*.json', 'src/circle/*.js'] },
  produces: ['DESCRIPTOR', 'IDE_STAGES', 'createIde', 'verifyDescriptors'],
  changes: [],
};

export const IDE_STAGES = ['DISCOVER', 'PARSE', 'TYPE', 'PLAN', 'BUILD', 'EXECUTE', 'OBSERVE', 'RECORD'];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** Compare each module's DESCRIPTOR with its source: declared exports vs actual, declared module imports vs actual. */
export async function verifyDescriptors() {
  const out = [];
  for (const f of readdirSync(HERE).filter((x) => x.endsWith('.js')).sort()) {
    const src = readFileSync(join(HERE, f), 'utf8');
    const mod = await import(join(HERE, f));
    const d = mod.DESCRIPTOR ?? null;
    const exports = Object.keys(mod).sort();
    const imports = [...src.matchAll(/^import .* from [']([.]{1,2}[/][^']+)[']; *$/gm)].map((m) => m[1]).sort();
    const row = { module: `src/circle/${f}`, has_descriptor: !!d, source_id: sha256(src) };
    if (d) {
      row.exports_undeclared = exports.filter((e) => !d.produces.includes(e));
      row.declared_not_exported = d.produces.filter((e) => !exports.includes(e));
      row.imports_undeclared = imports.filter((i) => !d.requires.modules.includes(i));
      row.declared_not_imported = d.requires.modules.filter((i) => !imports.includes(i));
      row.ok = !row.exports_undeclared.length && !row.declared_not_exported.length && !row.imports_undeclared.length && !row.declared_not_imported.length;
    } else row.ok = false;
    out.push(row);
  }
  return { modules: out, ok: out.every((r) => r.ok), rule: 'a descriptor is a claim; it is accepted only if it matches the module source (exports, relative imports)' };
}

export function createIde(x) {
  const { envelope, move, CircleError, cfg, substrate, typed, P } = x;
  const SUB = cfg.substrateDir ?? resolve(ROOT, '..', 'substrateIO');
  const REG = (n) => join(SUB, 'research', 'registries', `${n}.json`);
  const reg = (n) => (existsSync(REG(n)) ? readJson(REG(n)) : null);

  // ---- nomenclature ------------------------------------------------------------
  function nomenclature(id) {
    const terms = reg('nomenclature');
    if (!terms) throw new CircleError(503, 'unavailable_here', `registry not found at ${REG('nomenclature')}`);
    if (id) {
      const t = terms.find((k) => k.id === id || k.canonical_name === id);
      if (!t) throw new CircleError(404, 'not_found', 'No such term. GET /nomenclature lists them.');
      return { term: t };
    }
    return { registry: 'substrateIO research/registries/nomenclature.json', content_id: sha256(terms), count: terms.length,
      profiles: { core: 'every term', operational: 'operational terms add operation, input, output, invariants, validation_method, implementation (BRIDGE-NOMENCLATURE.md §10)' },
      conflicts: 'circle/BRIDGE-NOMENCLATURE.md §9',
      terms: terms.map((t) => ({ id: t.id, name: t.canonical_name, status: t.status, term_class: t.term_class ?? null, scope: t.scope ?? null, href: `/nomenclature/${t.id}` })) };
  }

  // ---- experiments ----------------------------------------------------------------
  const EXP = join(ROOT, 'circle', 'experiments');
  function experiments(name) {
    const names = existsSync(EXP) ? readdirSync(EXP).filter((n) => statSync(join(EXP, n)).isDirectory()).sort() : [];
    const one = (n) => {
      const files = readdirSync(join(EXP, n)).sort();
      return { name: n, spec: files.find((f) => /^SPEC/i.test(f)) ?? null, records: files.filter((f) => f.endsWith('.json')), documents: files.filter((f) => f.endsWith('.md')),
        location: `purl circle/experiments/${n}/` };
    };
    if (name) { if (!names.includes(name)) throw new CircleError(404, 'not_found', 'No such experiment.'); return one(name); }
    const sub = reg('experiments');
    return { circle: names.map(one), substrate: sub ? sub.map((e) => ({ id: e.experiment_id, title: e.title, epistemic_status_of_result: e.epistemic_status_of_result })) : null,
      rule: 'failed and invalid runs are kept beside valid ones; a record is never rewritten' };
  }

  // ---- research state -------------------------------------------------------------
  function research() {
    const hyp = reg('hypotheses'), op = reg('open_problems'), rq = reg('research_queue');
    if (!hyp) throw new CircleError(503, 'unavailable_here', 'substrateIO registries not found');
    return {
      source: 'substrateIO research/registries (the record); this is a read-only view',
      hypotheses: hyp.map((h) => ({ id: h.id, status: h.status, statement: h.statement })),
      open_problems: op.map((p) => ({ id: p.id, status: p.status, problem: p.problem })),
      research_queue: rq.map((t) => ({ id: t.task_id, status: t.status, question: t.question, blocker: t.current_blocker ?? null })),
      bridge_open_problems: 'circle/OPEN-PROBLEMS.md',
    };
  }
  function openQuestions() {
    const r = research();
    return { open: [...r.hypotheses.filter((h) => !/SUPPORTED|DISPROVEN|REJECTED/i.test(h.status)), ...r.open_problems.filter((p) => !/RESOLVED|CLOSED/i.test(p.status)), ...r.research_queue.filter((t) => !/DONE|COMPLETE/i.test(t.status))] };
  }

  // ---- examples (each one is a URL you can GET; none performs anything) --------------------
  const EXAMPLES = [
    { title: 'resolve a value', get: '/v/map/eca/90/8/state/5/next', shows: 'a value with value_id; pure' },
    { title: 'see a typed term without evaluating it', get: '/term/map/eca/90/8/state/5/next', shows: 'derivation_id; nothing executed' },
    { title: 'a program, prepared', get: '/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD', shows: 'COMMIT and BUILD are prepared, not performed; POST the same URL to perform' },
    { title: 'one program through the eight IDE stages', get: '/ide?program=/seurl/START/map/eca/30/8/state/1/WRITE/next/PERTURB/0', shows: 'each stage is its own URL' },
    { title: 'transform a program', get: '/programs/transform?source=/seurl/START/map/eca/90/8/state/5&t=extend&p=next', shows: 'build_id; result typed; nothing committed' },
    { title: 'closure of a program under five transformers', get: '/programs/closure?source=/seurl/START/map/eca/90/8/state/5&depth=1', shows: 'fraction well-typed' },
    { title: 'is this prompt a program?', get: '/prompts/classify?p=%7B%22operation%22%3A%7B%22method%22%3A%22GET%22%2C%22href%22%3A%22%2Fv%2Fmap%2Feca%2F90%2F8%2Fstate%2F5%22%7D%7D', shows: 'conversation (missing fields): classification never executes' },
    { title: 'what this code claims', get: '/code', shows: 'module descriptors verified against the source' },
  ];

  // ---- IDE stages -------------------------------------------------------------------
  function programOf(q) {
    const p = q.get('program');
    if (!p) throw new CircleError(422, 'missing_program', 'program must be a SEURL path, e.g. /seurl/START/map/eca/90/8/state/5/WRITE/next');
    return p.startsWith('/seurl/') ? p : '/seurl/' + p.replace(/^\/+/, '');
  }
  async function stage(name, text) {
    const word = text.slice('/seurl'.length);
    switch (name) {
      case 'DISCOVER': return { verbs_legal_next: (() => { try { return run(word).legal; } catch { return null; } })(), sdk: '/sdk', operations: '/operations', nomenclature: '/nomenclature' };
      case 'PARSE': { try { return { ok: true, moves: parseMoves(word) }; } catch (e) { return { ok: false, error: { code: e.code, message: e.message } }; } }
      case 'TYPE': return typed(text);
      case 'PLAN': { try { const s = run(word); return { ok: true, fsm_state: s.state, would_reach: s.would_reach, value_address: s.current_address, prepared_mutations: s.prepared, note: 'prepared ≠ performed' }; } catch (e) { return { ok: false, error: { code: e.code, message: e.message } }; } }
      case 'BUILD': {
        const pure = parseMoves(word).filter((m) => !MUTATING.has(m.verb));
        const build = { source_content_id: sha256(text), transformer: 'identity', target: 'seurl/0 move word (mutating verbs removed)', environment: 'circle/0' };
        return { build_id: sha256(build), build, artifact: { text: '/seurl/' + pure.map((m) => [m.verb, ...m.args].join('/')).join('/') }, note: 'BUILD here is the identity transformation; /programs/transform applies others' };
      }
      case 'EXECUTE': {
        let s; try { s = run(word); } catch (e) { return { ok: false, error: { code: e.code, message: e.message } }; }
        if (!s.current_address) return { ok: false, error: { code: 'unbound' } };
        const r = await substrate.resolve(s.current_address);
        if (!r.available) return { ok: false, error: { code: 'unavailable_here', message: r.reason } };
        return { ok: r.ok, address: s.current_address, value_id: r.json?.identity?.value_id ?? r.json?.value_id ?? null, value: r.json?.value ?? null, effect: 'pure GET of a value: nothing recorded (a recorded execution is POST /scrolls/{id}/build)', epistemic_status: 'SIMULATED' };
      }
      case 'OBSERVE': { try { return { transitions: parseMoves(word).map((_, i) => P.seurl(text, i)), schema: '/sdk/schemas/addressed-transition' }; } catch (e) { return { ok: false, error: { code: e.code, message: e.message } }; } }
      case 'RECORD': {
        const commit = word.includes('/COMMIT') ? text : text + '/COMMIT';
        return { performed: false, to_record: { method: 'POST', href: `${commit}?session={your session id}` }, records: 'a circle Scroll (PURL resource); the program text becomes immutable (K-12)', authority: 'PURL grant of the circle principal; your session is asserted, not authenticated' };
      }
      default: throw new CircleError(404, 'unknown_stage', `Stages: ${IDE_STAGES.join(' ')}.`);
    }
  }

  async function dispatch(method, path, q) {
    if (method !== 'GET') return null;
    let m;
    if (path === '/nomenclature') { const d = nomenclature(); return envelope('nomenclature', d, d.terms.slice(0, 5).map((t) => move(t.id, 'GET', t.href, 'read'))); }
    if ((m = /^\/nomenclature\/([^/]+)$/.exec(path))) return envelope('term', nomenclature(m[1]), [move('all', 'GET', '/nomenclature', 'read')]);
    if (path === '/experiments') { const d = experiments(); return envelope('experiments', d, d.circle.map((e) => move(e.name, 'GET', `/experiments/${e.name}`, 'read'))); }
    if ((m = /^\/experiments\/([^/]+)$/.exec(path))) return envelope('experiment', experiments(m[1]), [move('all', 'GET', '/experiments', 'read')]);
    if (path === '/research') return envelope('research-state', research(), [move('open', 'GET', '/research/open', 'read')]);
    if (path === '/research/open') return envelope('open-questions', openQuestions(), [move('research', 'GET', '/research', 'read')]);
    if (path === '/examples') return envelope('examples', { examples: EXAMPLES }, EXAMPLES.map((e) => move(e.title, 'GET', e.get, 'read')));
    if (path === '/code') { const v = await verifyDescriptors(); return envelope('code', v, v.modules.map((r) => move(r.module, 'GET', `/code/${r.module.split('/').pop().replace('.js', '')}`, 'read'))); }
    if ((m = /^\/code\/([a-z]+)$/.exec(path))) {
      const f = join(HERE, `${m[1]}.js`);
      if (!existsSync(f)) throw new CircleError(404, 'not_found', 'No such module.');
      const mod = await import(f);
      const v = (await verifyDescriptors()).modules.find((r) => r.module.endsWith(`/${m[1]}.js`));
      return envelope('code-module', { descriptor: mod.DESCRIPTOR ?? null, verification: v }, [move('all', 'GET', '/code', 'read')]);
    }
    if (path === '/ide') {
      const text = q.get('program') ? programOf(q) : null;
      return envelope('ide', { stages: IDE_STAGES, program: text, rule: 'every stage is a separate GET; RECORD is described, never performed here' },
        IDE_STAGES.map((s) => move(s, 'GET', `/ide/${s.toLowerCase()}?program=${encodeURIComponent(text ?? '/seurl/START/map/eca/90/8/state/5/WRITE/next')}`, 'read')));
    }
    if ((m = /^\/ide\/([a-z]+)$/.exec(path))) {
      const name = m[1].toUpperCase();
      const text = programOf(q);
      const i = IDE_STAGES.indexOf(name);
      const r = await stage(name, text);
      return envelope('ide-stage', { stage: name, program: text, result: r },
        [...(i > 0 ? [move('previous', 'GET', `/ide/${IDE_STAGES[i - 1].toLowerCase()}?program=${encodeURIComponent(text)}`, 'read')] : []),
          ...(i >= 0 && i < IDE_STAGES.length - 1 ? [move('next', 'GET', `/ide/${IDE_STAGES[i + 1].toLowerCase()}?program=${encodeURIComponent(text)}`, 'read')] : [])]);
    }
    return null;
  }
  return { dispatch, stage };
}
