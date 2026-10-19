import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date('2026-10-19T08:00:00+07:00')});await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('http://127.0.0.1:4173/?demo=1',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#syncStatus')).toContainText('Mode demo');
});
test('mobile pages, dates and editor remain usable in both themes and orientations',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const pages=['dashboard','wallets','transactions','budget','goals','investments','scanner','recurring','credit-card','reports','settings'];
 for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  for(const theme of ['dark','light']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   for(const name of pages){await page.evaluate(n=>location.hash=n,name);await expect(page.locator(`#page-${name}`)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${theme} ${size.width}`).toBe(true);}
  }
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.documentElement.dataset.theme='dark';location.hash='transactions';});
 const row=page.locator('[data-history-row]').first(),id=await row.getAttribute('data-history-row');
 expect(await row.locator('[data-label=Tanggal]').evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap');
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length);
 await row.getByRole('button',{name:'Edit',exact:true}).tap();await expect(page.locator('#transactionEditForm')).toBeVisible();
 await page.locator('#transactionEditForm [name=amount]').fill('12345.67');await page.locator('#transactionEditForm [name=description]').fill('Mobile correction');
 expect(await page.locator('#spendlyDialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 expect((await new AxeBuilder({page}).include('#spendlyDialog').analyze()).violations).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('mobile-editor.png')});
 await page.locator('#transactionEditForm [type=submit]').tap();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions);
 expect(saved.length).toBe(before);expect(saved.find(t=>t.id===id).amount).toBe(12345.67);
 expect(errors).toEqual([]);
});
test('touch selection and Select All work on collapsed scan cards',async({page},testInfo)=>{
 await page.evaluate(()=>{location.hash='scanner';window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:'BCA Mutasi rekening\n13/10/2026 Mobile receipt -76.543,00\n14/10/2026 Another receipt -20.000,00'}}),terminate:async()=>{}})};});
 await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').tap();
 await expect(page.locator('[data-scan-index]')).toHaveCount(2);
 await page.locator('#clearAllScanCandidates').tap();await page.locator('[data-scan-index="0"] [data-scan-field=selected]').tap();
 await expect(page.locator('[data-scan-index="0"] [data-scan-field=selected]')).toBeChecked();
 await expect(page.locator('[data-scan-index="0"]')).toHaveAttribute('data-scan-expanded','false');
 await page.locator('#selectAllScanCandidates').tap();await expect(page.locator('[data-scan-field=selected]:checked')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('mobile-scan.png')});
 await page.locator('#saveScanCandidates').tap();await expect(page.locator('#scanMessage')).toContainText('2 transaksi disimpan');
});
