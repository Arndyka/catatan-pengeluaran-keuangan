import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransaction,DEFAULT_SETTINGS,balanceSheet,incomeStatement} from '../assets/js/accounting.js';
import {parseIdrValue,detectBankFromText} from '../assets/js/scanner.js';
const base={date:'2026-10-15',amount:100,type:'expense',sourceAccountId:'asset-mandiri',category:'Makan'};

test('scan reference identity is idempotent across wording but preserves distinct references',async()=>{
 const a=await buildTransaction({...base,importIdentity:'reference:123456',description:'Receipt'},DEFAULT_SETTINGS);
 const b=await buildTransaction({...base,importIdentity:'reference:123456',description:'PDF wording',category:'Belanja'},DEFAULT_SETTINGS);
 const c=await buildTransaction({...base,importIdentity:'reference:654321',description:'Receipt'},DEFAULT_SETTINGS);
 assert.equal(a.id,b.id);assert.notEqual(a.id,c.id);
});
test('impossible transaction dates and non-finite amounts cannot enter journals',async()=>{
 await assert.rejects(buildTransaction({...base,date:'2026-02-30'},DEFAULT_SETTINGS));
 await assert.rejects(buildTransaction({...base,amount:Infinity},DEFAULT_SETTINGS));
});
test('transfer to the same account is rejected',async()=>{
 await assert.rejects(buildTransaction({...base,type:'transfer',destinationAccountId:'asset-mandiri'},DEFAULT_SETTINGS));
});
test('investment moves asset balances without inflating consumption expenses',async()=>{
 const income=await buildTransaction({...base,type:'income',amount:1000,category:'Gaji'},DEFAULT_SETTINGS);
 const investment=await buildTransaction({...base,type:'investment',amount:400,destinationAccountId:'asset-investment'},DEFAULT_SETTINGS);
 const expense=await buildTransaction({...base,amount:100},DEFAULT_SETTINGS);
 const tx=[income,investment,expense];
 assert.equal(balanceSheet(tx).assets,900);
 assert.equal(balanceSheet(tx).balanced,true);
 assert.equal(incomeStatement(tx,'2026-10').expenses,100);
});
test('credit card repayment does not count as another expense',async()=>{
 const purchase=await buildTransaction({...base,type:'credit_purchase',sourceAccountId:'liability-mandiri-cc'},DEFAULT_SETTINGS);
 const payment=await buildTransaction({...base,type:'credit_payment',destinationAccountId:'liability-mandiri-cc'},DEFAULT_SETTINGS);
 assert.equal(incomeStatement([purchase,payment],'2026-10').expenses,100);
 assert.equal(balanceSheet([purchase,payment]).liabilities,0);
});
test('bank detection and Indonesian amount reader remain compatible',()=>{
 assert.equal(parseIdrValue('1.234.567,89').amount,1234567.89);
 assert.equal(detectBankFromText('BCA TAHAPAN XPRESI REKENING KORAN').bank,'bca');
 assert.equal(detectBankFromText('PT Bank Mandiri (Persero) Tbk e-Statement').bank,'mandiri');
 assert.equal(detectBankFromText('PT Krom Bank Indonesia e-Statement').bank,'krom');
});
