import test from 'node:test';
import assert from 'node:assert/strict';
import {visionCandidates} from '../assets/js/scan-vision.js';
import {parseReceiptText,parseImageText} from '../assets/js/scanner.js';
test('vision preserves readable facts, never invents invalid amount or date',()=>{
 const row={record_kind:'transaction',status:'completed',date:'2026-10-15',amount:50000,direction:'outgoing',reference:'REF123456'};
 const result=visionCandidates({transactions:[row,{...row,amount:null},{...row,date:'2026-02-30'},{...row,direction:'unknown'}]}, {accountId:'bca',bank:'bca',pageNumber:1});
 assert.equal(result.length,1);assert.equal(result[0].amount,50000);assert.equal(result[0].selected,false);assert.equal(result[0].reference,'REF123456');
});
test('screenshot receipt can put amount before date and has no +/- sign',()=>{
 const [row]=parseReceiptText('BCA\nTransaksi Berhasil\nTotal Transaksi\nRp50.000,00\n15 Oktober 2026\n12:30:11\nPembayaran QRIS\nKopi Senja\nNo. Referensi: ABC123456',{bank:'bca',accountId:'bca',pageNumber:1,merchantRules:{}});
 assert.equal(row.amount,50000);assert.equal(row.date,'2026-10-15');assert.equal(row.selected,false);assert.equal(row.movementReference,'ABC123456');assert.equal(row.time,'12:30:11');
});
test('receipt without a readable date is rejected instead of using today',()=>{
 assert.deepEqual(parseReceiptText('Transaksi berhasil Rp50.000 QRIS',{bank:'bca',accountId:'bca',pageNumber:1}),[]);
});

test('QRIS payment requests and failed receipts are not completed transactions',()=>{
 for(const status of ['Menunggu pembayaran','Status: pending','Transaksi gagal','Transaksi tidak berhasil','']){
  assert.deepEqual(parseReceiptText(`Mandiri\nQRIS\n15/10/2026\nNominal Rp 50000\n${status}`,{bank:'mandiri',accountId:'mandiri'}),[]);
 }
 assert.deepEqual(parseImageText('Mandiri\nQRIS\n15/10/2026 -Rp50.000\nMenunggu pembayaran',{bank:'mandiri',accountId:'mandiri'}),[]);
});
test('vision rejects nontransactions and pending records even if amount/date look valid',()=>{
 const row={date:'2026-10-15',amount:50000,direction:'outgoing',record_kind:'transaction',status:'completed'};
 const result=visionCandidates({transactions:[{...row,record_kind:'summary'},{...row,status:'pending'},{...row,description:'Saldo awal'},row]},{bank:'bca',accountId:'bca',pageNumber:1});
 assert.equal(result.length,1);
});
