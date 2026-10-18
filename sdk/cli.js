#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {PurlClient} from './client.js';

const [command='help',address,...args]=process.argv.slice(2);
if(command==='help'||!address){
  console.log('purl discover|inspect|manifest|continue|history|replay <PURL>\npurl create <base-url> <definition.json>\npurl compile|build|publish|fork|checkpoint <PURL> [input.json]\npurl run <PURL> <input.json>\nSet PURL_TOKEN out of band for mutations; never include it in a URL.');
}else{
  try{
    const client=new PurlClient(address,{token:process.env.PURL_TOKEN});
    let result;
    if(command==='discover')result=await client.discover();
    else if(command==='inspect')result=await client.get();
    else if(command==='manifest')result=await client.manifest();
    else if(command==='continue')result=await client.continuity();
    else if(command==='history')result=await client.history();
    else if(command==='replay')result=await client.replay();
    else if(command==='create')result=await client.create(JSON.parse(await readFile(args[0],'utf8')));
    else if(['compile','build','run','publish','fork','checkpoint','propose','commit'].includes(command)){
      const input=args[0]?JSON.parse(await readFile(args[0],'utf8')):{};
      result=await client.act(client.programId,command,command==='run'?{input}:input);
    }else throw Error('Unknown command');
    console.log(JSON.stringify(result,null,2));
  }catch(error){console.error(JSON.stringify({error:error.message,status:error.status,code:error.code}));process.exitCode=1;}
}
