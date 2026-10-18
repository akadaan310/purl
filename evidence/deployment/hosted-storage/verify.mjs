import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SupabaseRepository} from '../../../service/repository.js';
import {canonicalize} from '../../../service/domain/support.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
const env=process.env;
const options={url:env.SUPABASE_URL,serviceRoleKey:env.SUPABASE_SERVICE_ROLE_KEY,bucket:'purl-artifacts'};
const repo=new SupabaseRepository({...options,documentId:'godseed-v3-production'});
const nonce=`verification-${Date.now()}`;
const copies=[];
const report={status:'RUNNING',started_at:new Date().toISOString(),execution_class:'ACTUAL_HOSTED_SUPABASE_PRIVATE_STORAGE_AND_ISOLATED_DOCUMENT_RESTORE',credentials_recorded:false,checks:[],limits:'Same hosted project/private bucket; not a cross-project disaster-recovery exercise. Original authoritative document and content-addressed objects remain untouched.'};
let restoreId;
try {
  for(const name of ['arithmetic','mission']) {
    const artifact=JSON.parse(await readFile(new URL(`../hosted-backend/${name}-artifact.json`,import.meta.url),'utf8'));
    const {content_id,storage,...content}=artifact;
    const expected=Buffer.from(canonicalize(content));
    const bytes=await repo.getArtifact(storage.id);
    assert.equal(bytes.length,storage.size);
    assert.ok(bytes.equals(expected));
    assert.equal(`sha256:${hash(bytes)}`,storage.id);
    const key=`verification/${nonce}/${hash(bytes)}`;
    await repo.request(`/storage/v1/object/purl-artifacts/${key}`,{body:bytes,raw:true,headers:{'content-type':'application/purl+json','x-upsert':'false'}});
    copies.push(key);
    const recovered=Buffer.from(await (await repo.request(`/storage/v1/object/purl-artifacts/${key}`,{method:'GET'})).arrayBuffer());
    assert.ok(recovered.equals(bytes));
    report.checks.push({name,private_download:'PASS',recovery_copy:'PASS',sha256:hash(bytes),bytes:bytes.length});
  }
  const snapshot=await repo.read();
  const digest=hash(canonicalize(snapshot.data));
  restoreId=`${nonce}-restore`;
  const restored=new SupabaseRepository({...options,documentId:restoreId});
  await restored.transaction(data=>{Object.assign(data,structuredClone(snapshot.data));});
  const recovered=await restored.read();
  assert.equal(hash(canonicalize(recovered.data)),digest);
  assert.equal(hash(canonicalize((await repo.read()).data)),digest);
  report.snapshot={source_revision:snapshot.revision,restore_revision:recovered.revision,data_sha256:digest,programs:Object.keys(snapshot.data.programs).length,executions:Object.keys(snapshot.data.executions).length,artifacts:Object.keys(snapshot.data.artifacts).length,restored_document:restoreId,source_unchanged:true};
  report.status='PASS';
} catch(error) {report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally {
  report.cleanup={};
  try {
    if(copies.length)await repo.request('/storage/v1/object/purl-artifacts',{method:'DELETE',body:{prefixes:copies}});
    report.cleanup.temporary_private_copies_removed=true;
  }catch(error){report.cleanup.copy_cleanup_error=error.message;report.status='FAIL';process.exitCode=1;}
  if(restoreId) {
    try {
      await repo.request(`/rest/v1/purl_documents?document_id=eq.${encodeURIComponent(restoreId)}`,{method:'DELETE'});
      assert.equal((await new SupabaseRepository({...options,documentId:restoreId}).read()).revision,0);
      report.cleanup.restored_test_document_removed=true;
    }catch(error){report.cleanup.document_cleanup_error=error.message;report.status='FAIL';process.exitCode=1;}
  }
  report.completed_at=new Date().toISOString();
  await writeFile(new URL('./report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
