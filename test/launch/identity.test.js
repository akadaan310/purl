import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MemoryLaunchStore } from '../../service/launch/store.js';
import { generateKeyPairSync, sign, createHash, randomBytes } from 'node:crypto';

const hash=x=>createHash('sha256').update(x).digest('base64url');
const cookie = r => (Array.isArray(r.headers?.['set-cookie'])?r.headers['set-cookie']:[r.headers?.['set-cookie']]).filter(Boolean).map(x=>x.split(';')[0]).join('; ');
async function provider(t) {
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk=publicKey.export({format:'jwk'});Object.assign(jwk,{kid:'mock',alg:'RS256',use:'sig'});
  const codes=new Map(), tokens=new Map(); let issuer; let mode='ok';let enabled=true;
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const b of req)raw+=b;
    res.setHeader('content-type','application/json');
    const send=(code,obj)=>{res.statusCode=code;res.end(JSON.stringify(obj));};
    if(req.url.includes('.well-known'))return enabled?send(200,{issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',userinfo_endpoint:issuer+'/userinfo',jwks_uri:issuer+'/jwks',revocation_endpoint:issuer+'/revoke',response_types_supported:['code'],id_token_signing_alg_values_supported:['RS256'],subject_types_supported:['public'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['client_secret_basic']}):send(404,{error:'feature_disabled'});
    if(req.url==='/jwks')return send(200,{keys:[jwk]});
    if(req.url==='/token') {
      const clientAuth = Buffer.from(req.headers.authorization?.replace(/^Basic /, '') || '', 'base64').toString().split(':').map(decodeURIComponent).join(':');
      if (!['purls-client:synthetic-secret', 'cgit-client:synthetic-secret'].includes(clientAuth)) return send(401, {error:'invalid_client'});
      const p=new URLSearchParams(raw), item=codes.get(p.get('code'));codes.delete(p.get('code'));
      if(!item||hash(p.get('code_verifier')||'')!==item.challenge||p.get('redirect_uri')!==item.redirect)return send(400,{error:'invalid_grant'});
      const now=Math.floor(Date.now()/1000); const claims={iss:mode==='issuer'?'https://wrong.invalid':issuer,sub:item.sub,aud:mode==='aud'?'wrong':item.client,iat:now,exp:mode==='expired'?now-300:now+3600,nonce:mode==='nonce'?'wrong':item.nonce,email:'private@example.test',email_verified:mode!=='unverified',name:'Test Human'};
      const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'mock'})).toString('base64url'),p64=Buffer.from(JSON.stringify(claims)).toString('base64url');const data=h+'.'+p64;const jwt=data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
      const access=randomBytes(24).toString('hex');tokens.set(access,{sub:item.sub,email_verified:true});return send(200,{access_token:access,id_token:mode==='signature'?jwt.slice(0,-4)+'AAAA':jwt,token_type:'Bearer',expires_in:3600});
    }
    if(req.url==='/userinfo'){const v=tokens.get(req.headers.authorization?.slice(7));return v?send(200,v):send(401,{error:'invalid_token'});}
    if(req.url==='/revoke'){tokens.delete(new URLSearchParams(raw).get('token'));return send(200,{});}
    return send(404,{});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));issuer=`http://127.0.0.1:${server.address().port}`;
  return {issuer,tokens,setMode:x=>mode=x,setEnabled:x=>enabled=x,code(url,sub='human-1'){const u=new URL(url);assert.equal(u.searchParams.get('code_challenge_method'),'S256');const code=randomBytes(16).toString('hex');codes.set(code,{sub,client:u.searchParams.get('client_id'),nonce:u.searchParams.get('nonce'),challenge:u.searchParams.get('code_challenge'),redirect:u.searchParams.get('redirect_uri')});return {code,state:u.searchParams.get('state')};}};
}
async function setup(t,product='purls',store=new MemoryLaunchStore()) {
 const {IdentityService}=await import('../../service/launch/identity.js');const p=await provider(t);const env={NODE_ENV:'test',PURL_IDENTITY_ALLOW_HTTP:'true',PURL_IDENTITY_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),PURL_OIDC_ISSUER:p.issuer,PURL_OIDC_CLIENT_ID:product+'-client',PURL_OIDC_CLIENT_SECRET:'synthetic-secret'};
 const service=new IdentityService({store,product,baseUrl:'http://localhost:3000',env});return {service,p,env,store};
}
async function start(service){const config=await service.handle('GET','/api/identity/config',{},{});assert.equal(config.body.available,true);const ctx={headers:{origin:'http://localhost:3000',cookie:cookie(config),'x-csrf-token':config.body.csrf_token}};const login=await service.handle('POST','/api/identity/login',{},ctx);return {login,ctx:{headers:{...ctx.headers,cookie:cookie(login)}}};}
async function login(f,sub){const {login,ctx}=await start(f.service);const callback=await f.service.handle('POST','/api/identity/callback',f.p.code(login.body.authorization_url,sub),ctx);const headers={origin:'http://localhost:3000',cookie:cookie(callback),'x-csrf-token':callback.body.csrf_token};return {callback,ctx:{headers},actor:await f.service.authenticate({headers})};}

