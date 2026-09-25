// The first end-to-end demonstration (brief §23), run through HTTP by clients
// that discover every operation from manifests.
//
//   npm run demo                 — starts an in-process server on a free port
//   PURL_URL=http://host:port npm run demo   — runs against an existing server
import { pathToFileURL } from 'node:url';
import { PurlClient } from '../src/client/client.js';
import { createPurlServer } from '../src/transport/server.js';

export async function runDemo(base, { print = console.log } = {}) {
  const steps = [];
  const must = (r) => {
    if (!r.ok) throw new Error(`unexpected ${r.status}: ${r.json?.detail}`);
    return r;
  };
  const step = (title, facts) => {
    steps.push({ title, facts });
    print(`\n── ${steps.length}. ${title}`);
    for (const [k, v] of Object.entries(facts)) print(`   ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  };

  // 1. A human creates a resource.
  const human = new PurlClient(base, { label: 'Researcher (human)' });
  const inst = await human.discoverInstance();
  await human.register('human');
  const url = await human.create({ type: 'research-session', state: { title: 'Binary transition study', question: 'Does order-2 structure survive 5% noise?' } });
  step('Human creates a PURL resource', { principal: human.principal.id, resource: url, discovered_via: '/.well-known/purl → vocabulary.operations[create]', operations_in_vocabulary: inst.vocabulary.operations.length });

  // Agents register as their own principals.
  const A = new PurlClient(base, { label: 'Agent A' });
  const B = new PurlClient(base, { label: 'Agent B' });
  await A.register();
  await B.register();
  await human.invoke(url, 'delegate', { grantee: A.principal.id, rights: ['observe', 'read', 'append', 'assign', 'grant'], purpose: 'Run the first analysis and hand off' });
  step('Human delegates a scoped task to Agent A', { grantee: A.principal.id, rights: 'observe, read, append, assign, grant', owner_remains: human.principal.id });

  // 2. The resource exposes a machine manifest; Agent A inspects it knowing only the URL.
  const docA = await A.open(url);
  const manA = await A.get(docA.links.manifest);
  const allowed = manA.operations.filter((o) => o.available && !o.safe).map((o) => o.name);
  const denied = manA.operations.filter((o) => !o.available && !o.safe).map((o) => `${o.name} (${o.reason})`);
  step('Agent A opens the URL and reads the manifest', { kind: docA.kind, protocol: docA.protocol, owner: docA.owner, 'A may': allowed.join(', '), 'A may not (sample)': denied.slice(0, 3) });

  // 3. Agent A performs an allowed operation; an event is recorded.
  const f1 = must(await A.invoke(url, 'append', { collection: 'findings', body: { claim: 'lag2copy: h_3 = 0.27 bits/symbol; order-2 structure present', evidence: 'experiments/exp-0001 (lag2copy)' } }));
  const refused = await A.invoke(url, 'update', { merge_patch: { title: 'hijacked' } });
  step('Agent A appends a finding (allowed) and attempts update (not delegated)', { append_status: f1.status, finding: f1.json.result.entry, event: f1.json.events[0], update_status: refused.status, update_problem: refused.json.detail, manifest_had_said: refused.advertised });

  // 4. Agent A hands off to Agent B with a continuity package and an attenuated grant.
  const ho = must(await A.invoke(url, 'handoff', {
    to: B.principal.id,
    label: 'A → B',
    package: {
      task: 'Test robustness of the order-2 finding',
      objective: 'Decide whether h_3 stays below 0.5 bits under 5% flips',
      findings: [{ entry: f1.json.result.entry, summary: 'h_3 ≈ 0.27 on the clean sequence' }],
      assumptions: ['Stationarity over the 2048-symbol window'],
      open_questions: ['Does the effect survive bit flips?'],
      constraints: ['Do not modify state; append findings only'],
      requested_operation: { operation: 'append', note: 'append the perturbation result to findings' },
    },
    grant: { rights: 'contributor', operations: ['append', 'acknowledge', 'annotate', 'fork'], purpose: 'perturbation check' },
  }));
  step('Agent A hands off to Agent B', { status: ho.status, events: ho.json.events.map((e) => `${e.kind}@v${e.version}`), grant: ho.json.result.grant, assignee: B.principal.id });

  // 5. Agent B accesses the resource and sees the checkpoint.
  const docB = await B.open(url);
  const cont = await B.get(docB.links.continuity);
  const ack = must(await B.invoke(url, 'acknowledge', { checkpoint: cont.checkpoint.entry, note: 'received; starting perturbation check' }));
  step('Agent B reads the continuity view', { addressed_to_B: cont.addressed_to_you, prepared_by: cont.checkpoint.prepared_by, verified_checkpoint: cont.checkpoint.verified, package_status: cont.package_status, requested: cont.package.requested_operation, acknowledged: ack.status });

  // 6. Agent B performs the delegated operation; ownership stays separate.
  const f2 = must(await B.invoke(url, 'append', { collection: 'findings', body: { claim: 'Under 5% added flips mean h_3 rises to 0.55 bits/symbol (5 replicates); attenuated, still far below 1 bit', evidence: 'experiments/exp-0001 perturbation.levels[1]' } }));
  const escalate = await B.invoke(url, 'transfer', { to: B.principal.id });
  const escalate2 = await B.invoke(url, 'grant', { grantee: A.principal.id, rights: ['update'] });
  const now = await B.open(url);
  const bGrant = now.grants.find((g) => g.grantee === B.principal.id);
  step('Agent B performs the delegated operation; escalation is refused', { append_status: f2.status, authority_on_event: f2.json.events[0].authority, transfer_status: escalate.status, grant_status: escalate2.status, owner: now.owner, assignee: now.assignee, B_grant_parent: bGrant.parent });

  // 7. Complete lineage is reconstructable, independently of the server's own state.
  const rec = await human.reconstruct(url);
  const verify = await human.get(now.links.verify);
  step('Human reconstructs every state from the event log', { events: rec.events.length, all_hashes_and_states_match: rec.all_ok, server_verify: verify.valid, timeline: rec.checks.map((c) => `v${c.version} ${c.kind}/${c.op} by ${c.actor} via ${c.via}${c.chain.length ? ' [' + c.chain.join('→') + ']' : ''}`) });

  // 8. Fork, modify the branch, supersede a finding, preserve provenance.
  const fork = must(await B.invoke(url, 'fork', { note: 'explore a stricter threshold' }));
  const forkUrl = fork.json.resource.href;
  const forkDoc = await B.open(forkUrl);
  step('Agent B forks the resource', { status: fork.status, fork: forkUrl, fork_owner: forkDoc.owner, derived_from: forkDoc.derived_from, grants_copied: forkDoc.grants.length, source_version_unchanged: (await human.open(url)).version === now.version + 0 });

  const mod = must(await B.invoke(forkUrl, 'update', { merge_patch: { threshold_bits: 0.4, note: 'stricter threshold on branch' } }));
  step('Agent B modifies the branch', { status: mod.status, branch_state: (await B.open(forkUrl)).state });

  const sup = must(await A.invoke(url, 'supersede', { collection: 'findings', supersedes: f1.json.result.entry, body: { claim: 'lag2copy: h_3 = 0.274 bits/symbol (plug-in, n = 2048), below all 99 Markov-1 surrogates (min 0.960); the order-1 transition matrix is NOT a reliable witness of absence (P00 = 0.615; sampling s.d. 0.068)', evidence: 'experiments/exp-0001 H2 and REPORT.md' } }));
  const afterSup = await human.open(url);
  const original = afterSup.collections.findings.find((e) => e.id === f1.json.result.entry);
  step('Agent A supersedes its first finding', { status: sup.status, original_still_present: Boolean(original), original_body: original.body, superseded_by: original.superseded_by, current_findings: afterSup.collections.findings.filter((e) => e.current).map((e) => e.id) });

  await B.invoke(forkUrl, 'grant', { grantee: human.principal.id, rights: 'reader' });
  const merge = must(await human.invoke(url, 'merge', { source: forkUrl.split('/').pop() }));
  const lineage = await human.get(afterSup.links.lineage);
  const final = await human.open(url);
  step('Human merges the branch; lineage is preserved on both sides', { merge_status: merge.status, state_changes: merge.json.result.state_changes, relation: final.relations.at(-1), descendants: lineage.descendants.map((d) => d.id), final_owner: final.owner, final_version: final.version });

  const rec2 = await human.reconstruct(url);
  step('Final verification', { events: rec2.events.length, all_ok: rec2.all_ok, owner_changed_ever: rec2.events.some((e) => e.kind === 'transfer') });
  return { url, forkUrl, steps, principals: { human: human.principal.id, A: A.principal.id, B: B.principal.id }, reconstruction_ok: rec2.all_ok };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let server;
  let base = process.env.PURL_URL;
  if (!base) {
    server = createPurlServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  console.log(`PURL demonstration against ${base}`);
  try {
    const out = await runDemo(base);
    console.log(`\nDone. Resource: ${base}${out.url} · fork: ${base}${out.forkUrl} · reconstruction ok: ${out.reconstruction_ok}`);
    if (server && process.env.PURL_KEEP === '1') console.log('Server kept running (PURL_KEEP=1). Open the URLs above in a browser.');
    else server?.close();
  } catch (e) {
    console.error(e);
    server?.close();
    process.exitCode = 1;
  }
}
