import { chromium, devices } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { appendFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const baseURL = 'https://purl-api-production.up.railway.app';
const out = new URL('./', import.meta.url);
const routes = ['/', '/explore', '/create', '/p/godseed-mission', '/observatory', '/docs'];
const report = { schema:'purl.public-browser-verification/1', started_at:new Date().toISOString(), base_url:baseURL, source_revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), execution_class:'LIVE_PUBLIC_RAILWAY_API_AND_WORKER', browser:null, devices:[], throttles:[], status:'RUNNING', credentials_persisted:false, limitations:['Android checks use Chromium Pixel 5 emulation, not a physical handset.','Performance values are single-browser navigation samples, not a load test.','Native clipboard permissions are explicitly granted for positive checks and denied for the fallback check.'] };
let sequence = 0;
const pending = new Set();
const redact = value => Array.isArray(value) ? value.map(redact) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,item]) => [key,/(?:token|password|secret|authorization|api[_-]?key|publishable[_-]?key)/i.test(key) ? '[REDACTED]' : redact(item)])) : value;
async function persist() { await writeFile(new URL('report.json',out), JSON.stringify(report,null,2)+'\n'); }
async function saveResponse(response, deviceName) {
  const request=response.request(), url=new URL(response.url());
  if (url.origin!==baseURL || !(url.pathname.startsWith('/api/')||url.pathname==='/.well-known/purl')) return;
  const status=response.status(), method=request.method();
  let body;
  try { body=await response.json(); } catch { body={unreadable_json:true}; }
  const item={sequence:++sequence,at:new Date().toISOString(),device:deviceName,method,path:url.pathname+url.search,status,retry_after:response.headers()['retry-after']||null,body:redact(body)};
  if(status===429) report.throttles.push({...item,body:undefined});
  await appendFile(new URL('raw-http.jsonl',out),JSON.stringify(item)+'\n');
}
async function ready(page,path='/') {
  await page.goto(baseURL+path,{waitUntil:'networkidle',timeout:45000});
  await page.locator('h1').waitFor({timeout:15000});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelector('.live-indicator')?.textContent.includes('LIVE'),null,{timeout:20000});
}
async function waitIdle(page) { await page.waitForFunction(()=>!document.body.classList.contains('is-busy'),null,{timeout:45000}); }
async function waitRate(response) {
  const header=response.headers()['retry-after'];
  let delay=header&&/^\d+(?:\.\d+)?$/.test(header)?Number(header)*1000:header?Math.max(0,Date.parse(header)-Date.now()):61000;
  delay=Math.max(1000,Number.isFinite(delay)?delay:61000)+500;
  console.log(JSON.stringify({event:'rate_limit_wait',retry_after:header||null,wait_ms:delay}));
  while(delay>0){const chunk=Math.min(delay,30000);await new Promise(resolve=>setTimeout(resolve,chunk));delay-=chunk;}
}
async function mutation(page,selector,suffix) {
  for(let attempt=0;attempt<3;attempt++) {
    const responsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&(new URL(response.url()).pathname.endsWith(suffix)||response.status()===429),{timeout:45000});
    await page.locator(selector).click();
    const response=await responsePromise;await waitIdle(page);
    if(response.status()===429){await waitRate(response);continue;}
    const body=await response.json();assert(response.ok(),`Mutation ${suffix} failed: ${JSON.stringify(redact(body))}`);return body;
  }
  throw new Error(`${suffix} exceeded the bounded rate-limit retries`);
}
async function screenshot(page,name) { const file=`${name}.png`;await page.screenshot({path:new URL(file,out).pathname,fullPage:true,animations:'disabled'});return file; }
async function clipboardChecks(browser,context,page,name,isAndroid) {
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:baseURL});
  await ready(page);
  const capsule=page.locator('.capsule').first(), copy=capsule.locator('.capsule-copy');
  const canonical=await copy.getAttribute('data-copy');assert.equal(new URL(canonical).origin,baseURL);
  const before=page.url();
  await page.evaluate(()=>document.addEventListener('pointerup',event=>{window.__purlPointerType=event.pointerType},{once:true}));
  if(isAndroid) await capsule.tap({position:{x:35,y:65}});else await capsule.click({position:{x:35,y:65}});
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('copied'));
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),canonical);assert.equal(page.url(),before);
  const pointer=await page.evaluate(()=>window.__purlPointerType);assert.equal(pointer,isAndroid?'touch':'mouse');
  await copy.focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),canonical);
  await copy.focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),canonical);
  const sentinel='PURL_OPEN_CONTROL_SENTINEL';await page.evaluate(value=>navigator.clipboard.writeText(value),sentinel);
  await capsule.locator('.capsule-open').click();await page.waitForURL(/\/p\//);await page.locator('.detail-title').waitFor();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),sentinel);
  const opened=page.url();
  await ready(page,'/explore');
  await context.clearPermissions();
  const cdp=await context.newCDPSession(page), info=await cdp.send('Target.getTargetInfo');
  const browserContextId=info.targetInfo.browserContextId;
  for(const permission of ['clipboard-write','clipboard-read']) await cdp.send('Browser.setPermission',{permission:{name:permission},setting:'denied',origin:baseURL,browserContextId});
  const permissionState=await page.evaluate(async()=>({write:(await navigator.permissions.query({name:'clipboard-write'})).state,read:(await navigator.permissions.query({name:'clipboard-read'})).state}));
  assert.equal(permissionState.write,'denied');
  const denialButton=page.locator('.capsule-copy').first(), denialCanonical=await denialButton.getAttribute('data-copy');
  if(isAndroid)await denialButton.tap();else await denialButton.click();
  await page.locator('#copy-dialog').waitFor({state:'visible',timeout:10000});assert.equal(await page.locator('#manual-copy').inputValue(),denialCanonical);
  await page.locator('#manual-copy-select').click();assert.equal(await page.locator('#manual-copy').evaluate(input=>input.selectionEnd-input.selectionStart),denialCanonical.length);
  const fallbackScreenshot=await screenshot(page,`clipboard-denial-${name}`);
  await page.locator('#copy-dialog [data-close-dialog]').click();
  await cdp.detach();await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:baseURL});
  return {status:'PASS',canonical_url:canonical,surface_pointer_type:pointer,native_clipboard:true,enter:true,space:true,surface_preserved_navigation:true,open_url:opened,open_preserved_clipboard_sentinel:true,denial:{method:'Chromium Browser.setPermission: native read/write denial',permission_state:permissionState,selected_manual_url:denialCanonical,selected_character_count:denialCanonical.length,screenshot:fallbackScreenshot}};
}
async function ideChecks(page,name) {
  await ready(page,'/create');
  await page.locator('#program-title').fill(`Public browser verification · ${name}`);
  await page.locator('#program-visibility').selectOption('private');
  await page.locator('#program-source').fill('input number | math.add 2 | math.multiply 3');
  const compiled=await mutation(page,'[data-action="compile"]','/compile');assert.equal(compiled.ok,true);assert.equal(compiled.diagnostics.length,0);assert.match(page.url(),/\/ide\//);
  const programId=compiled.program.id;
  const built=await mutation(page,'[data-action="build"]','/build');assert.equal(built.build.status,'passed');assert(built.build.tests.every(test=>test.passed));
  await page.locator('#program-input').fill('4');
  const started=Date.now(),run=await mutation(page,'[data-action="run"]','/run');
  await page.waitForFunction(()=>document.querySelector('#run-output')?.textContent.includes('SUCCEEDED'),null,{timeout:60000});
  assert.equal((await page.locator('.output-value').innerText()).trim(),'18');
  const workerCompletionMs=Date.now()-started;
  const release=await mutation(page,'[data-action="publish"]','/publish');assert.equal(release.release.immutable,true);
  await page.locator('[data-action="checkpoint"]').click();await page.locator('#checkpoint-form').waitFor();
  await page.locator('#checkpoint-summary').fill(`Live public Railway browser verification completed on ${name}: compile, passing test, immutable build, worker output 18 and immutable release. Evidence: evidence/deployment/public-ui/report.json.`);
  await page.locator('#checkpoint-next').fill('Inspect the recorded build, execution receipt, artifact and immutable release from this program URL.');
  const checkpoint=await mutation(page,'#checkpoint-form button[type="submit"]','/checkpoint');assert(checkpoint.checkpoint.summary.includes('output 18'));
  await page.waitForFunction(()=>!document.querySelector('#checkpoint-dialog')?.open);
  await page.locator('[data-editor-tab="graph"]').click();assert.equal(await page.locator('.graph-node').count(),3);
  await page.locator('[data-data-tab="history"]').click();await page.waitForFunction(()=>document.querySelector('#data-body')?.textContent.includes('checkpoint'));
  const ideScreenshot=await screenshot(page,`ide-${name}`);
  await page.locator('[data-data-tab="artifacts"]').click();await page.waitForSelector('[data-artifact]');const artifactId=await page.locator('[data-artifact]').first().getAttribute('data-artifact');
  return {status:'PASS',visibility:'private',program_id:programId,program_url:baseURL+'/p/'+programId,compile_ok:compiled.ok,derivation_id:compiled.derivation_id,build_id:built.build.id,build_status:built.build.status,declared_tests:built.build.tests.length,passed_tests:built.build.tests.filter(test=>test.passed).length,execution_id:run.execution.id,worker_status:'succeeded',output:18,worker_completion_observed_ms:workerCompletionMs,artifact_id:artifactId,release_id:release.release.id,release_url:release.release.url,release_immutable:true,checkpoint_id:checkpoint.checkpoint.id,checkpoint_version:checkpoint.checkpoint.version,graph_nodes:3,history_contains_checkpoint:true,screenshot:ideScreenshot};
}
async function routeChecks(page,name) {
  const findings=[];
  for(const path of routes){
    await ready(page,path);
    const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert(noOverflow,`Horizontal overflow on ${name} ${path}`);
    const axe=await new AxeBuilder({page}).analyze();
    const violations=axe.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(node=>node.target)}));
    const performance=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {dom_content_loaded_ms:n.domContentLoadedEventEnd,response_ms:n.responseEnd,load_ms:n.loadEventEnd,first_contentful_paint_ms:performance.getEntriesByName('first-contentful-paint')[0]?.startTime??null,resource_transfer_bytes:performance.getEntriesByType('resource').reduce((sum,entry)=>sum+entry.transferSize,0),reduced_motion:matchMedia('(prefers-reduced-motion: reduce)').matches,viewport:{width:innerWidth,height:innerHeight},document_width:document.documentElement.scrollWidth};});
    assert.equal(performance.reduced_motion,true);
    const files=[];if(path==='/'||path==='/p/godseed-mission')files.push(await screenshot(page,`${path==='/'?'landing':'mission'}-${name}`));
    findings.push({path,status:violations.length?'FAIL':'PASS',no_horizontal_overflow:noOverflow,axe_violations:violations,performance,screenshots:files});
    console.log(JSON.stringify({event:'route_verified',device:name,path,axe_violations:violations.length,no_overflow:noOverflow}));
  }
  assert(findings.every(item=>item.axe_violations.length===0),'Axe found accessibility violations');return findings;
}

