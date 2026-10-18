import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hashOf } from '../src/core/canonical.js';

export const NODE_IMAGE='node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b';
export const PYTHON_IMAGE='python:3.12.9-slim-bookworm@sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44';
const JS_RUNNER=`
let text=''; for await (const c of process.stdin) text+=c;
const {source,input,seed}=JSON.parse(text);
let state=(Number(seed)||0)>>>0; Math.random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296};
const mod={exports:{}};
const fn=new Function('module','exports',source+'\\n;return typeof main === "function" ? main : module.exports;')(mod,mod.exports);
if(typeof fn!=='function')throw Error('Define function main(input) or module.exports = function(input)');
const value=await fn(input);
if(value===undefined)throw Error('main must return a JSON value');
process.stdout.write('\\nPURL_RESULT:'+JSON.stringify({value})+'\\n');`;
const PY_RUNNER=`import sys,json,random\npayload=json.load(sys.stdin)\nrandom.seed(payload.get('seed',0))\nns={'__name__':'__purl__'}\nexec(compile(payload['source'],'purl-program.py','exec'),ns)\nif not callable(ns.get('main')): raise ValueError('Define main(input)')\nvalue=ns['main'](payload.get('input'))\nprint('\\nPURL_RESULT:'+json.dumps({'value':value},allow_nan=False,separators=(',',':')))\n`;
const TS_RUNNER=`
import {writeFile} from 'node:fs/promises';
let text='';for await(const c of process.stdin)text+=c;
const {source,input,seed}=JSON.parse(text);
let state=(Number(seed)||0)>>>0;Math.random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296};
await writeFile('/tmp/purl-program.ts',source);
const module=await import('file:///tmp/purl-program.ts');
const main=module.default??module.main;
if(typeof main!=='function')throw Error('Export default function main(input)');
const value=await main(input);if(value===undefined)throw Error('main must return JSON');
process.stdout.write('\\nPURL_RESULT:'+JSON.stringify({value})+'\\n');`;

export function sandboxArguments({name,image,language}){
  const args=['--host=unix:///var/run/docker.sock','run','--rm','-i',`--name=${name}`,
    '--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
    '--pids-limit=32','--memory=128m','--memory-swap=128m','--cpus=0.5',
    '--user=10001:10001','--tmpfs=/tmp:rw,noexec,nosuid,size=16m,mode=1777','--workdir=/tmp'];
  for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'])args.push('--env',`${key}=`);
  args.push(image);
  if(language==='javascript')args.push('node','--max-old-space-size=64','--input-type=module','-e',JS_RUNNER);
  else if(language==='typescript')args.push('node','--max-old-space-size=64','--experimental-strip-types','--disable-warning=ExperimentalWarning','--input-type=module','-e',TS_RUNNER);
  else args.push('python','-I','-c',PY_RUNNER);
  return args;
}

/** Docker is the isolation boundary; this adapter is disabled by default.
 * "verified" means the operator explicitly enabled a tested configuration,
 * not a general security certification of the host kernel or Docker daemon.
 */
export class DockerSandbox{
  constructor({enabled=false,verified=false,nodeImage=NODE_IMAGE,pythonImage=PYTHON_IMAGE,timeoutMs=5000,maxOutput=65536}={}){
    this.verified=Boolean(enabled&&verified);this.id='docker-restricted/1';
    this.nodeImage=nodeImage;this.pythonImage=pythonImage;this.timeoutMs=timeoutMs;this.maxOutput=maxOutput;
  }
  async execute({language,source,input,seed=0}){
    if(!this.verified)throw Error('Sandbox not verified/enabled; arbitrary code execution is unavailable');
    if(!['javascript','typescript','python'].includes(language))throw Error(`${language} adapter unavailable`);
    if(typeof source!=='string'||Buffer.byteLength(source)>256*1024)throw Error('Source size limit exceeded');
    const payload=JSON.stringify({source,input,seed});
    if(Buffer.byteLength(payload)>512*1024)throw Error('Input size limit exceeded');
    const image=language==='python'?this.pythonImage:this.nodeImage;
    if(!/@sha256:[a-f0-9]{64}$/.test(image))throw Error('Sandbox image must be pinned by digest');
    const name=`purl-${randomUUID()}`;
    const args=sandboxArguments({name,image,language});
    const started=Date.now();
    const result=await new Promise((resolve,reject)=>{
      const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
      const chunks=[];const errors=[];let bytes=0;let failure=null;
      const stop=(reason)=>{failure??=Error(reason);child.kill('SIGKILL');const cleanup=spawn('docker',['--host=unix:///var/run/docker.sock','rm','-f',name],{stdio:'ignore'});cleanup.on('error',()=>{});};
      const timer=setTimeout(()=>stop(`Sandbox timeout after ${this.timeoutMs}ms`),this.timeoutMs);
      child.stdout.on('data',c=>{bytes+=c.length;if(bytes>this.maxOutput)stop('Sandbox output limit exceeded');else chunks.push(c);});
      child.stderr.on('data',c=>{bytes+=c.length;if(bytes>this.maxOutput)stop('Sandbox output limit exceeded');else errors.push(c);});
      child.on('error',e=>{clearTimeout(timer);reject(e);});
      child.on('close',code=>{clearTimeout(timer);if(failure)return reject(failure);const stdout=Buffer.concat(chunks).toString(),stderr=Buffer.concat(errors).toString();if(code!==0)return reject(Error(`Sandbox failed (${code}): ${stderr.slice(-3000)}`));resolve({stdout,stderr});});
      child.stdin.on('error',()=>{});child.stdin.end(payload);
    });
    const index=result.stdout.lastIndexOf('\nPURL_RESULT:');
    if(index<0)throw Error('Sandbox returned no JSON result');
    let envelope;try{envelope=JSON.parse(result.stdout.slice(index+13).trim());}catch{throw Error('Sandbox result is invalid JSON');}
    const content_id=hashOf(envelope.value);
    return {value:envelope.value,logs:[result.stdout.slice(0,index),result.stderr].filter(Boolean),trace:[{operator:'authored-code',language,source_digest:hashOf(source),result:content_id}],environment:{adapter:this.id,image,network:'none',filesystem:'read-only + 16MiB tmpfs',uid:10001,memory_bytes:128*1024*1024,pids:32,cpus:0.5,timeout_ms:this.timeoutMs,elapsed_ms:Date.now()-started,determinism:'seeded-random; clock/process/files not deterministic',source_digest:hashOf(source)},artifact:{content_id}};
  }
}
