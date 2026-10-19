import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={search:'?demo=1'};
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const {initializeDemo,demoRepository:repo,DEMO_UID}=await import('../assets/js/demo.js');
const {buildTransaction,DEFAULT_SETTINGS}=await import('../assets/js/accounting.js');
await initializeDemo();

test('deleting an actual legacy routine reopens only its period',async()=>{
 const rule={name:'Legacy',type:'income',amount:100,sourceAccountId:'asset-bca',dayOfMonth:1,startDate:'2026-01-01',lastPostedPeriod:'2026-10',active:true};
 const id=await repo.saveRecurringRule(DEMO_UID,rule),tx=await buildTransaction({...rule,date:'2026-10-01',recurringRuleId:id},DEFAULT_SETTINGS);
 await repo.createTransactionPermanent(DEMO_UID,tx);await repo.deleteTransaction(DEMO_UID,tx.id);
 const {isSettled}=await import('../assets/js/recurring-logic.js');
 const stored=JSON.parse(memory.get('spendly:demo:v1')).recurring.find(r=>r.id===id);
 assert.equal(isSettled(stored,'2026-10'),false);assert.equal(isSettled(stored,'2026-09'),true);
 const result=await repo.settleRecurringOccurrence(DEMO_UID,id,'2026-10',{transactionData:tx});assert.equal(result.created,true);
});
test('settling salary is atomic and idempotent; imported salary can be linked without a new journal',async()=>{
 const date='2026-10-01',period='2026-10';
 const rule={kind:'salary',name:'Gaji test',type:'income',amount:1234567,sourceAccountId:'asset-bca',category:'Gaji',dayOfMonth:1,startDate:date,active:true};
 const id=await repo.saveRecurringRule(DEMO_UID,rule);
 const tx=await buildTransaction({...rule,date,recurringRuleId:id,recurringPeriod:period},DEFAULT_SETTINGS);
 const results=await Promise.all([repo.settleRecurringOccurrence(DEMO_UID,id,period,{transactionData:tx}),repo.settleRecurringOccurrence(DEMO_UID,id,period,{transactionData:tx})]);
 assert.equal(results.filter(r=>r.created).length,1);assert.equal(results.filter(r=>r.duplicate).length,1);
 const id2=await repo.saveRecurringRule(DEMO_UID,{...rule,name:'Gaji scan'});
 const imported=await buildTransaction({...rule,date,merchant:'Payroll hasil scan'},DEFAULT_SETTINGS);await repo.createTransactionPermanent(DEMO_UID,imported);
 const before=JSON.parse(memory.get('spendly:demo:v1')).transactions.length;
 const linked=await repo.settleRecurringOccurrence(DEMO_UID,id2,period,{existingTransactionId:imported.id});
 assert.equal(linked.linked,true);assert.equal(JSON.parse(memory.get('spendly:demo:v1')).transactions.length,before);
 await repo.deleteTransaction(DEMO_UID,tx.id);
 const reopened=JSON.parse(memory.get('spendly:demo:v1')).recurring.find(r=>r.id===id);
 assert.equal(reopened.settledPeriods[period],undefined);
 const restored=await repo.settleRecurringOccurrence(DEMO_UID,id,period,{transactionData:tx});assert.equal(restored.created,true);
 await assert.rejects(repo.settleRecurringOccurrence(DEMO_UID,'missing',period,{transactionData:tx}));
});

test('advanced payday links one receipt to its nominal month and deleting it reopens that month',async()=>{
 const rule={kind:'salary',name:'Gaji Januari',type:'income',amount:7654321,sourceAccountId:'asset-bca',category:'Gaji',dayOfMonth:1,startDate:'2022-12-01',active:true};
 const id=await repo.saveRecurringRule(DEMO_UID,rule);
 const receipt=await buildTransaction({...rule,date:'2022-12-30',merchant:'Payroll Januari'},DEFAULT_SETTINGS);
 await repo.createTransactionPermanent(DEMO_UID,receipt);
 const read=()=>JSON.parse(memory.get('spendly:demo:v1'));
 const before=read().transactions.length;
 assert.equal((await repo.settleRecurringOccurrence(DEMO_UID,id,'2023-01',{existingTransactionId:receipt.id})).linked,true);
 const stored=read().transactions.find(tx=>tx.id===receipt.id);
 assert.equal(stored.date,'2022-12-30');assert.equal(stored.sourceMeta.recurringPeriod,'2023-01');assert.equal(read().transactions.length,before);
 assert.equal((await repo.settleRecurringOccurrence(DEMO_UID,id,'2023-01',{existingTransactionId:receipt.id})).duplicate,true);
 await assert.rejects(repo.settleRecurringOccurrence(DEMO_UID,id,'2022-12',{existingTransactionId:receipt.id}),/periode lain/);
 await repo.deleteTransaction(DEMO_UID,receipt.id);
 const saved=read().recurring.find(r=>r.id===id);
 assert.equal(saved.settledPeriods['2023-01'],undefined);assert.equal(saved.reopenedPeriods['2023-01'],true);assert.equal(saved.reopenedPeriods['2022-12'],undefined);
});
test('a new advance salary preserves its nominal period through transaction construction',async()=>{
 const {confirmOccurrence}=await import('../assets/js/recurring.js');
 const rule={kind:'salary',name:'Gaji awal tahun',type:'income',amount:3456789,sourceAccountId:'asset-bca',category:'Gaji',dayOfMonth:1,startDate:'2022-12-01',active:true};
 const id=await repo.saveRecurringRule(DEMO_UID,rule);
 const result=await confirmOccurrence(DEMO_UID,{...rule,id},'2023-01',DEFAULT_SETTINGS,{date:'2022-12-30',amount:rule.amount});
 assert.equal(result.created,true);
 const saved=JSON.parse(memory.get('spendly:demo:v1')).transactions.find(t=>t.id===result.id);
 assert.equal(saved.date,'2022-12-30');assert.equal(saved.sourceMeta.recurringPeriod,'2023-01');
});
