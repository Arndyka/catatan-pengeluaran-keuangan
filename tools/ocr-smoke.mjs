import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:800,height:950}});
const fixture=await context.newPage();
await fixture.setContent('<main style="font:30px/1.8 Arial;background:white;color:black;padding:40px"><h1>BCA</h1><p>Transaksi Berhasil</p><p>Total Transaksi<br>Rp50.000,00</p><p>15 Oktober 2026<br>12:30:11</p><p>Pembayaran QRIS<br>Kopi Senja</p><p>No. Referensi: ABC123456</p></main>');
const png=await fixture.screenshot({fullPage:true});await fixture.close();
const page=await context.newPage();
try{
 await page.goto('http://127.0.0.1:4173/?demo=1#scanner');await page.locator('#page-scanner').waitFor({state:'visible'});
 await page.locator('#scanInput').setInputFiles({name:'synthetic-bca-receipt.png',mimeType:'image/png',buffer:png});
 await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-field="amount"]')).toHaveValue('50000',{timeout:120000});
 await expect(page.locator('[data-scan-field="date"]')).toHaveValue('2026-10-15');
 await expect(page.locator('[data-scan-field="sourceAccountId"]')).toHaveValue('asset-bca');
 await expect(page.locator('[data-scan-field="selected"]')).not.toBeChecked();
 console.log('Real Tesseract OCR passed on a synthetic receipt: amount, date, bank account, review selection.');
}finally{await browser.close();}
