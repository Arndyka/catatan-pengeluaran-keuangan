import {journalEntries} from './accounting.js';
export const VERIFIED_ON='2026-10-15';
const bca='https://www.bca.co.id/id/Individu/produk/simpanan/';
const mandiri='https://www.bankmandiri.co.id/web/guest/tarif-layanan';
export const BANK_PRODUCTS={
 'bca-xpresi':{name:'BCA Tahapan Xpresi',admin:10000,card:0,minimum:0,held:10000,penalty:0,basis:'none',source:bca+'Tahapan-Xpresi'},
 'bca-tahapan':{name:'BCA Tahapan · Blue Mastercard',admin:15000,card:0,minimum:100000,held:50000,penalty:5000,basis:'average',source:bca+'Tahapan'},
 'mandiri-gold-visa':{name:'Mandiri Rupiah · Gold Visa',admin:13000,card:6000,minimum:100000,held:0,penalty:5000,basis:'current',source:mandiri},
 'mandiri-gold-gpn':{name:'Mandiri Rupiah · Gold GPN',admin:13000,card:5500,minimum:100000,held:0,penalty:5000,basis:'current',source:mandiri},
 blu:{name:'bluAccount',admin:0,card:0,minimum:0,held:0,penalty:0,basis:'none',source:'https://blubybcadigital.id/info/fees-rates/'},
 krom:{name:'Krom · Tabungan Basic',admin:0,card:0,minimum:0,held:0,penalty:0,basis:'none',source:'https://krom.id/faq/'}
};
export function suggestedProduct(account) {
 const name=String(account.name||'').toLowerCase();
 if(name.includes('krom'))return 'krom';
 if(name.includes('blu'))return 'blu';
 if(name.includes('mandiri'))return 'mandiri-gold-visa';
 if(name.includes('bca'))return 'bca-xpresi';
 return '';
}
export function interestEstimate(balance,rate,month) {
 if(!Number.isFinite(balance)||!Number.isFinite(rate)||rate<0||rate>100||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Saldo, bunga, atau bulan tidak valid.');
 const days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 const annual=Math.max(0,balance)*rate/100;
 return {annual,monthly:annual*days/365,daily:annual/365,days};
}
export function dailyAccountBalances(transactions,accountId,today) {
 const month=today.slice(0,7), days=Number(today.slice(8));
 let opening=0;const changes=Array(days).fill(0);
 for(const tx of transactions) {
  if(!tx.date||tx.date>today)continue;
  const delta=journalEntries(tx.journal).filter(j=>j.accountId===accountId).reduce((n,j)=>n+Number(j.debit||0)-Number(j.credit||0),0);
  if(tx.date.slice(0,7)<month)opening+=delta;
  else changes[Number(tx.date.slice(8))-1]+=delta;
 }
 return changes.map(delta=>opening+=delta);
}
export function bankForecast(rule,balances,daysInMonth) {
 const last=balances.at(-1)||0, elapsed=balances.length;
 const sum=balances.reduce((n,v)=>n+v,0), remaining=Math.max(0,daysInMonth-elapsed);
 const average=elapsed?sum/elapsed:0, projectedAverage=(sum+last*remaining)/daysInMonth;
 const metric=rule.basis==='average'?projectedAverage:last;
 const penalty=rule.basis!=='none'&&metric<rule.minimum?rule.penalty:0;
 const fixedFee=rule.admin+rule.card;
 const topUp=rule.basis==='average'?Math.max(0,(rule.minimum*daysInMonth-sum-last*remaining)/(remaining+1)):Math.max(0,rule.minimum-last);
 return {last,average,projectedAverage,penalty,fixedFee,total:fixedFee+penalty,topUp,heldShortfall:Math.max(0,rule.held-last)};
}
