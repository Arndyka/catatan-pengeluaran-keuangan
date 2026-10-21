import test from 'node:test';
import assert from 'node:assert/strict';
import {detectBankFromText,parseImageText,parseScreenshotHistory} from '../assets/js/scanner.js';
const options={bank:'shopee',accountId:'wallet-shopee',paylaterAccountId:'paylater-test',merchantRules:{}};
const order=method=>`Shopee\nRincian Pesanan\nPesanan Selesai\nWaktu Pembayaran 21 Oktober 2026 10:11\nMetode Pembayaran ${method}\nSubtotal Produk Rp40.000\nOngkos Kirim Rp5.000\nTotal Pembayaran Rp45.000\nNo. Pesanan TEST123456`;
test('Krom issuer layout survives shared filenames and counterparty bank names',()=>{
 const text='Riwayat Transaksi\n21 Okt 2026\nPenerima BANK MANDIRI -Rp90.000\nUang Keluar\nDana Darurat Rp5.000\nPemindahan Saldo\nPengirim +Rp120.000\nUang Masuk';
 assert.equal(detectBankFromText(text,'shared.jpeg').bank,'krom');
 assert.deepEqual(parseImageText(text,{bank:'krom',accountId:'krom'}).map(r=>r.signedAmount),[-90000,120000]);
});
test('Shopee issuer is distinct from a bank transaction mentioning ShopeePay',()=>{
 assert.equal(detectBankFromText(order('ShopeePay'),'shared.jpeg').bank,'shopee');
 assert.equal(detectBankFromText('Transaksi e-Statement\n21 Okt 2026\nBayar/Top-up - IDR 50.000\nPembayaran ShopeePay','shared.jpeg').bank,'mandiri');
});
test('paid Shopee order uses payment date, total and explicit payment instrument',()=>{
 const cash=parseImageText(order('ShopeePay'),options);assert.equal(cash.length,1);assert.equal(cash[0].amount,45000);assert.equal(cash[0].date,'2026-10-21');assert.equal(cash[0].sourceAccountId,'wallet-shopee');assert.equal(cash[0].type,'expense');assert.equal(cash[0].selected,false);
 const credit=parseImageText(order('SPayLater'),options);assert.equal(credit[0].type,'credit_purchase');assert.equal(credit[0].sourceAccountId,'paylater-test');
 const bank=parseImageText(order('Transfer Bank BCA'),options);assert.equal(bank[0].sourceAccountId,'');
 assert.equal(parseImageText(order('ShopeePay').replace('Waktu Pembayaran','Waktu Pesanan Dibuat'),options).length,0);
});
test('unpaid cancelled refunded or ambiguous orders do not become purchases',()=>{
 for(const status of ['Belum Bayar','Pesanan Dibatalkan','Pengembalian Dana','Menunggu Pembayaran'])assert.equal(parseImageText(order('ShopeePay').replace('Pesanan Selesai',status),options).length,0,status);
 assert.equal(parseImageText(order('ShopeePay').replace('45.000','45.00O'),options).length,0);
});
test('ShopeePay history requires full date explicit direction and settled state',()=>{
 const text='ShopeePay\nRiwayat Transaksi\n21 Okt 2026\nPembayaran Toko A -Rp12.000\nBerhasil\nTransfer dari Teman +Rp50.000\nBerhasil\nPembayaran Toko B -Rp9.000\nStatus Pending';
 const rows=parseImageText(text,options);assert.deepEqual(rows.map(r=>r.signedAmount),[-12000,50000]);assert(rows.every(r=>r.sourceAccountId==='wallet-shopee'));
 assert.equal(parseImageText(text.replace('21 Okt 2026','Hari ini'),options).length,0);
});
test('Shopee credit and loan summaries are readable evidence, never spending or income',()=>{
 const loan='Rincian Pinjaman\nRp1.000.000\nTotal pinjaman\nWaktu Pengajuan 21 Okt 2026 10:11\nDurasi Pinjaman 2 bulan\nBiaya Pencairan Rp10.000\nBiaya Cicilan Rp60.000\nRincian Pembayaran Bulanan\n1/2, Rp530.000\nJatuh Tempo:21 Nov 2026 Belum Dibayar\n2/2, Rp530.000\nJatuh Tempo:21 Des 2026 Belum Dibayar';
 const result=parseScreenshotHistory(loan,options);assert(result.handled);assert.equal(result.candidates.length,0);assert.equal(result.evidence.kind,'loan');assert.equal(result.evidence.fields.find(f=>f.label==='Pokok pinjaman').amount,1000000);assert.equal(result.evidence.bills.length,2);
 const bill=parseScreenshotHistory('SPayLater\nTagihan Saya\nBelum Lunas\nRp450.000\nTanggal jatuh tempo 25 Nov 2026',options);assert.equal(bill.candidates.length,0);assert.equal(bill.evidence.kind,'bills');
 assert.equal(parseImageText('ShopeePay\nRp0\nSPayLater Rp4.000.000\nSPinjam Rp2.000.000\nIsi Saldo Kirim Uang',options).length,0);
});

test('known loan disbursement in bank history is not presented as ordinary income',()=>{
 const result=parseScreenshotHistory('Riwayat Transaksi\n21 Okt 2026\nPT Lentera Dana Nusantara +Rp990.000\nUang Masuk\nDana Darurat Rp5.000\nPemindahan Saldo',{bank:'krom',accountId:'krom'});
 assert.equal(result.candidates.length,0);assert(result.excluded.some(e=>/pinjaman/i.test(e.reason)));
});

test('Shopee amounts reject split digits rather than taking a smaller prefix',()=>{
 for(const bad of ['Rp45 000','Rp45\n000','Rp4S.000','Rp45.00O','Rp45,000.00'])assert.equal(parseImageText(order('ShopeePay').replace('Rp45.000',bad),options).length,0,bad);
});
test('a ShopeePay merchant cannot hijack a blu history issuer or its footer dates',()=>{
 const text='Riwayat Transaksi\nShopeePay -Rp100.000\nPembayaran QRIS Berhasil\n21 Okt 2026 10:11:00 WIB\nKedai -Rp50.000\nPembayaran QRIS Berhasil\n20 Okt 2026 10:11:00 WIB';
 assert.equal(detectBankFromText(text,'shared.jpeg').bank,'blu');
});
import {confirmedAmountRetry} from '../assets/js/history-amounts.js';
test('amount crop retries preserve known digits and require confidence and exact separators',()=>{
 assert(confirmedAmountRetry('l.234.567','1.234.567',95));
 for(const [before,after,confidence] of [['l.234.567','1.234.568',99],['l.234.567','1234567',99],['l.234.567','1.234.567',79],['1.234.567','1.234.567',99],['l.234.567','1.234.567',NaN]])assert.equal(confirmedAmountRetry(before,after,confidence),false);
});
