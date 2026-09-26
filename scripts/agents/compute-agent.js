// One agent session, as its own OS process. Configuration arrives in the
// AGENT_CONFIG environment variable (JSON) so the capability never appears on
// a command line: { acspResource, capability, session, agent, next, fault?, runId? }.
// Prints its report as one JSON document on stdout.
import { runAgent } from '../../src/bridge/agent.js';

const config = JSON.parse(process.env.AGENT_CONFIG ?? '{}');
runAgent(config)
  .then((report) => process.stdout.write(JSON.stringify({ pid: process.pid, ...report }) + '\n'))
  .catch((e) => {
    process.stdout.write(JSON.stringify({ pid: process.pid, error: e.message, stack: e.stack }) + '\n');
    process.exitCode = 1;
  });
