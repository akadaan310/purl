/** Dependency-free browser/Node client for the consumer PURL resource protocol. */
export class PurlLaunchClient {
 constructor(baseUrl,{token,fetch:transport=globalThis.fetch}={}){this.baseUrl=new URL(baseUrl).origin;this.token=token;this.fetch=transport;this.csrf=null;this.bootstrapCsrf=null;this.cookies=new Map();}
 async request(path,{method='GET',body,idempotencyKey}={}){
  const url=new URL(path,this.baseUrl);if(url.origin!==this.baseUrl)throw Error('Cross-origin API operation requires a separately configured client');
  const node=typeof document==='undefined',cookie=[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ');
  const bootstrap=['/api/identity/login','/api/identity/guest','/api/identity/recover'].includes(url.pathname),csrf=bootstrap?(this.bootstrapCsrf??this.csrf):this.csrf;
  const r=await this.fetch(url,{method,redirect:'manual',credentials:'same-origin',headers:{accept:'application/purl+json',...(this.token?{authorization:`Bearer ${this.token}`} :{}),...(node&&cookie?{cookie}:{}),...(method==='POST'?{'content-type':'application/json',...(node?{origin:this.baseUrl}:{}),...(csrf?{'x-csrf-token':csrf}:{})}:{}),...(idempotencyKey?{'idempotency-key':idempotencyKey}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(r.status>=300&&r.status<400)throw Object.assign(Error('Redirect following is disabled for authenticated SDK requests'),{status:r.status,code:'redirect_denied'});
  if(node)for(const value of r.headers.getSetCookie?.()??[]){const item=value.split(';')[0],at=item.indexOf('=');if(at>0)this.cookies.set(item.slice(0,at),item.slice(at+1));}
  const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error?.message??`PURL HTTP ${r.status}`),{status:r.status,code:data.error?.code});if(data.csrf_token){if(url.pathname==='/api/identity/config')this.bootstrapCsrf=data.csrf_token;else this.csrf=data.csrf_token;}return data;
 }
 discover(){return this.request('/.well-known/purl');}
 async preview(options={}){await this.request('/api/identity/config');return this.request('/api/identity/guest',{method:'POST',body:options});}
 me(){return this.request('/api/identity/me');}
 catalog(){return this.request('/api/catalog');}
 runExperience(id,input){return this.request(`/api/catalog/${encodeURIComponent(id)}/run`,{method:'POST',body:{input}});}
 createResource(resource,idempotencyKey){return this.request('/api/resources',{method:'POST',body:resource,idempotencyKey});}
 inspect(id){return this.request(`/api/resources/${encodeURIComponent(id)}`);}
 operation(id,name,expected_version,payload={},idempotencyKey){if(!['source','compile','build','run','publish','checkpoint','fork','propose','commit'].includes(name))throw Error('Unknown typed resource operation');return this.request(`/api/resources/${encodeURIComponent(id)}/${name}`,{method:'POST',body:{expected_version,...payload},idempotencyKey});}
 async reconstruct(purl){const manifest=await this.request(new URL(purl,this.baseUrl).href);const continuity=manifest.links?.continuity?await this.request(manifest.links.continuity):null;return {manifest,continuity,permitted_operations:manifest.operations?.filter(x=>x.available)??[],next:continuity?.checkpoint?.next??continuity?.state?.next??manifest.continuation?.steps??[]};}
}