test('missing provider fails closed with actionable config and pure recovery',async()=>{const {IdentityService}=await import('../../service/launch/identity.js');const service=new IdentityService({store:new MemoryLaunchStore(),baseUrl:'https://purls.example',env:{}});const r=await service.handle('GET','/api/identity/config',{},{});assert.equal(r.body.available,false);assert.ok(r.body.blockers.length);await assert.rejects(service.handle('POST','/api/identity/recover',{}, {headers:{origin:'https://purls.example'}}),e=>e.status===503);});
test('real code and PKCE establishes verified identity with encrypted tokens and bounded session',async t=>{const f=await setup(t);const r=await login(f);assert.equal(r.actor.verified,true);assert.equal(r.actor.product,'purls');assert.equal(r.callback.body.identity.kind,'human');assert.ok(r.callback.body.csrf_token);assert.ok(!JSON.stringify(r.callback).includes('private@example'));assert.ok(!JSON.stringify(await f.service.record(r.actor.credentialId)).includes('synthetic-secret'));assert.ok(!JSON.stringify(await f.service.record(r.actor.credentialId)).includes([...f.p.tokens.keys()][0]));assert.ok(Date.parse(r.actor.expiresAt)<=Date.now()+3600000);});
for(const mode of ['nonce','aud','issuer','expired','unverified'])test(`rejects ${mode} provider identity`,async t=>{const f=await setup(t);f.p.setMode(mode);const {login:l,ctx}=await start(f.service);await assert.rejects(f.service.handle('POST','/api/identity/callback',f.p.code(l.body.authorization_url),ctx),e=>e.status===401);});
test('state cookie binding and one-use callbacks reject replay',async t=>{const f=await setup(t),{login:l,ctx}=await start(f.service),body=f.p.code(l.body.authorization_url);await assert.rejects(f.service.handle('POST','/api/identity/callback',{...body,state:'forged'},ctx),e=>e.status===401);const r=await f.service.handle('POST','/api/identity/callback',body,ctx);assert.equal(r.status,200);await assert.rejects(f.service.handle('POST','/api/identity/callback',body,ctx),e=>e.status===401);});
test('explicit consent, stable subjects, unique rename and product isolation',async t=>{const f=await setup(t),a=await login(f);assert.deepEqual(a.actor.products,['purls']);const claim=await f.service.handle('POST','/api/identity/claim',{handle:'pearl',activate_cgit:true},a.ctx);assert.deepEqual(claim.body.identity.products,['cgit','purls']);const b=await login(f,'human-2');await assert.rejects(f.service.handle('POST','/api/identity/claim',{handle:'pearl'},b.ctx),e=>e.status===409);const rename=await f.service.handle('POST','/api/identity/rename',{handle:'new-pearl'},a.ctx);assert.equal(rename.body.identity.id,a.actor.id);const {IdentityService}=await import('../../service/launch/identity.js');const cgit=new IdentityService({store:f.store,product:'cgit',baseUrl:'http://localhost:3000',env:{...f.env,PURL_OIDC_CLIENT_ID:'cgit-client'}});assert.equal(await cgit.authenticate(a.ctx),null);const c=await login({...f,service:cgit});assert.equal(c.actor.id,a.actor.id);assert.equal(c.actor.product,'cgit');});
test('origin and CSRF guard mutations, owner and provider revocation invalidate agents',async t=>{const f=await setup(t),a=await login(f);await assert.rejects(f.service.handle('POST','/api/identity/claim',{handle:'x'},{headers:{...a.ctx.headers,origin:'https://evil.test'}}),e=>e.status===403);await assert.rejects(f.service.handle('POST','/api/identity/claim',{handle:'x'},{headers:{...a.ctx.headers,'x-csrf-token':'wrong'}}),e=>e.status===403);const created=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read'],expires_in:120},a.ctx);assert.ok(created.body.credential);const agentCtx={headers:{authorization:'Bearer '+created.body.credential}};const agent=await f.service.authenticate(agentCtx);assert.equal(agent.kind,'agent');assert.equal(agent.owner,a.actor.id);const b=await login(f,'human-2');await assert.rejects(f.service.handle('POST',`/api/agents/${agent.id}/revoke`,{},b.ctx),e=>[403,404].includes(e.status));await f.service.handle('POST','/api/identity/logout',{all_products:true},a.ctx);assert.equal(await f.service.authenticate(a.ctx),null);assert.equal(await f.service.authenticate(agentCtx),null);});
test('live provider revocation blocks sensitive changes and session reads',async t=>{const f=await setup(t),a=await login(f);f.p.tokens.clear();await assert.rejects(f.service.handle('POST','/api/identity/rename',{handle:'revoked'},a.ctx),e=>e.status===401);assert.equal(await f.service.authenticate(a.ctx),null);});
test('guest labels cannot claim verified human or issue delegated agents',async t=>{const f=await setup(t);const c=await f.service.handle('GET','/api/identity/config',{},{});const ctx={headers:{origin:'http://localhost:3000',cookie:cookie(c),'x-csrf-token':c.body.csrf_token}};const g=await f.service.handle('POST','/api/identity/guest',{kind:'human'},ctx);const gc={headers:{origin:'http://localhost:3000',cookie:cookie(g),'x-csrf-token':g.body.csrf_token}};const actor=await f.service.authenticate(gc);assert.equal(actor.verified,false);assert.equal(actor.kind,'guest');await assert.rejects(f.service.handle('POST','/api/identity/claim',{handle:'claimed'},gc),e=>e.status===403);await assert.rejects(f.service.handle('POST','/api/agents/create',{},gc),e=>e.status===403);});
test('disabled provider reports unavailable without fake sign-in',async t=>{const f=await setup(t);f.p.setEnabled(false);const config=await f.service.handle('GET','/api/identity/config',{},{});assert.equal(config.body.available,false);assert.match(config.body.blockers.join(' '),/disabled|unavailable/);});
test('wrong PKCE code and missing flow cookie fail closed',async t=>{const f=await setup(t),a=await start(f.service),b=await start(f.service);const wrong=f.p.code(b.login.body.authorization_url);const right=f.p.code(a.login.body.authorization_url);await assert.rejects(f.service.handle('POST','/api/identity/callback',right,{headers:{origin:'http://localhost:3000'}}),e=>e.status===401);await assert.rejects(f.service.handle('POST','/api/identity/callback',{code:wrong.code,state:right.state},a.ctx),e=>e.status===401);});
test('flow, session and delegated credential expiry are enforced',async t=>{const f=await setup(t);const base=Date.now();f.service.clock=()=>base;const a=await login(f);const created=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read'],expires_in:2},a.ctx);const c={headers:{authorization:'Bearer '+created.body.credential}};assert.ok(await f.service.authenticate(c));f.service.clock=()=>base+3000;assert.equal(await f.service.authenticate(c),null);f.service.clock=()=>base+3601000;assert.equal(await f.service.authenticate(a.ctx),null);const pending=await start(f.service);f.service.clock=()=>base+4301000;await assert.rejects(f.service.handle('POST','/api/identity/callback',f.p.code(pending.login.body.authorization_url),pending.ctx),e=>e.status===401);});
test('agent scopes attenuate, worker lookup binds audience, and raw credentials are returned only at creation',async t=>{const f=await setup(t),a=await login(f);await assert.rejects(f.service.handle('POST','/api/agents/create',{scopes:['cgit:write']},a.ctx),e=>e.status===400);await assert.rejects(f.service.handle('POST','/api/agents/create',{scopes:['memory:read'],expires_in:86401},a.ctx),e=>e.status===400);const r=await f.service.handle('POST','/api/agents/create',{scopes:['resources:read'],expires_in:100},a.ctx);const agent=r.body.agent;assert.equal(await f.service.authenticateCredentialId(digestToken(r.body.credential),{product:'cgit'}),null);const me=await f.service.handle('GET','/api/identity/me',{}, {headers:{authorization:'Bearer '+r.body.credential}});assert.equal(me.body.credential,undefined);await f.service.handle('POST',`/api/agents/${agent.id}/revoke`,{},a.ctx);assert.equal(await f.service.authenticateCredentialId(digestToken(r.body.credential)),null);});
const digestToken=x=>createHash('sha256').update(x).digest('hex');
test('product consent removal and account deletion revoke sessions and erase owned data',async t=>{const f=await setup(t),a=await login(f);await f.store.commit(a.actor.id,[{key:'memory:private',expectedVersion:0,value:{secret:'owned'}}]);const exported=await f.service.handle('GET','/api/identity/export',{},a.ctx);assert.ok(exported.body.profiles.length);assert.ok(!JSON.stringify(exported.body).includes('access_token'));await assert.rejects(f.service.handle('POST','/api/identity/delete',{confirm:'no'},a.ctx),e=>e.status===400);await f.service.handle('POST','/api/identity/deactivate',{},a.ctx);assert.equal(await f.service.authenticate(a.ctx),null);const b=await login(f);const deleted=await f.service.handle('POST','/api/identity/delete',{confirm:'DELETE'},b.ctx);assert.equal(deleted.body.revoked,true);assert.equal(await f.service.authenticate(b.ctx),null);assert.equal(await f.store.read(a.actor.id,'memory:private'),null);await assert.rejects(login(f),e=>e.status===403);});
test('CGIT first login has separate consent and later PURLs login keeps stable identity',async t=>{const f=await setup(t,'cgit'),a=await login(f);assert.deepEqual(a.actor.products,['cgit']);const {IdentityService}=await import('../../service/launch/identity.js');const purls=new IdentityService({store:f.store,product:'purls',baseUrl:'http://localhost:3000',env:{...f.env,PURL_OIDC_CLIENT_ID:'purls-client'}});const b=await login({...f,service:purls});assert.equal(a.actor.id,b.actor.id);assert.deepEqual(b.actor.products,['cgit','purls']);});
test('self-declared AI preview is an unverified agent with bounded permissions',async t=>{const f=await setup(t);const c=await f.service.handle('GET','/api/identity/config',{},{});const ctx={headers:{origin:'http://localhost:3000',cookie:cookie(c),'x-csrf-token':c.body.csrf_token}};const g=await f.service.handle('POST','/api/identity/guest',{kind:'agent'},ctx);const actor=await f.service.authenticate({headers:{cookie:cookie(g)}});assert.equal(actor.kind,'agent');assert.equal(actor.verified,false);assert.equal(actor.attestation,'self-declared');assert.equal(actor.owner,undefined);assert.ok(actor.id);});
test('session issuance and login flows are bounded by per-source rate limits',async t=>{const f=await setup(t);const config=await f.service.handle('GET','/api/identity/config',{},{});const ctx={remoteAddress:'test-client',headers:{origin:'http://localhost:3000',cookie:cookie(config),'x-csrf-token':config.body.csrf_token}};let limited=false;for(let n=0;n<35;n++){try{await f.service.handle('POST','/api/identity/guest',{},ctx);}catch(e){assert.equal(e.status,429);limited=true;break;}}assert.equal(limited,true);});
test('live verified email removal invalidates account authentication',async t=>{const f=await setup(t),a=await login(f);for(const [token,value]of f.p.tokens)f.p.tokens.set(token,{...value,email_verified:false});assert.equal(await f.service.authenticate(a.ctx),null);});
test('production cannot enable insecure development cookies or an HTTP issuer',async t=>{const f=await setup(t);const {IdentityService}=await import('../../service/launch/identity.js');const production=new IdentityService({store:f.store,baseUrl:'http://localhost:3000',env:{...f.env,NODE_ENV:'production'}});const c=await production.handle('GET','/api/identity/config',{},{});assert.equal(c.body.available,false);assert.equal(c.body.guest_available,false);});
test('tampered ID token signature is rejected by established OIDC verification',async t=>{const f=await setup(t);f.p.setMode('signature');const {login:l,ctx}=await start(f.service);await assert.rejects(f.service.handle('POST','/api/identity/callback',f.p.code(l.body.authorization_url),ctx),e=>e.status===401);});
test('self-declared AI preview can revoke its own session', async t => {
  const f = await setup(t);
  const config = await f.service.handle('GET', '/api/identity/config', {}, {});
  const guest = await f.service.handle('POST', '/api/identity/guest', {kind:'agent'}, {
    headers: {origin:'http://localhost:3000', cookie:cookie(config), 'x-csrf-token':config.body.csrf_token}
  });
  const context = {headers:{origin:'http://localhost:3000', cookie:cookie(guest), 'x-csrf-token':guest.body.csrf_token}};
  await f.service.handle('POST', '/api/identity/logout', {}, context);
  assert.equal(await f.service.authenticate(context), null);
});
test('delegated agents cannot export their owner identity profiles', async t => {
  const f = await setup(t), a = await login(f);
  const created = await f.service.handle('POST', '/api/agents/create', {scopes:['memory:read']}, a.ctx);
  await assert.rejects(f.service.handle('GET', '/api/identity/export', {}, {
    headers:{authorization:'Bearer '+created.body.credential}
  }), error => error.status === 403);
});

async function preview(service, body={}) {
  const config = await service.handle('GET', '/api/identity/config', {}, {});
  const result = await service.handle('POST', '/api/identity/guest', body, {
    headers: {origin:'http://localhost:3000', cookie:cookie(config), 'x-csrf-token':config.body.csrf_token}
  });
  const ctx = {headers:{origin:'http://localhost:3000', cookie:cookie(result), 'x-csrf-token':result.body.csrf_token}};
  return {ctx, result, actor:await service.authenticate(ctx)};
}

test('guest preview scopes match the chosen product and preserve unverified authority', async t => {
  const purls = await setup(t), p = await preview(purls.service);
  assert.deepEqual(p.actor.scopes, ['catalog:run','memory:read','memory:write','memory:share','memory:publish','resources:read','resources:write','models:read']);
  const cgit = await setup(t, 'cgit'), c = await preview(cgit.service);
  assert.deepEqual(c.actor.scopes, ['cgit:read','cgit:write']);
  assert.equal(c.actor.verified, false);
  assert.equal(c.actor.kind, 'guest');
  assert.ok(Date.parse(c.actor.expiresAt) <= Date.now()+1800000);
  await assert.rejects(cgit.service.handle('POST', '/api/identity/claim', {handle:'not-human'}, c.ctx), e=>e.status===403);
  await assert.rejects(cgit.service.handle('POST', '/api/agents/create', {scopes:['cgit:read']}, c.ctx), e=>e.status===403);
});

test('guest CGIT activation requires explicit consent and cannot claim a handle', async t => {
  const f = await setup(t), g = await preview(f.service);
  await assert.rejects(f.service.handle('POST', '/api/identity/activate', {product:'cgit'}, g.ctx), e=>e.status===400);
  await assert.rejects(f.service.handle('POST', '/api/identity/activate', {product:'cgit',consent:true,handle:'stolen'}, g.ctx), e=>e.status===400);
  const activated = await f.service.handle('POST', '/api/identity/activate', {product:'cgit',consent:true}, g.ctx);
  assert.equal(activated.body.identity.verified, false);
  assert.deepEqual(activated.body.identity.products, ['cgit','purls']);
  assert.ok(!activated.body.identity.scopes.includes('cgit:write'));
  const row = await f.store.read(g.actor.id,'profile:cgit');
  assert.equal(row.value.consent.source, 'explicit-activation');
  await f.service.handle('POST', '/api/identity/activate', {product:'cgit',consent:true}, g.ctx);
  assert.deepEqual((await f.store.read(g.actor.id,'profile:cgit')).value, row.value);
});

test('integration authority revalidates credential, persisted consent and exact requested scopes', async t => {
  const f = await setup(t), a = await login(f);
  await assert.rejects(f.service.authorizeIntegration({...a.actor,products:['cgit'],scopes:['cgit:write']}, 'cgit', ['cgit:write']), e=>e.status===403);
  await f.service.handle('POST','/api/identity/activate',{product:'cgit',consent:true},a.ctx);
  await assert.rejects(f.service.authorizeIntegration(a.actor, 'cgit', ['agents:create']),e=>e.status===403);
  const integrated = await f.service.authorizeIntegration(a.actor, 'cgit', ['cgit:write']);
  assert.equal(integrated.id,a.actor.id);
  assert.equal(integrated.product,'cgit');
  assert.equal(integrated.sourceProduct,'purls');
  assert.deepEqual(integrated.scopes,['cgit:write']);
  assert.equal(integrated.verified,true);
  assert.ok(!(await f.service.authenticate(a.ctx)).scopes.includes('cgit:write'));
  await assert.rejects(f.service.authorizeIntegration({...a.actor,id:'someone-else'},'cgit',['cgit:read']),e=>e.status===401);
  await f.service.handle('POST','/api/identity/logout',{},a.ctx);
  await assert.rejects(f.service.authorizeIntegration(a.actor,'cgit',['cgit:read']),e=>e.status===401);
});

test('guest integrations require persisted activation and agents never gain undelegated scopes', async t => {
  const f=await setup(t), g=await preview(f.service);
  await assert.rejects(f.service.authorizeIntegration({...g.actor,products:['cgit']},'cgit',['cgit:write']),e=>e.status===403);
  await f.service.handle('POST','/api/identity/activate',{product:'cgit',consent:true},g.ctx);
  const integrated=await f.service.authorizeIntegration(g.actor,'cgit',['cgit:write']);
  assert.equal(integrated.verified,false);
  assert.equal(integrated.id,g.actor.id);
  const a=await login(f);
  await f.service.handle('POST','/api/identity/activate',{product:'cgit',consent:true},a.ctx);
  const issued=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read']},a.ctx);
  const agent=await f.service.authenticate({headers:{authorization:'Bearer '+issued.body.credential}});
  await assert.rejects(f.service.authorizeIntegration({...agent,scopes:['cgit:write']},'cgit',['cgit:write']),e=>e.status===403);
  const target=await f.store.read(g.actor.id,'profile:cgit');
  await f.store.commit(g.actor.id,[{key:target.key,expectedVersion:target.version,value:{...target.value,active:false}}]);
  await assert.rejects(f.service.authorizeIntegration(integrated,'cgit',['cgit:write']),e=>e.status===403);
});

test('CGIT guest repositories remain isolated and enforce the actual repository quota', async t => {
  const f=await setup(t,'cgit'), a=await preview(f.service), b=await preview(f.service);
  const {CgitService}=await import('../../service/launch/cgit.js');
  const cgit=new CgitService({store:f.store});
  await cgit.authorize(a.actor,true);
  const repo=await cgit.create(a.actor,'Preview repository');
  await assert.rejects(cgit.repo(b.actor,repo.id),e=>e.status===404);
  for(let i=1;i<20;i++)await cgit.create(a.actor,`Preview ${i}`);
  await assert.rejects(cgit.create(a.actor,'Over quota'),e=>e.status===413&&e.code==='repository_quota');
  assert.equal((await cgit.create(b.actor,'Independent preview')).owner,b.actor.id);
});

test('an unrelated Authorization header cannot disable cookie CSRF checks', async t => {
  const f=await setup(t), g=await preview(f.service);
  await assert.rejects(f.service.requireActor({}, {headers:{cookie:g.ctx.headers.cookie,authorization:'not-bearer',origin:'https://evil.test'}}), e=>e.status===403);
});

test('a delegated CGIT read credential can integrate without acquiring write authority', async t => {
  const f=await setup(t,'cgit'), a=await login(f);
  const issued=await f.service.handle('POST','/api/agents/create',{scopes:['cgit:read']},a.ctx);
  const agent=await f.service.authenticate({headers:{authorization:'Bearer '+issued.body.credential}});
  const integrated=await f.service.authorizeIntegration(agent,'cgit',['cgit:read']);
  assert.deepEqual(integrated.scopes,['cgit:read']);
  assert.equal(integrated.owner,a.actor.id);
  assert.equal(integrated.verified,false);
  await assert.rejects(f.service.authorizeIntegration(agent,'cgit',['cgit:write']),e=>e.status===403);
});

test('account deletion erases delegated data and revokes public passports and cognition', async t => {
  const f=await setup(t), a=await login(f);
  const issued=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read','memory:write','memory:share','memory:publish']},a.ctx);
  const agent=await f.service.authenticate({headers:{authorization:'Bearer '+issued.body.credential}});
  const {MemoryService}=await import('../../service/launch/memory.js');
  const memory=new MemoryService({store:f.store});
  const fact=(await memory.handle('POST','/api/memory/create',{text:'Delegated private fact'},agent)).body.fact;
  await memory.handle('POST','/api/memory/publish',{consent:true,fact_ids:[fact.id],purpose:'Deletion regression'},agent);
  const passport=(await memory.handle('POST','/api/memory/passports/create',{consent:true,fact_ids:[fact.id],purpose:'Deletion regression',expires_at:new Date(Date.now()+3600000).toISOString(),allowed_scopes:['memory:read']},agent)).body.passport;
  await f.store.commit(agent.id,[{key:'resources/private',expectedVersion:0,value:{secret:'delegated resource'}}]);
  assert.equal((await memory.readPassport(passport.id)).facts.length,1);
  await f.service.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx);
  assert.deepEqual(await f.store.list(agent.id),[]);
  assert.equal((await memory.cognition()).partitions.length,0);
  await assert.rejects(memory.readPassport(passport.id),e=>[404,410].includes(e.status));
  assert.equal(await f.service.authenticateCredentialId(digestToken(issued.body.credential)),null);
});

test('interrupted deletion retains its descendant plan and resumes across service restart', async t => {
  class InterruptedStore extends MemoryLaunchStore {
    failScope;
    async erase(scope) {if(scope===this.failScope){this.failScope=null;throw Object.assign(new Error('Synthetic persistence interruption'),{status:503});}return super.erase(scope);}
  }
  const store=new InterruptedStore(), f=await setup(t,'purls',store), a=await login(f), agents=[];
  for(let i=0;i<2;i++){
    const issued=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read']},a.ctx);
    agents.push(issued.body.agent.id);
    await store.commit(issued.body.agent.id,[{key:'private',expectedVersion:0,value:{text:'owned'}}]);
  }
  store.failScope=agents[1];
  await assert.rejects(f.service.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx),e=>e.status===503);
  assert.equal(await f.service.authenticate(a.ctx),null);
  const {IdentityService}=await import('../../service/launch/identity.js');
  const restarted=new IdentityService({store,product:'purls',baseUrl:'http://localhost:3000',env:f.env});
  const completed=await restarted.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx);
  assert.equal(completed.body.deleted,true);
  for(const id of agents)assert.deepEqual(await store.list(id),[]);
  assert.equal((await restarted.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx)).body.deleted,true);
  await assert.rejects(login({...f,service:restarted}),e=>e.status===403);
});

