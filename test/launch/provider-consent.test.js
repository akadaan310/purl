import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MemoryLaunchStore } from '../../service/launch/store.js';
import { IdentityService } from '../../service/launch/identity.js';
import { digest, stablePrincipal } from '../../service/launch/identity-crypto.js';

const loaded = await import('../../service/launch/provider-consent.js').catch(() => ({}));
const { ProviderConsentService } = loaded;
const baseUrl = 'https://identity.example.test';
const path = '/api/identity/provider';
const cookie = result => result.headers['set-cookie'].split(';')[0];
const rejected = (status, code) => error => error.status === status && (!code || error.code === code);

async function fixture(t) {
  const requests = [], tokens = new Map(), authorizations = new Map();
  let mode = 'ok', origin, counter = 0, tokenExpiry;
  const user = {id:'verified-user', email:'private@example.test', email_confirmed_at:'2026-01-01T00:00:00Z', user_metadata:{private:'never expose'}};
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const parsed = raw ? JSON.parse(raw) : null;
    requests.push({method:req.method,url:req.url,headers:req.headers,body:parsed});
    const send = (status, body) => {res.writeHead(status, {'content-type':'application/json'});res.end(JSON.stringify(body));};
    const url = new URL(req.url, origin);
    if (mode === 'unavailable') return send(503, {message:'provider outage secret detail'});
    if (url.pathname.endsWith('/.well-known/oauth-authorization-server')) return mode === 'disabled' ? send(404, {error:'feature_disabled'}) : send(200, {
      issuer:origin+'/auth/v1',authorization_endpoint:origin+'/auth/v1/oauth/authorize',token_endpoint:origin+'/auth/v1/oauth/token',userinfo_endpoint:origin+'/auth/v1/oauth/userinfo',code_challenge_methods_supported:['S256']
    });
    if (url.pathname === '/auth/v1/token') {
      assert.equal(url.searchParams.get('grant_type'), 'password');
      if (parsed.password === 'wrong-password') return send(400, {error_code:'invalid_credentials',message:'do not expose upstream private data'});
      const access = 'fixture-access-'+(++counter), refresh = 'fixture-refresh-'+counter;
      tokens.set(access, {...user, ...(mode === 'unverified' ? {email_confirmed_at:null,confirmed_at:'2026-01-01',user_metadata:{email_verified:true}} : {})});
      tokenExpiry = Math.floor(Date.now()/1000)+(mode === 'short' ? 1 : 3600);
      return send(200, {access_token:access,refresh_token:refresh,expires_in:mode === 'short' ? 1 : 3600,expires_at:tokenExpiry,user:{...user,email_confirmed_at:'forged-token-response'}});
    }
    if (url.pathname === '/auth/v1/user') return tokens.has(req.headers.authorization?.slice(7)) ? send(200, tokens.get(req.headers.authorization.slice(7))) : send(401, {error:'bad_jwt'});
    if (url.pathname === '/auth/v1/logout') {tokens.delete(req.headers.authorization?.slice(7));return send(200, {});}
    if (url.pathname === '/auth/v1/signup') return send(200, {id:user.id,email:user.email});
    if (url.pathname === '/auth/v1/recover') return send(200, {});
    const match = url.pathname.match(/^\/auth\/v1\/oauth\/authorizations\/([^/]+)(\/consent)?$/);
    if (match) {
      if (!tokens.has(req.headers.authorization?.slice(7))) return send(401, {});
      const item = authorizations.get(match[1]);
      if (!item || item.used) return send(404, {error_code:'oauth_authorization_not_found'});
      assert.equal(req.headers.origin, baseUrl);
      if (!match[2]) return send(200, item.auto ? {redirect_url:item.redirect_uri+'?code=auto&state=fixture-state'} : item);
      assert.ok(['approve','deny'].includes(parsed.action)); item.used = true;
      return send(200, {redirect_url:mode === 'evil-redirect' ? 'https://evil.test/auth/callback?code=stolen' : item.redirect_uri+'?'+(parsed.action === 'approve' ? 'code=fixture-code' : 'error=access_denied')+'&state=fixture-state'});
    }
    return send(404, {});
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = 'http://127.0.0.1:'+server.address().port;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const store = new MemoryLaunchStore();
  const env = {NODE_ENV:'test',PURL_IDENTITY_ALLOW_HTTP:'true',SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',PURL_IDENTITY_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),PURLS_BASE_URL:'https://purls.example.test',CGIT_BASE_URL:'https://cgit.example.test',PURL_OIDC_CLIENT_ID:'purls-client',PURL_PRODUCT:'purls',SUPABASE_AUTH_REDIRECT_ALLOWLIST:baseUrl+'/oauth/consent'};
  const identity = new IdentityService({store,baseUrl,env});
  assert.equal(typeof ProviderConsentService, 'function', 'provider consent adapter is implemented');
  const service = new ProviderConsentService({store,identity,baseUrl,env});
  const bootstrap = identity.bootstrap();
  const entry = {headers:{origin:baseUrl,cookie:identity.bootstrapCookie+'='+bootstrap,'x-csrf-token':bootstrap}};
  const call = (method, route, body={},context=entry) => service.handle(method,path+route,body,context);
  const authorization = (id='request-one', changes={}) => authorizations.set(id,{authorization_id:id,client:{id:'purls-client',name:'newPURLs production',uri:'javascript:evil()',logo_uri:'https://tracker.test/logo'},user:{id:user.id,email:user.email},scope:'openid email profile',redirect_uri:env.PURLS_BASE_URL+'/auth/callback',...changes});
  const signin = async () => {const result = await call('POST','/signin',{email:user.email,password:'fixture-password'});return {result,context:{headers:{origin:baseUrl,cookie:cookie(result),'x-csrf-token':result.body.csrf_token}}};};
  return {service,store,env,identity,entry,requests,tokens,authorizations,authorization,call,signin,user,setMode:value=>mode=value,origin,getTokenExpiry:()=>tokenExpiry};
}

test('provider readiness is public and read-only, reports disabled server without modifying defaults', async t => {
  const f = await fixture(t), before = await f.store.snapshot();
  assert.equal((await f.call('GET','/config',{},{})).body.available, true);
  assert.deepEqual(await f.store.snapshot(), before);
  f.setMode('disabled');
  const config = await f.call('GET','/config',{},{});
  assert.equal(config.body.available, false);
  assert.match(config.body.blockers.join(' '), /disabled|unavailable/);
  assert.equal(config.body.authorization_path, '/oauth/consent');
  assert.equal(f.requests.some(r => r.method !== 'GET'), false);
});

test('password signin uses provider REST and stores encrypted expiring opaque session only', async t => {
  const f = await fixture(t), {result,context} = await f.signin();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.user, {id:f.user.id,email:f.user.email,email_verified:true});
  assert.match(result.headers['set-cookie'], /^purl_provider_session=[A-Za-z0-9_-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/);
  assert.ok(!result.headers['set-cookie'].includes('Domain='));
  const state = JSON.stringify(await f.store.snapshot());
  for (const secret of ['fixture-password','fixture-access-1','fixture-refresh-1',cookie(result).split('=')[1]]) assert.ok(!state.includes(secret));
  const scope = '__provider_session:'+digest(cookie(result).split('=')[1]);
  const row = await f.store.read(scope,'record');
  assert.equal(typeof row.value.tokens, 'string');
  assert.ok(Date.parse(row.value.expiresAt) <= Date.now()+3600000);
  assert.equal((await f.call('GET','/me',{},context)).body.user.email_verified,true);
  const request = f.requests.find(r=>r.url.startsWith('/auth/v1/token'));
  assert.deepEqual(request.body,{email:f.user.email,password:'fixture-password'});
  assert.equal(request.headers.apikey,'sb_publishable_fixture');
});

test('signin requires matching origin and bound bootstrap, rejects wrong credentials and live unverified email', async t => {
  const f = await fixture(t);
  await assert.rejects(f.call('POST','/signin',{email:f.user.email,password:'fixture-password'},{headers:{...f.entry.headers,origin:'https://evil.test'}}),rejected(403));
  await assert.rejects(f.call('POST','/signin',{email:f.user.email,password:'fixture-password'},{headers:{origin:baseUrl}}),rejected(403));
  await assert.rejects(f.call('POST','/signin',{email:f.user.email,password:'wrong-password'}),rejected(401));
  f.setMode('unverified');
  await assert.rejects(f.signin(),rejected(403,'email_verification_required'));
  assert.deepEqual(await f.store.snapshot(),{scopes:{},handles:{}});
});

test('signup and recovery send exact provider email requests with explicit central redirect allowlist', async t => {
  const f = await fixture(t);
  const signup = await f.call('POST','/signup',{email:f.user.email,password:'fixture-password',authorization_id:'request-one',redirect_to:'https://evil.test',provider_url:'https://evil.test'});
  assert.equal(signup.status,202);assert.equal(signup.body.verification_required,true);
  await f.call('POST','/recover',{email:f.user.email,password:'must-not-forward'});
  const requests = f.requests.filter(r=>/^\/auth\/v1\/(signup|recover)/.test(r.url));
  assert.equal(requests.length,2);
  for (const r of requests) assert.equal(new URL(r.url,f.origin).searchParams.get('redirect_to'),baseUrl+'/oauth/consent');
  assert.deepEqual(requests[0].body,{email:f.user.email,password:'fixture-password'});
  assert.deepEqual(requests[1].body,{email:f.user.email});
  delete f.env.SUPABASE_AUTH_REDIRECT_ALLOWLIST;
  await assert.rejects(f.call('POST','/recover',{email:f.user.email}),rejected(503,'provider_email_redirect_unconfigured'));
  assert.equal((await f.call('GET','/config',{},{})).body.email_redirect_available,false);
});

test('authorization review is explicit POST, GET reads staged exact scopes and approval is bound and one-use', async t => {
  const f = await fixture(t), {context} = await f.signin();f.authorization();
  const count = f.requests.length, snapshot = await f.store.snapshot();
  await assert.rejects(f.call('GET','/authorization',{}, {headers:context.headers,query:new URLSearchParams({authorization_id:'request-one'})}),rejected(409,'authorization_review_required'));
  assert.equal(f.requests.length,count+1); // live /user verification only
  assert.deepEqual(await f.store.snapshot(),snapshot);
  const review = await f.call('POST','/authorization',{authorization_id:'request-one'},context);
  assert.deepEqual(review.body.client,{id:'purls-client',name:'newPURLs production'});
  assert.deepEqual(review.body.scopes,['openid','email','profile']);
  assert.ok(!JSON.stringify(review.body).includes('javascript:'));
  const staged = await f.call('GET','/authorization',{}, {headers:context.headers,query:new URLSearchParams({authorization_id:'request-one'})});
  assert.deepEqual(staged.body,review.body);
  await assert.rejects(f.call('POST','/consent',{authorization_id:'request-one',approve:true},{headers:{...context.headers,'x-csrf-token':f.entry.headers['x-csrf-token']}}),rejected(403));
  const approved = await f.call('POST','/consent',{authorization_id:'request-one',approve:true},context);
  assert.equal(approved.body.redirect_url,'https://purls.example.test/auth/callback?code=fixture-code&state=fixture-state');
  assert.deepEqual(f.requests.find(r=>r.url.endsWith('/consent')).body,{action:'approve'});
  await assert.rejects(f.call('POST','/consent',{authorization_id:'request-one',approve:true},context),rejected(409));
});

test('deny uses provider deny action, refuses implicit approval and unsafe clients or redirects', async t => {
  const f = await fixture(t), {context} = await f.signin();f.authorization();
  await f.call('POST','/authorization',{authorization_id:'request-one'},context);
  await assert.rejects(f.call('POST','/consent',{authorization_id:'request-one'},context),rejected(400));
  const denied = await f.call('POST','/consent',{authorization_id:'request-one',approve:false},context);
  assert.match(denied.body.redirect_url,/error=access_denied/);
  assert.deepEqual(f.requests.find(r=>r.url.endsWith('/consent')).body,{action:'deny'});
  for (const changes of [{redirect_uri:'https://purls.example.test/auth/callback/extra'},{redirect_uri:'https://user:pass@purls.example.test/auth/callback'},{client:{id:'forged-client',name:'fake'}},{user:{id:'other-user'}},{scope:'openid email profile admin'},{authorization_id:'wrong-id'}]) {
    f.authorization('unsafe-request',changes);
    await assert.rejects(f.call('POST','/authorization',{authorization_id:'unsafe-request'},context),rejected(403));
  }
  f.authorization('auto-request',{auto:true});
  await assert.rejects(f.call('POST','/authorization',{authorization_id:'auto-request'},context),rejected(409,'provider_implicit_approval'));
  f.authorization('evil-response');
  await f.call('POST','/authorization',{authorization_id:'evil-response'},context);f.setMode('evil-redirect');
  await assert.rejects(f.call('POST','/consent',{authorization_id:'evil-response',approve:true},context),rejected(403,'provider_redirect_rejected'));
});

test('live provider revocation, deletion, expiry, tampering and logout fail closed', async t => {
  const f = await fixture(t), a = await f.signin();
  f.tokens.clear();await assert.rejects(f.call('GET','/me',{},a.context),rejected(401));
  const b = await f.signin();
  for (const [token,user] of f.tokens) f.tokens.set(token,{...user,email_confirmed_at:null});
  await assert.rejects(f.call('GET','/me',{},b.context),rejected(403));
  f.tokens.clear();const c = await f.signin();
  const owner = stablePrincipal(f.origin+'/auth/v1',f.user.id);
  await f.store.commit('__identity_deletion:'+owner,[{key:'identity:deletion',expectedVersion:0,value:{deleted:true}}]);
  await assert.rejects(f.call('GET','/me',{},c.context),rejected(403));
  await f.store.erase('__identity_deletion:'+owner);
  const d = await f.signin(), hash = digest(cookie(d.result).split('=')[1]), scope = '__provider_session:'+hash;
  let row = await f.store.read(scope,'record');
  await f.store.commit(scope,[{key:'record',expectedVersion:row.version,value:{...row.value,expiresAt:new Date(0).toISOString()}}]);
  await assert.rejects(f.call('GET','/me',{},d.context),rejected(401));
  const e = await f.signin();f.setMode('unavailable');
  const logout = await f.call('POST','/logout',{},e.context);
  assert.equal(logout.body.logged_out,true);assert.equal(logout.body.provider_revoked,false);
  assert.match(logout.headers['set-cookie'],/Max-Age=0/);
  f.setMode('ok');await assert.rejects(f.call('GET','/me',{},e.context),rejected(401));
});

test('session credentials are isolated by namespace and provider errors never disclose private upstream bodies', async t => {
  const f = await fixture(t), a = await f.signin(), b = await f.signin();
  assert.notEqual(cookie(a.result),cookie(b.result));
  await assert.rejects(f.call('POST','/logout',{}, {headers:{...a.context.headers,'x-csrf-token':b.result.body.csrf_token}}),rejected(403));
  await f.call('POST','/logout',{},a.context);
  assert.equal((await f.call('GET','/me',{},b.context)).body.user.id,f.user.id);
  f.setMode('unavailable');
  await assert.rejects(f.call('GET','/me',{},b.context),error=>error.status===503&&!error.message.includes('secret detail'));
  assert.equal(await f.service.handle('GET','/elsewhere',{},{}),null);
  assert.equal(await f.service.handle('GET',path+'/unknown',{},{}),null);
});

test('review lifetime, wrong authorization and ciphertext tampering block consent without upstream approval', async t => {
  const f = await fixture(t), {context,result} = await f.signin();f.authorization();
  await f.call('POST','/authorization',{authorization_id:'request-one'},context);
  await assert.rejects(f.call('POST','/consent',{authorization_id:'another-request',approve:true},context),rejected(409));
  const now = Date.now();f.identity.clock = () => now+300001;
  await assert.rejects(f.call('POST','/consent',{authorization_id:'request-one',approve:true},context),rejected(409));
  assert.equal(f.requests.filter(r=>r.url.endsWith('/consent')).length,0);
  f.identity.clock = () => now;
  const sessionScope = '__provider_session:'+digest(cookie(result).split('=')[1]), row = await f.store.read(sessionScope,'record');
  await f.store.commit(sessionScope,[{key:'record',expectedVersion:row.version,value:{...row.value,tokens:row.value.tokens+'broken'}}]);
  await assert.rejects(f.call('GET','/me',{},context),rejected(401));
});

test('configuration rejects secret keys, non-origin URLs and production HTTP without provider requests', async t => {
  const f = await fixture(t);
  for (const patch of [{SUPABASE_PUBLISHABLE_KEY:'sb_secret_never_use'},{SUPABASE_URL:'https://user:pass@example.test'},{SUPABASE_URL:'https://example.test/user/path'},{PURL_IDENTITY_ENCRYPTION_KEY:'bad-key'},{NODE_ENV:'production'}]) {
    const service = new ProviderConsentService({store:f.store,identity:f.identity,baseUrl,env:{...f.env,...patch}});
    const before = f.requests.length;
    const config = await service.handle('GET',path+'/config',{},{});
    assert.equal(config.body.available,false);assert.equal(f.requests.length,before);
  }
});

test('expired bootstrap and per-source rate limits prevent password dispatch', async t => {
  const f = await fixture(t), before = f.requests.length;
  f.identity.clock = () => Date.now()+600001;
  await assert.rejects(f.signin(),rejected(403));
  assert.equal(f.requests.length,before);
  f.identity.clock = () => Date.now();
  for (let i=0;i<30;i++) {
    try { await f.call('POST','/signin',{email:'invalid',password:'fixture-password'}); } catch (error) {assert.ok([400,429].includes(error.status));}
  }
  await assert.rejects(f.signin(),rejected(429));
  assert.equal(f.requests.filter(r=>r.url.startsWith('/auth/v1/token')).length,0);
});

test('read-only me restores cookie session and CSRF after browser refresh without an Origin header', async t => {
  const f = await fixture(t), {result,context} = await f.signin();f.authorization();
  const before = await f.store.snapshot();
  const refresh = {headers:{cookie:cookie(result)}};
  const me = await f.call('GET','/me',{},refresh);
  assert.equal(me.body.csrf_token,result.body.csrf_token);
  assert.deepEqual(await f.store.snapshot(),before);
  await f.call('POST','/authorization',{authorization_id:'request-one'},context);
  const staged = await f.call('GET','/authorization',{}, {...refresh,query:{authorization_id:'request-one'}});
  assert.equal(staged.body.authorization_id,'request-one');
  await assert.rejects(f.call('POST','/consent',{authorization_id:'request-one',approve:true},refresh),rejected(403));
});

test('processing time cannot extend a local session past the exact provider expiry', async t => {
  const f = await fixture(t);let time = Date.now();f.identity.clock = () => time+=100;
  const {result} = await f.signin();
  assert.ok(Date.parse(result.body.expires_at) <= f.getTokenExpiry()*1000);
});

for (const route of ['/authorization','/consent']) {
  test(`slow live verification crossing session expiry prevents ${route} mutation`, async t => {
    const f = await fixture(t), {result,context} = await f.signin();f.authorization();
    let now = Date.parse(result.body.expires_at)-5000;f.identity.clock = () => now;
    if (route === '/consent') await f.call('POST','/authorization',{authorization_id:'request-one'},context);
    const snapshot = await f.store.snapshot(), before = f.requests.length;
    const fetcher = f.service.fetch;
    f.service.fetch = async (url,options) => {
      const response = await fetcher(url,options);
      if (new URL(url).pathname === '/auth/v1/user') now+=6000;
      return response;
    };
    await assert.rejects(f.call('POST',route,{authorization_id:'request-one',approve:true},context),rejected(401,'provider_session_expired'));
    assert.deepEqual(f.requests.slice(before).map(request=>request.url),['/auth/v1/user']);
    assert.deepEqual(await f.store.snapshot(),snapshot);
  });
}

test('consent CAS crossing session expiry cannot dispatch an upstream decision', async t => {
  const f = await fixture(t), {result,context} = await f.signin();f.authorization();
  let now = Date.parse(result.body.expires_at)-5000;f.identity.clock = () => now;
  await f.call('POST','/authorization',{authorization_id:'request-one'},context);
  const commit = f.store.commit.bind(f.store);
  f.store.commit = async (...args) => {
    const result = await commit(...args);
    if (args[1].some(change=>change.key === 'record' && change.value?.review === null)) now+=6000;
    return result;
  };
  await assert.rejects(f.call('POST','/consent',{authorization_id:'request-one',approve:true},context),rejected(401,'provider_session_expired'));
  assert.equal(f.requests.some(request=>request.url.endsWith('/consent')),false);
});
