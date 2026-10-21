import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImageText,detectBankFromText} from '../assets/js/scanner.js';
import {readCardCents} from '../assets/js/card-history.js';
const parse=text=>parseImageText(text,{bank:'mandiri',accountId:'asset-mandiri',cardAccountId:'card-mandiri',merchantRules:{}});
const header='Tagihan Berjalan Rp 9.000.000,00\nSisa Limit Rp 4.000.000,00\nJatuh Tempo: 28 Okt 2026\nTransaksi e-Billing\n09 Sep - 08 Okt Belum Tertagih\n';
test('card scan identifies issuer and excludes summary, tabs and due date',()=>{
 assert.equal(detectBankFromText(header,'shared.jpeg').bank,'mandiri');
 const rows=parse(header+'09 Okt 2026\nGoogle Contoh Rp 123.456,78\nUS\nCicil\n12 Okt 2026\nMusik Rp 20.000,00\nSE');
 assert.deepEqual(rows.map(r=>[r.date,r.amount,r.type,r.sourceAccountId]),[['2026-10-09',123456.78,'credit_purchase','card-mandiri'],['2026-10-12',20000,'credit_purchase','card-mandiri']]);
 assert(rows.every(r=>!r.selected&&r.signedAmount<0&&r.cardBillingStatus==='unbilled'));
 assert.equal(parse(header).length,0);
 assert.equal(parse(header+'14 Okt 2026\nMerchant Rp 20.000,00\nTotal Tagihan Rp 2.000.000,00\nSisa Limit Rp 1.000.000,00\nTagihan Berjalan Rp 3.000.000,00').length,1);
});
test('card scan shares a date across rows and preserves merchant reference only as description',()=>{
 const rows=parse(header+'14 Okt 2026\nE-BILLING STATEMENT Rp 5.500,00\nCHRGE\nLivin Food Cafe Rp 70.000,00\n8825303391999999');
 assert.equal(rows.length,2);assert(rows.every(r=>r.date==='2026-10-14'));
 assert.equal(rows[1].movementReference,'');assert.match(rows[1].description,/8825303391999999/);
});
test('card scan does not guess cents, dates or turn payments and refunds into purchases',()=>{
 for(const row of ['Merchant Rp 20.000”','Merchant Rp 20.000%','Merchant Rp 20.000','Refund Rp 20.000,00','Pembayaran kartu Rp 20.000,00','Merchant - Rp 20.000,00','Merchant Rp 20.000,00 CR','Merchant Rp 20 000,00'])assert.equal(parse(header+'14 Okt 2026\n'+row).length,0,row);
 assert.equal(parse(header+'Merchant Rp 20.000,00').length,0);
 assert.equal(parse(header+'31 Feb 2026\nMerchant Rp 20.000,00').length,0);
});
test('missing card account never falls back to a debit account',()=>{
 const rows=parseImageText(header+'14 Okt 2026\nMerchant Rp 20.000,00',{bank:'mandiri',accountId:'asset-mandiri'});
 assert.equal(rows[0].sourceAccountId,'');
});
test('unreadable date headings break date inheritance and payments never become purchases',()=>{
 for(const heading of ['15 Okt 2026.','1S Okt 2026','15 Okt\n2026','32 Okt 2026','15 Okt 2O26','15/10/2026']){
  const rows=parse(header+'14 Okt 2026\nMerchant A Rp 20.000,00\n'+heading+'\nMerchant B Rp 30.000,00');
  assert.equal(rows.length,1,heading);assert.equal(rows[0].amount,20000);
 }
 for(const description of ['PAYMENT - LIVIN Rp 20.000,00','PAYMENT THANK YOU Rp 20.000,00','PEMBAYARAN VIA LIVIN Rp 20.000,00','Refund Rp − 20.000,00'])assert.equal(parse(header+'14 Okt 2026\n'+description).length,0);
});
test('raised cents are verified even when initial OCR looks valid; nonzero cents survive and uncertainty excludes',async()=>{
 const original=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
 try {
  for(const prefix of ['12.345','345']){
  const x=prefix.length*10,word={text:prefix+',00',bbox:{x0:0,y0:5,x1:x+24,y1:40},symbols:[...prefix].map((text,i)=>({text,bbox:{x0:i*10,y0:20,x1:(i+1)*10,y1:40}})).concat([{text:',00',bbox:{x0:x,y0:5,x1:x+24,y1:18}}])};
  const data={lines:[{text:'Transaksi e-Billing',words:[]},{text:'Merchant Rp '+word.text,words:[word]}]};
  for(const [value,confidence,expected] of [['67',95,prefix+',67'],['00',50,'sen belum terbaca'],['7',95,'sen belum terbaca']]){
   let calls=0;const parameters=[];
   const result=await readCardCents(data,{}, {setParameters:async p=>parameters.push(p),recognize:async()=>{calls++;return {data:{text:value,confidence}};}});
   assert.equal(calls,1);assert(result.includes(expected));assert.equal(parameters.at(-1).tessedit_char_whitelist,'');
  }
  }
 }finally{globalThis.document=original;}
});
