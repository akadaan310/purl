// npm run handoff — the ACSP × PURL two-agent handoff (needs the ACSP checkout;
// ACSP_DIR, default ../NetGovComEduGovOrgEduGovComNet, with npm dependencies installed).
import { handoffExperiment, acspAvailable } from './lib/handoff.js';

if (!acspAvailable()) {
  console.error('ACSP checkout not found (set ACSP_DIR) or its dependencies are not installed (npm ci there).');
  process.exit(2);
}
const runs = await handoffExperiment();
for (const r of runs) {
  console.log(`\n== ${r.run} (fault: ${r.fault ?? 'none'}) — ${r.acsp_resource}`);
  for (const [name, a] of Object.entries(r.agents)) {
    if (a.error) { console.log(`  agent ${name}: ERROR ${a.error}`); continue; }
    console.log(`  agent ${name} (pid ${a.pid}): verified=${a.verified} performed=${a.performed.map((p) => `${p.step}=${p.value}`).join(',') || '—'} impersonation→${a.log.find((l) => l.step === 'impersonation-attempt').status}`);
  }
  for (const x of r.owner.results) console.log(`  owner check ${x.step} by ${x.source}: claimed ${x.claimed}, purl ${x.purl_value}, cone_valid=${x.cone_valid}; annotations ${x.annotations.map((a) => `${a.kind}/${a.by}`).join(' ') || '—'}`);
  console.log(`  checkpoints ${r.owner.checkpoints.map((c) => (c.ok ? '✓' : '✗')).join('')}  owner ${r.owner.ownership.session_id}  events ${JSON.stringify(r.owner.events.by_session)}`);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(runs, null, 1));