test('full legacy identity index partitions cannot deny new issuance for either product', async t => {
  const store=new MemoryLaunchStore();
  for(const scope of ['__identity_credentials','__identity_flows'])for(let start=0;start<4096;start+=32){
    await store.commit(scope,Array.from({length:32},(_,i)=>({key:(start+i).toString(16).padStart(64,'0'),expectedVersion:0,value:{expiresAt:'2020-01-01T00:00:00.000Z',owner:'expired',key:'expired'}})));
  }
  const f=await setup(t,'purls',store), a=await preview(f.service);
  const c=await setup(t,'cgit',store), b=await preview(c.service);
  assert.ok(await f.service.authenticate(a.ctx));
  assert.ok(await c.service.authenticate(b.ctx));
  const pending=await start(f.service);
  const established=await f.service.handle('POST','/api/identity/callback',f.p.code(pending.login.body.authorization_url),pending.ctx);
  assert.equal(established.body.identity.verified,true);
  assert.ok(await f.service.authenticate(a.ctx));
});

test('bounded expiry compaction preserves live credentials and replay defenses', async t => {
  const f=await setup(t), base=Date.now();f.service.clock=()=>base;
  const original=await preview(f.service), expiredFlow=await start(f.service), oldCode=f.p.code(expiredFlow.login.body.authorization_url);
  f.service.clock=()=>base+11*60000;
  const live=await preview(f.service);
  for(let i=0;i<15;i++){const result=await f.service.compactExpired({limit:1,maxBuckets:32});assert.ok(result.erased<=1);}
  await assert.rejects(f.service.handle('POST','/api/identity/callback',oldCode,expiredFlow.ctx),e=>e.status===401);
  assert.ok(await f.service.authenticate(original.ctx));
  assert.ok(await f.service.authenticate(live.ctx));
  f.service.clock=()=>base+31*60000;
  for(let i=0;i<15;i++)await f.service.compactExpired({limit:1,maxBuckets:32});
  assert.equal(await f.service.authenticate(original.ctx),null);
  assert.equal(await f.service.record(original.actor.credentialId),null);
  assert.ok(await f.service.authenticate(live.ctx));
  const pending=await start(f.service), body=f.p.code(pending.login.body.authorization_url);
  await f.service.handle('POST','/api/identity/callback',body,pending.ctx);
  await assert.rejects(f.service.handle('POST','/api/identity/callback',body,pending.ctx),e=>e.status===401);
});

