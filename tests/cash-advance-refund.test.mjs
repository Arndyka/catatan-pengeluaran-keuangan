import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,buildTransaction,deriveLedger,incomeStatement,cashFlowStatement,transactionExpense} from '../assets/js/accounting.js';
import {budgetActual} from '../assets/js/budget.js';
import {transactionPresentation} from '../assets/js/transaction-filters.js';
import {prepareTransactionEdit} from '../assets/js/transaction-edit.js';
import {matchImport} from '../assets/js/import-reconciliation.js';
const settings=structuredClone(DEFAULT_SETTINGS),date='2026-10-20';
test('credit funding, fee and purchase count consumption once and survive editing',async()=>{
 const funding=await buildTransaction({type:'credit_cash_advance',date,amount:100000,sourceAccountId:'liability-mandiri-cc',destinationAccountId:'asset-blu',category:'Pencairan Kartu'},settings);
 const fee=await buildTransaction({type:'expense',date,amount:300,sourceAccountId:'asset-blu',category:'Biaya Bank'},settings);
 const purchase=await buildTransaction({type:'expense',date,amount:100000,sourceAccountId:'asset-blu',category:'Hiburan'},settings);
 const txs=[funding,fee,purchase],ledger=deriveLedger(txs);
 assert.equal(incomeStatement(txs,'2026-10').income,0);assert.equal(incomeStatement(txs,'2026-10').expenses,100300);
 assert.equal(ledger.accounts.find(a=>a.accountId==='asset-blu').balance,-300);assert.equal(ledger.accounts.find(a=>a.accountId==='liability-mandiri-cc').balance,100000);
 assert.equal(cashFlowStatement(txs,'2026-10',settings).financingInflow,100000);assert.equal(transactionExpense(funding),0);
 assert.equal(transactionPresentation(funding,settings.accounts).destinationLabel,'blu');assert.equal(transactionPresentation(funding,settings.accounts).sign,'+');
 const edited=await prepareTransactionEdit(funding,{description:'Corrected note'},settings);assert.deepEqual(edited.journal,funding.journal);assert.equal(edited.destinationAccountId,'asset-blu');
 await assert.rejects(buildTransaction({...funding,sourceAccountId:'asset-mandiri'},settings));await assert.rejects(buildTransaction({...funding,destinationAccountId:'asset-investment'},settings));
});
test('rescanning net card payout requires review of the already recorded gross funding',async()=>{
 const funding=await buildTransaction({type:'credit_cash_advance',date,amount:100000,sourceAccountId:'liability-mandiri-cc',destinationAccountId:'asset-blu',sourceMeta:{bank:'mandiri',netProceeds:99700}},settings);
 const candidate={type:'income',date,amount:99700,signedAmount:99700,sourceAccountId:'asset-blu',bank:'blu'};
 assert.equal(matchImport(candidate,[funding]).status,'review');assert.equal(matchImport({...candidate,sourceAccountId:'asset-bca'},[funding]).status,'new');
});
test('meal reimbursement reduces expense and budget, not income, and preserves receiving bank',async()=>{
 const meal=await buildTransaction({type:'expense',date,amount:80000,sourceAccountId:'asset-blu',category:'Makan'},settings);
 const refund=await buildTransaction({type:'expense_refund',date,amount:30000,sourceAccountId:'asset-mandiri',category:'Makan',merchant:'Friend'},settings);
 assert.equal(incomeStatement([meal,refund],'2026-10').income,0);assert.equal(incomeStatement([meal,refund],'2026-10').expenses,50000);assert.equal(transactionExpense(refund),-30000);
 assert.equal(budgetActual([meal,refund],'2026-10',{category:'Makan'}),50000);assert.equal(budgetActual([meal,refund],'2026-10',{category:'needs'}),50000);
 assert.equal(cashFlowStatement([meal,refund],'2026-10',settings).operatingInflow,30000);assert.equal(transactionPresentation(refund,settings.accounts).destinationLabel,'Mandiri');
 assert.equal(transactionPresentation(refund,settings.accounts).sign,'+');
 assert.deepEqual((await prepareTransactionEdit(refund,{description:'Meal share'},settings)).journal,refund.journal);
});
