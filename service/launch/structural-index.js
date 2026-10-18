import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { parse } from '@babel/parser';
export function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;}
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
export function problem(status,code,message){return Object.assign(new Error(message),{status,code});}
export function safePath(path){if(typeof path!=='string'||path.length>240||!path||path.startsWith('/')||/[\\\x00-\x1f%]/.test(path)||path.split('/').some(x=>!x||x==='.'||x==='..'||['__proto__','constructor','prototype'].includes(x)))throw problem(400,'invalid_path','Artifact paths must be relative and contain no traversal');return path;}
const supported=/\.(?:[cm]?js|jsx|ts|tsx|[cm]ts)$/i;
export function buildStructuralIndex(files){
 if(!Array.isArray(files)||files.length>1000)throw problem(413,'file_limit','At most 1000 inventory files');
 const paths=new Set(files.map(f=>safePath(f.path)));if(paths.size!==files.length)throw problem(400,'duplicate_path','Duplicate source paths');
 let selected=0,bytes=0;
 const summaries=files.map(file=>{
 const {path}=file,content=file.content;const out={path,status:'inventory-only',language:path.split('.').at(-1),sourceGitBlobSha:file.sourceGitBlobSha??null,contentHash:content===undefined?null:hash(content),bytes:content===undefined?file.bytes??0:Buffer.byteLength(content)};
 if(!supported.test(path)||content===undefined)return out;
 if(++selected>40||out.bytes>200*1024||(bytes+=out.bytes)>2*1024*1024)throw problem(413,'index_limit','Index source quota exceeded');
 const plugins=[];if(/\.[cm]?tsx?$/i.test(path))plugins.push('typescript');if(!/\.[cm]?ts$/i.test(path))plugins.push('jsx');
 let ast;try{ast=parse(content,{sourceType:'unambiguous',plugins,allowReturnOutsideFunction:true,errorRecovery:false});}catch(e){return {...out,status:'syntax-error',error:{code:'syntax_error',line:e.loc?.line??null,column:e.loc?.column??null}};}
 const symbols=[],imports=[];let nodes=0;const stack=[ast];
 while(stack.length){const node=stack.pop();if(!node||typeof node!=='object')continue;if(Array.isArray(node)){for(let i=node.length-1;i>=0;i--)stack.push(node[i]);continue;}if(typeof node.type!=='string')continue;
 if(++nodes>100000)throw problem(413,'ast_limit','AST node quota exceeded');
 const names=[];if(['FunctionDeclaration','ClassDeclaration','TSInterfaceDeclaration','TSTypeAliasDeclaration','TSEnumDeclaration'].includes(node.type)&&node.id?.name)names.push(node.id.name);
 if(node.type==='VariableDeclarator'){const gather=p=>{if(!p)return;if(p.type==='Identifier')names.push(p.name);else if(p.type==='ObjectPattern')p.properties.forEach(x=>gather(x.value||x.argument));else if(p.type==='ArrayPattern')p.elements.forEach(gather);else if(p.type==='AssignmentPattern')gather(p.left);else if(p.type==='RestElement')gather(p.argument);};gather(node.id);}
 for(const name of names)if(symbols.length<80)symbols.push({name,kind:node.type,line:node.loc?.start.line,column:node.loc?.start.column,endLine:node.loc?.end.line});
 if(node.type==='ImportDeclaration'||node.type==='ExportAllDeclaration'||node.type==='ExportNamedDeclaration'&&node.source){if(imports.length<80)imports.push({source:node.source.value,line:node.loc.start.line,names:(node.specifiers||[]).slice(0,40).map(s=>({imported:s.imported?.name||s.imported?.value||(s.type==='ImportDefaultSpecifier'?'default':s.type==='ImportNamespaceSpecifier'?'*':s.local?.name),local:s.local?.name||s.exported?.name}))});}
 // TypeScript import-equals uses an external-module node rather than a require CallExpression.
 // Qualified aliases (import X = Namespace.Member) do not introduce a file dependency.
 if(node.type==='TSImportEqualsDeclaration'&&node.moduleReference?.type==='TSExternalModuleReference'&&node.moduleReference.expression?.type==='StringLiteral'&&imports.length<80){
 imports.push({source:node.moduleReference.expression.value,line:node.loc.start.line,names:[{imported:'*',local:node.id.name}]});
 }
 if((node.type==='CallExpression'&&node.callee?.name==='require'||node.type==='CallExpression'&&node.callee?.type==='Import')&&node.arguments?.[0]?.type==='StringLiteral'&&imports.length<80)imports.push({source:node.arguments[0].value,line:node.loc.start.line,names:[]});
 for(const [k,v]of Object.entries(node))if(!['loc','start','end','extra','comments','tokens','errors'].includes(k)&&v&&typeof v==='object')stack.push(v);
 }
 symbols.sort((a,b)=>a.line-b.line||a.column-b.column||a.name.localeCompare(b.name));imports.sort((a,b)=>a.line-b.line||a.source.localeCompare(b.source));
 const dependencies=imports.map(i=>{if(!i.source.startsWith('.'))return `external:${i.source}`;const base=posix.normalize(posix.join(posix.dirname(path),i.source));const candidates=[base,...['.ts','.tsx','.js','.jsx','.mts','.mjs','.cts','.cjs'].map(e=>base+e),...['.ts','.tsx','.js','.jsx'].map(e=>base+'/index'+e)];if(/\.js$/.test(base))candidates.push(base.slice(0,-3)+'.ts',base.slice(0,-3)+'.tsx');return candidates.find(p=>paths.has(p))||`unresolved:${i.source}`;});
 return {...out,status:'indexed',symbols,imports,dependencies:[...new Set(dependencies)].sort(),ast:{nodes,sourceType:ast.program.sourceType},truncated:symbols.length===80||imports.length===80};
 });
 const navigationMap=['CGIT-NAV/1',...summaries.flatMap(file=>[
 `${file.status==='indexed'?'F':file.status==='syntax-error'?'E':'U'} ${JSON.stringify(file.path)} #${file.contentHash??file.sourceGitBlobSha??'unfetched'}`,
 ...(file.symbols||[]).map(s=>` S ${JSON.stringify(s.name)} ${s.kind} @${s.line}:${s.column}`),
 ...(file.imports||[]).map(i=>` I ${JSON.stringify(i.source)} @${i.line}`),
 ...(file.dependencies||[]).map(d=>` D ${JSON.stringify(d)}`)
 ])].join('\n');
 return {version:'cgit-structural/1',parser:'@babel/parser@7.29.9',files:summaries,navigationMap,navigationGrammar:'F indexed file, U inventory-only, E syntax error; # content SHA256 or upstream Git blob SHA1; S symbol kind @line:column; I import @line; D dependency. Names and paths JSON-quoted.',claims:'Deterministic syntax navigation; no execution or semantic-equivalence claim'};
}
export function queryStructuralIndex(index,query={}){
 const {kind,name=''}=query;if(!['symbol','name','dependencies'].includes(kind)||typeof name!=='string'||name.length>240)throw problem(400,'invalid_query','Supported queries: symbol, name, dependencies');
 const matches=[];for(const file of index.files){if(kind==='symbol'){for(const symbol of file.symbols||[])if(symbol.name===name)matches.push({path:file.path,...symbol});}else if(kind==='name'){if(file.path.includes(name))matches.push({path:file.path,status:file.status,contentHash:file.contentHash});}else if(file.path===name)matches.push({path:file.path,dependencies:file.dependencies||[],imports:file.imports||[]});}return {kind,name,matches:matches.slice(0,200),deterministic:true};
}
export function structuralDiff(from,to){const a=new Map(from.files.map(f=>[f.path,f])),b=new Map(to.files.map(f=>[f.path,f]));const changes=[];for(const path of [...new Set([...a.keys(),...b.keys()])].sort()){const x=a.get(path),y=b.get(path);const fromHash=x?.contentHash??x?.sourceGitBlobSha??null,toHash=y?.contentHash??y?.sourceGitBlobSha??null;if(x&&y&&fromHash===toHash)continue;changes.push({path,kind:!x?'added':!y?'deleted':'modified',from:fromHash,to:toHash,hashAlgorithm:x?.contentHash||y?.contentHash?'sha256':'git-blob-sha1',addedSymbols:(y?.symbols||[]).filter(s=>!(x?.symbols||[]).some(t=>t.name===s.name)).map(s=>s.name),removedSymbols:(x?.symbols||[]).filter(s=>!(y?.symbols||[]).some(t=>t.name===s.name)).map(s=>s.name)});}return {changes};}