test('failed external intent persistence leaves the owner active and permits a fresh deletion retry', async t => {
  class InterruptedPlanStore extends MemoryLaunchStore {
    failPlan=false;
    async commit(scope,changes,options){if(this.failPlan&&scope.startsWith('__identity_deletion:')){this.failPlan=false;throw Object.assign(new Error('Synthetic plan interruption'),{status:503});}return super.commit(scope,changes,options);}
  }
  const store=new InterruptedPlanStore(), f=await setup(t,'purls',store), a=await login(f);
  const issued=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read']},a.ctx);
  await store.commit(issued.body.agent.id,[{key:'private',expectedVersion:0,value:{data:'erase'}}]);
  store.failPlan=true;
  await assert.rejects(f.service.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx),e=>e.status===503);
  const {IdentityService}=await import('../../service/launch/identity.js');
  const restarted=new IdentityService({store,product:'purls',baseUrl:'http://localhost:3000',env:f.env});
  assert.deepEqual(await restarted.resumeDeletions(),{completed:0,failed:0});
  assert.ok(await restarted.authenticate(a.ctx));
  await restarted.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx);
  assert.deepEqual(await store.list(issued.body.agent.id),[]);
  await restarted.compactExpired();
  await assert.rejects(login({...f,service:restarted}),e=>e.status===403);
});

