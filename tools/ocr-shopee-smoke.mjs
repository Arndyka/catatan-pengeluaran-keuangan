import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
// Synthetic examples only. This tests the actual OCR worker without account writes.
const order=method=>['Shopee','Rincian Pesanan','Pesanan Selesai','Waktu Pembayaran 21 Okt 2026 10:11',`Metode Pembayaran ${method}`,'Subtotal Produk Rp40.000','Ongkos Kirim Rp5.000','Total Pembayaran Rp45.000','No. Pesanan TEST123456'];
const fixtures=[{lines:order('ShopeePay'),expected:[['expense',45000,'wallet-shopee']]},{lines:order('SPayLater'),expected:[['credit_purchase',45000,'paylater-shopee']]},{lines:['ShopeePay','Riwayat Transaksi','21 Okt 2026','Pembayaran Toko A -Rp12.000','Berhasil','Transfer dari Teman +Rp50.000','Berhasil','Pembayaran Toko B -Rp9.000','Status Pending'],expected:[['expense',12000,'wallet-shopee'],['income',50000,'wallet-shopee']]}];
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),cloud=[];
 await page.route('**/*',route=>{if(/firestore|identitytoolkit|integrate.api.nvidia/i.test(route.request().url())){cloud.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(process.env.SPENDLY_TEST_URL||'http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.Tesseract);await page.waitForFunction(()=>document.querySelector('#syncStatus')?.textContent.includes('Mode demo')&&localStorage.getItem('spendly:demo:v1'));
 const before=await page.evaluate(()=>localStorage.getItem('spendly:demo:v1'));
 for(const [i,fixture] of fixtures.entries()){
  const drawing=await browser.newPage({viewport:{width:850,height:1000}});await drawing.setContent(`<body style="margin:0;background:#fff;color:#111;font:28px/1.8 Arial;padding:35px">${fixture.lines.map(l=>`<div>${l}</div>`).join('')}</body>`);const bytes=await drawing.screenshot({fullPage:true});await drawing.close();
  const result=await page.evaluate(async bytes=>{const {scanStatementFiles}=await import('./assets/js/scanner.js');return scanStatementFiles({files:[new File([new Uint8Array(bytes)],'shared.png',{type:'image/png'})],bankAccountMap:{shopee:'wallet-shopee',shopeePaylater:'paylater-shopee',generic:''}});},[...bytes]);
  assert.equal(result.statements[0].bank,'shopee');assert.deepEqual(result.candidates.map(r=>[r.type,r.amount,r.sourceAccountId]),fixture.expected);assert(result.candidates.every(r=>r.date==='2026-10-21'&&!r.selected));console.log(`PASS synthetic Shopee OCR ${i+1}: ${fixture.expected.length} reviewed candidates, correct amounts/accounts/date.`);
 }
 assert.equal(cloud.length,0);assert.equal(await page.evaluate(()=>localStorage.getItem('spendly:demo:v1')),before);console.log('No account writes or financial data transmission.');
}finally{await browser.close();}
