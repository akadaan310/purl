import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'../../../test/launch',testMatch:'provider-ui.spec.js',timeout:15000,workers:1,retries:0,reporter:[['list']],use:{headless:true,reducedMotion:'reduce',trace:'off'},outputDir:'./browser-output',projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['Pixel 5']}}]});
