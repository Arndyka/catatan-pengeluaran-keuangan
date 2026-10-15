import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch(),context=await browser.newContext({reducedMotion:'reduce',timezoneId:'Asia/Jakarta'}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173/?demo=1');
await page.locator('#appShell').waitFor({state:'visible'});
const audits=[];
for(const width of [1440,390]){
 await page.setViewportSize({width,height:900});
 for(const route of ['credit-card','investments','wallets']){
  await page.evaluate(route=>location.hash=route,route);await page.locator('#page-'+route).waitFor({state:'visible'});
  if(route==='investments')await page.locator('[data-bank-action="savings"]').click();
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:`artifacts/previews/followup-${route}-${width}.png`,fullPage:true,animations:'disabled'});
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  audits.push({route,width,violations:audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
 }
}
await fs.writeFile('artifacts/followup-accessibility.json',JSON.stringify({errors,audits},null,2));
console.log(JSON.stringify({errors,audits}));await browser.close();
