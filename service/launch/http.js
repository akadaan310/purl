import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../compiler.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const HEADERS={'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','cache-control':'no-store','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",vary:'Accept, Cookie, Authorization'};
const error=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
function durableJson(value){
 const stack=[{value,depth:0}];let nodes=0;
 const text=string=>{for(let i=0;i<string.length;i++){const c=string.charCodeAt(i);if(c===0)return false;if(c>=0xd800&&c<=0xdbff){const next=string.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;};
 while(stack.length){const {value,depth}=stack.pop();if(++nodes>250000||depth>64)error(400,'storage_json','JSON exceeds the structural limits for durable storage');
  if(typeof value==='string'&&!text(value)||typeof value==='number'&&!Number.isFinite(value))error(400,'storage_json','JSON contains a value incompatible with durable storage');
  if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(!text(key))error(400,'storage_json','JSON contains a key incompatible with durable storage');stack.push({value:child,depth:depth+1});}
 }
 return value;
}
async function readBody(req,limit){
 if(!/^application\/(?:json|purl\+json)(?:\s*;|$)/i.test(req.headers['content-type']??'')){req.resume();error(415,'content_type','Use application/json');}
 let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>limit){req.resume();error(413,'body_limit',`Request exceeds ${limit} bytes`);}chunks.push(c);}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{error(400,'invalid_json','A JSON object is required');}return durableJson(body);
}
export function createLaunchServer({app}={}){
 if(!app)throw new TypeError('app is required');
 const rates=new Map();
 const server=createServer(async(req,res)=>{
  const reply=({status=200,body,headers={}})=>{res.writeHead(status,{...HEADERS,'content-type':'application/purl+json; charset=utf-8',...headers});res.end(req.method==='HEAD'||status===204?'':JSON.stringify(body));};
  try{
   const url=new URL(req.url,'http://purl.invalid'),path=url.pathname.replace(/\/+$/,'')||'/',method=req.method==='HEAD'?'GET':req.method;
   for(const name of url.searchParams.keys())if(/^(?:token|access_token|auth|key|api_key|apikey|bearer|password|client_secret)$/i.test(name))error(400,'credentials_in_url','Credentials belong in protected headers or request bodies, never shared URLs');
   if(req.headers.authorization&&!/^Bearer [^\s]+$/.test(req.headers.authorization))error(401,'invalid_authorization','Use a Bearer credential');
   if(method==='OPTIONS')return reply({status:204,headers:{allow:'GET, HEAD, POST, OPTIONS'}});
   if(!['GET','POST'].includes(method))return reply({status:405,body:{error:{code:'method',message:'Use GET for reads or POST for mutations'}}});
   const ctx={headers:req.headers,query:Object.fromEntries(url.searchParams),requestOrigin:req.headers.origin,remoteAddress:req.socket.remoteAddress,idempotencyKey:req.headers['idempotency-key']};
   let body={};
   if(method==='POST'){
    if(req.headers.origin&&req.headers.origin!==app.baseUrl)error(403,'origin','Cross-origin mutation is denied');
    const limit=path==='/api/cgit/import'?8*1024*1024:/^\/api\/cgit\/repos\/[^/]+\/commit$/.test(path)?3*1024*1024:256*1024;
    body=await readBody(req,limit);
   }
   if(path==='/healthz'&&method==='GET'){await app.store.read('__launch_health','probe');return reply({body:{status:'ok',product:app.product,persistence:app.store.mode,untrusted_execution:'disabled',native_programs:'bounded-pure'}});}
   if(path==='/api/config'&&method==='GET')return reply({body:{product:app.product,purls_url:app.env.PURLS_BASE_URL??(app.product==='purls'?app.baseUrl:null),cgit_url:app.env.CGIT_BASE_URL??(app.product==='cgit'?app.baseUrl:null),legacy_url:'https://purl-api-production.up.railway.app',identity:await app.identity.ready(),mission_url:app.resources.url('/p/consumer-launch-mission'),limits:{data_bytes:10485760,row_bytes:262144,native_source_bytes:65536,default_body_bytes:262144,cgit_import_bytes:8388608,retention:'Data persists until explicit deletion, quota enforcement or an announced policy change; export is available. Free capacity is bounded.'}}});
   if(path==='/.well-known/purl'&&method==='GET')return reply({body:{protocol:'PURL/launch-1',name:app.product==='cgit'?'CGIT Hub':'PURLs',meaning:'Programmable URLs',identity:{system:'PURL Identity',protocol:'OIDC Authorization Code + S256 PKCE',config:app.resources.url('/api/identity/config'),verified_login_available:(await app.identity.ready()).available},endpoints:{identity:app.resources.url('/api/identity/config'),catalog:app.resources.url('/api/catalog'),resources:app.resources.url('/api/resources'),memory:app.resources.url('/api/memory'),cgit:app.resources.url('/api/cgit/repos'),models:app.resources.url('/api/models'),constellations:app.resources.url('/api/constellations'),sdk:app.resources.url('/sdk/launch.js')},mission:{url:app.resources.url('/p/consumer-launch-mission'),continuity:app.resources.url('/api/resources/consumer-launch-mission/continuity')},authority:'Public reading grants no mutation authority. Preview principals are explicitly unverified. Use disclosed authenticated operations and expected versions.'}});
   if(path.startsWith('/api/identity/provider/')){const result=await app.providerConsent.handle(method,path,body,ctx);if(result)return reply(result);error(404,'not_found','Provider operation not found');}
   if(path==='/api/runtime'&&method==='GET')return reply({body:{protocol:'purl-runtime-capabilities/1',product:app.product,node:process.versions.node,architecture:process.arch,source_revision:app.env.PURL_SOURCE_REVISION??null,persistence:app.store.mode,authority:'Supabase scoped CAS records; containers hold no essential state',languages:{purl:'bounded pure interpreter',catalog:'closed registered operators',javascript:'AST indexing only',typescript:'AST indexing only'},untrusted_authored_execution:false,network:{model_provider:'fixed OpenRouter HTTPS origin, explicit credential and budget required',github:'fixed GitHub HTTPS origins, read-only, bounded'},limits:{source_bytes:65536,artifact_bytes:65536,row_bytes:262144,tenant_bytes:10485760,history_versions:200},worker:{leases:'persisted CAS fencing',interrupted_native_jobs:'retryable deterministic pure execution',interrupted_model_calls:'ambiguous calls never automatically repeated'},portability:{api_start:'node service/launch/main.js',worker_start:'node service/launch/worker-main.js',healthcheck:'node deploy/healthcheck.js',adapter:'Docker/Railway now; Oracle worker on same image and authoritative backend'}}});
   if(path.startsWith('/api/identity/')||path.startsWith('/api/agents/')){
    const result=await app.identity.handle(method,path,body,ctx);if(result)return reply(result);error(404,'not_found','Identity operation not found');
   }
   let actor=await app.identity.authenticate(ctx);
   if(req.headers.authorization&&!actor)error(401,'authentication_required','Bearer credential is invalid, expired or revoked');
   if(method==='POST'){
    if(actor)actor=await app.identity.requireActor(body,ctx);
    const key=actor?.id??req.socket.remoteAddress,now=Date.now(),entry=rates.get(key);
    const bucket=entry&&now-entry.at<60000?entry:{at:now,count:0};if(++bucket.count>120)error(429,'rate_limit','Mutation limit reached; retry after one minute');rates.set(key,bucket);
    if(rates.size>10000)for(const[k,v]of rates)if(now-v.at>60000)rates.delete(k);
   }
   if(path==='/api/compiler'&&method==='GET')return reply({body:{protocol:'purl-compiler/1',language:'purl',operations:[{name:'compile',method:'POST',href:app.resources.url('/api/compiler'),available:true,requires:[],effects:[],input_schema:{type:'object',properties:{source:{anyOf:[{type:'string'},{type:'object'}]}},required:['source']},output:'Compilation diagnostics and bounded plan; no execution or state mutation'}],limits:{request_bytes:262144,native_resource_source_bytes:65536,authored_code:'disabled'},next:'Use the resource manifest for authenticated build, run, publish and checkpoint operations.'}});
   if(path==='/api/compiler'&&method==='POST')return reply({body:compile(body.source)});
   const profile=/^\/api\/profile\/([a-z0-9-]+)$/.exec(path);
   if(profile&&method==='GET'){
    const resolved=await app.store.resolveHandle(profile[1]);if(!resolved)error(404,'not_found','PURL handle not found');
    const account=(await app.store.read(resolved.subject,'profile:identity'))?.value;if(!account||account.deleted)error(404,'not_found','PURL handle not found');
    const resources=(await app.store.list(resolved.subject,{prefix:'resource/'})).filter(r=>r.value.visibility==='public').map(r=>({id:r.value.id,title:r.value.title,url:app.resources.url(`/p/${r.value.id}`)}));
    return reply({body:{id:resolved.subject,handle:resolved.handle,canonical_url:app.resources.url(`/@${resolved.handle}`),identity_status:account.kind==='human'?'provider-verified human':'self-declared',resources}});
   }
   let cgitActor=actor;
   if(path.startsWith('/api/cgit/')&&actor&&actor.product!=='cgit'){
    const readOnly=method==='GET'||/^\/api\/cgit\/lenses\/[^/]+\/(?:query|diff)$/.test(path);
    cgitActor=await app.identity.authorizeIntegration(actor,'cgit',readOnly?['cgit:read']:['cgit:read','cgit:write']);
   }
   for(const [service,who]of [[app.memory,actor],[app.catalog,actor],[app.cgit,cgitActor],[app.gateway,actor],[app.constellations,actor],[app.resources,actor]]){
    const result=await service.handle(method,path,body,who,ctx);if(result)return reply(result);
   }
   const p=/^\/p\/([A-Za-z0-9_-]+)$/.exec(path);
   if(p&&method==='GET'&&/application\/(?:purl\+json|json)/i.test(req.headers.accept??'')){
    const experience=app.catalog.catalog().find(e=>e.id===p[1]);
    if(experience){const available=experience.status==='working'&&Boolean(actor)&&experience.permissions.every(scope=>actor.scopes?.includes(scope));return reply({body:{protocol:'PURL/launch-1',program:{id:experience.id,title:experience.title,kind:'experience',language:experience.graph.protocol,input_schema:experience.input_schema,output_schema:experience.output_schema},experience,authority:{principal_id:actor?.id??null,rights:available?['read','run']:['read']},operations:[{name:'run',method:'POST',href:app.resources.url(`/api/catalog/${experience.id}/run`),input_schema:{type:'object',properties:{input:experience.input_schema},required:['input']},requires:experience.permissions,effects:experience.effects,available}],links:{self:app.resources.url(path),source:app.resources.url(`/api/catalog/${experience.id}`),sdk:app.resources.url('/sdk/launch.js')}}});}
    return reply(await app.resources.handle('GET',`/api/resources/${p[1]}/manifest`,{},actor,ctx));
   }
   if(path.startsWith('/api/'))error(404,'not_found','API operation not found');
   const files={'/sdk/launch.js':['sdk/launch.js','text/javascript'], '/consumer/app.js':['web/consumer/app.js','text/javascript'],'/consumer/style.css':['web/consumer/style.css','text/css'],'/cgit/app.js':['web/cgit/app.js','text/javascript'],'/cgit/style.css':['web/cgit/style.css','text/css'],'/identity/app.js':['web/identity/app.js','text/javascript'],'/identity/style.css':['web/identity/style.css','text/css'],'/oauth/consent':['web/identity/index.html','text/html']};
   const font=/^\/assets\/([A-Za-z0-9._-]+\.(?:ttf|woff2?|txt))$/.exec(path);if(font)files[path]=[`web/assets/${font[1]}`,font[1].endsWith('.txt')?'text/plain':font[1].endsWith('.ttf')?'font/ttf':'font/woff2'];
   const document=/^\/mission\/documents\/((?:0[0-7]_[A-Z_]+|CODEX_MASTER)\.md)$/.exec(path);if(document)files[path]=[`reference/consumer-launch/${document[1]}`,'text/markdown'];
   if(files[path]){const [file,type]=files[path],content=await readFile(resolve(ROOT,file));res.writeHead(200,{...HEADERS,'content-type':`${type}; charset=utf-8`});return res.end(req.method==='HEAD'?'':content);}
   if(path==='/favicon.ico')return reply({status:204});
   if(!/^\/(?:$|discover$|my-purl$|memory$|ais$|constellations(?:\/[A-Za-z0-9_-]+)?$|worlds$|models$|account$|auth\/callback$|oauth\/consent$|settings$|repos(?:\/[A-Za-z0-9_-]+)?$|repo\/[A-Za-z0-9_-]+$|repositories(?:\/[A-Za-z0-9_-]+)?$|github$|lens(?:\/[A-Za-z0-9_-]+)?$|p\/[A-Za-z0-9_-]+$|@[a-z0-9-]+$)/.test(path))error(404,'not_found','Page not found');
   const content=await readFile(resolve(ROOT,`web/${app.product==='cgit'?'cgit':'consumer'}/index.html`));res.writeHead(200,{...HEADERS,'content-type':'text/html; charset=utf-8',link:'</.well-known/purl>; rel="service-desc"; type="application/purl+json"'});res.end(req.method==='HEAD'?'':content);
  }catch(e){
   if(res.headersSent){res.end();return;}
   const status=Number.isInteger(e.status)?e.status:e.code==='ENOENT'?404:500;
   if(status>=500)console.error(JSON.stringify({event:'launch_request_failed',code:e.code??'internal_error',status}));
   reply({status,body:{error:{code:e.code??'internal_error',message:status>=500&&!e.code?'The operation could not be completed':e.message, ...(e.details?{details:e.details}:{})}}});
  }
 });
 server.requestTimeout=60000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 return server;
}