test('more than 4096 expired session lifetimes reuse bounded owner metadata', async () => {
  const {IdentityService}=await import('../../service/launch/identity.js');
  const store=new MemoryLaunchStore();let now=Date.now();
  const service=new IdentityService({store,baseUrl:'http://localhost:3000',env:{NODE_ENV:'test',PURL_IDENTITY_ALLOW_HTTP:'true'},clock:()=>now});
  await service.provision('lifecycle-preview','guest');
  let last;
  for(let i=0;i<4100;i++){
    now+=31*60000;
    last=await service.session('lifecycle-preview','guest');
  }
  assert.ok(await service.authenticate({headers:{cookie:cookie(last)}}));
  assert.ok((await store.list('lifecycle-preview')).length<=3);
  const active=await store.scan({prefix:'record',limit:200});
  assert.equal(active.length,1);
});

async function fillOwnerQuota(store, owner, headroom=0) {
  const bytes=(await store.list(owner,{limit:200})).reduce((sum,row)=>sum+Buffer.byteLength(JSON.stringify(row.value)),0);
  let remaining=10*1024*1024-bytes-headroom, n=0;
  while(remaining>0) {
    let size=Math.min(250*1024,remaining);
    if(remaining-size>0&&remaining-size<11)size-=11;
    assert.ok(size>=11);
    await store.commit(owner,[{key:`resources/quota-${n++}`,expectedVersion:0,value:{data:'x'.repeat(size-11)}}]);
    remaining-=size;
  }
}

