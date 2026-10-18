// A fresh process starts with a PURL only. It discovers the SDK over HTTP,
// downloads it into memory and reconstructs external mission state.
import assert from 'node:assert/strict';
const address=process.argv[2];if(!address)throw Error('Supply one PURL');
const url=new URL(address);const headers={Accept:'application/purl+json',...(process.env.PURL_COLD_TOKEN?{Authorization:`Bearer ${process.env.PURL_COLD_TOKEN}`}:{})};
async function get(path){const target=new URL(path,url);assert.equal(target.origin,url.origin,'never forward credentials off origin');const r=await fetch(target,{headers});if(!r.ok)throw Error(`Discovery HTTP ${r.status}`);return r.json();}
const manifest=await get(url);
const meta=await get('/.well-known/purl');
const sdkUrl=manifest.links?.sdk??meta.endpoints?.sdk;if(!sdkUrl)throw Error('PURL does not disclose an SDK');
const sdkTarget=new URL(sdkUrl,url);assert.equal(sdkTarget.origin,url.origin);
const sdkResponse=await fetch(sdkTarget);assert.ok(sdkResponse.ok);const sdk=await sdkResponse.text();
const {PurlClient}=await import(`data:text/javascript;base64,${Buffer.from(sdk).toString('base64')}`);
const client=new PurlClient(address,{token:process.env.PURL_COLD_TOKEN});
const {program}=await client.get();const continuity=await client.continuity();const replay=await client.replay();
const graph=program.state?.graph;
const nodes=graph?.nodes??[];
const ready=nodes.filter(node=>node.status!=='PASS'&&node.dependencies.every(id=>nodes.find(n=>n.id===id)?.status==='PASS'));
const result={execution_class:'INDEPENDENT_NODE_PROCESS_LIVE_HTTP',given_only_url:address,previous_conversation_available:false,sdk_discovered:sdkTarget.href,program_id:program.id,version:program.version,kind:program.kind,source:program.source,tests:program.tests,mission_nodes:nodes.length,full_directive_characters:program.state?.directive?.length??0,amendment_characters:program.state?.amendment?.length??0,ready_nodes:ready.map(x=>x.id),checkpoint:continuity.checkpoint??null,permitted_operations:manifest.operations.filter(x=>x.available).map(x=>x.name),replay_valid:replay.valid,authority:manifest.authority};
if(process.env.PURL_COLD_ACTION==='checkpoint'){
 const checkpoint=await client.act(program.id,'checkpoint',{summary:'Fresh process reconstructed source, tests, checkpoint and current manifest through one PURL',next:'Continue the declared mission dependencies',evidence:[]});result.created_checkpoint=checkpoint.checkpoint?.id??null;
}
console.log(JSON.stringify(result,null,2));
