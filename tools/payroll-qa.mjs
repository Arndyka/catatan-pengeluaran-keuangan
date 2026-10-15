import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch();
const context=await browser.newContext({reducedMotion:'reduce',timezoneId:'Asia/Jakarta'});
const page=await context.newPage(),errors=[],audits=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:4173/?demo=1#recurring');
 await page.locator('#page-recurring').waitFor({state:'visible'});
 await page.locator('#salarySetupButton').click();
 await page.locator('#recurringName').fill('Gaji bulanan');
 await page.locator('#recurringAmount').fill('8500000');
 await page.locator('#recurringDay').fill('25');
 await page.locator('#recurringSource').selectOption('asset-bca');
 await page.locator('#recurringSaveButton').click();
 await expect(page.locator('#recurringMessage')).toContainText('Jadwal disimpan');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  for(const route of ['dashboard','recurring','transactions']){
   await page.evaluate(route=>location.hash=route,route);
   await page.locator('#page-'+route).waitFor({state:'visible'});
   if(route==='transactions'){
    await page.locator('#transactionMerchant').fill('Alfamrt');
    await page.locator('#checkManualButton').click();
   }
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:`artifacts/previews/payroll-${route}-${width}.png`,fullPage:true,animations:'disabled'});
   const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   audits.push({route,width,overflow,violations:audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
  }
 }
 await fs.writeFile('artifacts/payroll-accessibility.json',JSON.stringify({errors,audits},null,2));
 console.log(JSON.stringify({errors,audits}));
 if(errors.length||audits.some(a=>a.overflow||a.violations.length))process.exitCode=1;
}finally{await browser.close();}
