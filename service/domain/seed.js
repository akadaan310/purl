import { existsSync, readFileSync } from 'node:fs';
import { hashOf } from './support.js';

export const SEED_OWNER = 'principal_purl_seed';
export const SEED_IDS = { math: 'math-demo', diagnostic: 'diagnostic', game: 'tic-tac-toe', mission: 'godseed-mission' };
export const templates = () => [
  { id: 'math', title: 'A little arithmetic', kind: 'program', language: 'purl', source: 'input number | math.add 2 | math.multiply 3', input: 4, input_schema: { type: 'number' }, output_schema: { type: 'number' }, tests: [{ input: 4, expected: 18 }, { input: 0, expected: 6 }], description: 'A typed, deterministic pipeline with a visible derivation.' },
  { id: 'diagnostic', title: 'A transparent diagnostic', kind: 'program', language: 'purl', source: 'input json | json.stringify', input: { status: 'ready', protocol: 'PURL/0.2' }, tests: [], description: 'Canonical JSON observation without external effects.' },
  { id: 'game', title: 'Tic-tac-toe, together', kind: 'game', language: 'purl', source: 'input json', input: null, tests: [], description: 'A multiplayer state machine with atomic backend turn validation.' },
  { id: 'javascript', title: 'JavaScript performer', kind: 'program', language: 'javascript', source: 'function main(input) { return input + 1; }', input: 1, input_schema: { type: 'number' }, output_schema: { type: 'number' }, tests: [{ input: 1, expected: 2 }], description: 'Stored source; execution requires a verified isolated worker.' },
  { id: 'python', title: 'Python performer', kind: 'program', language: 'python', source: 'def main(input):\n    return input + 1', input: 1, input_schema: { type: 'number' }, output_schema: { type: 'number' }, tests: [{ input: 1, expected: 2 }], description: 'Stored source; execution requires a verified isolated worker.' },
  { id: 'typescript', title: 'TypeScript performer', kind: 'program', language: 'typescript', source: 'export default function main(input: number): number { return input + 1; }', input: 1, input_schema: { type: 'number' }, output_schema: { type: 'number' }, tests: [{ input: 1, expected: 2 }], description: 'Erasable TypeScript types run inside the restricted Node worker; no package installs.' },
];
export function missionState(baseUrl = '') {
  const directive = readFileSync(new URL('../../reference/godseed/GODSEED.md', import.meta.url), 'utf8');
  const amendmentPath = new URL('../../reference/godseed/DEPLOYMENT_AMENDMENT.md', import.meta.url);
  const amendment = existsSync(amendmentPath) ? readFileSync(amendmentPath, 'utf8') : 'Deployment amendment: Railway first for the public web/control plane and workers; preserve Supabase as the sole production persistence authority. Inventory Oracle before any changes and move isolated computational workers there only when credentials and safe isolation are verified. Missing Oracle credentials do not block local implementation or Railway deployment. Never claim deployment without a live smoke test.';
  const nodes = [];
  const add = (id, title, text, dependencies = [], type = 'requirement') => {
    nodes.push({ id, type, title, text, dependencies, status: 'NOT_RUN', effects: ['local-state'], operations: ['inspect', 'propose', 'checkpoint'], tests: [{ id: `${id}:evidence`, assertion: 'Evidence is addressable, verified and meets the stated requirement' }], completion_predicate: { operator: 'all', clauses: [{ operator: 'dependencies_pass' }, { operator: 'evidence_verified' }, { operator: 'tests_pass' }] }, evidence: [], href: `${baseUrl}/api/programs/${SEED_IDS.mission}/mission/${id}` });
  };
  const sections = directive.split(/^## /m).slice(1);
  const sectionIds = ['mission', 'reconstruction', 'formal-contract', 'features', 'cinematic-design', 'experiments', 'infrastructure', 'work-plan', 'deliverables', 'execution'];
  sections.forEach((section, i) => {
    const [title, ...body] = section.split('\n');
    const id = sectionIds[i] ?? `section-${i + 1}`;
    add(id, title.trim(), body.join('\n').trim(), i === 0 ? [] : i === 1 ? ['mission'] : ['reconstruction'], 'directive-section');
  });
  const featureText = sections.find((s) => s.startsWith('Complete feature set')) ?? '';
  const features = [...featureText.matchAll(/^(\d+)\. ([\s\S]*?)(?=^\d+\. |$(?![\s\S]))/gm)];
  const featureDeps = { 1: ['feature-3', 'feature-8'], 2: ['formal-contract'], 3: ['formal-contract'], 4: ['feature-1', 'feature-3'], 5: ['feature-2', 'feature-3', 'feature-9'], 6: ['feature-3'], 7: ['feature-3'], 8: ['feature-2'], 9: ['infrastructure', 'feature-8'], 10: ['feature-3', 'feature-8'], 11: ['feature-2', 'feature-8'], 12: ['feature-8', 'feature-9'] };
  for (const match of features) add(`feature-${match[1]}`, `Feature ${match[1]}: ${match[2].split('.')[0]}`, match[2].trim(), featureDeps[match[1]] ?? ['formal-contract']);
  const experimentText = sections.find((s) => s.startsWith('Ten required')) ?? '';
  const experimentDeps = { E01: ['feature-3'], E02: ['feature-3'], E03: ['reconstruction', 'feature-3'], E04: ['feature-7'], E05: ['feature-5'], E06: ['feature-2', 'feature-9'], E07: ['feature-11'], E08: ['feature-10'], E09: ['feature-10', 'feature-11'], E10: ['feature-1', 'feature-4', 'feature-8', 'feature-9'] };
  for (const match of experimentText.matchAll(/^(E\d{2}) ([^\n]+)$/gm)) add(match[1], `${match[1]} ${match[2].split(':')[0]}`, match[2], experimentDeps[match[1]], 'experiment');
  const deliverables = ['README', 'ARCHITECTURE', 'FORMAL_SEMANTICS', 'LANGUAGE_SPEC', 'SDK', 'NOMENCLATURE', 'CONSTITUTION', 'SECURITY', 'DEPLOYMENT', 'RECONSTRUCTION', 'MIGRATIONS', 'EXPERIMENTS', 'ACCEPTANCE.json', 'PROGRAM_GRAPH.json', 'handoff.json', 'Playwright screenshots', 'example PURLs', 'build hashes', 'deployed URL'];
  for (const title of deliverables) add(`artifact-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, title, `Deliver ${title} with verified evidence and explicit PASS/FAIL/BLOCKED/NOT_RUN status.`, ['reconstruction'], 'artifact');
  add('deployment-amendment', 'Railway first, Oracle later', amendment, ['infrastructure'], 'amendment');
  return { directive, directive_content_id: hashOf(directive), amendment, graph: { schema: 'purl.mission-graph/1', nodes, edges: nodes.flatMap((node) => node.dependencies.map((dependency) => ({ from: dependency, to: node.id, relation: 'requires' }))), completion_predicate: { operator: 'all_nodes_pass', exception: 'Blocked work must retain exact blockers; blocking is not completion' } }, completion: { status: 'NOT_RUN', verified: false }, evidence_class: 'LIVE_LOCAL', next: ['Inspect the manifest', 'Read reconstruction and formal-contract nodes', 'Fork with your own authority', 'Attach evidence through checkpoints'] };
}
