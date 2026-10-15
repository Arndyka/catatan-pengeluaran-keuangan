import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransaction,DEFAULT_SETTINGS,balanceSheet,cashFlowStatement,incomeStatement,validateJournal,deriveLedger} from '../assets/js/accounting.js';
import {budgetAnalysis} from '../assets/js/budget.js';
const base={type:'expense',date:'2026-10-01',amount:1000,sourceAccountId:'asset-bca',category:'Belanja'};
test('invalid account roles and inactive accounts cannot create misleading journals',async()=>{
 for(const input of [{...base,sourceAccountId:'liability-mandiri-cc'},{...base,type:'income',sourceAccountId:'liability-mandiri-cc'},{...base,type:'transfer',destinationAccountId:'liability-mandiri-cc'},{...base,type:'investment',destinationAccountId:'asset-krom'},{...base,installmentTenor:1.5}])await assert.rejects(buildTransaction(input,DEFAULT_SETTINGS));
 const settings={...DEFAULT_SETTINGS,accounts:DEFAULT_SETTINGS.accounts.map(a=>({...a,active:a.id!=='asset-bca'}))};
 await assert.rejects(buildTransaction(base,settings));
});
test('balance sheet reports broken journals instead of a tautological equation',()=>{
 const tx={date:'2026-10-01',journal:[{accountId:'a',accountType:'asset',debit:100,credit:0}]};
 assert.equal(balanceSheet([tx]).balanced,false);
 assert.equal(validateJournal([]).valid,false);
 assert.equal(validateJournal([{debit:-100,credit:-100}]).valid,false);
});
test('decimal rupiah are summed in cents without phantom differences',async()=>{
 const tx=await Promise.all([0.1,0.2].map(amount=>buildTransaction({...base,amount},DEFAULT_SETTINGS)));
 assert.equal(incomeStatement(tx,'2026-10').expenses,0.3);
 assert.equal(deriveLedger(tx).accounts.find(a=>a.accountId==='asset-bca').balance,-0.3);
});
test('future entries are excluded from actual balances, reports and budget',async()=>{
 const future=await buildTransaction({...base,type:'income',date:'2099-10-01',amount:5000},DEFAULT_SETTINGS);
 assert.equal(balanceSheet([future]).assets,0);
 assert.equal(incomeStatement([future],'2099-10').income,0);
 assert.equal(budgetAnalysis([future],'2099-10',{items:[{method:'percentage',value:50,category:'Belanja'}]}).rows[0].target,0);
});
test('cash flow recognizes investment disposal, excludes card expenses, and ignores own cash transfers',async()=>{
 const disposal=await buildTransaction({...base,type:'transfer',sourceAccountId:'asset-investment',destinationAccountId:'asset-bca'},DEFAULT_SETTINGS);
 const internal=await buildTransaction({...base,type:'transfer',destinationAccountId:'asset-krom'},DEFAULT_SETTINGS);
 const purchase=await buildTransaction({...base,type:'credit_purchase',sourceAccountId:'liability-mandiri-cc'},DEFAULT_SETTINGS);
 assert.equal(cashFlowStatement([disposal,internal,purchase],'2026-10',DEFAULT_SETTINGS).netCashFlow,1000);
});
test('opening balances are equity, never monthly salary or spending',async()=>{
 const asset=await buildTransaction({...base,type:'opening_balance',amount:5000},DEFAULT_SETTINGS);
 const card=await buildTransaction({...base,type:'opening_balance',sourceAccountId:'liability-mandiri-cc',amount:1000},DEFAULT_SETTINGS);
 assert.equal(balanceSheet([asset,card]).equity,4000);
 assert.equal(incomeStatement([asset,card],'2026-10').income,0);
 assert.equal(cashFlowStatement([asset,card],'2026-10',DEFAULT_SETTINGS).netCashFlow,0);
 assert.equal((await buildTransaction({...base,type:'opening_balance',amount:9999},DEFAULT_SETTINGS)).id,asset.id);
});
test('spending with zero budget is still over budget',()=>{
 const analysis=budgetAnalysis([base],'2026-10',{items:[{category:'Belanja',method:'nominal',value:0}]});
 assert.equal(analysis.rows[0].overBudget,true);
});
