import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIdrValue,parseImageText,parseStatementTokenPagesForTest} from '../assets/js/scanner.js';
import {reconcileImports} from '../assets/js/import-reconciliation.js';

const options={bank:'generic',accountId:'asset-bca',pageNumber:1,merchantRules:{}};

test('statement money preserves cents including amounts below one rupiah',()=>{
 for(const [text,amount] of [['Rp 1.234,56',1234.56],['-IDR 1,234.56',1234.56],['Rp 0,49',0.49]]){
  const parsed=parseIdrValue(text);
  assert.equal(parsed.amount,amount);
  assert.equal(parsed.signedAmount,text.startsWith('-')?-amount:amount);
 }
});

test('statement date separators never become transaction amounts',()=>{
 const [row]=parseImageText('Riwayat transaksi\n15-10-2026 Kopi -Rp 50.000',options);
 assert.equal(row.amount,50000);
 assert.equal(row.date,'2026-10-15');
 assert.equal(row.type,'expense');
});

test('statement rows preserve descriptions and do not derive times from money',()=>{
 const [row]=parseImageText('Riwayat transaksi\n15/10/2026 Kopi -Rp 50.000',options);
 assert.equal(row.description,'Kopi');
 assert.equal(row.time,'');
 assert.equal(row.merchant,'Kopi');
});

test('statement filters unsuccessful rows while retaining posted rows',()=>{
 const rows=parseImageText('Riwayat transaksi\n15/10/2026 Kopi -Rp 50.000\n14/10/2026 Transfer gagal -Rp 100.000\n13/10/2026 Gaji +Rp 10.000.000',options);
 assert.deepEqual(rows.map(row=>[row.date,row.amount]),[['2026-10-15',50000],['2026-10-13',10000000]]);
});

test('ISO statement dates and explicit timestamps are preserved',()=>{
 const [row]=parseImageText('Account statement\n2026-10-15 09:20:31 Kopi -Rp 50.000,50',options);
 assert.equal(row.date,'2026-10-15');
 assert.equal(row.time,'09:20:31');
 assert.equal(row.amount,50000.50);
 assert.equal(row.description,'Kopi');
});

test('incoming Krom income uses only its receiving account, like screenshot imports',()=>{
 const token=(text,x)=>({text,x,y:500,width:80,height:10});
 const result=parseStatementTokenPagesForTest({fileName:'krom.pdf',bankAccountMap:{krom:'asset-krom'},pages:[{
  pageWidth:1000,pageHeight:1000,pageText:'Krom E-Statement Oktober 2026',tokens:[
   token('15 Oktober 2026',50),token('Transfer ABC123456789',200),token('Transfer Masuk',600),token('+Rp 50.000,50',850)
  ]
 }]});
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].type,'income');
 assert.equal(result.candidates[0].sourceAccountId,'asset-krom');
 assert.equal(result.candidates[0].destinationAccountId,'');
 assert.equal(result.candidates[0].amount,50000.50);
});

test('long merchant words are not invented bank references that drop repeated payments',()=>{
 const tokens=[500,400].flatMap(y=>[['15 Oktober 2026',50],['Pembayaran Metropolitan',200],['Pembayaran',600],['-Rp 50.000',850]].map(([text,x])=>({text,x,y,width:80,height:10})));
 const result=parseStatementTokenPagesForTest({fileName:'krom.pdf',bankAccountMap:{krom:'asset-krom'},pages:[{pageWidth:1000,pageHeight:1000,pageText:'Krom E-Statement Oktober 2026',tokens}]});
 assert.equal(result.candidates.length,2);
 assert.deepEqual(reconcileImports(result.candidates,[]).map(row=>row.importMatch.status),['new','review']);
});

test('Krom sender account numbers never prove repeated payments are duplicates',()=>{
 const tokens=[500,400].flatMap(y=>[['15 Oktober 2026',50],['Transfer dari 123456789012',200],['Transfer Masuk',600],['+Rp 50.000',850]].map(([text,x])=>({text,x,y,width:80,height:10})));
 const result=parseStatementTokenPagesForTest({fileName:'krom.pdf',bankAccountMap:{krom:'asset-krom'},pages:[{pageWidth:1000,pageHeight:1000,pageText:'Krom E-Statement Oktober 2026',tokens}]});
 assert.deepEqual(reconcileImports(result.candidates,[]).map(row=>row.importMatch.status),['new','review']);
});

test('BCA bank and channel codes never prove repeated transfers are duplicates',()=>{
 for(const description of ['BIF TRANSFER DR 014','1510/FTSCY/WS95011']){
  const tokens=[500,400].flatMap(y=>[['15/10',50],['TRSF E-BANKING DB',150],[description,350],['50,000.00 DB',700]].map(([text,x])=>({text,x,y,width:80,height:10})));
  const result=parseStatementTokenPagesForTest({fileName:'bca.pdf',bankAccountMap:{bca:'asset-bca'},pages:[{pageWidth:1000,pageHeight:1000,pageText:'BCA PERIODE OKTOBER 2026',tokens}]});
  assert.equal(result.candidates.length,2);
  assert.deepEqual(reconcileImports(result.candidates,[]).map(row=>row.importMatch.status),['new','review']);
 }
});

test('explicit Krom transaction references still identify a duplicate',()=>{
 const tokens=[500,400].flatMap(y=>[['15 Oktober 2026',50],['Transfer No. Referensi: ABC123456789',200],['Transfer Masuk',600],['+Rp 50.000',850]].map(([text,x])=>({text,x,y,width:80,height:10})));
 const result=parseStatementTokenPagesForTest({fileName:'krom.pdf',bankAccountMap:{krom:'asset-krom'},pages:[{pageWidth:1000,pageHeight:1000,pageText:'Krom E-Statement Oktober 2026',tokens}]});
 assert.deepEqual(reconcileImports(result.candidates,[]).map(row=>row.importMatch.status),['new','duplicate']);
});
