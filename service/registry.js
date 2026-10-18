import {authenticate,initialize,fail,expected,hashOf,requireRight,clone}from'./domain/support.js';
/** Shared promotion is a server-configured curator act, separate from publishing. */
export class Registry{
 constructor({repository,curatorIds=[]}){this.repository=repository;this.curatorIds=new Set(curatorIds);}
 async list(){const{data}=await this.repository.read();return {items:Object.values(data.registry??{}).map(clone),promotion:'Configured curator authority and a passing immutable public release are required'};}
 async promote(body,{token}={}){
  return this.repository.transaction(document=>{
   const data=initialize(document);const principal=authenticate(data,token,true);
   if(!this.curatorIds.has(principal.id))fail(403,'curator_required','Shared promotion requires configured curator authority; labels and ownership do not confer it');
   const release=data.releases[body.release_id];const program=release&&data.programs[release.program_id];
   if(!release||!program)fail(404,'not_found','Immutable release not found');requireRight(program,principal,'read');expected(program,body);
   if(program.visibility!=='public')fail(422,'public_release_required','Shared registry entries must refer to public programs');
   const build=program.builds.find(b=>b.id===release.build_id);const unsignedBuild=build?{...build}:null;if(unsignedBuild)delete unsignedBuild.content_id;
   const unsignedRelease={...release};delete unsignedRelease.content_id;
   if(!release.immutable||hashOf(unsignedRelease)!==release.content_id||!build||hashOf(unsignedBuild)!==build.content_id||build.status!=='passed'||!build.tests_passed||!build.tests.length)fail(422,'verified_build_required','Promotion requires an intact immutable release and at least one passing declared test');
   data.registry??={};if(data.registry[release.id])return clone(data.registry[release.id]);
   const entry={release_id:release.id,program_id:program.id,title:program.title,build_id:build.id,build_content_id:build.content_id,source_content_id:release.source_content_id,curated_by:principal.id,promoted_at:new Date().toISOString(),authority:'server-configured-curator',immutable:true};entry.content_id=hashOf(entry);data.registry[release.id]=entry;data.audit.push({operation:'registry-promotion',actor:principal.id,program_id:program.id,release_id:release.id,at:entry.promoted_at,content_id:entry.content_id});return clone(entry);
  });
 }
}
