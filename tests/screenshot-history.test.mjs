import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImageText,chooseHistoryReading,detectBankFromText} from '../assets/js/scanner.js';
const parse=(bank,text)=>parseImageText(text,{bank,accountId:'asset-'+bank,pageNumber:1,merchantRules:{}});
test('Livin history shared with a generic filename is recognized by its issuer layout',()=>{
 const text='Transaksi e-Statement\nSeptember Oktober\n20 Okt 2026\nBiaya - IDR 2.000\nBiaya transaksi bank\nBayar/Top-up - IDR 120.000\nPembayaran ShopeePay\n+1 poin\nQR Bayar - IDR 5.000\nPembayaran QR ke Kedai Contoh';
 const detected=detectBankFromText(text,'shared-image.jpeg');
 assert.equal(detected.bank,'mandiri');
 assert.deepEqual(parse(detected.bank,text).map(r=>[r.date,r.signedAmount]),[['2026-10-20',-2000],['2026-10-20',-120000],['2026-10-20',-5000]]);
 assert.equal(detectBankFromText('Transaksi berhasil\nBayar/Top-up - IDR 120.000','shared-image.jpeg').bank,'generic');
 assert.equal(detectBankFromText('Transaksi e-Statement\n20 Okt 2026\nKedai Contoh - IDR 5.000','shared-image.jpeg').bank,'generic');
});
test('OCR numeric prefixes are never accepted as complete amounts',()=>{
 for(const amount of ['-Rp12 000','-Rp 1 234,56','-Rp12.000S','-Rp1.234,567','-Rp12,34,567'])assert.equal(parse('krom',`Riwayat Transaksi\n15 Okt 2026\nMerchant ${amount}\nUang Keluar`).length,0,amount);
});
test('contrast retry cannot replace an already decoded date or amount with a conflicting guess',()=>{
 const a={handled:true,candidates:[{date:'2026-10-15',time:'',signedAmount:-10}]};
 const b={handled:true,candidates:[{date:'2026-10-16',time:'',signedAmount:-10},{date:'2026-10-15',time:'',signedAmount:-15}]};
 assert.equal(chooseHistoryReading(a,b),a);
 const c={handled:true,candidates:[...a.candidates,b.candidates[1]]};assert.equal(chooseHistoryReading(a,c),c);
});
test('blu dates below each row belong to that row, including unsigned incoming amounts',()=>{
 const rows=parse('blu','Riwayat Transaksi\nOktober 2026\nPembayaran QRIS\nKedai Contoh - Rp 12.000,00\nMakanan\n18 Okt 2026 17:35 WIB\nDana Masuk dari Teman\nRp 40.000,25\nUang Masuk\n17 Okt 2026 08:43 WIB\nPembayaran QRIS\nBaris terpotong - Rp 9.000,00');
 assert.deepEqual(rows.map(r=>[r.date,r.time,r.signedAmount]),[['2026-10-18','17:35:00',-12000],['2026-10-17','08:43:00',40000.25]]);
 assert(rows.every(r=>r.selected===false));
});
test('Mandiri group date supports several transactions and excludes undated cropped top',()=>{
 const rows=parse('mandiri','Transaksi e-Statement\nQRBayar -Rp 7.000\nPembayaran QR ke Terpotong\n08 Okt 2026\nTransfer Rupiah +Rp 21.000\nTransfer dari BANK MANDIRI Contoh\nQRBayar -Rp 13.000\nPembayaran QR ke Kedai\n06 Okt 2026\nBiaya -Rp 6.000\nBiaya administrasi');
 assert.deepEqual(rows.map(r=>[r.date,r.signedAmount]),[['2026-10-08',21000],['2026-10-08',-13000],['2026-10-06',-6000]]);
});
test('myBCA split calendar and DB/CR decode rows, ignoring active balance',()=>{
 const rows=parse('bca','Account Information\nActive Balance\nIDR 55,000.00\n19 Oct 2026 10:06:30\nAccount Transactions Card Pocket\nOctober\n1 6    TRANSFER DR Contoh\nBI-FAST CR\nOct\n2026 IDR 100,000.25\n1 5    TGL: 1015 QR 490 00000.00Kedai\nTRANSAKSI DEBIT\nOct\n2026 IDR 12,500.00');
 assert.deepEqual(rows.map(r=>[r.date,r.signedAmount]),[['2026-10-16',100000.25],['2026-10-15',-12500]]);
});
test('Krom grouped dates keep all signed rows and ignore pocket moves and ambiguous amounts',()=>{
 const rows=parse('krom','Riwayat Transaksi\n14 Okt 2026\nDana Darurat Rp9.000\nPemindahan Saldo\n28 Sep 2026\nBunga Tabungan Utama +Rp2.123\nBunga\nPajak Tabungan Utama -Rp424\nPajak\nCashback Bonus +Rpl0\nBonus\n25 Sep 2026\nTeman -Rp100.000\nUang Keluar');
 assert.deepEqual(rows.map(r=>[r.date,r.signedAmount]),[['2026-09-28',2123],['2026-09-28',-424],['2026-09-25',-100000]]);
});
test('history does not invent dates, directions, or promote failed rows',()=>{
 assert.equal(parse('krom','Riwayat Transaksi\nMerchant -Rp9.000').length,0);
 assert.equal(parse('krom','Riwayat Transaksi\n31 Sep 2026\nMerchant -Rp9.000').length,0);
 assert.equal(parse('blu','Riwayat Transaksi\nTransaksi gagal\nMerchant -Rp9.000\n15 Okt 2026 10:10 WIB').length,0);
 assert.equal(parse('bca','Account Transactions\n1 5 Merchant\nOct\n2026 IDR 90,000.00').length,0);
});