test('account deletion succeeds at exact and near tenant quota without owner growth', async t => {
  for(const headroom of [128,0]) {
    const f=await setup(t), a=await login(f);
    const issued=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read']},a.ctx);
    await f.store.commit(issued.body.agent.id,[{key:'private',expectedVersion:0,value:{secret:'remove'}}]);
    await fillOwnerQuota(f.store,a.actor.id,headroom);
    const deleted=await f.service.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx);
    assert.equal(deleted.body.deleted,true);
    assert.deepEqual(await f.store.list(a.actor.id),[]);
    assert.deepEqual(await f.store.list(issued.body.agent.id),[]);
    assert.equal((await f.store.read(`__identity_deletion:${a.actor.id}`,'identity:deletion')).value.status,'complete');
  }
});

test('a full-quota deletion interrupted after external intent resumes without spare owner space', async t => {
  class InterruptedFenceStore extends MemoryLaunchStore {
    failOwner;
    async commit(scope,changes,options) {
      if(scope===this.failOwner&&changes.some(change=>change.key==='profile:identity'&&(change.value===null||change.value.deleted))) {
        this.failOwner=null;throw Object.assign(new Error('Synthetic fence interruption'),{status:503});
      }
      return super.commit(scope,changes,options);
    }
  }
  const store=new InterruptedFenceStore(), f=await setup(t,'purls',store), a=await login(f);
  const issued=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read']},a.ctx);
  await store.commit(issued.body.agent.id,[{key:'private',expectedVersion:0,value:{secret:'remove'}}]);
  await fillOwnerQuota(store,a.actor.id,0);
  store.failOwner=a.actor.id;
  await assert.rejects(f.service.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx),e=>e.status===503);
  assert.equal((await store.read(`__identity_deletion:${a.actor.id}`,'identity:deletion')).value.status,'fencing');
  assert.equal(await f.service.authenticate(a.ctx),null);
  const {IdentityService}=await import('../../service/launch/identity.js');
  const restarted=new IdentityService({store,baseUrl:'http://localhost:3000',env:f.env});
  assert.deepEqual(await restarted.resumeDeletions(),{completed:1,failed:0});
  assert.deepEqual(await store.list(a.actor.id),[]);
  assert.deepEqual(await store.list(issued.body.agent.id),[]);
});

