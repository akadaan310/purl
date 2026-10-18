import { createHash } from 'node:crypto';
import { FileRepository } from '../repository.js';

const MAX_ROW = 256 * 1024, MAX_TENANT = 10 * 1024 * 1024;
const MAX_RECORDS = 4096, MAX_RETRIES = 1024, MAX_RETRY_BYTES = 2 * 1024 * 1024, MAX_HANDLES = 1024;
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
const clone = value => structuredClone(value);
const own = (object, key) => object && Object.hasOwn(object, key) ? object[key] : undefined;
const validUnicode = value => !value.includes('\u0000') && value.isWellFormed();
function fail(code, message, status = 400) { throw Object.assign(new Error(message), { code, status }); }
function text(value, max, label) {
  if (typeof value !== 'string' || !value || !validUnicode(value) || Buffer.byteLength(value) > max || /[\u0000-\u001f\u007f]/.test(value) || unsafe.has(value)) fail('invalid_input', `Invalid ${label}`);
  return value;
}
// jsonb writes finite exponent numbers as decimal text. Use that same compact
// encoding for quotas in every adapter so development cannot bypass SQL bounds.
function decimalNumber(value) {
  const encoded=JSON.stringify(value);
  if(!encoded.includes('e')) return encoded;
  const [mantissa,power]=encoded.split('e'),negative=mantissa.startsWith('-');
  const unsigned=negative?mantissa.slice(1):mantissa,digits=unsigned.replace('.','');
  const point=(unsigned.includes('.')?unsigned.indexOf('.'):unsigned.length)+Number(power);
  const expanded=point<=0?`0.${'0'.repeat(-point)}${digits}`:point>=digits.length?digits+'0'.repeat(point-digits.length):`${digits.slice(0,point)}.${digits.slice(point)}`;
  return (negative?'-':'')+expanded;
}
const jsonBytes = value => Buffer.byteLength(canonical(value,new Set(),0,true));
function canonical(value, seen = new Set(), depth = 0, storage = false) {
  if (depth > 64) fail('invalid_input', 'JSON nesting exceeds limit');
  if (typeof value === 'string' && !validUnicode(value)) fail('invalid_input', 'JSON requires valid Unicode without NUL');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return storage ? decimalNumber(value) : JSON.stringify(value);
  if (!value || typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail('invalid_input', 'Values must be finite JSON');
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value,key);
    if (typeof key !== 'string' || !validUnicode(key) || unsafe.has(key) || descriptor.get || descriptor.set || !descriptor.enumerable) fail('invalid_input', 'Unsafe JSON property');
  }
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) fail('invalid_input', 'Invalid JSON array');
    result = `[${Array.from(value, item => canonical(item, seen, depth + 1, storage)).join(',')}]`;
  } else {
    if (Object.getOwnPropertySymbols(value).length) fail('invalid_input', 'Invalid JSON properties');
    result = `{${Object.keys(value).sort().map(key => {
      if (unsafe.has(key) || Object.getOwnPropertyDescriptor(value,key).get || Object.getOwnPropertyDescriptor(value,key).set) fail('invalid_input', 'Unsafe JSON property');
      return `${JSON.stringify(key)}:${canonical(value[key], seen, depth + 1, storage)}`;
    }).join(',')}}`;
  }
  seen.delete(value); return result;
}
function scopeKey(scope,key) { text(scope,256,'scope'); if (key !== undefined) text(key,512,'key'); }
function selection({prefix = '',limit = 200,statuses} = {}) {
  if (typeof prefix !== 'string' || !validUnicode(prefix) || Buffer.byteLength(prefix)>512 || /[\u0000-\u001f\u007f]/.test(prefix) || !Number.isInteger(limit) || limit < 1 || limit > 200) fail('invalid_input','Invalid read bounds');
  if (statuses !== undefined && (!Array.isArray(statuses) || !statuses.length || statuses.length>32 || statuses.some(s=>typeof s !== 'string'||!s||!validUnicode(s)||/[\u0000-\u001f\u007f]/.test(s)||Buffer.byteLength(s)>64))) fail('invalid_input','Invalid statuses');
  return {prefix,limit,statuses};
}
function handleName(name) { if (typeof name !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name) || unsafe.has(name)) fail('invalid_input','Invalid handle'); return name; }
function prepare(scope, changes, options = {}) {
  scopeKey(scope);
  if (!Array.isArray(changes) || !changes.length || changes.length>32) fail('invalid_input','Commit requires 1–32 changes');
  const keys = new Set();
  const normalized = changes.map(item=>{
    if (!item || typeof item !== 'object') fail('invalid_input','Invalid change');
    const {key,expectedVersion,value} = item; scopeKey(scope,key);
    if (keys.has(key) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER) fail('invalid_input','Invalid expected version or duplicate key');
    keys.add(key);
    const encoded = canonical(value);
    if (jsonBytes(value)>MAX_ROW) fail('row_limit','Row exceeds 256 KiB',413);
    return {key,expectedVersion,value:JSON.parse(encoded)};
  });
  const {idempotencyKey,payloadHash,handle} = options;
  if ((idempotencyKey === undefined) !== (payloadHash === undefined)) fail('invalid_input','Idempotency key and payload hash must be paired');
  if (idempotencyKey !== undefined) { text(idempotencyKey,256,'idempotency key'); text(payloadHash,256,'payload hash'); }
  if (handle !== undefined) handleName(handle?.name);
  const fingerprint = createHash('sha256').update(canonical({changes:normalized,handle:handle ? {name:handle.name} : null})).digest('hex');
  return {changes:normalized,idempotencyKey,payloadHash,handle:handle ? {name:handle.name}:undefined,fingerprint};
}
const empty = () => ({scopes:{},handles:{}});
function commitState(state,scope,operation) {
  const {changes,idempotencyKey,payloadHash,handle,fingerprint}=operation;
  const tenant=own(state.scopes,scope) || {revision:0,records:{},idempotency:{},handle:null};
  const previous=idempotencyKey && own(tenant.idempotency,idempotencyKey);
  if (previous) {
    if(previous.payloadHash !== payloadHash || previous.fingerprint !== fingerprint) fail('idempotency_conflict','Idempotency payload differs',409);
    return {...clone(previous.result),duplicate:true};
  }
  if (handle && state.handles[handle.name] && state.handles[handle.name] !== scope) fail('handle_conflict','Handle is occupied',409);
  for(const item of changes) if ((own(tenant.records,item.key)?.version || 0) !== item.expectedVersion) fail('version_conflict','Record version differs',409);
  let bytes=Object.values(tenant.records).reduce((sum,r)=>sum+(r.value === null ? 0 : jsonBytes(r.value)),0);
  for(const item of changes) bytes += (item.value === null ? 0 : jsonBytes(item.value)) - (own(tenant.records,item.key)?.value == null ? 0 : jsonBytes(own(tenant.records,item.key).value));
  if(bytes>MAX_TENANT) fail('tenant_quota','Tenant exceeds 10 MiB',413);
  const records=changes.map(({key,expectedVersion,value})=>({key,version:expectedVersion+1,value:clone(value)}));
  const result={revision:tenant.revision+1,records:clone(records),duplicate:false};
  if(Object.keys(tenant.records).length+changes.filter(item=>!Object.hasOwn(tenant.records,item.key)).length>MAX_RECORDS) fail('metadata_quota','Tenant exceeds 4096 records including tombstones',413);
  if(handle && !Object.hasOwn(state.handles,handle.name) && Object.values(state.handles).filter(owner=>owner===scope).length>=MAX_HANDLES) fail('metadata_quota','Tenant exceeds 1024 handle aliases',413);
  if(idempotencyKey) {
    const metadata={key:idempotencyKey,payloadHash,fingerprint,result:clone(result)};
    const bytes=jsonBytes(metadata);
    const existingBytes=Object.entries(tenant.idempotency).reduce((sum,[key,value])=>sum+jsonBytes({key,...value}),0);
    if(Object.keys(tenant.idempotency).length>=MAX_RETRIES || existingBytes+bytes>MAX_RETRY_BYTES) fail('metadata_quota','Tenant exceeds retry metadata limits (1024 entries, 2 MiB)',413);
  }
  for(const record of records) tenant.records[record.key]=record;
  if(handle) { state.handles[handle.name]=scope; tenant.handle=handle.name; }
  tenant.revision=result.revision;
  if(idempotencyKey) tenant.idempotency[idempotencyKey]={payloadHash,fingerprint,result:clone(result)};
  state.scopes[scope]=tenant; return result;
}
class LocalLaunchStore {
  async read(scope,key) { scopeKey(scope,key); const state=await this.snapshot(); return clone(own(own(state.scopes,scope)?.records,key) || null); }
  async list(scope,options={}) { scopeKey(scope); const {prefix,limit}=selection(options),state=await this.snapshot(); return clone(Object.values(own(state.scopes,scope)?.records || {}).filter(r=>r.value !== null && r.key.startsWith(prefix)).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).slice(0,limit)); }
  async scan(options={}) {
    const {prefix,limit,statuses}=selection(options),state=await this.snapshot(),rows=[];
    for(const scope of Object.keys(state.scopes).sort()) for(const r of Object.values(state.scopes[scope].records).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)) if(r.value !== null && r.key.startsWith(prefix) && (!statuses || statuses.includes(r.value?.status))) { rows.push({scope,...r}); if(rows.length===limit)return clone(rows); }
    return clone(rows);
  }
  async commit(scope,changes,options={}) { const operation=prepare(scope,changes,options); return this.mutate(state=>commitState(state,scope,operation)); }
  async resolveHandle(name) { handleName(name); const state=await this.snapshot(),scope=state.handles[name]; return scope ? {subject:scope,handle:state.scopes[scope].handle}:null; }
  async erase(scope) { scopeKey(scope); return this.mutate(state=>{delete state.scopes[scope];for(const [name,owner]of Object.entries(state.handles)) if(owner===scope)delete state.handles[name];}); }
}
export class MemoryLaunchStore extends LocalLaunchStore {
  mode='development-memory';
  constructor(){super();this.state=empty();}
  async snapshot(){return clone(this.state);}
  async mutate(fn){const candidate=clone(this.state),result=fn(candidate);this.state=candidate;return clone(result);}
}
/** Single-host development only; separate from the legacy repository document. */
export class FileLaunchStore extends LocalLaunchStore {
  mode='development-file';
  constructor(path='./.purl/launch.json',options={}){super();this.repository=new FileRepository(path,options);}
  async snapshot(){return (await this.repository.read()).data.launch || empty();}
  async mutate(fn){return this.repository.transaction(data=>{data.launch ||= empty(); return fn(data.launch);});}
}
export class SupabaseLaunchStore {
  mode='supabase';
  constructor({url,serviceRoleKey,fetch:fetcher=globalThis.fetch,timeoutMs=15000}={}){
    if(!url || !serviceRoleKey) fail('store_configuration','SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',503);
    let parsed;try { parsed=new URL(url); } catch { fail('store_configuration','Invalid Supabase URL',503); }
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)fail('store_configuration','Invalid Supabase URL',503);
    this.url=parsed.href.replace(/\/$/,'');this.key=serviceRoleKey;this.fetch=fetcher;this.timeoutMs=timeoutMs;
  }
  async rpc(name,body){
    let response;try{response=await this.fetch(`${this.url}/rest/v1/rpc/purl_launch_${name}`,{method:'POST',headers:{apikey:this.key,authorization:`Bearer ${this.key}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(this.timeoutMs)});}catch{fail('store_unavailable','Launch persistence unavailable',503);}
    if(!response.ok){let code;try{const payload=await response.json();code=['invalid_input','row_limit','tenant_quota','metadata_quota','version_conflict','handle_conflict','idempotency_conflict'].find(c=>payload.message===c);}catch{}
      if(code)fail(code,`Launch store rejected operation: ${code}`,['version_conflict','handle_conflict','idempotency_conflict'].includes(code)?409:['row_limit','tenant_quota','metadata_quota'].includes(code)?413:400);
      fail('store_unavailable',`Launch persistence request failed (${response.status})`,503);
    }
    try { return await response.json(); } catch { fail('store_unavailable','Invalid launch persistence response',503); }
  }
  async read(scope,key){scopeKey(scope,key);return this.rpc('read',{p_scope:scope,p_key:key});}
  async list(scope,options={}){scopeKey(scope);const {prefix,limit}=selection(options);return this.rpc('list',{p_scope:scope,p_prefix:prefix,p_limit:limit});}
  async scan(options={}){const {prefix,limit,statuses}=selection(options);return this.rpc('scan',{p_prefix:prefix,p_statuses:statuses||null,p_limit:limit});}
  async commit(scope,changes,options={}){const p=prepare(scope,changes,options);return this.rpc('commit',{p_scope:scope,p_changes:p.changes,p_idempotency_key:p.idempotencyKey||null,p_payload_hash:p.payloadHash||null,p_handle:p.handle?.name||null});}
  async resolveHandle(name){handleName(name);return this.rpc('resolve_handle',{p_handle:name});}
  async erase(scope){scopeKey(scope);await this.rpc('erase',{p_scope:scope});}
}
export function createLaunchStore(env=process.env){
  const production=env.NODE_ENV==='production',mode=env.PURL_LAUNCH_PERSISTENCE||(production?'supabase':'file');
  if(production && mode!=='supabase')fail('store_configuration','Production requires Supabase launch persistence',503);
  if(mode==='supabase')return new SupabaseLaunchStore({url:env.SUPABASE_URL,serviceRoleKey:env.SUPABASE_SERVICE_ROLE_KEY});
  if(mode==='memory')return new MemoryLaunchStore();
  if(mode==='file')return new FileLaunchStore(env.PURL_LAUNCH_FILE||'./.purl/launch.json');
  fail('store_configuration','Unknown launch persistence adapter',503);
}
