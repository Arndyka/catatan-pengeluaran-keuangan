import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransaction,DEFAULT_SETTINGS,deriveLedger,incomeStatement,cashFlowStatement} from '../assets/js/accounting.js';
import {prepareTransactionEdit} from '../assets/js/transaction-edit.js';
import {dailyAllowance} from '../assets/js/finance-insights.js';
import {budgetActual} from '../assets/js/budget.js';
import {loanSchedule} from '../assets/js/loans.js';
const settings={...structuredClone(DEFAULT_SETTINGS),accounts:[...DEFAULT_SETTINGS.accounts,{id:'loan-test',name:'Pinjaman uji',type:'liability',subtype:'loan',active:true}]};
const input={type:'loan_disbursement',date:'2026-10-21',amount:990000,sourceAccountId:'asset-krom',destinationAccountId:'loan-test',category:'Biaya Pinjaman',sourceMeta:{loanId:'loan-demo',loanPrincipal:1000000,disbursementFee:10000}};
test('loan disbursement increases cash net of fees and principal debt without income',async()=>{
 const tx=await buildTransaction(input,settings);const ledger=deriveLedger([tx]);
 assert(ledger.balanced);assert.equal(ledger.accounts.find(a=>a.accountId==='asset-krom').balance,990000);assert.equal(ledger.accounts.find(a=>a.accountId==='loan-test').balance,1000000);
 assert.equal(incomeStatement([tx],'2026-10').income,0);assert.equal(incomeStatement([tx],'2026-10').expenses,10000);
 const flow=cashFlowStatement([tx],'2026-10',settings);assert.equal(flow.financingInflow,990000);assert.equal(flow.otherNet,0);assert.equal(flow.netCashFlow,990000);
 const edited=await prepareTransactionEdit(tx,{description:'Rincian diperiksa'},settings);
 assert.deepEqual(edited.journal,tx.journal);assert.equal(edited.destinationAccountId,'loan-test');
 await assert.rejects(prepareTransactionEdit(tx,{amount:1},settings));
});
test('loan drawdown requires exact principal fee net arithmetic and a loan liability',async()=>{
 for(const patch of [{destinationAccountId:'asset-bca'},{destinationAccountId:'liability-mandiri-cc'},{sourceMeta:{loanPrincipal:1000000,disbursementFee:20000}},{sourceMeta:{loanPrincipal:1000000,disbursementFee:-1}},{sourceMeta:{loanPrincipal:Infinity,disbursementFee:0}}])await assert.rejects(buildTransaction({...input,...patch},settings));
});
test('loan schedule keeps future fees separate and rejects inconsistent or duplicate installments',()=>{
 const plan={id:'test',accountId:'loan-test',name:'Pinjaman contoh',date:'2026-10-21',principal:1000000,disbursementFee:10000,installmentFee:60000,bills:[{id:'a',dueDate:'2026-11-21',amount:530000},{id:'b',dueDate:'2026-12-21',amount:530000}]};
 const schedule=loanSchedule(plan);assert.equal(schedule.total,1060000);assert.equal(schedule.received,990000);
 assert.throws(()=>loanSchedule({...plan,installmentFee:1}));assert.throws(()=>loanSchedule({...plan,bills:[plan.bills[0],plan.bills[0]]}));
});

test('loan fee consumes spending allowance and category budget without counting principal',async()=>{
 const tx=await buildTransaction(input,settings);
 const allowance=dailyAllowance([tx],2000000,'2026-10-21');
 assert.equal(allowance.spent,10000);assert.equal(allowance.todaySpent,10000);
 assert.equal(budgetActual([tx],'2026-10',{category:'Biaya Pinjaman'}),10000);
 await assert.rejects(prepareTransactionEdit(tx,{category:'Administrasi'},settings));
});
