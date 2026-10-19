import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'mobile.spec.mjs',outputDir:'./artifacts/mobile-browser-tests',timeout:120000,workers:1,reporter:'list',use:{headless:true,timezoneId:'Asia/Jakarta',trace:'retain-on-failure'},projects:[
 {name:'android-chromium',use:{...devices['Pixel 7']}},
 {name:'ios-webkit',use:{...devices['iPhone 13']}}
]});
