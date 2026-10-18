import test from 'node:test';import assert from 'node:assert/strict';
import { buildStructuralIndex, queryStructuralIndex, structuralDiff } from '../../service/launch/structural-index.js';
import { GithubLens, parseGithubUrl } from '../../service/launch/github-lens.js';
const sha='a'.repeat(40);
const files=[{path:'src/util.ts',content:'export interface User { id: string }; export const double=(n:number)=>n*2;'}, {path:'src/main.tsx',content:'import { double as twice } from "./util"; export function View(){ return <p>{twice(2)}</p> }'}, {path:'data.py',content:'print(1)'}];
test('Babel handles TS/JSX, symbols, import aliases and local dependency resolution',()=>{
 const index=buildStructuralIndex(files);assert.equal(index.files[0].status,'indexed');
 assert.equal(queryStructuralIndex(index,{kind:'symbol',name:'double'}).matches[0].path,'src/util.ts');
 const deps=queryStructuralIndex(index,{kind:'dependencies',name:'src/main.tsx'});assert.deepEqual(deps.matches[0].dependencies,['src/util.ts']);
 assert.equal(index.files.find(x=>x.path==='data.py').status,'inventory-only');assert.equal(index.files[1].imports[0].names[0].local,'twice');
 assert.ok(index.files[0].symbols[0].line>0); assert.equal(index.parser,'@babel/parser@7.29.9');
 const bad=buildStructuralIndex([{path:'bad.js',content:'export const = ;'}]);assert.equal(bad.files[0].status,'syntax-error');
 const changed=buildStructuralIndex([{path:'src/util.ts',content:'export const triple=n=>n*3;'}]);assert.equal(structuralDiff(index,changed).changes.find(x=>x.path==='src/util.ts').kind,'modified');
});
test('URL allowlist denies credentials, ports, query, traversal and encoded components',()=>{
 assert.deepEqual(parseGithubUrl('https://github.com/octocat/Hello-World'),{owner:'octocat',repo:'Hello-World'});
 for(const url of ['http://github.com/a/b','https://evil.test/a/b','https://u:p@github.com/a/b','https://github.com:443/a/b','https://github.com/a/b?x=1','https://github.com/a/../b','https://github.com/a/%62','https://github.com/a/b/tree/main','https://github.com/a/b#x'])assert.throws(()=>parseGithubUrl(url),{status:400});
});
function fakeFetch({redirect=false,large=false,rate=false,badPath=false}={}){return async(url,options)=>{
 assert.equal(options.redirect,'manual');const u=new URL(url);assert.ok(['api.github.com','raw.githubusercontent.com'].includes(u.host));
 if(redirect)return new Response('',{status:302,headers:{location:'http://127.0.0.1/'}});if(rate)return new Response('{}',{status:429});
 if(u.hostname==='raw.githubusercontent.com')return new Response(large?'x'.repeat(205000):'export const answer=42;');
 if(u.pathname.endsWith('/commits/HEAD'))return Response.json({sha});
 if(u.pathname.includes('/git/trees/'))return Response.json({truncated:false,tree:[{path:badPath?'../bad.js':'index.js',type:'blob',size:30,sha:'b'.repeat(40)}]});
 return Response.json({private:false,html_url:'https://github.com/a/b',license:{spdx_id:'MIT'},default_branch:'main'});
};}
test('public GitHub reads pin immutable SHA and preserve attribution and bounded index',async()=>{
 const lens=await new GithubLens({fetch:fakeFetch()}).index({url:'https://github.com/a/b'});
 assert.equal(lens.source.commitSha,sha);assert.equal(lens.source.license,'MIT');assert.equal(lens.index.files[0].symbols[0].name,'answer');assert.match(lens.index.files[0].contentHash,/^[a-f0-9]{64}$/);assert.equal(lens.benchmark.method,'UTF-8 bytes / 4 estimate; not tokenizer-measured');
});
test('GitHub fetch rejects redirect, oversized files, rate limit and tree traversal',async()=>{
 for(const [options,status] of [[{redirect:true},502],[{large:true},413],[{rate:true},429],[{badPath:true},400]])await assert.rejects(new GithubLens({fetch:fakeFetch(options)}).index({url:'https://github.com/a/b'}),{status});
});
test('navigation grammar retains destructured symbols, CommonJS/dynamic imports and source hash provenance',()=>{
 const index=buildStructuralIndex([{path:'a.js',content:'const {x: renamed,...rest}=get(); const pkg = require("package"); import("./dep.js"); export {value} from "./dep.js";'}, {path:'dep.js',content:'export const value=1;'}, {path:'README.md',bytes:40,sourceGitBlobSha:'c'.repeat(40)}]);
 assert.deepEqual(queryStructuralIndex(index,{kind:'symbol',name:'renamed'}).matches.map(x=>x.path),['a.js']);
 assert.deepEqual(queryStructuralIndex(index,{kind:'dependencies',name:'a.js'}).matches[0].dependencies,['dep.js','external:package']);
 assert.match(index.navigationMap,/CGIT-NAV\/1/);assert.match(index.navigationMap,/renamed/);assert.equal(index.files[2].sourceGitBlobSha,'c'.repeat(40));
});
test('CGIT saved lens survives service restart, denies other tenants and bounds actor indexing rate',async()=>{
 const {CgitService}=await import('../../service/launch/cgit.js');const {MemoryLaunchStore}=await import('../../service/launch/store.js');
 const store=new MemoryLaunchStore(),actor={id:'alice',products:['cgit'],scopes:['cgit:read','cgit:write']},s=new CgitService({store,fetch:fakeFetch()});
 const {lens}=(await s.handle('POST','/api/cgit/github/index',{url:'https://github.com/a/b'},actor)).body;
 const restarted=new CgitService({store,fetch:fakeFetch()});const saved=(await restarted.handle('GET',`/api/cgit/lenses/${lens.id}`,{},actor)).body.lens;assert.deepEqual(saved,lens);
 const readOnly={...actor,scopes:['cgit:read']};const query=await restarted.handle('POST',`/api/cgit/lenses/${lens.id}/query`,{kind:'symbol',name:'answer'},readOnly);assert.equal(query.body.matches[0].name,'answer');
 await assert.rejects(restarted.handle('GET',`/api/cgit/lenses/${lens.id}`,{}, {...actor,id:'mallory'}),{status:404});
 for(let n=0;n<5;n++)await restarted.handle('POST','/api/cgit/github/index',{url:'https://github.com/a/b'},actor);
 await assert.rejects(restarted.handle('POST','/api/cgit/github/index',{url:'https://github.com/a/b'},actor),{status:429});
});
test('inventory-only structural diff reports upstream Git blob hashes without pretending AST analysis',()=>{
 const before=buildStructuralIndex([{path:'README.md',sourceGitBlobSha:'a'.repeat(40),bytes:10}]),after=buildStructuralIndex([{path:'README.md',sourceGitBlobSha:'b'.repeat(40),bytes:12}]);
 const diff=structuralDiff(before,after);assert.equal(diff.changes.length,1);assert.equal(diff.changes[0].from,'a'.repeat(40));assert.equal(diff.changes[0].hashAlgorithm,'git-blob-sha1');assert.deepEqual(diff.changes[0].addedSymbols,[]);
});
test('JSX in JavaScript and TypeScript generic arrows parse while file and AST quotas reject excess',()=>{
 const index=buildStructuralIndex([{path:'react.js',content:'export function Card(){return <div/>;}'},{path:'generic.ts',content:'export const identity = <T>(value:T):T=>value;'}]);assert.ok(index.files.every(f=>f.status==='indexed'));
 assert.throws(()=>buildStructuralIndex(Array.from({length:41},(_,n)=>({path:`${n}.js`,content:'const a=1;'}))),{status:413});
 assert.throws(()=>buildStructuralIndex([{path:'huge.js',content:';'.repeat(120000)}]),{status:413,code:'ast_limit'});
});
test('TypeScript import-equals retains local aliases and resolves external-module dependencies',()=>{
 for(const extension of ['ts','cts']){
  const path=`src/main.${extension}`;
  const index=buildStructuralIndex([
   {path,content:'import util = require("./util");\nimport external = require("external-package");\nexport const value = util.value;'},
   {path:'src/util.ts',content:'export const value = 42;'}
  ]);
  assert.equal(index.files[0].status,'indexed');
  const {matches}=queryStructuralIndex(index,{kind:'dependencies',name:path});
  assert.deepEqual(matches,[{path,dependencies:['external:external-package','src/util.ts'],imports:[
   {source:'./util',line:1,names:[{imported:'*',local:'util'}]},
   {source:'external-package',line:2,names:[{imported:'*',local:'external'}]}
  ]}]);
 }
 const internal=buildStructuralIndex([{path:'internal.ts',content:'namespace Existing { export const value = 1; }\nimport alias = Existing.value;'}]);
 assert.equal(internal.files[0].status,'indexed');assert.deepEqual(queryStructuralIndex(internal,{kind:'dependencies',name:'internal.ts'}).matches[0].dependencies,[]);
});
