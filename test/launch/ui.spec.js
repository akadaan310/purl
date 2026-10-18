import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {writeFile} from 'node:fs/promises';
const purls=process.env.PURLS_BASE_URL||'http://127.0.0.1:8180';
const cgit=process.env.CGIT_BASE_URL||'http://127.0.0.1:8181';
const observations=new WeakMap();
test.beforeEach(async({page})=>{const record={responses:[],unexpected:[],pageErrors:[],requestFailures:[]};observations.set(page,record);page.on('pageerror',e=>record.pageErrors.push(e.message));page.on('requestfailed',r=>record.requestFailures.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));page.on('response',r=>{const path=new URL(r.url()).pathname,status=r.status();record.responses.push({method:r.request().method(),path,status});if(status>=400&&!(status===401&&path==='/api/identity/me')&&!(status===410&&path.startsWith('/api/passports/')))record.unexpected.push({path,status})})});
test.afterEach(async({page},info)=>{const record=observations.get(page);await writeFile(`evidence/consumer-launch/06-frontends/network-${info.project.name}-${info.title.slice(0,70).replace(/[^a-z0-9]+/gi,'-')}.json`,JSON.stringify(record,null,2));expect(record.unexpected).toEqual([]);expect(record.pageErrors).toEqual([]);expect(record.requestFailures).toEqual([])});

