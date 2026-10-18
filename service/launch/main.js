import { readFile } from 'node:fs/promises';
import { createLaunchApplication } from './application.js';
import { createLaunchServer } from './http.js';

const app=createLaunchApplication();
const seed=JSON.parse(await readFile(new URL('../../deploy/consumer-mission.seed.json',import.meta.url),'utf8'));
await app.resources.seedMission(seed);
const server=createLaunchServer({app});
server.listen(Number(process.env.PORT??8180),process.env.HOST??'127.0.0.1',()=>console.log(JSON.stringify({event:'launch_ready',product:app.product,url:app.baseUrl,persistence:app.store.mode,untrusted_execution:'disabled'})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),60000).unref();});
