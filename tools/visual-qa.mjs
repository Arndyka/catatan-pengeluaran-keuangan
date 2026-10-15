import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
await fs.mkdir('artifacts/previews',{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1050},timezoneId:'Asia/Jakarta',reducedMotion:'reduce'});
const page=await context.newPage();
const errors=[];page.on('pageerror',err=>errors.push(err.message));
await page.goto('http://127.0.0.1:4173/?demo=1',{waitUntil:'domcontentloaded'});
await page.locator('#goalCards .goal-card').first().waitFor({state:'attached'});
const results=[];
for(const width of [1440,390]){
 await page.setViewportSize({width,height:width===1440?1050:844});
 for(const name of ['dashboard','goals','wallets','investments','transactions','budget','scanner','settings']){
  await page.evaluate(name=>{location.hash=name;},name);
  await page.locator(`#page-${name}`).waitFor({state:'visible'});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:`artifacts/previews/${name}-${width}.png`,fullPage:true,animations:'disabled'});
  if(width===390&&['dashboard','goals','scanner','settings'].includes(name)){
   if(name==='scanner')await page.locator('.ai-options').evaluate(el=>el.open=true);
   const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
   results.push({page:name,theme:'light',violations:audit.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,6)}))});
  }
 }
}
await page.locator('#themeButton').click();
for(const name of ['dashboard','goals','settings','scanner']){
 await page.evaluate(name=>{location.hash=name;},name);await page.locator(`#page-${name}`).waitFor({state:'visible'});
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:`artifacts/previews/${name}-dark.png`,fullPage:true,animations:'disabled'});
 if(name==='scanner')await page.locator('.ai-options').evaluate(el=>el.open=true);
 const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
 results.push({page:name,theme:'dark',violations:audit.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,6)}))});
}
await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
await page.locator('#authScreen').waitFor();
await page.screenshot({path:'artifacts/previews/login-mobile.png',fullPage:true,animations:'disabled'});
await page.setViewportSize({width:1440,height:1000});
await page.evaluate(()=>{document.documentElement.dataset.theme='light'});
await page.screenshot({path:'artifacts/previews/login-desktop.png',fullPage:true,animations:'disabled'});
await fs.writeFile('artifacts/accessibility.json',JSON.stringify({errors,results},null,2));
console.log(JSON.stringify({errors,results}));
await browser.close();
