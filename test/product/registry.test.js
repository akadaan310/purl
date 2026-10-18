import test from 'node:test';
import assert from 'node:assert/strict';
import {PurlService}from'../../service/domain.js';
import {MemoryRepository}from'../../service/repository.js';
import {Registry}from'../../service/registry.js';
test('shared registry promotion needs actual configured curator authority and a tested immutable public release',async()=>{
 const repository=new MemoryRepository();const service=new PurlService({repository});const session=(await service.handle('POST','/api/session',{kind:'agent',label:'Builder',curator:true})).body;
 const call=(method,path,body={})=>service.handle(method,path,body,{token:session.token});let p=(await call('POST','/api/programs',{title:'Reusable increment',language:'purl',visibility:'public',source:'input number | math.add 1',tests:[{input:1,expected:2}]})).body.program;
 p=(await call('POST',`/api/programs/${p.id}/build`,{expected_version:p.version})).body.program;const published=(await call('POST',`/api/programs/${p.id}/publish`,{expected_version:p.version})).body;
 const denied=new Registry({repository});await assert.rejects(denied.promote({release_id:published.release.id,expected_version:published.program.version},{token:session.token}),e=>e.status===403);
 const registry=new Registry({repository,curatorIds:[session.principal.id]});const entry=await registry.promote({release_id:published.release.id,expected_version:published.program.version},{token:session.token});assert.equal(entry.release_id,published.release.id);assert.equal(entry.curated_by,session.principal.id);assert.ok(entry.content_id);assert.equal((await registry.list()).items.length,1);
 await assert.rejects(registry.promote({release_id:published.release.id,expected_version:1},{token:session.token}),e=>e.status===409);
});
