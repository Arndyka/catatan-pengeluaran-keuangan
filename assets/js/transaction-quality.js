import {recurringReceiptInPeriod} from './recurring-logic.js';
const normalize=value=>String(value||'').trim().replace(/\s+/g,' ');
export function scanExclusionReason(row) {
 if(row.is_transaction===false || (row.record_kind && row.record_kind!=='transaction'))return 'Bukan baris transaksi';
 if(row.status && !['completed','posted','success','successful','settled','berhasil'].includes(String(row.status).toLowerCase()))return 'Belum berhasil atau belum dibukukan';
 const text=normalize(row.description||row.merchant).toLowerCase();
 if(/\b(tidak berhasil|belum berhasil|payment failed|payment cancelled|awaiting payment)\b/.test(text)&&! /^(biaya|refund|pengembalian|koreksi)\b/.test(text))return 'Transaksi belum selesai atau gagal';
 if(/\b(status\s*:?\s*(pending|failed|gagal|diproses)|menunggu pembayaran|pending payment|payment pending|belum dibayar)\b/.test(text))return 'Transaksi belum selesai atau gagal';
 if(!/^(biaya|refund|pengembalian|koreksi)\b/.test(text)&&/\b(transaksi|transfer|pembayaran)\s+(gagal|tertunda|dibatalkan)\b/.test(text))return 'Transaksi belum selesai atau gagal';
 if(/^(saldo (awal|akhir|tersedia)|opening balance|closing balance|available balance|total (transaksi|pengeluaran|pemasukan|debit|kredit|saldo)|sub[ -]?total|ringkasan|summary|promo\b|penawaran\b|iklan\b|contoh\b|simulasi\b|limit (kredit|kartu)|tagihan belum dibayar|invoice belum dibayar)/.test(text))return 'Ringkasan, saldo, atau informasi di luar transaksi';
 if(/^(status\s*:?\s*(pending|failed|gagal|diproses)|transaksi\s+(gagal|tertunda|dibatalkan)|transfer\s+(gagal|tertunda)|menunggu pembayaran)/.test(text))return 'Transaksi belum selesai atau gagal';
 return '';
}
export function manualRecurringMatches(tx,history=[]){
 return history.filter(old=>old.recurringRuleId&&old.type===tx.type&&old.sourceAccountId===tx.sourceAccountId&&(old.destinationAccountId||'')===(tx.destinationAccountId||'')&&recurringReceiptInPeriod(old,tx)&&(Number(old.amount)===Number(tx.amount)||(tx.type==='income'&&salaryText(tx)&&salaryText(old))));
}
const MERCHANT_TYPOS={'alfamrt':'Alfamart','alfamrat':'Alfamart','indomart':'Indomaret','indomret':'Indomaret','gojekk':'Gojek','grabbb':'Grab','shopepay':'ShopeePay','youtubeprem':'YouTube Premium'};
const salaryText=tx=>/\b(gaji|salary|payroll)\b/i.test([tx.category,tx.merchant,tx.description].join(' '));
export function suggestionKey(s){return JSON.stringify([s.field,s.before,s.after,s.reason]);}
export function suggestTransaction(tx,{history=[],accounts=[],today=new Date().toISOString().slice(0,10)}={}) {
 const result=[];
 const suggest=(field,after,reason)=>{if(after!==tx[field])result.push({field,before:tx[field]??'',after,reason,source:'Pemeriksaan lokal'});};
 const warn=(field,reason)=>result.push({field,before:tx[field]??'',reason,warning:true,source:'Pemeriksaan lokal'});
 for(const field of ['merchant','description']){const value=normalize(tx[field]);if(value&&value!==tx[field])suggest(field,value,'Rapikan spasi berlebih tanpa mengubah isi.');}
 const merchant=normalize(tx.merchant).toLowerCase();if(MERCHANT_TYPOS[merchant])suggest('merchant',MERCHANT_TYPOS[merchant],'Kemungkinan salah ketik nama merchant. Pastikan nama pada bukti transaksi.');
 if(salaryText(tx)){
  if(tx.type==='income')suggest('category','Gaji','Keterangan menunjukkan penerimaan gaji.');
  else if(tx.type==='expense')warn('type','Keterangan menyebut gaji. Pastikan ini gaji yang kamu terima (pemasukan), bukan gaji yang kamu bayar.');
 }
 if(tx.date>today)warn('date','Tanggal berada di masa depan. Untuk transaksi yang belum terjadi, gunakan jadwal rutin.');
 if(['transfer','investment','credit_payment'].includes(tx.type)&&tx.sourceAccountId===tx.destinationAccountId)warn('destinationAccountId','Akun sumber dan tujuan sama. Pilih dua rekening yang berbeda.');
 if(accounts.length&&tx.sourceAccountId&&!accounts.some(a=>a.id===tx.sourceAccountId&&a.active!==false))warn('sourceAccountId','Rekening tidak ditemukan atau sedang nonaktif.');
 const prior=history.filter(t=>normalize(t.merchant).toLowerCase()===merchant&&merchant&&t.type===tx.type&&t.sourceAccountId===tx.sourceAccountId&&Number(t.amount)>0).slice(0,30).map(t=>Number(t.amount)).sort((a,b)=>a-b);
 if(prior.length>=3){const median=prior[Math.floor(prior.length/2)],amount=Number(tx.amount);if(amount>=median*10||amount>0&&amount<=median/10)warn('amount','Nominal berbeda jauh dari transaksi merchant ini sebelumnya. Periksa jumlah nol; nominal tidak diubah otomatis.');}
 return result;
}
export function stageAiSuggestions(tx,update,accounts=[]) {
 const allowed=['type','category','merchant','description','sourceAccountId','destinationAccountId'];
 return allowed.flatMap(field=>{
  const value=update[field];if(typeof value!=='string'||value===String(tx[field]??''))return [];
  if(field==='type'&&!['income','expense','transfer','credit_purchase','credit_payment','investment'].includes(value))return [];
  if(field.endsWith('AccountId')&&!accounts.some(a=>a.id===value&&a.active!==false))return [];
  return [{field,before:tx[field]??'',after:value.slice(0,2000),source:'NVIDIA AI',reason:normalize(update.reason||'Usulan berdasarkan keterangan transaksi. Periksa sebelum menerapkan.').slice(0,500)}];
 });
}
