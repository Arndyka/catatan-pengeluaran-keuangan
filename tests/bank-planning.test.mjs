import test from 'node:test';
import assert from 'node:assert/strict';
import {interestEstimate, bankForecast, BANK_PRODUCTS, dailyAccountBalances} from '../assets/js/bank-planning.js';

test('average balance top-up includes today, even on final day',()=>{
 const r=bankForecast({admin:0,card:0,minimum:100000,held:0,penalty:5000,basis:'average'},[0,0,200000],3);
 assert.equal(r.penalty,5000);assert.equal(r.topUp,100000);
});
test('Krom gross interest follows actual days / 365 and never compounds forecasts',()=>{
 const r=interestEstimate(10000000,6,'2026-02');assert.equal(r.annual,600000);assert.equal(r.monthly,600000*28/365);assert.equal(r.daily,600000/365);
 assert.throws(()=>interestEstimate(10,Infinity,'2026-02'));
});
test('Xpresi held balance is not a monthly penalty threshold',()=>{
 const r=bankForecast(BANK_PRODUCTS['bca-xpresi'],[5000],31);assert.equal(r.penalty,0);assert.equal(r.fixedFee,10000);assert.equal(r.heldShortfall,5000);
});
test('Mandiri Gold Visa separates account fee card fee and minimum penalty',()=>{
 const p=BANK_PRODUCTS['mandiri-gold-visa'];assert.equal(bankForecast(p,[99999],31).total,24000);assert.equal(bankForecast(p,[100000],31).total,19000);
});
test('BCA Tahapan average threshold is not checked against last balance alone',()=>{
 const r=bankForecast(BANK_PRODUCTS['bca-tahapan'],[200000,0],2);assert.equal(r.penalty,0);
});
test('Krom/blu no monthly minimum fee, daily ledger includes prior history',()=>{
 assert.equal(bankForecast(BANK_PRODUCTS.krom,[0],31).total,0);assert.equal(bankForecast(BANK_PRODUCTS.blu,[0],31).total,0);
 const tx=[{date:'2026-09-30',journal:[{accountId:'a',debit:200000,credit:0}]},{date:'2026-10-02',journal:[{accountId:'a',debit:0,credit:50000}]}];
 assert.deepEqual(dailyAccountBalances(tx,'a','2026-10-03'),[200000,150000,150000]);
});
