import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'browser.spec.mjs',timeout:60000,workers:1,use:{headless:true,viewport:{width:1440,height:1000},timezoneId:'Asia/Jakarta',trace:'retain-on-failure'},reporter:'list'});
