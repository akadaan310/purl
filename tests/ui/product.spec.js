import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';

async function ready(page,path='/'){await page.goto(path);await page.locator('h1').waitFor();await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.live-indicator').first()).toContainText('LIVE');}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}

test('capsule surface copies canonical URL, keyboard copies, Open navigates independently',async({page,context,baseURL})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await ready(page);
 const capsule=page.locator('.capsule').first();const copy=capsule.locator('.capsule-copy');const expected=await copy.getAttribute('data-copy');
 const before=page.url();await page.evaluate(()=>document.addEventListener('pointerup',e=>{window.__copyPointerType=e.pointerType},{once:true}));
 if(test.info().project.name==='android')await capsule.tap({position:{x:35,y:65}});else await capsule.click({position:{x:35,y:65}});
 expect(await page.evaluate(()=>window.__copyPointerType)).toBe(test.info().project.name==='android'?'touch':'mouse');await expect(page.locator('#toast')).toContainText('copied');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(expected);expect(page.url()).toBe(before);
 await copy.focus();await page.keyboard.press('Enter');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(expected);await copy.focus();await page.keyboard.press('Space');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(expected);
 await capsule.locator('a.capsule-open').click();await expect(page).toHaveURL(/\/p\//);expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(expected);await noOverflow(page);
});

test('clipboard denial offers selectable canonical URL and touch remains usable',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))}}));
 await ready(page,'/explore');const button=page.locator('.capsule-copy').first();const expected=await button.getAttribute('data-copy');await button.click();await expect(page.locator('#copy-dialog')).toBeVisible();await expect(page.locator('#manual-copy')).toHaveValue(expected);await page.getByRole('button',{name:'Select URL',exact:true}).click();expect(await page.locator('#manual-copy').evaluate(x=>x.selectionEnd-x.selectionStart)).toBe(expected.length);
});

test('IDE creates, compiles, builds, tests, runs, publishes and checkpoints through live API',async({page})=>{
 await ready(page,'/create');await page.locator('#program-title').fill(`Browser verified ${test.info().project.name}`);await page.locator('#program-source').fill('input number | math.add 2 | math.multiply 3');
 const compilation=page.waitForResponse(r=>r.url().endsWith('/compile')&&r.request().method()==='POST');await page.locator('[data-action="compile"]').click();expect((await(await compilation).json()).ok).toBe(true);await expect(page).toHaveURL(/\/ide\//);
 const buildResponse=page.waitForResponse(r=>r.url().endsWith('/build')&&r.request().method()==='POST');await page.locator('[data-action="build"]').click();const built=await(await buildResponse).json();expect(built.build.status).toBe('passed');expect(built.build.tests.every(x=>x.passed)).toBe(true);
 await page.locator('#program-input').fill('4');await page.locator('[data-action="run"]').click();await expect(page.locator('#run-output')).toContainText('SUCCEEDED',{timeout:20000});await expect(page.locator('.output-value')).toHaveText('18');
 const release=page.waitForResponse(r=>r.url().endsWith('/publish')&&r.request().method()==='POST');await page.locator('[data-action="publish"]').click();expect((await(await release).json()).release.immutable).toBe(true);
 await page.locator('[data-action="checkpoint"]').click();await expect(page.locator('#checkpoint-form')).toBeVisible();await page.locator('#checkpoint-summary').fill('Browser verification complete. Next session can inspect immutable build and output18.');
 const cp=page.waitForResponse(r=>r.url().endsWith('/checkpoint')&&r.request().method()==='POST');await page.locator('#checkpoint-form button[type="submit"]').click();expect((await(await cp).json()).checkpoint.summary).toContain('Browser verification complete');await noOverflow(page);
 await page.locator('[data-editor-tab="graph"]').click();await expect(page.locator('.graph-node')).toHaveCount(3);await page.locator('[data-data-tab="history"]').click();await expect(page.locator('#data-body')).toContainText('checkpoint');
 await page.screenshot({path:`evidence/ui/ide-${test.info().project.name}.png`,fullPage:true,animations:'disabled'});
});

test('invalid types produce visible diagnostics and do not report a successful build',async({page})=>{
 await ready(page,'/create');await page.locator('#program-title').fill('Invalid type negative control');await page.locator('#program-source').fill('input string | math.add 2');const response=page.waitForResponse(r=>r.url().endsWith('/compile')&&r.request().method()==='POST');await page.locator('[data-action="compile"]').click();const body=await(await response).json();expect(body.ok).toBe(false);expect(body.diagnostics.some(x=>x.code==='TYPE_MISMATCH')).toBe(true);await expect(page.locator('#data-body')).toContainText('TYPE_MISMATCH');
});

test('landing, mission, docs and observatory meet responsive accessibility and screenshot checks',async({page})=>{
 const findings=[];
 for(const path of ['/','/explore','/create','/p/godseed-mission','/observatory','/docs']){
  await ready(page,path);await noOverflow(page);const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();const serious=result.violations.filter(x=>['critical','serious'].includes(x.impact));findings.push({path,violations:result.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.length})),serious:serious.length});expect(serious,JSON.stringify(serious.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})))).toEqual([]);
  if(path==='/'){await expect(page).toHaveScreenshot('landing.png',{fullPage:true});await page.screenshot({path:`evidence/ui/landing-${test.info().project.name}.png`,fullPage:true,animations:'disabled'});}
 }
 const performance=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {dom_content_loaded_ms:n.domContentLoadedEventEnd,response_ms:n.responseEnd,load_ms:n.loadEventEnd,transferred_bytes:performance.getEntriesByType('resource').reduce((s,x)=>s+x.transferSize,0),reduced_motion:matchMedia('(prefers-reduced-motion: reduce)').matches};});
 await mkdir('evidence/ui',{recursive:true});await writeFile(`evidence/ui/metrics-${test.info().project.name}.json`,JSON.stringify({findings,performance},null,2));expect(performance.reduced_motion).toBe(true);
});

test('unsolicited provider token is rejected and removed without changing account',async({page})=>{
 const requests=[];page.on('request',r=>{if(r.url().endsWith('/api/auth/session'))requests.push(r.url())});await ready(page,'/workspace#access_token=attacker-token');expect(page.url()).not.toContain('access_token');expect(requests).toEqual([]);expect(await page.evaluate(()=>sessionStorage.getItem('purl.session'))).toBe(null);
});