test('deletion captures a concurrent owned delegation before fencing inventory', async t => {
  class BeforeIntentStore extends MemoryLaunchStore {
    beforeIntent;
    async commit(scope,changes,options){if(this.beforeIntent&&scope.startsWith('__identity_deletion:')){const fn=this.beforeIntent;this.beforeIntent=null;await fn();}return super.commit(scope,changes,options);}
  }
  const store=new BeforeIntentStore(),f=await setup(t,'purls',store),a=await login(f);
  const lateId='agent_late-owned',lateHash='f'.repeat(64);
  store.beforeIntent=async()=>{
    const parent=await f.service.record(a.actor.credentialId);
    await f.service.persistCredential({...parent,id:lateId,kind:'agent',parentCredential:a.actor.credentialId,scopes:['memory:read']},lateHash);
    await store.commit(lateId,[{key:'private',expectedVersion:0,value:{secret:'owned-late'}}]);
  };
  await f.service.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx);
  assert.deepEqual(await store.list(lateId),[]);
  assert.equal(await f.service.record(lateHash),null);
});

test('a persisted deletion intent refuses to erase a changed principal incarnation', async t => {
  class ReplacedPrincipalStore extends MemoryLaunchStore {
    replaceOwner;
    async commit(scope,changes,options) {
      if(this.replaceOwner&&scope.startsWith('__identity_deletion:')) {
        const owner=this.replaceOwner;this.replaceOwner=null;
        const row=await this.read(owner,'profile:identity');
        await super.commit(owner,[{key:'profile:identity',expectedVersion:row.version,value:{kind:'human',issuer:'https://replacement.invalid',subject:'new-subject',generation:0,createdAt:new Date().toISOString()}}]);
        await super.commit(owner,[{key:'replacement-data',expectedVersion:0,value:{must:'remain'}}]);
      }
      return super.commit(scope,changes,options);
    }
  }
  const store=new ReplacedPrincipalStore(),f=await setup(t,'purls',store),a=await login(f);
  store.replaceOwner=a.actor.id;
  await assert.rejects(f.service.handle('POST','/api/identity/delete',{confirm:'DELETE'},a.ctx),e=>e.status===409);
  assert.deepEqual((await store.read(a.actor.id,'replacement-data')).value,{must:'remain'});
  assert.deepEqual(await f.service.resumeDeletions(),{completed:0,failed:1});
  assert.ok(await store.read(a.actor.id,'replacement-data'));
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};

for (const overlap of ['request', 'maintenance']) {
  test(`overlapping deletion ${overlap} preserves the durable fence across mixed read timing`, async () => {
    const beforeCommit=deferred(),allowCommit=deferred(),committed=deferred(),releaseFirst=deferred();
    const owner=`id_fencing_${overlap}`,agentId=`agent_fencing_${overlap}`;
    class InterleavedStore extends MemoryLaunchStore {
      pauseFence=false;
      staleProfile=false;
      async commit(scope,changes,options) {
        if(this.pauseFence&&scope===owner&&changes.some(change=>change.key==='profile:identity'&&change.value===null)) {
          this.pauseFence=false;beforeCommit.resolve();await allowCommit.promise;
          const result=await super.commit(scope,changes,options);
          committed.resolve();await releaseFirst.promise;return result;
        }
        return super.commit(scope,changes,options);
      }
      async read(scope,key) {
        const result=await super.read(scope,key);
        if(this.staleProfile&&scope===owner&&key==='profile:identity') {
          this.staleProfile=false;allowCommit.resolve();await committed.promise;
        }
        return result;
      }
    }
    const {IdentityService}=await import('../../service/launch/identity.js');
    const store=new InterleavedStore();
    const options={store,baseUrl:'http://localhost:3000',env:{NODE_ENV:'test',PURL_IDENTITY_ALLOW_HTTP:'true'}};
    const service=new IdentityService(options),hash='1'.repeat(64),agentHash='2'.repeat(64);
    await service.provision(owner,'human',{issuer:'https://issuer.invalid',subject:overlap});
    const credential={owner,kind:'human',product:'purls',scopes:[],generation:0,productGeneration:1,csrf:'synthetic',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:new Date().toISOString()};
    await service.persistCredential(credential,hash);
    await service.persistCredential({...credential,kind:'agent',id:agentId,parentCredential:hash},agentHash);
    await store.commit(owner,[{key:'private',expectedVersion:0,value:{secret:'must delete'}}]);
    await store.commit(agentId,[{key:'private',expectedVersion:0,value:{secret:'delegated'}}]);
    store.pauseFence=true;
    const first=service.beginDeletion(owner,hash).then(value=>({value}),error=>({error}));
    await beforeCommit.promise;
    store.staleProfile=true;
    const second=await (overlap==='maintenance'?service.resumeDeletions():service.fenceDeletion(owner)).then(value=>({value}),error=>({error}));
    releaseFirst.resolve();
    const firstResult=await first;
    assert.equal(firstResult.error,undefined);
    assert.equal(second.error,undefined);
    if(overlap==='maintenance')assert.deepEqual(second.value,{completed:1,failed:0});
    const restarted=new IdentityService(options);
    assert.deepEqual(await restarted.resumeDeletions(),{completed:overlap==='request'?1:0,failed:0});
    assert.equal((await store.read(`__identity_deletion:${owner}`,'identity:deletion')).value.status,'complete');
    assert.deepEqual(await store.list(owner),[]);
    assert.deepEqual(await store.list(agentId),[]);
  });
}

test('an in-flight agent revocation cannot mutate inventory after the deletion fence', async t => {
  const actorReady=deferred(),releaseActor=deferred(),fenced=deferred(),releaseFence=deferred();
  class PausedStore extends MemoryLaunchStore {
    actorScope;owner;reads=0;pauseFence=false;
    async read(scope,key) {
      const result=await super.read(scope,key);
      if(scope===this.actorScope&&key==='record'&&++this.reads===2) {
        this.actorScope=null;actorReady.resolve();await releaseActor.promise;
      }
      return result;
    }
    async commit(scope,changes,options) {
      const result=await super.commit(scope,changes,options);
      if(this.pauseFence&&scope===this.owner&&changes.some(change=>change.key==='profile:identity'&&change.value===null)) {
        this.pauseFence=false;fenced.resolve();await releaseFence.promise;
      }
      return result;
    }
  }
  const store=new PausedStore(),f=await setup(t,'purls',store),a=await login(f);
  const issued=await f.service.handle('POST','/api/agents/create',{scopes:['memory:read']},a.ctx);
  store.actorScope=`__identity_credential:${a.actor.credentialId}`;
  const revoke=f.service.handle('POST',`/api/agents/${issued.body.agent.id}/revoke`,{},a.ctx).then(value=>({value}),error=>({error}));
  await actorReady.promise;
  store.owner=a.actor.id;store.pauseFence=true;
  const deletion=f.service.beginDeletion(a.actor.id,a.actor.credentialId).then(value=>({value}),error=>({error}));
  await fenced.promise;
  releaseActor.resolve();
  const revoked=await revoke;
  releaseFence.resolve();
  const deleted=await deletion;
  assert.ok([401,403,409].includes(revoked.error?.status));
  assert.equal(deleted.error,undefined);
  assert.deepEqual(await f.service.resumeDeletions(),{completed:1,failed:0});
});

test('unstable inventory reads have bounded retries and later maintenance can recover', async () => {
  const owner='id_bounded_fence';
  class BusyStore extends MemoryLaunchStore {
    armed=false;activate=false;profileReads=0;
    async commit(scope,changes,options) {
      const result=await super.commit(scope,changes,options);
      if(this.activate&&scope===`__identity_deletion:${owner}`){this.activate=false;this.armed=true;}
      return result;
    }
    async read(scope,key) {
      let result=await super.read(scope,key);
      if(this.armed&&scope===owner&&key==='profile:identity'&&++this.profileReads%2===0) {
        const registry=await super.read(owner,'identity:credentials');
        await super.commit(owner,[{key:'profile:identity',expectedVersion:result.version,value:result.value},{key:registry.key,expectedVersion:registry.version,value:registry.value}]);
        result=await super.read(scope,key);
      }
      return result;
    }
  }
  const {IdentityService}=await import('../../service/launch/identity.js');
  const store=new BusyStore(),options={store,baseUrl:'http://localhost:3000',env:{NODE_ENV:'test',PURL_IDENTITY_ALLOW_HTTP:'true'}};
  const service=new IdentityService(options),hash='3'.repeat(64);
  await service.provision(owner,'human',{issuer:'https://issuer.invalid',subject:'bounded'});
  await service.persistCredential({owner,kind:'human',product:'purls',scopes:[],generation:0,productGeneration:1,csrf:'synthetic',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:new Date().toISOString()},hash);
  store.activate=true;
  await assert.rejects(service.beginDeletion(owner,hash),error=>error.status===409&&error.code==='deletion_busy');
  assert.ok(store.profileReads<=16);
  store.armed=false;
  assert.deepEqual(await new IdentityService(options).resumeDeletions(),{completed:1,failed:0});
});
