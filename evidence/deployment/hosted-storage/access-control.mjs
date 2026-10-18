import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {SupabaseRepository} from '../../../service/repository.js';
const base=process.env.SUPABASE_URL;
const headers={apikey:process.env.SUPABASE_ANON_KEY,authorization:`Bearer ${process.env.SUPABASE_ANON_KEY}`,'content-type':'application/json'};
const checks=[];
for(const [path,method,body] of [
  ['/rest/v1/purl_documents?select=document_id','GET'],
  ['/rest/v1/rpc/purl_read_document','POST',{p_document_id:'godseed-v3-production'}],
  ['/storage/v1/object/purl-artifacts/a8/a895c316939b3e0d26a1947996e23f516092e7c2653c4c89d50581d094655367','GET'],
  ['/storage/v1/object/public/purl-artifacts/a8/a895c316939b3e0d26a1947996e23f516092e7c2653c4c89d50581d094655367','GET'],
]) {
  const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
  await r.arrayBuffer();
  assert.ok([400,401,403,404].includes(r.status),`Anonymous access unexpectedly allowed at ${path}`);
  checks.push({path,status:r.status,anonymous_access:'DENIED'});
}
const repo=new SupabaseRepository({url:base,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY,documentId:'godseed-v3-production'});
assert.equal(await repo.hasPendingExecutions(),false);
checks.push({name:'Actual hosted indexed idle query',pending:false});
const report={status:'PASS',recorded_at:new Date().toISOString(),execution_class:'ACTUAL_HOSTED_HTTP_ANON_DENIAL_AND_PRIVATE_QUEUE_HINT',checks,credentials_recorded:false};
await writeFile(new URL('./access-control.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
