import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTransactions,historyAccounts,accountActivity} from '../assets/js/transaction-filters.js';
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
