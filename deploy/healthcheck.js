import { readFile } from 'node:fs/promises';

try {
  if (process.env.PURL_ROLE === 'worker') {
    const heartbeat = JSON.parse(await readFile(process.env.PURL_WORKER_HEARTBEAT_FILE || '/tmp/purl-worker-heartbeat.json', 'utf8'));
    const updated = typeof heartbeat.updatedAt === 'number' ? heartbeat.updatedAt : Date.parse(heartbeat.updatedAt);
    const maximumAge = Number(process.env.PURL_WORKER_HEALTH_MAX_AGE_MS || 120_000);
    if (!Number.isFinite(updated) || Date.now() - updated > maximumAge || !['running', 'draining'].includes(heartbeat.status)) throw new Error('stale worker heartbeat');
  } else {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/healthz`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('API is not healthy');
  }
} catch {
  process.exitCode = 1;
}
