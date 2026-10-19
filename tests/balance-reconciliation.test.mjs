import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransaction,DEFAULT_SETTINGS,deriveLedger,incomeStatement,cashFlowStatement} from '../assets/js/accounting.js';
import {confirmedCardSnapshot} from '../assets/js/credit-card.js';
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
