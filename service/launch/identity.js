import { randomBytes } from 'node:crypto';
import { randomToken, digest, stablePrincipal, encryptionKey, seal, unseal, mac, equal } from './identity-crypto.js';
const PRODUCTS=['purls', 'cgit'];
const SCOPES={
  purls:['resources:read', 'resources:write', 'memory:read', 'memory:write', 'memory:share', 'memory:publish', 'catalog:run', 'models:read', 'models:write', 'chat:write', 'constellations:read', 'constellations:write', 'agents:create'], cgit:['cgit:read', 'cgit:write', 'agents:create']
};
const PREVIEW_SCOPES={
  purls:['catalog:run','memory:read','memory:write','memory:share','memory:publish','resources:read','resources:write','models:read'],
  cgit:['cgit:read','cgit:write']
};
const failure=(status, code, message)=>Object.assign(new Error(message), {
  status, code
});
const iso=ms=>new Date(ms).toISOString();
const credentialScope = hash => `__identity_credential:${hash}`;
const flowScope = hash => `__identity_flow:${hash}`;
const deletionScope = owner => `__identity_deletion:${owner}`;
const expiryKey = time => `identity-expiry:${String(Math.floor(time / 60000)).padStart(12, '0')}:`;
const REGISTRY = 'identity:credentials';
const identityFingerprint = value => digest(JSON.stringify([value.kind, value.issuer??null, value.subject??null, value.createdAt??null]));
const header=(ctx, name)=>ctx.headers?.get?.(name)??ctx.headers?.[name]??ctx.headers?.[name.toLowerCase()];
function cookies(ctx){
  return Object.fromEntries((header(ctx, 'cookie')||'').split(';').map(v=>v.trim().split('=' )).filter(v=>v.length===2));
}
export class IdentityService {
  constructor({
    store, product='purls', baseUrl, env=process.env, fetch=globalThis.fetch, clock=()=>Date.now()
  }) {
    this.store=store;
    this.product=env.PURL_PRODUCT||product;
    if(!PRODUCTS.includes(this.product))throw new Error('Unsupported identity product');
    this.env=env;
    this.baseUrl=new URL(baseUrl||env.PURL_BASE_URL||'http://localhost:3000').origin;
    this.fetch=fetch;
    this.clock=clock;
    this.key=encryptionKey(env.PURL_IDENTITY_ENCRYPTION_KEY);
    this.csrfKey=this.key||randomBytes(32);
    this.dev=env.NODE_ENV!=='production'&&env.PURL_IDENTITY_ALLOW_HTTP==='true';
    this.rates=new Map();
    this.cookieName=`purl_${this.product}_session`;
    this.flowCookie=`purl_${this.product}_flow`;
    this.bootstrapCookie=`purl_${this.product}_bootstrap`;
  }
  now(){
    return Number(this.clock());
  }
  rateLimit(ctx) {
    const now=this.now();
    for(const [key, value] of this.rates)if(value.until<=now)this.rates.delete(key);
    const key=digest(String(ctx.remoteAddress||'shared-origin'));
    const entry=this.rates.get(key)||{
      until:now+60000, count:0
    };
    if(entry.count>=30||(!this.rates.has(key)&&this.rates.size>=10000))throw failure(429, 'identity_rate_limit', 'Too many identity requests; retry in one minute');
    entry.count++;
    this.rates.set(key, entry);
  }
  cookie(name, value, seconds){
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(seconds))}${this.baseUrl.startsWith('https:')?'; Secure':''}`;
  }
  assertOrigin(ctx){
    if((header(ctx, 'origin')||ctx.requestOrigin)!==this.baseUrl)throw failure(403, 'origin_required', 'A matching request Origin is required');
  }
  bootstrap(){
    const payload=`${this.now()+600000}.${randomToken()}`;
    return `${payload}.${mac(payload,this.csrfKey)}`;
  }
  assertBootstrap(body, ctx){
    this.assertOrigin(ctx);
    const value=cookies(ctx)[this.bootstrapCookie], submitted=header(ctx, 'x-csrf-token')||body.csrf_token;
    if(!value||!equal(value, submitted))throw failure(403, 'csrf_required', 'A bound CSRF token is required');
    const parts=value.split('.');
    if(parts.length!==3||Number(parts[0])<this.now()||!equal(parts[2], mac(parts.slice(0, 2).join('.'), this.csrfKey)))throw failure(403, 'csrf_expired', 'CSRF token expired');
  }
  async ready(){
    const blockers=[];
    for(const name of ['PURL_OIDC_ISSUER', 'PURL_OIDC_CLIENT_ID', 'PURL_OIDC_CLIENT_SECRET'])if(!this.env[name])blockers.push(`${name} is not configured`);
    if(!this.key)blockers.push('PURL_IDENTITY_ENCRYPTION_KEY must be 32 bytes in base64');
    if(!this.baseUrl.startsWith('https:')&&!this.dev)blockers.push('HTTPS base URL is required');
    if(blockers.length)return {
      available:false, blockers
    };
    if(this.configuration&&this.readyUntil>this.now())return {
      available:true, blockers:[]
    };
    try{
      const oidc=await import('openid-client');
      const issuer=new URL(this.env.PURL_OIDC_ISSUER);
      if(issuer.protocol!=='https:'&&!(this.dev&&['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname)))throw new Error('HTTPS issuer required');
      const safeFetch=(input, options={})=>this.fetch(input, {
        ...options, redirect:'error', signal:options.signal||AbortSignal.timeout(10000)
      });
      const config=await oidc.discovery(issuer, this.env.PURL_OIDC_CLIENT_ID, undefined, oidc.ClientSecretBasic(this.env.PURL_OIDC_CLIENT_SECRET), {
        [oidc.customFetch]:safeFetch, execute:this.dev?[oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks]:[oidc.enableNonRepudiationChecks], timeout:10
      });
      const md=config.serverMetadata();
      if(!md.userinfo_endpoint||!md.code_challenge_methods_supported?.includes('S256'))throw new Error('Provider requires UserInfo and S256');
      if(issuer.hostname.endsWith('.supabase.co')){
        const r=await safeFetch(issuer.href.replace(/\/$/, '')+'/.well-known/oauth-authorization-server');
        if(!r.ok)throw new Error('Supabase OAuth server disabled');
        const m=await r.json();
        if(m.issuer!==issuer.href.replace(/\/$/, ''))throw new Error('OAuth issuer mismatch');
      }
      this.oidc=oidc;
      this.configuration=config;
      this.readyUntil=this.now()+30000;
      return {
        available:true, blockers:[]
      };
    } catch{
      return {
        available:false, blockers:['OIDC provider is unavailable, disabled, or does not meet the required S256/UserInfo protocol configuration']
      };
    }
  }
  async requireReady(){
    const r=await this.ready();
    if(!r.available)throw failure(503, 'identity_unavailable', r.blockers.join('; '));
  }
  async write(scope, key, value, options){
    const old=await this.store.read(scope, key);
    return this.store.commit(scope, [{
      key, expectedVersion:old?.version||0, value
    }], options);
  }
  async identity(id){
    if ((await this.store.read(deletionScope(id), 'identity:deletion'))?.value) return {deleted:true};
    return (await this.store.read(id, 'profile:identity'))?.value;
  }
  async expiryCursor() {
    let cursor = await this.store.read('__identity_maintenance', 'expiry');
    if (!cursor) {
      try { await this.store.commit('__identity_maintenance', [{key:'expiry', expectedVersion:0, value:{bucket:Math.floor(this.now()/60000)}}]); }
      catch(error) { if(error.status!==409)throw error; }
      cursor = await this.store.read('__identity_maintenance', 'expiry');
    }
    return cursor;
  }
  async saveEphemeral(scope, value) {
    await this.expiryCursor();
    const expiresAt = Date.parse(value.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) throw failure(401,'credential_expired','Credential or login flow expired');
    await this.store.commit(scope, [
      {key:'record', expectedVersion:0, value},
      {key:expiryKey(expiresAt), expectedVersion:0, value:{expiresAt:value.expiresAt}}
    ]);
  }
  // The cursor has one stable row. Each time bucket scans only expiry markers,
  // then erases a whole expired namespace (including callback tombstones).
  async compactExpired({limit=100, maxBuckets=32}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(maxBuckets)||maxBuckets<1||maxBuckets>128)throw failure(400,'invalid_maintenance_bounds','Invalid maintenance bounds');
    const cursor=await this.expiryCursor();
    let bucket=cursor.value.bucket, erased=0, examined=0;
    const last=Math.floor(this.now()/60000)-1;
    while(bucket<=last&&examined<maxBuckets&&erased<limit) {
      const remaining=limit-erased;
      const rows=await this.store.scan({prefix:expiryKey(bucket*60000),limit:remaining});
      for(const row of rows) {
        if(!/^__identity_(credential|flow):[a-f0-9]{64}$/.test(row.scope)||Date.parse(row.value.expiresAt)>this.now())throw failure(500,'invalid_expiry_record','Invalid identity maintenance record');
        await this.store.erase(row.scope);
        erased++;
      }
      examined++;
      if(rows.length===remaining)break;
      bucket++;
    }
    if(bucket!==cursor.value.bucket) {
      try {await this.store.commit('__identity_maintenance',[{key:'expiry',expectedVersion:cursor.version,value:{bucket}}]);}
      catch(error){if(error.status!==409)throw error;}
    }
    return {erased,buckets:examined};
  }
  async persistCredential(record, hash) {
    for(let attempt=0;attempt<4;attempt++) {
      const principal=await this.store.read(record.owner,'profile:identity');
      if(!principal?.value||principal.value.deleted||(await this.store.read(deletionScope(record.owner),'identity:deletion'))?.value)throw failure(403,'account_deleted','This account has been deleted');
      const row=await this.store.read(record.owner,REGISTRY);
      const registry=row?.value||{credentials:[],agents:[],audit:[]};
      const expired=registry.credentials.filter(item=>Date.parse(item.expiresAt)<=this.now());
      const credentials=registry.credentials.filter(item=>Date.parse(item.expiresAt)>this.now());
      if(credentials.length>=128)throw failure(429,'credential_quota','At most 128 unexpired credentials per account');
      if(record.parentCredential&&registry.agents.length>=128)throw failure(429,'agent_quota','At most 128 delegated principals per account');
      const agents=record.parentCredential?[...registry.agents,{id:record.id,hash,createdAt:record.createdAt}]:registry.agents;
      const audit=record.parentCredential?[...registry.audit,{event:'agent_created',agent:record.id,at:iso(this.now())}].slice(-128):registry.audit;
      try {
        // Fence deletion and inventory changes in the same owner transaction.
        await this.store.commit(record.owner,[
          {key:'profile:identity',expectedVersion:principal.version,value:principal.value},
          {key:REGISTRY,expectedVersion:row?.version||0,value:{credentials:[...credentials,{hash,expiresAt:record.expiresAt}],agents,audit}}
        ]);
      } catch(error) {if(error.status===409&&attempt<3)continue;throw error;}
      for(const item of expired)await this.store.erase(credentialScope(item.hash));
      if((await this.identity(record.owner))?.deleted)throw failure(403,'account_deleted','This account has been deleted');
      await this.saveEphemeral(credentialScope(hash),record);
      if((await this.identity(record.owner))?.deleted) {
        await this.store.erase(credentialScope(hash));
        throw failure(403,'account_deleted','This account has been deleted');
      }
      return;
    }
  }
  async profiles(id){
    const rows=await this.store.list(id, {
      prefix:'profile:', limit:20
    });
    return rows.filter(r=>r.key!=='profile:identity'&&r.value?.active).map(r=>r.value.product).sort();
  }
  async actor(record, hash){
    const p=await this.store.read(record.owner, `profile:${this.product}`);
    const identity=await this.identity(record.owner);
    if(!identity||identity.deleted||identity.generation!==record.generation||!p?.value?.active||p.value.generation!==record.productGeneration)return null;
    return {
      id:record.kind==='agent'?(record.id||record.owner):record.owner, kind:record.kind, verified:record.kind==='human', product:this.product, scopes:record.scopes, credentialId:hash, expiresAt:record.expiresAt, products:await this.profiles(record.owner), ...(record.kind==='agent'?{
        ...(record.parentCredential?{
          owner:record.owner
        }:{}), attestation:'self-declared'
      }:{}), handle:p.value.handle||null
    };
  }
  async record(hash){
    if(!/^[a-f0-9]{64}$/.test(hash||''))return null;
    return (await this.store.read(credentialScope(hash),'record'))?.value||null;
  }
  async authenticateCredentialId(hash, {
    live=true, depth=0, product=this.product
  }
  ={}){
    if(product!==this.product)return null;
    const r=await this.record(hash);
    if(!r||r.product!==this.product||r.revoked||Date.parse(r.expiresAt)<=this.now()||depth>3)return null;
    const actor=await this.actor(r, hash);
    if(!actor)return null;
    if(r.kind==='agent'&&r.parentCredential){
      const parent=await this.authenticateCredentialId(r.parentCredential, {
        live, depth:depth+1
      });
      if(!parent||parent.id!==r.owner||!parent.verified)return null;
      return actor;
    }
    if(r.kind==='human'){
      try{
        await this.requireReady();
        const tokens=unseal(r.tokens, this.key, `${r.owner}:${hash}`);
        const user=await this.oidc.fetchUserInfo(this.configuration, tokens.access_token, r.subject);
        if(user.email_verified!==true)throw new Error('Verified email is required');
      } catch{
        return null;
      }
    }
    return actor;
  }
  async authenticate(ctx={}){
    const auth=header(ctx, 'authorization');
    const token=auth?.startsWith('Bearer ')?auth.slice(7):cookies(ctx)[this.cookieName];
    if(!token)return null;
    return this.authenticateCredentialId(digest(token));
  }
  async requireActor(body, ctx, {
    human=false
  }
  ={}){
    const actor=await this.authenticate(ctx);
    if(!actor)throw failure(401, 'authentication_required', 'An active identity session is required');
    if(human&&(!actor.verified||actor.kind!=='human'))throw failure(403, 'verified_human_required', 'A verified human account is required');
    const r=await this.record(actor.credentialId);
    if(!header(ctx, 'authorization')?.startsWith('Bearer ')){
      this.assertOrigin(ctx);
      if(!equal(header(ctx, 'x-csrf-token')||body.csrf_token, r.csrf))throw failure(403, 'csrf_required', 'A bound CSRF token is required');
    }
    return actor;
  }
  async revokeProvider(record, hash) {
    if(!record?.tokens)return 'not_applicable';
    try {
      await this.requireReady();
      if(!this.configuration.serverMetadata().revocation_endpoint)return 'provider_endpoint_not_available';
      const tokens=unseal(record.tokens,this.key,`${record.owner}:${hash}`);
      await this.oidc.tokenRevocation(this.configuration,tokens.access_token,{token_type_hint:'access_token'});
      if(tokens.refresh_token)await this.oidc.tokenRevocation(this.configuration,tokens.refresh_token,{token_type_hint:'refresh_token'});
      return 'requested';
    } catch {return 'failed_local_revocation_complete';}
  }
  async beginDeletion(owner, requestCredential) {
    const scope=deletionScope(owner);
    const existing=await this.store.read(scope,'identity:deletion');
    if(existing?.value)return this.fenceDeletion(owner);
    const principal=await this.store.read(owner,'profile:identity');
    if(!principal?.value||principal.value.deleted)throw failure(403,'account_deleted','This account has been deleted');
    const registry=await this.store.read(owner,REGISTRY);
    const inventory=registry?.value||{credentials:[],agents:[],audit:[]};
    if(!inventory.credentials.some(item=>item.hash===requestCredential))throw failure(401,'authentication_required','Deletion requires an owned credential');
    const intent={owner,product:this.product,status:'fencing',requestCredential,identityFingerprint:identityFingerprint(principal.value),agents:inventory.agents.map(agent=>agent.id),credentials:inventory.credentials.map(item=>item.hash),startedAt:iso(this.now())};
    // This server-derived intent is durable before touching quota-bound owner
    // data. Its presence immediately denies reauthentication and new issuance.
    try {await this.store.commit(scope,[{key:'identity:deletion',expectedVersion:existing?.version||0,value:intent}]);}
    catch(error){if(error.status!==409)throw error;}
    return this.fenceDeletion(owner);
  }
  async fenceDeletion(owner) {
    const scope=deletionScope(owner);
    for(let attempt=0;attempt<8;attempt++) {
      const row=await this.store.read(scope,'identity:deletion');
      const intent=row?.value;
      if(!intent||intent.owner!==owner)throw failure(409,'deletion_intent_required','Durable deletion intent is required');
      if(intent.status==='complete'||intent.status==='pending')return intent;
      if(intent.status!=='fencing')throw failure(409,'invalid_deletion_state','Deletion state is invalid');
      const principal=await this.store.read(owner,'profile:identity');
      const registry=await this.store.read(owner,REGISTRY);
      const verifiedPrincipal=await this.store.read(owner,'profile:identity');
      // Issuance and fencing atomically change profile + registry. A stable
      // profile version around the inventory read is required before replacing
      // the durable witness; otherwise this may mix pre/post-fence versions.
      if(principal?.version!==verifiedPrincipal?.version)continue;
      if(principal?.value===null) {
        if(principal.version!==intent.profileVersion+1||(registry?.version||0)!==intent.registryVersion+(intent.registryVersion?1:0)) {
          throw failure(409,'deletion_identity_changed','The deletion fence no longer matches the owned inventory');
        }
        const pending={...intent,status:'pending',fenceVersion:principal.version};
        try {await this.store.commit(scope,[{key:'identity:deletion',expectedVersion:row.version,value:pending}]);return pending;}
        catch(error){if(error.status===409)continue;throw error;}
      }
      if(!principal?.value||identityFingerprint(principal.value)!==intent.identityFingerprint) {
        throw failure(409,'deletion_identity_changed','The principal changed after deletion was requested');
      }
      const inventory=registry?.value||{credentials:[],agents:[],audit:[]};
      const snapshot={...intent,agents:inventory.agents.map(agent=>agent.id),credentials:inventory.credentials.map(item=>item.hash),profileVersion:principal.version,registryVersion:registry?.version||0};
      try {
        // Refresh the complete owned inventory before fencing. A credential
        // issuance committed just before the intent is captured by this CAS.
        await this.store.commit(scope,[{key:'identity:deletion',expectedVersion:row.version,value:snapshot}]);
        const changes=[{key:'profile:identity',expectedVersion:principal.version,value:null}];
        if(registry)changes.push({key:REGISTRY,expectedVersion:registry.version,value:registry.value});
        // A tombstone releases bytes; this transition never needs owner quota
        // headroom and uses no new owner key or retry-metadata allocation.
        await this.store.commit(owner,changes);
      } catch(error){if(error.status===409)continue;throw error;}
    }
    throw failure(409,'deletion_busy','Deletion inventory changed; retry the persisted request');
  }
  async finishDeletion(plan) {
    const scope=deletionScope(plan.owner);
    let current=await this.fenceDeletion(plan.owner);
    if(current.status==='complete')return current;
    if(plan.providerRevocation&&!current.providerRevocation) {
      for(let attempt=0;attempt<4;attempt++) {
        const marker=await this.store.read(scope,'identity:deletion');
        if(marker.value.status==='complete')return marker.value;
        if(marker.value.providerRevocation)break;
        try {await this.store.commit(scope,[{key:'identity:deletion',expectedVersion:marker.version,value:{...marker.value,providerRevocation:plan.providerRevocation}}]);break;}
        catch(error){if(error.status!==409)throw error;}
      }
      current=(await this.store.read(scope,'identity:deletion')).value;
      if(current.status==='complete')return current;
    }
    const principal=await this.store.read(current.owner,'profile:identity');
    if(principal&&(principal.value!==null||principal.version!==current.fenceVersion)) {
      throw failure(409,'deletion_identity_changed','Refusing to erase a changed principal incarnation');
    }
    // Only inventory read from the durable server-derived intent can be erased.
    for(const agent of current.agents)await this.store.erase(agent);
    for(const hash of current.credentials)if(hash!==current.requestCredential)await this.store.erase(credentialScope(hash));
    await this.store.erase(current.owner);
    const receipt=await this.store.read(credentialScope(current.requestCredential),'record');
    if(receipt?.value)await this.store.commit(credentialScope(current.requestCredential),[{key:'record',expectedVersion:receipt.version,value:{owner:current.owner,kind:'deletion-receipt',product:receipt.value.product,csrf:receipt.value.csrf,expiresAt:receipt.value.expiresAt,revoked:true}}]);
    const complete={owner:current.owner,status:'complete',completedAt:iso(this.now()),providerRevocation:current.providerRevocation||'not_confirmed'};
    await this.write(scope,'identity:deletion',complete);
    return complete;
  }
  async resumeDeletions({limit=10}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>100)throw failure(400,'invalid_maintenance_bounds','Invalid deletion maintenance bound');
    const rows=await this.store.scan({prefix:'identity:deletion',statuses:['fencing','pending'],limit});
    let completed=0,failed=0;
    for(const row of rows) {
      if(row.scope!==deletionScope(row.value.owner))throw failure(500,'invalid_deletion_record','Invalid deletion maintenance record');
      try {await this.finishDeletion(row.value);completed++;}catch{failed++;}
    }
    return {completed,failed};
  }
  async deleteAccount(body,ctx) {
    if(body.confirm!=='DELETE')throw failure(400,'confirmation_required','Verified account deletion requires confirm: DELETE');
    const authorization=header(ctx,'authorization');
    const token=authorization?.startsWith('Bearer ')?authorization.slice(7):cookies(ctx)[this.cookieName];
    const hash=token?digest(token):null, record=hash?await this.record(hash):null;
    let plan;
    if(record&&record.product===this.product&&['human','deletion-receipt'].includes(record.kind)&&Date.parse(record.expiresAt)>this.now()) {
      plan=(await this.store.read(deletionScope(record.owner),'identity:deletion'))?.value;
    }
    if(plan) {
      if(!authorization?.startsWith('Bearer ')) {
        this.assertOrigin(ctx);
        if(!equal(header(ctx,'x-csrf-token')||body.csrf_token,record.csrf))throw failure(403,'csrf_required','A bound CSRF token is required');
      }
    } else {
      const actor=await this.requireActor(body,ctx,{human:true});
      plan=await this.beginDeletion(actor.id,actor.credentialId);
      plan={...plan,providerRevocation:await this.revokeProvider(record,actor.credentialId)};
    }
    const completed=await this.finishDeletion(plan);
    return {status:200,body:{revoked:true,deleted:true,provider_revocation:completed.providerRevocation,provider_account_deletion:'Use the provider account deletion workflow; local account and delegated product data were removed.'},headers:{'set-cookie':this.cookie(this.cookieName,'',0)}};
  }
  // Server-only authority for an explicitly consented product integration. Re-read
  // the credential rather than trusting actor metadata persisted in a worker job.
  async authorizeIntegration(actor, product, requestedScopes) {
    if (product !== 'cgit' || !Array.isArray(requestedScopes) || !requestedScopes.length ||
        requestedScopes.some(scope => !['cgit:read', 'cgit:write'].includes(scope))) {
      throw failure(403, 'integration_scope_required', 'Only explicit CGIT read/write integration scopes are allowed');
    }
    const fresh = await this.authenticateCredentialId(actor?.credentialId);
    if (!fresh || fresh.id !== actor.id) {
      throw failure(401, 'authentication_required', 'An active matching identity credential is required');
    }
    const owner = fresh.owner || fresh.id;
    const profile = (await this.store.read(owner, 'profile:cgit'))?.value;
    const consent = profile?.consent;
    if (!profile?.active || consent?.version !== 1 || !Number.isFinite(Date.parse(consent.at)) ||
        !['direct-login', 'explicit-activation', 'explicit-preview'].includes(consent.source)) {
      throw failure(403, 'cgit_consent_required', 'Activate the separate CGIT profile with explicit consent');
    }
    if (fresh.kind === 'agent') {
      if (requestedScopes.some(scope => !fresh.scopes.includes(scope))) {
        throw failure(403, 'integration_scope_required', 'An integration cannot expand delegated agent scopes');
      }
    } else if (fresh.kind === 'guest') {
      if (!['explicit-activation', 'explicit-preview'].includes(consent.source)) {
        throw failure(403, 'preview_consent_required', 'Guest CGIT preview requires explicit product consent');
      }
    } else if (fresh.kind !== 'human' || !fresh.verified) {
      throw failure(403, 'verified_human_required', 'Human integration authority requires verified identity');
    }
    return {...fresh, product, sourceProduct:fresh.product, integration:true, scopes:[...new Set(requestedScopes)]};
  }
  async publicIdentity(actor){
    return {
      id:actor.id, kind:actor.kind, verified:actor.verified, product:actor.product, products:actor.products, scopes:actor.scopes, handle:actor.handle, expiresAt:actor.expiresAt, ...(actor.owner?{
        owner:actor.owner
      }:{}), ...(actor.kind==='agent'?{
        attestation:'self-declared'
      }:{})
    };
  }
  async session(owner, kind, tokens, subject){
    const token=randomToken(), hash=digest(token), identity=await this.identity(owner), profile=(await this.store.read(owner, `profile:${this.product}`)).value;
    const ttl=kind==='human'?Math.min(3600, Math.max(0, Number(tokens.expires_in)||0)):1800;
    if(ttl<1)throw failure(401, 'token_expired', 'Provider token has no bounded lifetime');
    const r={
      owner, kind, product:this.product, scopes:kind==='human'?SCOPES[this.product]:PREVIEW_SCOPES[this.product], generation:identity.generation, productGeneration:profile.generation, csrf:randomToken(), expiresAt:iso(this.now()+ttl*1000), createdAt:iso(this.now()), ...(tokens?{
        tokens:seal(tokens, this.key, `${owner}:${hash}`), subject
      }:{})
    };
    await this.persistCredential(r, hash);
    const actor=await this.actor(r, hash);
    return {
      status:200, body:{
        identity:await this.publicIdentity(actor), csrf_token:r.csrf
      }, headers:{
        'set-cookie':[this.cookie(this.cookieName, token, ttl), this.cookie(this.flowCookie, '', 0)]
      }
    };
  }
  async provision(owner, kind, {
    issuer, subject
  }
  ={}){
    for(let attempt=0;
    attempt<4;
    attempt++){
      const identity=await this.store.read(owner, 'profile:identity'), profile=await this.store.read(owner, `profile:${this.product}`);
      if(identity?.value?.deleted||(await this.store.read(deletionScope(owner),'identity:deletion'))?.value)throw failure(403, 'account_deleted', 'This account has been deleted');
      const changes=[];
      if(!identity?.value)changes.push({
        key:'profile:identity', expectedVersion:identity?.version||0, value:{
          kind, ...(issuer?{
            issuer, subject
          }:{}), generation:0, createdAt:iso(this.now())
        }
      });
      if(!profile?.value?.active)changes.push({
        key:`profile:${this.product}`, expectedVersion:profile?.version||0, value:{
          product:this.product, active:true, generation:(profile?.value?.generation||0)+1, consent:{
            source:kind==='human'?'direct-login':'explicit-preview', at:iso(this.now()), version:1
          }
        }
      });
      if(!changes.length)return;
      try{
        await this.store.commit(owner, changes);
        return;
      } catch(e){
        if(e.status!==409||attempt===3)throw e;
      }
    }
  }
  async handle(method, path, body={}, ctx={}){
    if(!path.startsWith('/api/identity/')&&!path.startsWith('/api/agents/'))return null;
    if(method==='GET'&&path==='/api/identity/config'){
      const r=await this.ready(), csrf=this.bootstrap();
      return {
        status:200, body:{
          ...r, product:this.product, callbackUrl:this.baseUrl+'/auth/callback', csrf_token:csrf, guest_available:this.baseUrl.startsWith('https:')||this.dev, recovery_available:!!this.env.PURL_OIDC_RECOVERY_URL
        }, headers:{
          'set-cookie':this.cookie(this.bootstrapCookie, csrf, 600), 'cache-control':'no-store'
        }
      };
    }
    if(method==='POST'&&path==='/api/identity/login'){
      this.assertBootstrap(body, ctx);
      this.rateLimit(ctx);
      await this.compactExpired();
      await this.requireReady();
      const state=this.oidc.randomState(), nonce=this.oidc.randomNonce(), verifier=this.oidc.randomPKCECodeVerifier(), binding=randomToken();
      const authorization=this.oidc.buildAuthorizationUrl(this.configuration, {
        redirect_uri:this.baseUrl+'/auth/callback', scope:'openid email profile', state, nonce, code_challenge:await this.oidc.calculatePKCECodeChallenge(verifier), code_challenge_method:'S256'
      });
      await this.saveEphemeral(flowScope(digest(state)), {
        product:this.product, binding:digest(binding), nonce, verifier:seal(verifier, this.key, digest(state)), expiresAt:iso(this.now()+600000)
      });
      return {
        status:200, body:{
          authorization_url:authorization.href
        }, headers:{
          'set-cookie':this.cookie(this.flowCookie, binding, 600)
        }
      };
    }
    if(method==='POST'&&path==='/api/identity/callback'){
      this.assertOrigin(ctx);
      this.rateLimit(ctx);
      await this.compactExpired();
      await this.requireReady();
      const key=digest(String(body.state||'')), flow=await this.store.read(flowScope(key), 'record');
      const value=flow?.value;
      if(!value||value.product!==this.product||Date.parse(value.expiresAt)<=this.now()||!equal(value.binding, digest(cookies(ctx)[this.flowCookie]||'')))throw failure(401, 'invalid_flow', 'Login state is invalid or expired');
      try{
        await this.store.commit(flowScope(key), [{
          key:'record', expectedVersion:flow.version, value:null
        }]);
      } catch{
        throw failure(401, 'invalid_flow', 'Login flow has already been consumed');
      }
      try{
        const callback=new URL(this.baseUrl+'/auth/callback');
        callback.searchParams.set('code', String(body.code||''));
        callback.searchParams.set('state', String(body.state));
        const tokens=await this.oidc.authorizationCodeGrant(this.configuration, callback, {
          pkceCodeVerifier:unseal(value.verifier, this.key, key), expectedState:body.state, expectedNonce:value.nonce, idTokenExpected:true
        });
        const claims=tokens.claims();
        if(claims?.email_verified!==true||!claims.sub)throw new Error('Email is not verified');
        const owner=stablePrincipal(claims.iss, claims.sub);
        const user=await this.oidc.fetchUserInfo(this.configuration, tokens.access_token, claims.sub);
        if(user.email_verified!==true)throw new Error('Verified email is required');
        await this.provision(owner, 'human', {
          issuer:claims.iss, subject:claims.sub
        });
        return await this.session(owner, 'human', {
          access_token:tokens.access_token, refresh_token:tokens.refresh_token, expires_in:Math.min(tokens.expires_in||3600, claims.exp-Math.floor(this.now()/1000))
        }, claims.sub);
      } catch(e){
        if(e.status===403)throw e;
        throw failure(401, 'invalid_identity', 'Provider login could not establish a verified identity');
      }
    }
    if(method==='POST'&&path==='/api/identity/guest'){
      this.assertBootstrap(body, ctx);
      this.rateLimit(ctx);
      await this.compactExpired();
      if(!this.baseUrl.startsWith('https:')&&!this.dev)throw failure(503, 'https_required', 'HTTPS is required');
      const owner='guest_'+randomToken();
      await this.provision(owner, 'guest');
      return this.session(owner, body.kind==='agent'?'agent':'guest');
    }
    if(method==='POST'&&path==='/api/identity/recover'){
      await this.requireReady();
      this.assertBootstrap(body, ctx);
      const target=this.env.PURL_OIDC_RECOVERY_URL;
      if(!target)throw failure(503, 'recovery_unavailable', 'Recovery must be configured at the identity provider');
      const url=new URL(target);
      if(url.protocol!=='https:'||url.origin!==new URL(this.env.PURL_OIDC_ISSUER).origin)throw failure(503, 'recovery_unavailable', 'Recovery URL must belong to the identity provider');
      return {
        status:200, body:{
          recovery_url:url.href
        }
      };
    }
    if(method==='GET'&&['/api/identity/me', '/api/identity/export'].includes(path)){
      const actor=await this.authenticate(ctx);
      if(!actor)throw failure(401, 'authentication_required', 'An active identity session is required');
      if(path.endsWith('/export')&&actor.owner)throw failure(403, 'owner_required', 'Delegated agents cannot export owner profiles');
      const r=await this.record(actor.credentialId);
      return {
        status:200, body:{
          identity:await this.publicIdentity(actor), ...(path.endsWith('/me')?{
            csrf_token:r.csrf
          }:{
            profiles:(await this.store.list(actor.owner||actor.id, {
              prefix:'profile:', limit:20
            })).filter(x=>x.key!=='profile:identity').map(x=>x.value), export_scope:'Identity and product profiles; product data has separate export endpoints.'
          })
        }, headers:{
          'cache-control':'no-store'
        }
      };
    }
    if(method!=='POST')return null;
    if(['/api/identity/claim', '/api/identity/rename', '/api/identity/activate'].includes(path)){
      const actor=await this.requireActor(body, ctx, {
        human:!path.endsWith('/activate')
      });
      if (path.endsWith('/activate') && actor.kind==='agent') throw failure(403, 'owner_required', 'Agents cannot activate product profiles');
      if (path.endsWith('/activate') && Object.hasOwn(body,'handle')) throw failure(400, 'invalid_activation', 'Activation does not claim a human handle');
      const products=path.endsWith('/activate')?[body.product]:[this.product, ...(body.activate_cgit===true?['cgit']:[])];
      if(products.some(p=>!PRODUCTS.includes(p)))throw failure(400, 'invalid_product', 'Product must be purls or cgit');
      if(path.endsWith('/activate')&&body.consent!==true)throw failure(400, 'consent_required', 'Explicit product consent is required');
      const handleName=body.handle;
      if(!path.endsWith('/activate')&&(typeof handleName!=='string'||!/^[a-z][a-z0-9-]{2,31}$/.test(handleName)))throw failure(400, 'invalid_handle', 'Handle must be 3–32 lowercase letters, numbers or hyphens');
      const changes=[];
      for(const product of [...new Set(products)]){
        const row=await this.store.read(actor.id, `profile:${product}`), v=row?.value||{
          product, generation:1
        };
        changes.push({
          key:`profile:${product}`, expectedVersion:row?.version||0, value:{
            ...v, active:true, ...(handleName?{
              handle:handleName
            }:{}), consent:v.active?v.consent:{
              source:'explicit-activation', at:iso(this.now()), version:1
            }
          }
        });
      }
      await this.store.commit(actor.id, changes, handleName?{
        handle:{
          name:handleName
        }
      }:undefined);
      const updated=await this.actor(await this.record(actor.credentialId), actor.credentialId);
      return {
        status:200, body:{
          identity:await this.publicIdentity(updated)
        }
      };
    }
    if(path==='/api/identity/delete')return this.deleteAccount(body,ctx);
    if(path==='/api/identity/logout'||path==='/api/identity/deactivate'){
      const actor=await this.requireActor(body,ctx);
      if(actor.owner)throw failure(403,'owner_required','Only the account owner can change product access');
      const key=body.all_products===true?'profile:identity':`profile:${this.product}`;
      const row=await this.store.read(actor.id,key);
      await this.store.commit(actor.id,[{key,expectedVersion:row.version,value:{...row.value,generation:row.value.generation+1,...(path.endsWith('/deactivate')?{active:false}:{})}}]);
      const record=await this.record(actor.credentialId);
      const providerRevocation=await this.revokeProvider(record,actor.credentialId);
      return {status:200,body:{revoked:true,provider_revocation:providerRevocation},headers:{'set-cookie':this.cookie(this.cookieName,'',0)}};
    }
    if(path==='/api/agents/create'){
      const actor=await this.requireActor(body, ctx, {
        human:true
      });
      if(!Array.isArray(body.scopes)||!body.scopes.length||body.scopes.some(s=>!actor.scopes.includes(s)||s==='agents:create'))throw failure(400, 'invalid_scopes', 'Agent scopes must be an explicit subset of owner permissions');
      const ttl=body.expires_in??3600;
      if(!Number.isFinite(ttl)||ttl<1||ttl>86400)throw failure(400, 'invalid_expiry', 'Agent lifetime must be between 1 second and 24 hours');
      const token=randomToken(), hash=digest(token), identity=await this.identity(actor.id), profile=(await this.store.read(actor.id, `profile:${this.product}`)).value;
      const id='agent_'+randomToken();
      const r={
        id, owner:actor.id, kind:'agent', product:this.product, scopes:[...new Set(body.scopes)], generation:identity.generation, productGeneration:profile.generation, parentCredential:actor.credentialId, expiresAt:iso(Math.min(this.now()+ttl*1000, Date.parse(actor.expiresAt))), createdAt:iso(this.now()), attestation:'self-declared'
      };
      await this.persistCredential(r, hash);
      return {
        status:201, body:{
          agent:await this.publicIdentity(await this.actor(r, hash)), credential:token
        }
      };
    }
    const revoke=path.match(/^\/api\/agents\/(agent_[A-Za-z0-9_-]+)\/revoke$/);
    if(revoke){
      const actor=await this.requireActor(body,ctx,{human:true});
      const principal=await this.store.read(actor.id,'profile:identity');
      if(!principal?.value||(await this.store.read(deletionScope(actor.id),'identity:deletion'))?.value)throw failure(403,'account_deleted','This account is being deleted');
      const row=await this.store.read(actor.id,REGISTRY);
      const delegated=row?.value.agents.find(item=>item.id===revoke[1]);
      if(!delegated)throw failure(404,'agent_not_found','Agent was not found');
      const record=await this.store.read(credentialScope(delegated.hash),'record');
      if(record?.value)await this.store.commit(credentialScope(delegated.hash),[{key:'record',expectedVersion:record.version,value:{...record.value,revoked:true,revokedAt:iso(this.now())}}]);
      const agents=row.value.agents.map(item=>item.id===delegated.id?{...item,revokedAt:iso(this.now())}:item);
      const audit=[...row.value.audit,{event:'agent_revoked',agent:delegated.id,at:iso(this.now())}].slice(-128);
      await this.store.commit(actor.id,[{key:'profile:identity',expectedVersion:principal.version,value:principal.value},{key:REGISTRY,expectedVersion:row.version,value:{...row.value,agents,audit}}]);
      return {status:200,body:{revoked:true}};
    }
    return null;
  }
}
