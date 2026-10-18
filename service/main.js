import { createRepository } from './repository.js';
import { PurlService } from './domain.js';
import { createProductServer } from './http.js';
import { DockerSandbox } from './sandbox.js';
import { createSupabaseAuth } from './auth.js';
import { Registry } from './registry.js';

const repository=createRepository();
const port=Number(process.env.PORT??8080);
const host=process.env.HOST??'127.0.0.1';
const baseUrl=process.env.PURL_BASE_URL??`http://${host==='0.0.0.0'?'127.0.0.1':host}:${port}`;
const sandboxAdapter=new DockerSandbox({enabled:process.env.PURL_SANDBOX_ENABLED==='1',verified:process.env.PURL_SANDBOX_VERIFIED==='1'});
const auth=createSupabaseAuth();
const service=new PurlService({repository,baseUrl,sandboxAdapter,verifyHuman:auth.available?token=>auth.verify(token):null});
await service.seed();
const registry=new Registry({repository,curatorIds:(process.env.PURL_CURATOR_IDS??'').split(',').filter(Boolean)});
const server=createProductServer({service,auth,registry});
server.listen(port,host,()=>console.log(JSON.stringify({event:'purl_ready',protocol:'PURL/0.2',url:baseUrl,persistence:repository.mode,worker:'separate-process',sandbox:sandboxAdapter.verified?'operator-enabled; see security evidence':'disabled'})));
async function stop(){server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