for(const [name,url] of [['PURLs',purls],['CGIT',cgit]]){
 test(`${name} independent, accessible and responsive`,async({page})=>{
  await page.goto(url); await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({path:`evidence/consumer-launch/06-frontends/${name.toLowerCase()}-${test.info().project.name}.png`,fullPage:true});
 });
}
test('PURLs discovery runs an actual catalog sample and shows its receipt',async({page})=>{
 await page.goto(`${purls}/my-purl`);await page.getByRole('button',{name:'Explore as a guest'}).click();await expect(page.getByRole('link',{name:'Guest preview · unverified ↗',exact:true})).toBeVisible();await page.getByRole('link',{name:'Discover',exact:true}).click();await expect(page.getByRole('heading',{name:'Claim your PURL'})).toBeVisible();
 await page.locator('[data-action="experience"][data-working="true"]').first().click();
 await page.getByRole('button',{name:'Try this sample'}).click();
 await expect(page.locator('#result-panel')).toBeVisible();
 await expect(page.locator('#result-panel')).toContainText(/Receipt|Result/);
});
test('PURLs guest memory remains explicit and supports real create/edit/delete',async({page})=>{
 await page.goto(`${purls}/my-purl`); await page.getByRole('button',{name:'Explore as a guest'}).click();
 await expect(page.getByText('Guest preview · unverified',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Memory',exact:true}).click();
 await page.getByLabel('What would you like to remember?').fill('UI acceptance: prefer concise answers');
 await page.getByRole('button',{name:'Save memory',exact:true}).click();
 await expect(page.locator('.fact-card').filter({hasText:'UI acceptance: prefer concise answers'})).toBeVisible();
 const fact=page.locator('.fact-card').filter({hasText:'UI acceptance: prefer concise answers'});
 await fact.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByLabel('Correct this memory').fill('UI acceptance: prefer thoughtful answers');
 await page.getByRole('button',{name:'Save correction'}).click();
 await expect(page.locator('.fact-card').filter({hasText:'UI acceptance: prefer thoughtful answers'})).toBeVisible();
 page.once('dialog',d=>d.accept()); await page.locator('.fact-card').filter({hasText:'UI acceptance: prefer thoughtful answers'}).getByRole('button',{name:'Delete',exact:true}).click();
 await expect(page.locator('.fact-card').filter({hasText:'UI acceptance: prefer thoughtful answers'})).toHaveCount(0);
});
test('CGIT first guest consent creates and commits an artifact',async({page})=>{
 await page.goto(cgit); await page.getByRole('button',{name:'Explore as a guest'}).click();
 await expect(page.getByRole('link',{name:'Guest preview · unverified ↗',exact:true})).toBeVisible();const activate=page.getByRole('button',{name:'Activate CGIT preview'});if(await activate.isVisible())await activate.click();
 await page.getByRole('button',{name:'New repository',exact:true}).click();
 await page.getByLabel('Repository name').fill(`ui-${Date.now()}`); await page.getByRole('button',{name:'Create repository',exact:true}).click();
 await page.getByLabel('Artifact path').fill('notes/hello.md'); await page.getByLabel('Artifact content').fill('A real UI acceptance artifact.');
 await page.getByLabel('Commit message').fill('Add acceptance artifact'); await page.getByRole('button',{name:'Commit artifact',exact:true}).click();
 await expect(page.locator('#workspace')).toContainText('notes/hello.md');
 await page.getByRole('button',{name:'History',exact:true}).click(); await expect(page.locator('#workspace')).toContainText('Add acceptance artifact');
});
test('selected live memory sharing revokes future access and clipboard denial has a native fallback',async({page,request})=>{
 await page.goto(`${purls}/my-purl`);await page.getByRole('button',{name:'Explore as a guest'}).click();await page.getByRole('link',{name:'Memory',exact:true}).click();
 await page.getByLabel('What would you like to remember?').fill('Share only this selected memory.');await page.getByRole('button',{name:'Save memory',exact:true}).click();
 await page.getByRole('checkbox',{name:'Select memory: Share only this selected memory.'}).check();await page.getByLabel('Purpose',{exact:true}).fill('UI read-only selected share');
 await page.getByRole('checkbox',{name:/I consent to sharing only my selected memories/}).check();await page.getByRole('button',{name:'Create selected-memory passport'}).click();
 const open=page.locator('.panel').filter({hasText:'Share a small piece.'}).getByRole('link',{name:'Open ↗'}).first();await expect(open).toBeVisible();const url=await open.getAttribute('href');
 const before=await request.get(url);expect(before.ok()).toBe(true);expect(JSON.stringify(await before.json())).toContain('Share only this selected memory.');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Denied')}},configurable:true}));
 await page.getByRole('button',{name:'Copy PURL',exact:true}).first().click();await expect(page.getByLabel('PURL',{exact:true})).toHaveValue(url);await page.getByRole('button',{name:'Close dialog'}).click();
 const revoked=page.waitForResponse(r=>r.url().includes('/api/passports/')&&r.url().endsWith('/revoke')&&r.request().method()==='POST');await page.getByRole('button',{name:'Revoke future access'}).first().click();expect((await revoked).status()).toBe(200);await expect(page.getByRole('button',{name:'Revoke future access'})).toHaveCount(0);const after=await request.get(url);expect(after.status()).toBe(410);
});
test('human sign-in and live inference show precise deployment availability',async({page})=>{
 const configReady=page.waitForResponse(r=>r.url()===`${purls}/api/identity/config`&&r.request().method()==='GET');await page.goto(`${purls}/my-purl`);const readiness=await(await configReady).json();
 if(!readiness.available){await expect(page.getByText('Verified sign-in is unavailable',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue with your identity provider ↗'})).toBeDisabled();}
 await page.getByRole('button',{name:'Explore as a guest'}).click();await expect(page.getByRole('link',{name:'Guest preview · unverified ↗',exact:true})).toBeVisible();await page.getByRole('link',{name:'Constellations',exact:true}).click();
 const models=await page.request.get(`${purls}/api/models`);if(models.ok()&&!(await models.json()).available){await expect(page.getByText(/Live inference is unavailable/)).toBeVisible();await expect(page.getByRole('button',{name:'Create constellation',exact:true})).toBeDisabled();}
});
test('catalog memory sharing requires explicit review before any mutation',async({page})=>{
 await page.goto(`${purls}/my-purl`);await page.getByRole('button',{name:'Explore as a guest'}).click();await page.getByRole('link',{name:'Discover',exact:true}).click();
 const mutations=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/catalog/memory-passport/run'))mutations.push(r.url())});
 await page.locator('[data-action="experience"][data-id="memory-passport"]').click();await page.getByRole('button',{name:'Try this sample'}).click();
 await expect(page.getByRole('alert')).toContainText('Review the selection and explicitly consent');expect(mutations).toEqual([]);
});
test('native mission follows read-only manifest and continuity links',async({page})=>{
 const mutations=[];page.on('request',r=>{if(r.method()==='POST')mutations.push(r.url())});await page.goto(`${purls}/p/consumer-launch-mission`);
 await expect(page.getByRole('heading',{name:'Pick up the thread.',exact:true})).toBeVisible();await expect(page.getByText('Native programmable resource',{exact:true})).toBeVisible();
 await expect(page.getByText('Current state, evidence & continuity',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Copy PURL',exact:true})).toBeVisible();expect(mutations).toEqual([]);
});
