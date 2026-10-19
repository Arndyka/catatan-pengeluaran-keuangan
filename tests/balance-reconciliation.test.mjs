import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransaction,DEFAULT_SETTINGS,deriveLedger,incomeStatement,cashFlowStatement} from '../assets/js/accounting.js';
import {confirmedCardSnapshot} from '../assets/js/credit-card.js';

test('confirmed unbilled installments are counted once, separately from the current bill',()=>{
 const s={cardAccountId:'card',issuerSnapshot:{accountId:'card',asOfDate:'2026-10-19',dueDate:'2026-10-28',currentBillIncluded:true,runningTotal:500.25,currentBill:300,availableCredit:99.5,remainingInstallments:1000,installmentsIncludedInRunningTotal:false,statementDate:'2026-10-08',minimumPayment:20,installmentThisMonth:125,installments:[{name:'Purchase A',monthly:125,tenor:10,billedCount:2,remainingPrincipal:1000}]}};
 const result=confirmedCardSnapshot(s,'2026-10-19');
 assert.equal(result.totalObligation,1500.25);assert.equal(result.unbilled,200.25);assert.equal(result.currentBill,300);assert.equal(result.remainingInstallments,1000);assert.equal(result.minimumPayment,20);assert.equal(result.installments.length,1);
 assert.equal(confirmedCardSnapshot({...s,issuerSnapshot:{...s.issuerSnapshot,installmentsIncludedInRunningTotal:true}},'2026-10-19').totalObligation,500.25);
 for(const value of [-1,NaN,'1000',null])assert.equal(confirmedCardSnapshot({...s,issuerSnapshot:{...s.issuerSnapshot,remainingInstallments:value}},'2026-10-19').remainingInstallments,null);
 const invalid=confirmedCardSnapshot({...s,issuerSnapshot:{...s.issuerSnapshot,minimumPayment:301,installments:[{name:'Broken',monthly:125,tenor:10,billedCount:2,remainingPrincipal:999}]}},'2026-10-19');
 assert.equal(invalid.minimumPayment,null);assert.deepEqual(invalid.installments,[]);
});
import {validatePaylaterPlan} from '../assets/js/paylater.js';
const base={type:'balance_adjustment',date:'2026-10-19',sourceAccountId:'asset-bca',amount:75.21,adjustmentDirection:'increase',description:'Confirmed balance reconciliation'};
test('confirmed balance corrections preserve profit and cash flow and reverse cleanly',async()=>{
 const up=await buildTransaction(base,DEFAULT_SETTINGS),down=await buildTransaction({...base,adjustmentDirection:'decrease'},DEFAULT_SETTINGS);
 assert.notEqual(up.id,down.id);
 assert.equal(deriveLedger([up]).accounts.find(a=>a.accountId==='asset-bca').balance,75.21);
 assert.equal(deriveLedger([down]).accounts.find(a=>a.accountId==='asset-bca').balance,-75.21);
 assert.equal(deriveLedger([up,down]).accounts.find(a=>a.accountId==='asset-bca').balance,0);
 for(const tx of [up,down]){assert.equal(incomeStatement([tx],'2026-10').netIncome,0);assert.equal(cashFlowStatement([tx],'2026-10',DEFAULT_SETTINGS).netCashFlow,0);}
 assert.equal(cashFlowStatement([down],'2026-10',DEFAULT_SETTINGS).balanceAdjustments,-75.21);
 assert.equal((await buildTransaction(base,DEFAULT_SETTINGS)).id,up.id);
});
test('liability reconciliation records debt, never purchases or payments',async()=>{
 const tx=await buildTransaction({...base,sourceAccountId:'liability-mandiri-cc'},DEFAULT_SETTINGS);
 assert.equal(deriveLedger([tx]).accounts.find(a=>a.accountId==='liability-mandiri-cc').balance,75.21);
 assert.equal(incomeStatement([tx],'2026-10').expenses,0);
 for(const patch of [{adjustmentDirection:''},{adjustmentDirection:'up'},{description:''},{sourceAccountId:'asset-transfer-clearing'}])await assert.rejects(buildTransaction({...base,...patch},DEFAULT_SETTINGS));
});
test('issuer snapshot separates included current bill without inferring a total credit limit',()=>{
 const settings={cardAccountId:'liability-mandiri-cc',issuerSnapshot:{accountId:'liability-mandiri-cc',asOfDate:'2026-10-19',runningTotal:500.25,currentBill:300,availableCredit:99.5,dueDate:'2026-10-28',currentBillIncluded:true}};
 const result=confirmedCardSnapshot(settings,'2026-10-19');
 assert.equal(result.unbilled,200.25);assert.equal(result.limit,null);assert.equal(result.runningTotal,500.25);
 assert.equal(confirmedCardSnapshot({...settings,limit:900,limitConfirmed:true},'2026-10-19').limit,900);
 assert.equal(confirmedCardSnapshot({...settings,limit:900},'2026-10-19').limit,null);
 assert.equal(confirmedCardSnapshot(settings,'2026-10-18'),null);
 assert.equal(confirmedCardSnapshot({...settings,cardAccountId:'different'},'2026-10-19'),null);
 assert.equal(confirmedCardSnapshot({...settings,issuerSnapshot:{...settings.issuerSnapshot,currentBill:501}},'2026-10-19'),null);
});
test('PayLater limit date does not move the original bill and payment boundary',()=>{
 const plan={accountId:'test',name:'Example',asOfDate:'2026-10-16',limitSnapshotDate:'2026-10-19',limit:200,availableLimit:50,bills:[{id:'a',period:'2026-09',dueDate:'2026-10-25',amount:120}]};
 assert.equal(validatePaylaterPlan(plan).asOfDate,'2026-10-16');
 assert.throws(()=>validatePaylaterPlan({...plan,limitSnapshotDate:'2026-02-30'}));
});
