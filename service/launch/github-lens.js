import { buildStructuralIndex, hash, problem, safePath } from './structural-index.js';
export function parseGithubUrl(value){
 if(typeof value!=='string'||value.length>512||!/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/?$/.test(value))throw problem(400,'invalid_github_url','Use a public https://github.com/owner/repo URL without credentials, ports, query or fragment');
 const [,owner,repoRaw]=new URL(value).pathname.split('/');const repo=repoRaw.replace(/\.git$/,'');if(!repo||repo==='.'||repo==='..'||owner==='.'||owner==='..')throw problem(400,'invalid_github_url','Invalid repository name');return {owner,repo};
}
export class GithubLens {
 constructor({fetch=globalThis.fetch,githubToken,timeoutMs=10000}={}){this.fetch=fetch;this.githubToken=githubToken;this.timeoutMs=timeoutMs;}
 async read(url,maxBytes,json=true,deadline=Date.now()+this.timeoutMs){
 const u=new URL(url);if(u.protocol!=='https:'||!['api.github.com','raw.githubusercontent.com'].includes(u.hostname)||u.port||u.username||u.password)throw problem(400,'upstream_denied','Upstream denied');
 const remaining=Math.min(this.timeoutMs,deadline-Date.now());if(remaining<=0)throw problem(502,'github_timeout','GitHub indexing deadline exceeded');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),remaining);let response;
 try{response=await this.fetch(url,{method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'application/vnd.github+json','User-Agent':'PURL-CGIT-readonly-lens',...(this.githubToken&&u.hostname==='api.github.com'?{Authorization:`Bearer ${this.githubToken}`}:{})}});
 if(response.status===429||response.status===403&&response.headers.get('x-ratelimit-remaining')==='0')throw problem(429,'github_rate_limit','GitHub rate limit reached; retry later');
 if(response.status>=300&&response.status<400)throw problem(502,'github_redirect_denied','GitHub redirects are denied');if(!response.ok)throw problem(response.status===404?404:502,'github_unavailable','Public GitHub resource unavailable');
 const declared=Number(response.headers.get('content-length'));if(declared>maxBytes)throw problem(413,'github_size_limit','GitHub response exceeds quota');
 const reader=response.body?.getReader();let size=0,chunks=[];if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw problem(413,'github_size_limit','GitHub response exceeds quota');}chunks.push(value);}}finally{reader.releaseLock();}}
 const text=Buffer.concat(chunks).toString('utf8');if(!json)return text;try{return JSON.parse(text);}catch{throw problem(502,'github_invalid_response','Invalid GitHub response');}
 }catch(e){if(e.status)throw e;throw problem(502,'github_network_error','GitHub read failed or timed out');}finally{clearTimeout(timer);}
 }
 async index({url,ref='HEAD'}={}){
 const {owner,repo}=parseGithubUrl(url);if(typeof ref!=='string'||ref.length>180||!ref||!/^[-A-Za-z0-9_./]+$/.test(ref)||ref.split('/').some(s=>!s||s==='.'||s==='..')||ref.startsWith('-'))throw problem(400,'invalid_ref','Unsupported GitHub ref');
 const base=`https://api.github.com/repos/${owner}/${repo}`,deadline=Date.now()+45000;
 const metadata=await this.read(base,128*1024,true,deadline);if(metadata.private!==false)throw problem(403,'github_private_denied','Only public GitHub repositories can be indexed');
 const revision=await this.read(`${base}/commits/${encodeURIComponent(ref)}`,128*1024,true,deadline);if(!/^[a-f0-9]{40}$/.test(revision.sha))throw problem(502,'github_invalid_sha','GitHub did not return a commit SHA');
 const tree=await this.read(`${base}/git/trees/${revision.sha}?recursive=1`,1024*1024,true,deadline);if(tree.truncated||!Array.isArray(tree.tree)||tree.tree.length>1000)throw problem(413,'github_tree_limit','Repository tree exceeds 1000 entries');
 const entries=tree.tree.filter(e=>e.type==='blob').map(e=>{safePath(e.path);if(!/^[a-f0-9]{40}$/.test(e.sha)||!Number.isSafeInteger(e.size)||e.size<0)throw problem(502,'github_invalid_tree','Invalid GitHub tree entry');return e;}).sort((a,b)=>a.path.localeCompare(b.path));
 const files=[];let count=0,total=0;for(const entry of entries){if(/\.(?:[cm]?js|jsx|ts|tsx|[cm]ts)$/i.test(entry.path)&&count<40){if(entry.size>200*1024||total+entry.size>2*1024*1024)throw problem(413,'github_source_limit','Selected source exceeds quota');const content=await this.read(`https://raw.githubusercontent.com/${owner}/${repo}/${revision.sha}/${entry.path.split('/').map(encodeURIComponent).join('/')}`,200*1024,false,deadline);total+=Buffer.byteLength(content);if(total>2*1024*1024)throw problem(413,'github_source_limit','Selected source exceeds quota');count++;files.push({path:entry.path,content,sourceGitBlobSha:entry.sha});}else files.push({path:entry.path,bytes:entry.size,sourceGitBlobSha:entry.sha});}
 const index=buildStructuralIndex(files),navigation=index.navigationMap;return {id:hash({owner,repo,sha:revision.sha,index}),createdAt:new Date().toISOString(),source:{url:`https://github.com/${owner}/${repo}`,owner,repository:repo,commitSha:revision.sha,license:metadata.license?.spdx_id||'UNKNOWN',attribution:`${owner}/${repo} at ${revision.sha}`,licenseNotice:'Source remains under its upstream license; unknown license grants no reuse permission'},index,limits:{tree:1000,indexedFiles:40,totalSourceBytes:2*1024*1024,fileBytes:200*1024,selectedFiles:count,sourceBytes:total},benchmark:{method:'UTF-8 bytes / 4 estimate; not tokenizer-measured',rawSelectedEstimatedTokens:Math.ceil(total/4),navigationEstimatedTokens:Math.ceil(Buffer.byteLength(navigation)/4),taskSuccess:'NOT_MEASURED; syntax navigation only',compressionClaim:false}};
 }
}
