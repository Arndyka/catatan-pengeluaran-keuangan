import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch(),context=await browser.newContext({reducedMotion:'reduce',timezoneId:'Asia/Jakarta'}),page=await context.newPage();
const errors=[],audits=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.locator('#appShell').waitFor({state:'visible'});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  for(const route of ['dashboard','wallets','transactions','goals','investments','budget','recurring','credit-card','reports','scanner','settings']){
   await page.evaluate(route=>location.hash=route,route);await page.locator('#page-'+route).waitFor({state:'visible'});
   const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   audits.push({route,width,overflow,violations:result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))});
   if(['wallets','credit-card','dashboard','reports'].includes(route))await page.screenshot({path:`artifacts/previews/final-${route}-${width}.png`,fullPage:true,animations:'disabled'});
  }
 }
 await fs.writeFile('artifacts/final-accessibility.json',JSON.stringify({errors,audits},null,2));
 console.log(JSON.stringify({errors,audits}));if(errors.length||audits.some(a=>a.overflow||a.violations.length))process.exitCode=1;
}finally{await browser.close();}
