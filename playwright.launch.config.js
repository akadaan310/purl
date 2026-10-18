import {defineConfig,devices} from '@playwright/test';
function inheritedProxy(){
 const value=process.env.HTTPS_PROXY||process.env.https_proxy;
 if(!value)return undefined;
 try{
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol))throw new Error();
  const bypass=[process.env.NO_PROXY||process.env.no_proxy||'','localhost','127.0.0.1','[::1]'].filter(Boolean).join(',');
  return {server:url.origin,bypass,...(url.username?{username:decodeURIComponent(url.username)}:{}),...(url.password?{password:decodeURIComponent(url.password)}:{})};
 }catch{throw new Error('HTTPS_PROXY is not a valid HTTP proxy configuration.');}
}
const proxy=inheritedProxy();
export default defineConfig({testDir:'./test/launch',testMatch:['ui.spec.js','provider-ui.spec.js'],timeout:45000,expect:{timeout:10000},fullyParallel:false,workers:1,retries:0,reporter:[['list'],['json',{outputFile:'evidence/consumer-launch/06-frontends/playwright-results.json'}]],outputDir:'evidence/consumer-launch/06-frontends/test-results',use:{headless:true,trace:'off',screenshot:'only-on-failure',reducedMotion:'reduce',...(proxy?{proxy}:{})},projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['Pixel 5'],defaultBrowserType:'chromium'}}]});
