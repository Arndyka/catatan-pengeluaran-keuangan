import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTransactions,historyAccounts,accountActivity,transactionPresentation} from '../assets/js/transaction-filters.js';
const accounts=[{id:'a',name:'Bank A',type:'asset',active:true},{id:'b',name:'Bank B',type:'asset',active:true},{id:'old',name:'Arsip',active:false},{id:'unused',name:'Unused',active:false}];
const txs=[{id:'transfer',type:'transfer',date:'2026-10-04',sourceAccountId:'a',destinationAccountId:'b',amount:120,description:'Dana bersama',journal:[{accountId:'a',debit:0,credit:120},{accountId:'b',debit:120,credit:0}]},{id:'old',date:'2026-09-01',sourceAccountId:'old',type:'expense',amount:20},{id:'adjust',type:'balance_adjustment',date:'2026-10-05',sourceAccountId:'b',amount:90,journal:[{accountId:'b',debit:90,credit:0}]}];
test('account history includes both transfer sides and combines all filters',()=>{
 assert.deepEqual(filterTransactions(txs,{accountId:'a'},accounts).map(t=>t.id),['transfer']);
 assert.deepEqual(filterTransactions(txs,{accountId:'b',type:'transfer',from:'2026-10-04',to:'2026-10-04',search:'bank a'},accounts).map(t=>t.id),['transfer']);
 assert.equal(filterTransactions(txs,{accountId:'a',from:'2026-10-05'},accounts).length,0);
 assert.equal(filterTransactions(txs,{from:'2026-10-10',to:'2026-10-01'},accounts).length,0);
 assert.equal(filterTransactions(txs,{accountId:'missing'},accounts).length,0);
});
test('dynamic accounts retain historical inactive accounts but not unused ones',()=>{
 assert.deepEqual(historyAccounts(accounts,txs).map(a=>a.id),['a','b','old']);
});
test('account activity excludes balance corrections and future rows',()=>{
 assert.deepEqual(accountActivity([...txs,{...txs[0],date:'2099-10-04'}],'b','2026-10-19'),{inflow:120,outflow:0,adjustments:90});
 assert.deepEqual(accountActivity(txs,'a','2026-10-19'),{inflow:0,outflow:120,adjustments:0});
});

const reviewAccounts=[...accounts,{id:'clear',name:'Transfer Belum Dipetakan',type:'asset',subtype:'clearing'},{id:'cc',name:'Kartu',type:'liability'}];
const pending={id:'pending',type:'transfer',sourceAccountId:'clear',destinationAccountId:'a',amount:35,merchant:'Pengirim',sourceMeta:{pendingAllocation:'Rincian belum diketahui'},journal:[{accountId:'a',debit:35,credit:0},{accountId:'clear',debit:0,credit:35}]};
const income={id:'income',type:'income',sourceAccountId:'a',amount:50,merchant:'Pemberi kerja',journal:[{accountId:'a',debit:50,credit:0}]};
const expense={id:'expense',type:'expense',sourceAccountId:'a',amount:10,merchant:'Kedai',journal:[{accountId:'a',debit:0,credit:10}]};
test('review and source/destination filters reflect real cash direction, not storage field names',()=>{
 const rows=[pending,income,expense,...txs];
 assert.deepEqual(filterTransactions(rows,{status:'pending'},reviewAccounts).map(t=>t.id),['pending']);
 assert.deepEqual(filterTransactions(rows,{status:'unmapped'},reviewAccounts).map(t=>t.id),['pending']);
 assert.deepEqual(filterTransactions(rows,{source:'external',destination:'a'},reviewAccounts).map(t=>t.id),['income']);
 assert.deepEqual(filterTransactions(rows,{source:'a',destination:'external'},reviewAccounts).map(t=>t.id),['expense']);
 assert.deepEqual(filterTransactions(rows,{type:'cash_in',accountId:'a'},reviewAccounts).map(t=>t.id),['pending','income']);
 assert.deepEqual(filterTransactions(rows,{type:'cash_out',accountId:'a'},reviewAccounts).map(t=>t.id),['expense','transfer']);
 assert.equal(filterTransactions([txs[0],txs[2]],{type:'cash_in'},reviewAccounts).length,0);
});
test('signs distinguish receipts, payments, internal transfers, adjustments and liabilities',()=>{
 assert.equal(transactionPresentation(income,reviewAccounts).sign,'+');
 assert.equal(transactionPresentation(expense,reviewAccounts).sign,'−');
 assert.equal(transactionPresentation(pending,reviewAccounts).sourceLabel,'Pengirim · belum dirinci');
 assert.equal(transactionPresentation(income,reviewAccounts).destinationLabel,'Bank A');
 assert.equal(transactionPresentation(txs[0],reviewAccounts).sign,'↔');
 assert.equal(transactionPresentation(txs[0],reviewAccounts,'a').sign,'−');
 assert.equal(transactionPresentation(txs[0],reviewAccounts,'b').sign,'+');
 assert.equal(transactionPresentation(txs[2],reviewAccounts,'b').sign,'');
 const payment={type:'credit_payment',sourceAccountId:'a',destinationAccountId:'cc',amount:5,journal:[{accountId:'a',debit:0,credit:5},{accountId:'cc',debit:5,credit:0}]};
 const p=transactionPresentation(payment,reviewAccounts,'cc');assert.equal(p.sign,'−');assert.equal(p.tone,'positive');assert.equal(p.directionLabel,'Utang berkurang');
 const settled={...pending,sourceMeta:{loanSettled:true}};
 assert.equal(filterTransactions([settled],{status:'unmapped'},reviewAccounts).length,0);
 assert.equal(filterTransactions([settled],{status:'settled'},reviewAccounts).length,1);
});
test('cash filters never count a credit purchase and its repayment as two cash payments',()=>{
 const purchase={type:'credit_purchase',sourceAccountId:'cc',amount:40,journal:[{accountId:'cc',debit:0,credit:40},{accountId:'expense',accountType:'expense',debit:40,credit:0}]};
 const payment={type:'credit_payment',sourceAccountId:'a',destinationAccountId:'cc',amount:40,journal:[{accountId:'a',debit:0,credit:40},{accountId:'cc',debit:40,credit:0}]};
 assert.deepEqual(filterTransactions([purchase,payment],{type:'cash_out'},reviewAccounts),[payment]);
 assert.equal(transactionPresentation(purchase,reviewAccounts).directionLabel,'Belanja kredit · non-tunai');
 assert.equal(filterTransactions([payment],{type:'cash_in',accountId:'cc'},reviewAccounts).length,0);
 assert.doesNotMatch(transactionPresentation({...pending,sourceMeta:{loanSettled:true}},reviewAccounts).sourceLabel,/belum dirinci/);
});
