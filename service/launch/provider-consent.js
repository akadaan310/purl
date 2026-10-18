import { randomToken, digest, stablePrincipal, encryptionKey, seal, unseal, equal } from './identity-crypto.js';

const PREFIX = '/api/identity/provider';
const COOKIE = 'purl_provider_session';
const SCOPES = new Set(['openid', 'email', 'profile']);
const fail = (status, code, message) => { throw Object.assign(new Error(message), {status, code}); };
const header = (ctx, name) => ctx.headers?.get?.(name) ?? ctx.headers?.[name];
const scope = hash => '__provider_session:'+hash;
const safeString = (value, max=256) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

/** Supabase's custom login/consent UI adapter. Supabase owns passwords and OAuth grants. */
export class ProviderConsentService {
  constructor({store, identity, baseUrl, env=process.env, fetch=globalThis.fetch}) {
    this.store = store;
    this.identity = identity;
    this.env = env;
    this.fetch = fetch;
    this.baseUrl = new URL(baseUrl || identity.baseUrl).origin;
    this.key = encryptionKey(env.PURL_IDENTITY_ENCRYPTION_KEY);
    this.rates = new Map();
    this.developmentHTTP = env.NODE_ENV !== 'production' && env.PURL_IDENTITY_ALLOW_HTTP === 'true';
    try {
      const url = new URL(env.SUPABASE_URL);
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(this.developmentHTTP && url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) throw new Error();
      this.providerUrl = url.origin;
      this.issuer = url.origin+'/auth/v1';
    } catch { this.providerUrl = null; }
  }
  now() { return this.identity.now(); }
  origin(context) {
    if ((header(context,'origin') || context.requestOrigin) !== this.baseUrl) fail(403,'origin_required','A matching request Origin is required');
  }
  rate(context) {
    const now = this.now();
    for (const [key,value] of this.rates) if (value.until <= now) this.rates.delete(key);
    const key = digest(String(context.remoteAddress || 'shared-origin'));
    const current = this.rates.get(key) || {count:0,until:now+60000};
    if (current.count >= 30 || (!this.rates.has(key) && this.rates.size >= 10000)) fail(429,'provider_rate_limit','Too many provider requests; retry in one minute');
    current.count++; this.rates.set(key,current);
  }
  publicKey() {
    const key = this.env.SUPABASE_PUBLISHABLE_KEY;
    if (!safeString(key,8192) || key.startsWith('sb_secret_')) return null;
    // Reject accidental legacy admin JWT configuration; never substitute a service key.
    try { if (JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role === 'service_role') return null; } catch {}
    return key;
  }
  emailRedirect() {
    const wanted = this.baseUrl+'/oauth/consent';
    let values = this.env.SUPABASE_AUTH_REDIRECT_ALLOWLIST || '';
    try { values = values.trim().startsWith('[') ? JSON.parse(values) : values.split(',').map(x=>x.trim()); } catch { return null; }
    return Array.isArray(values) && values.includes(wanted) ? wanted : null;
  }
  async readiness() {
    const blockers = [];
    if (!this.providerUrl) blockers.push('SUPABASE_URL must be an exact trusted HTTPS provider origin');
    if (!this.publicKey()) blockers.push('SUPABASE_PUBLISHABLE_KEY is missing or is an unsafe secret key');
    if (!this.key) blockers.push('PURL_IDENTITY_ENCRYPTION_KEY must be 32 bytes in base64');
    if (!this.baseUrl.startsWith('https:') && !this.developmentHTTP) blockers.push('HTTPS consent origin is required');
    if (!blockers.length) {
      try {
        const metadata = await this.remote('GET','/.well-known/oauth-authorization-server');
        if (metadata.issuer !== this.issuer || metadata.authorization_endpoint !== this.issuer+'/oauth/authorize' ||
          metadata.token_endpoint !== this.issuer+'/oauth/token' || metadata.userinfo_endpoint !== this.issuer+'/oauth/userinfo' ||
          !metadata.code_challenge_methods_supported?.includes('S256')) throw new Error();
      } catch { blockers.push('Supabase OAuth server is disabled, unavailable, or has incompatible issuer/authorization/S256 configuration'); }
    }
    return {available:blockers.length === 0,blockers,authorization_path:'/oauth/consent',email_redirect_available:!!this.emailRedirect()};
  }
  async requireReady() {
    const ready = await this.readiness();
    if (!ready.available) fail(503,'provider_unavailable',ready.blockers.join('; '));
  }
  async remote(method, route, body, accessToken) {
    if (!this.providerUrl || !this.publicKey()) fail(503,'provider_unavailable','Trusted Supabase provider configuration is unavailable');
    let response;
    try {
      response = await this.fetch(this.issuer+route, {
        method, redirect:'error', signal:AbortSignal.timeout(10000),
        headers:{apikey:this.publicKey(), ...(accessToken ? {authorization:'Bearer '+accessToken} : {}), origin:this.baseUrl, ...(body ? {'content-type':'application/json'} : {})},
        ...(body ? {body:JSON.stringify(body)} : {})
      });
    } catch { fail(503,'provider_unavailable','Supabase Auth request is unavailable'); }
    if (!response.ok) {
      // Provider error messages can contain account data; do not forward bodies.
      if (response.status === 429) fail(429,'provider_rate_limit','Supabase Auth rate limit reached');
      if (response.status >= 500) fail(503,'provider_unavailable','Supabase Auth is unavailable');
      if (response.status === 401) fail(401,'provider_session_invalid','Provider session is invalid or revoked');
      if (route.startsWith('/token')) fail(401,'provider_signin_failed','Email or password was rejected by the provider');
      if (response.status === 404) fail(404,'provider_request_not_found','Provider request is unavailable, expired, or OAuth server is disabled');
      fail(400,'provider_request_rejected','Supabase Auth rejected the request');
    }
    try {
      const value = await response.text();
      if (Buffer.byteLength(value) > 65536) throw new Error();
      return value ? JSON.parse(value) : {};
    } catch { fail(503,'provider_unavailable','Supabase Auth returned an invalid response'); }
  }
  credentials(body, password=true) {
    if (!safeString(body.email,254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) fail(400,'invalid_email','A valid email address is required');
    if (password && (!safeString(body.password,1024))) fail(400,'invalid_password','A password is required');
    return {email:body.email, ...(password ? {password:body.password} : {})};
  }
  authorizationID(value) {
    if (!safeString(value,128) || !/^[A-Za-z0-9_-]+$/.test(value)) fail(400,'invalid_authorization_id','A valid provider authorization_id is required');
    return value;
  }
  cookie(token, seconds) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(seconds))}${this.baseUrl.startsWith('https:') ? '; Secure' : ''}`;
  }
  async verifiedUser(accessToken, expectedID) {
    const user = await this.remote('GET','/user',undefined,accessToken);
    if (!safeString(user.id) || (expectedID && user.id !== expectedID)) fail(401,'provider_session_invalid','Provider subject does not match this session');
    if (!safeString(user.email,254) || !safeString(user.email_confirmed_at,64) || !Number.isFinite(Date.parse(user.email_confirmed_at))) fail(403,'email_verification_required','Verify your email with the provider before continuing');
    const owner = stablePrincipal(this.issuer,user.id);
    if ((await this.identity.identity(owner))?.deleted) fail(403,'account_deleted','This account has been deleted');
    return {id:user.id,email:user.email,email_verified:true};
  }
  assertSessionExpiry(record) {
    if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= this.now()) fail(401,'provider_session_expired','Provider session expired or was revoked');
  }
  async loadSession(body, context, {live=true,write=true}={}) {
    if (write) this.origin(context);
    const cookieValues = (header(context,'cookie') || '').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
    if (cookieValues.length !== 1) fail(401,'provider_session_required','Sign in with the identity provider');
    const token = cookieValues[0].slice(COOKIE.length+1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401,'provider_session_required','Sign in with the identity provider');
    const hash = digest(token), row = await this.store.read(scope(hash),'record');
    if (!this.key || !row?.value || !Number.isFinite(Date.parse(row.value.expiresAt)) || Date.parse(row.value.expiresAt) <= this.now()) fail(401,'provider_session_expired','Provider session expired or was revoked');
    let tokens;
    try { tokens = unseal(row.value.tokens,this.key,'provider:'+hash); } catch { fail(401,'provider_session_invalid','Provider session is invalid'); }
    if (write) {
      const submitted = header(context,'x-csrf-token') || body.csrf_token;
      if (!equal(submitted,tokens.csrf)) fail(403,'csrf_required','A bound provider CSRF token is required');
    }
    const user = live ? await this.verifiedUser(tokens.access_token,row.value.subject) : null;
    this.assertSessionExpiry(row.value);
    return {hash,row,tokens,user};
  }
  async entry(body, context) {
    this.origin(context);
    this.identity.assertBootstrap(body,context);
    await this.requireReady();
  }
  clients() {
    const list = [];
    for (const [product,urlName,keyName] of [['purls','PURLS_BASE_URL','PURLS_OIDC_CLIENT_ID'],['cgit','CGIT_BASE_URL','CGIT_OIDC_CLIENT_ID']]) {
      const id = this.env[keyName] || ((this.env.PURL_PRODUCT || this.identity.product) === product ? this.env.PURL_OIDC_CLIENT_ID : null);
      try {
        const url = new URL(this.env[urlName]);
        if (!id || url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !this.developmentHTTP)) continue;
        list.push({id,redirect:url.origin+'/auth/callback'});
      } catch {}
    }
    return list;
  }
  validateDetails(details, id, session) {
    if (details.redirect_url) fail(409,'provider_implicit_approval','Provider reused existing consent and already approved this request. No redirect was followed. Start a new provider authorization requiring fresh consent.');
    const client = this.clients().find(client=>client.id === details.client?.id && client.redirect === details.redirect_uri);
    const scopes = typeof details.scope === 'string' ? details.scope.split(' ').filter(Boolean) : [];
    if (details.authorization_id !== id || details.user?.id !== session.user.id || !client || !scopes.includes('openid') || scopes.some(value=>!SCOPES.has(value)) || new Set(scopes).size !== scopes.length) fail(403,'provider_authorization_rejected','Provider authorization client, user, scopes, or exact callback is not allowed');
    return {authorization_id:id,client:{id:details.client.id,name:safeString(details.client.name,200) ? details.client.name : 'Registered application'},scope:details.scope,scopes,redirect_uri:client.redirect,review_expires_at:new Date(Math.min(this.now()+300000,Date.parse(session.row.value.expiresAt))).toISOString()};
  }
  validateRedirect(value, review, approve) {
    let url;
    try { url = new URL(value); } catch { fail(403,'provider_redirect_rejected','Provider returned an unsafe callback'); }
    const allowed = approve ? ['code','state'] : ['error','error_description','state'];
    if (url.username || url.password || url.hash || url.origin+url.pathname !== review.redirect_uri ||
      [...url.searchParams.keys()].some(key=>!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) ||
      !url.searchParams.get('state') || (approve ? !url.searchParams.get('code') : url.searchParams.get('error') !== 'access_denied')) fail(403,'provider_redirect_rejected','Provider returned an unsafe callback');
    return url.href;
  }
  response(status, body, headers={}) { return {status,body,headers:{'cache-control':'no-store',...headers}}; }
  async handle(method, path, body={}, context={}) {
    if (!path.startsWith(PREFIX+'/')) return null;
    const route = path.slice(PREFIX.length);
    if (method === 'GET' && route === '/config') return this.response(200,await this.readiness());
    if (method === 'POST' && ['/signin','/signup','/recover'].includes(route)) {
      this.rate(context);await this.entry(body,context);
      const credentials = this.credentials(body,route !== '/recover');
      if (route === '/signin') {
        const tokens = await this.remote('POST','/token?grant_type=password',credentials);
        if (!safeString(tokens.access_token,16384)) fail(503,'provider_unavailable','Provider did not return an access token');
        const user = await this.verifiedUser(tokens.access_token);
        const issuedAt = this.now();
        const lifetime = Math.min(Number(tokens.expires_in)*1000,Number(tokens.expires_at)*1000-issuedAt,3600000);
        if (!Number.isFinite(lifetime) || lifetime < 1000) fail(401,'provider_session_expired','Provider session has no valid remaining lifetime');
        const token = randomToken(), hash = digest(token), csrf = randomToken(), expiresAt = new Date(issuedAt+lifetime).toISOString();
        await this.store.commit(scope(hash),[{key:'record',expectedVersion:0,value:{subject:user.id,expiresAt,tokens:seal({access_token:tokens.access_token,refresh_token:typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null,csrf},this.key,'provider:'+hash),review:null}}]);
        return this.response(200,{user,csrf_token:csrf,expires_at:expiresAt},{'set-cookie':this.cookie(token,lifetime/1000)});
      }
      const redirect = this.emailRedirect();
      if (!redirect) fail(503,'provider_email_redirect_unconfigured','SUPABASE_AUTH_REDIRECT_ALLOWLIST must contain the exact central /oauth/consent URL before sending email');
      const id = body.authorization_id === undefined ? undefined : this.authorizationID(body.authorization_id);
      await this.remote('POST',route+'?redirect_to='+encodeURIComponent(redirect),credentials);
      return this.response(202,{...(route === '/signup' ? {verification_required:true} : {}),message:route === '/signup' ? 'If signup is available, the provider will send email verification. Verify your email, then sign in.' : 'If the account exists, the provider will send recovery instructions.',...(id ? {authorization_id:id} : {})});
    }
    if (method === 'POST' && route === '/logout') {
      this.rate(context);
      const session = await this.loadSession(body,context,{live:false});
      // Local invalidation is durable even while the provider is down.
      await this.store.erase(scope(session.hash));
      let revoked = false;
      try { this.assertSessionExpiry(session.row.value);await this.remote('POST','/logout?scope=local',{},session.tokens.access_token);revoked=true; } catch {}
      return this.response(200,{logged_out:true,provider_revoked:revoked},{'set-cookie':this.cookie('',0)});
    }
    if (method === 'GET' && route === '/me') {
      const session = await this.loadSession(body,context,{write:false});
      return this.response(200,{user:session.user,csrf_token:session.tokens.csrf,expires_at:session.row.value.expiresAt});
    }
    if (route === '/authorization' && ['GET','POST'].includes(method)) {
      if (method === 'POST') this.rate(context);
      const session = await this.loadSession(body,context,{write:method === 'POST'});
      const id = this.authorizationID(method === 'GET' ? context.query?.get?.('authorization_id') ?? context.query?.authorization_id : body.authorization_id);
      if (method === 'GET') {
        const review = session.row.value.review;
        if (!review || review.authorization_id !== id || Date.parse(review.review_expires_at) <= this.now()) fail(409,'authorization_review_required','Choose Review authorization before reading consent details');
        return this.response(200,review);
      }
      // Despite its GET verb, Supabase associates the user here and may reuse consent.
      // This operation is reachable only from this CSRF-protected explicit POST.
      this.assertSessionExpiry(session.row.value);
      const details = await this.remote('GET','/oauth/authorizations/'+encodeURIComponent(id),undefined,session.tokens.access_token);
      this.assertSessionExpiry(session.row.value);
      const review = this.validateDetails(details,id,session);
      await this.store.commit(scope(session.hash),[{key:'record',expectedVersion:session.row.version,value:{...session.row.value,review}}]);
      return this.response(200,review);
    }
    if (method === 'POST' && route === '/consent') {
      this.rate(context);
      const session = await this.loadSession(body,context), id = this.authorizationID(body.authorization_id);
      if (typeof body.approve !== 'boolean') fail(400,'explicit_consent_required','Choose approve or deny explicitly');
      const review = session.row.value.review;
      if (!review || review.authorization_id !== id || Date.parse(review.review_expires_at) <= this.now()) fail(409,'authorization_review_required','Review this authorization again before deciding');
      // Consume the exact staged review with CAS before the provider operation.
      await this.store.commit(scope(session.hash),[{key:'record',expectedVersion:session.row.version,value:{...session.row.value,review:null}}]);
      this.assertSessionExpiry(session.row.value);
      const result = await this.remote('POST','/oauth/authorizations/'+encodeURIComponent(id)+'/consent',{action:body.approve ? 'approve' : 'deny'},session.tokens.access_token);
      return this.response(200,{redirect_url:this.validateRedirect(result.redirect_url,review,body.approve)});
    }
    return null;
  }
}