await mkdir(out,{recursive:true});await writeFile(new URL('raw-http.jsonl',out),'');await persist();
const browser=await chromium.launch({headless:true});report.browser=browser.version();
try {
  for(const [name,options] of [['desktop',{viewport:{width:1440,height:1000}}],['android-pixel5',{...devices['Pixel 5']}]] ){
    const item={device:name,status:'RUNNING',started_at:new Date().toISOString(),page_errors:[],console_errors:[]};report.devices.push(item);
    const context=await browser.newContext({...options,reducedMotion:'reduce'}),page=await context.newPage();
    page.on('pageerror',error=>item.page_errors.push(error.message));page.on('console',message=>{if(message.type()==='error')item.console_errors.push(message.text());});
    page.on('response',response=>{const promise=saveResponse(response,name);pending.add(promise);promise.finally(()=>pending.delete(promise));});
    try{
      item.user_agent=await page.evaluate(()=>navigator.userAgent);
      item.clipboard=await clipboardChecks(browser,context,page,name,name.startsWith('android'));
      item.ide=await ideChecks(page,name);console.log(JSON.stringify({event:'ide_verified',device:name,program_id:item.ide.program_id,output:item.ide.output}));
      item.routes=await routeChecks(page,name);assert.equal(item.page_errors.length,0);item.status='PASS';
    }catch(error){item.status='FAIL';item.error={message:error.message,stack:error.stack};item.failure_screenshot=await screenshot(page,`failure-${name}`).catch(()=>null);throw error;}
    finally{item.completed_at=new Date().toISOString();await persist();await context.close();}
  }
  report.status='PASS';
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};console.error(error.stack);process.exitCode=1;}
finally{await Promise.allSettled([...pending]);await browser.close();report.completed_at=new Date().toISOString();report.http_responses_recorded=sequence;await persist();console.log(JSON.stringify({event:'public_browser_completed',status:report.status,devices:report.devices.map(item=>({device:item.device,status:item.status})),throttles:report.throttles.length,report:'evidence/deployment/public-ui/report.json'}));}
