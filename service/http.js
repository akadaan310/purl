import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openapi } from './openapi.js';
import { compatibilitySources, substrateOperations, mapSubstrateTerm, parseSeurl, importComposition } from './adapters.js';
import { compile, checkProjection, compileTrace } from './compiler.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.md':'text/markdown'};
const HEADERS={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cache-Control':'no-store',Vary:'Accept, Authorization',
};
const MAX_BODY=256*1024;
function failure(status,code,message){return {status,body:{error:{code,message}}};}
async function readJson(req){
  if(!/^application\/(?:json|purl\+json)(?:\s*;|$)/i.test(req.headers['content-type']||'')) {
    req.resume(); throw failure(415,'content-type','Request bodies must use application/json');
  }
  let size=0; const chunks=[];
  for await(const chunk of req){ size+=chunk.length; if(size>MAX_BODY){req.resume();throw failure(413,'body-limit',`Request body exceeds ${MAX_BODY} bytes`);} chunks.push(chunk); }
  try{ const body=JSON.parse(Buffer.concat(chunks).toString()||'{}'); if(!body||Array.isArray(body)||typeof body!=='object')throw Error(); return body; }
  catch{throw failure(400,'invalid-json','Body must be a JSON object');}
}

/** HTTP boundary. No user-selected URL is fetched; credentials are header-only. */
export function createProductServer({service,webDir=resolve(ROOT,'web'),legacy=null,maxRequests=60,auth=null,registry=null}={}){
  if(!service)throw new TypeError('service is required');
  const requests=new Map();
  const server=createServer(async(req,res)=>{
    const reply=({status=200,body,headers={}})=>{
      const data=JSON.stringify(body);
      res.writeHead(status,{...HEADERS,'Content-Type':'application/purl+json; charset=utf-8',...headers});
      res.end(req.method==='HEAD'?'':data);
    };
    try{
      const url=new URL(req.url,'http://purl.invalid');
      const path=url.pathname.replace(/\/+$/,'')||'/';
      for(const key of url.searchParams.keys())if(/^(token|access_token|auth|key|api_key|apikey|bearer|password)$/i.test(key))throw failure(400,'credentials-in-url','Use Authorization: Bearer in a header; never place credentials in URLs');
      const authorization=req.headers.authorization;
      if(authorization&&!/^Bearer\s+\S+$/i.test(authorization))throw failure(401,'authentication','Use Authorization: Bearer <token>');
      const context={token:authorization?.replace(/^Bearer\s+/i,''),idempotencyKey:req.headers['idempotency-key']};
      const safe=['GET','HEAD'].includes(req.method);
      if(req.method==='OPTIONS')return reply({status:204,headers:{Allow:'GET, HEAD, POST, OPTIONS'}});
      if(!safe&&req.method!=='POST')return reply(failure(405,'method','Use GET for reads or POST for mutations'));
      if(!safe){
        const origin=req.headers.origin;
        const expectedOrigin=service.baseUrl?new URL(service.baseUrl).origin:`http://${req.headers.host}`;
        if(origin&&origin!==expectedOrigin&&origin!==`http://${req.headers.host}`)throw failure(403,'origin','Cross-origin mutations are denied');
        const key=req.socket.remoteAddress;
        const now=Date.now(); let bucket=requests.get(key);
        if(!bucket||now-bucket.start>60_000){bucket={start:now,count:0};requests.set(key,bucket);}
        if(++bucket.count>maxRequests)throw failure(429,'rate-limit','Mutation rate exceeded; retry in one minute');
        if(requests.size>10000)for(const[k,v]of requests)if(now-v.start>60_000)requests.delete(k);
      }
      if(path==='/healthz'&&safe){await service.repository?.read();return reply({body:{status:'ok',protocol:'PURL/0.2',service:'api',persistence:service.repository?.mode??'development',untrusted_execution:'disabled-unless-verified-worker'}});}
      if(path==='/api/openapi'&&safe)return reply({body:openapi()});
      if(path==='/api/registry'&&safe)return reply({body:registry?await registry.list():{items:[],promotion:'No curator authority configured'}});
      if(path==='/api/registry/promote'&&req.method==='POST'){
        if(!registry)throw failure(503,'registry-unavailable','Registry promotion authority is not configured');
        return reply({body:{entry:await registry.promote(await readJson(req),context)}});
      }
      if(path==='/api/runtime'&&safe){const runtime=JSON.parse(await readFile(resolve(ROOT,'deploy/runtime.json'),'utf8'));return reply({body:{...runtime,execution_class:'RUNTIME_CONFIGURATION',architecture:process.arch,node:process.versions.node,sandbox_enabled:service.sandboxAdapter?.verified===true}});}
      if(path==='/api/compiler'&&req.method==='POST'){const input=await readJson(req);return reply({body:compile(input.source)});}
      if(path==='/api/transitions/check'&&req.method==='POST')return reply({body:checkProjection(await readJson(req))});
      if(path==='/api/transitions/compile'&&req.method==='POST')return reply({body:compileTrace(await readJson(req))});
      if(path==='/api/auth/config'&&safe)return reply({body:auth?.config()??{available:false}});
      if(path==='/api/auth/start'&&req.method==='POST'){
        if(!auth?.available)throw failure(503,'auth-unavailable','Human account provider is not configured');
        const input=await readJson(req);try{return reply({body:await auth.start(input.email,input.state)});}catch(error){throw failure(400,'auth-rejected',error.message);}
      }
      if(path==='/.well-known/purl-reference'&&safe)return reply({body:{protocol:'PURL/0.1',execution_class:'PRESERVED_REFERENCE',source:compatibilitySources()[0],start:'npm run start:legacy',available_at_product_origin:false,authority:'Separate reference instance; tokens and grants are not imported'}});
      if(path==='/api/compatibility'&&safe)return reply({body:{sources:compatibilitySources(),substrate_operators:substrateOperations(),effects:[],authority_imported:false}});
      if(path==='/api/compatibility/substrate'&&safe)return reply({body:mapSubstrateTerm(url.searchParams.get('path')??'')});
      if(path==='/api/compatibility/seurl'&&safe)return reply({body:parseSeurl(url.searchParams.get('path')??'')});
      if(path==='/api/compatibility/composition'&&req.method==='POST'){
        const input=await readJson(req);return reply({body:importComposition(input.records,input.root_id,{version:input.version})});
      }
      if(path.startsWith('/api/')||path==='/.well-known/purl'){
        const result=await service.handle(req.method==='HEAD'?'GET':req.method,path+url.search,safe?{}:await readJson(req),context);
        if(path==='/.well-known/purl'&&result.status===200){
          result.body.endpoints={...result.body.endpoints,sdk:'/sdk/client.js',sdk_docs:'/docs/SDK.md',openapi:'/api/openapi',health:'/healthz',registry:'/api/registry',compiler:'/api/compiler',transition_compiler:'/api/transitions/compile',runtime:'/api/runtime'};
          result.body.links={...result.body.links,sdk:'/sdk/client.js',documentation:'/docs',mission:result.body.mission?.url??'/p/godseed-mission'};
        }
        return reply(result);
      }
      const p=/^\/p\/([A-Za-z0-9_-]+)$/.exec(path);
      if(p&&safe&&/application\/(?:json|purl\+json)/i.test(req.headers.accept??''))return reply(await service.handle('GET',`/api/programs/${p[1]}/manifest`,{},context));
      if(!safe)throw failure(405,'method','This URL is read-only. Discover POST operations from its manifest.');
      if(legacy&&(path==='/r'||path.startsWith('/r/')||path==='/principals'||path.startsWith('/principals/')||path.startsWith('/schemas/')||path.startsWith('/static/'))){legacy.emit('request',req,res);return;}
      const assets={
        '/app.js':[resolve(webDir,'app.js'),'text/javascript'],
        '/style.css':[resolve(webDir,'style.css'),'text/css'],
        '/sdk/client.js':[resolve(ROOT,'sdk/client.js'),'text/javascript'],
        '/sdk/cli.js':[resolve(ROOT,'sdk/cli.js'),'text/javascript'],
      };
      const docs=/^\/docs\/([A-Z_]+\.md)$/.exec(path);
      if(docs&&['SDK.md','LANGUAGE_SPEC.md','FORMAL_SEMANTICS.md','SECURITY.md','DEPLOYMENT.md','RECONSTRUCTION.md','ARCHITECTURE.md'].includes(docs[1]))assets[path]=[resolve(ROOT,docs[1]),'text/markdown'];
      if(assets[path]){
        const [file,type]=assets[path];const content=await readFile(file);
        res.writeHead(200,{...HEADERS,'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'public, max-age=60'});
        return res.end(req.method==='HEAD'?'':content);
      }
      const font=/^\/assets\/([A-Za-z0-9._-]+\.(?:woff2?|ttf|txt))$/.exec(path);
      if(font){
        const content=await readFile(resolve(webDir,'assets',font[1]));
        const type=font[1].endsWith('.woff2')?'font/woff2':font[1].endsWith('.woff')?'font/woff':font[1].endsWith('.ttf')?'font/ttf':'text/plain';
        res.writeHead(200,{...HEADERS,'Content-Type':type,'Cache-Control':'public, max-age=31536000, immutable'});return res.end(req.method==='HEAD'?'':content);
      }
      if(path==='/favicon.ico'){res.writeHead(204,HEADERS);return res.end();}
      if(!/^\/(?:$|explore$|create$|workspace$|ide(?:\/[A-Za-z0-9_-]+)?$|p\/[A-Za-z0-9_-]+$|observatory$|docs$)/.test(path))throw failure(404,'not-found','No route for this address');
      const content=await readFile(resolve(webDir,'index.html'));
      res.writeHead(200,{...HEADERS,'Content-Type':'text/html; charset=utf-8',Link:'</.well-known/purl>; rel="service-desc"; type="application/purl+json"'});
      res.end(req.method==='HEAD'?'':content);
    }catch(error){
      if(res.headersSent){res.end();return;}
      if(error.status&&error.body)return reply(error);
      if(error.status&&error.code)return reply(failure(error.status,error.code,error.message));
      if(error.code&&/^[a-z_]+$/.test(error.code))return reply(failure(400,error.code,error.message));
      const status=error.status??(error.code==='ENOENT'?404:500);
      reply(failure(status,status===500?'internal':'not-found',status===500?'Internal error; no success has been recorded':error.message));
      if(status===500)console.error(JSON.stringify({event:'request_failed',message:error.message}));
    }
  });
  server.requestTimeout=30_000;server.headersTimeout=10_000;server.keepAliveTimeout=5000;
  return server;
}
