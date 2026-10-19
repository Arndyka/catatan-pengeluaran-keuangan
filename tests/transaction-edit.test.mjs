import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransaction,DEFAULT_SETTINGS,deriveLedger,incomeStatement} from '../assets/js/accounting.js';
globalThis.location={search:'?demo=1'};
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const {initializeDemo,demoRepository:repo}=await import('../assets/js/demo.js');
const read=()=>JSON.parse(memory.get('spendly:demo:v1'));
const make=patch=>buildTransaction({type:'expense',date:'2026-09-15',amount:100,sourceAccountId:'asset-bca',merchant:'Edit test',...patch},DEFAULT_SETTINGS);

test('edit replaces one journal, preserves evidence, and rejects stale edits and duplicate creations',async()=>{
 await initializeDemo();const old=await make({sourceMeta:{fileHash:'example',page:1,row:1}});await repo.createTransactionPermanent('demo',old);
 const count=read().transactions.length;
 assert.equal(typeof repo.updateTransaction,'function');
 const result=await repo.updateTransaction('demo',old.id,{amount:125.25,description:'Corrected'},old);
 const next=read().transactions.find(t=>t.id===old.id);
 assert.equal(result.id,old.id);assert.equal(read().transactions.length,count);assert.equal(next.amount,125.25);
 assert.equal(next.journal.find(j=>j.accountId==='asset-bca').credit,125.25);
 assert.equal(next.sourceMeta.fileHash,'example');assert.equal(next.sourceMeta.userEdited,true);
 assert.equal(next.editOriginal.amount,100);
 await assert.rejects(repo.updateTransaction('demo',old.id,{amount:500},old),/berubah/);
 const corrected=await make({amount:125.25,description:'Corrected',sourceMeta:old.sourceMeta});
 assert.equal((await repo.createTransactionPermanent('demo',corrected)).duplicate,true);
 assert.equal((await repo.createTransactionPermanent('demo',old)).duplicate,true);
 await repo.deleteTransaction('demo',old.id);
 assert.equal((await repo.createTransactionPermanent('demo',corrected)).created,true);
});

test('opening balance remains baseline, correcting it does not count as income',async()=>{
 memory.clear();await initializeDemo();const opening=await make({type:'opening_balance',amount:1000,sourceAccountId:'asset-blu'});
 await repo.createTransactionPermanent('demo',opening);
 await repo.updateTransaction('demo',opening.id,{amount:1500},opening);
 const updated=read().transactions.find(t=>t.id===opening.id),income=await make({type:'income',amount:200,sourceAccountId:'asset-blu'}),expense=await make({amount:50,sourceAccountId:'asset-blu'});
 assert.equal(deriveLedger([updated,income,expense]).accounts.find(a=>a.accountId==='asset-blu').balance,1650);
 assert.equal(incomeStatement([updated,income,expense],'2026-09').income,200);
 await assert.rejects(repo.updateTransaction('demo',updated.id,{sourceAccountId:'asset-bca'},updated),/saldo awal/i);
 await assert.rejects(repo.updateTransaction('demo',updated.id,{amount:-1},updated));
});

test('linked recurring receipt cannot move to another account or period',async()=>{
 const rule={kind:'subscription',name:'Editor music',type:'credit_purchase',amount:100,sourceAccountId:'liability-mandiri-cc',dayOfMonth:12,startDate:'2026-09-01',active:true};
 const ruleId=await repo.saveRecurringRule('demo',rule),tx=await make({...rule,date:'2026-09-12',recurringRuleId:ruleId});
 await repo.settleRecurringOccurrence('demo',ruleId,'2026-09',{transactionData:tx});
 const old=read().transactions.find(t=>t.id===tx.id);
 await assert.rejects(repo.updateTransaction('demo',tx.id,{date:'2026-08-12'},old),/periode/);
 await repo.updateTransaction('demo',tx.id,{amount:120},old);
 assert.equal(read().recurring.find(r=>r.id===ruleId).settledPeriods['2026-09'],tx.id);
});

test('PayLater-linked entries allow text corrections but protect bill amounts',async()=>{
 const tx=await make({type:'credit_payment',sourceAccountId:'asset-bca',destinationAccountId:'liability-mandiri-cc',sourceMeta:{paylaterBillId:'example-bill'}});
 await repo.createTransactionPermanent('demo',tx);
 await repo.updateTransaction('demo',tx.id,{description:'Corrected note'},tx);
 const saved=read().transactions.find(t=>t.id===tx.id);
 assert.equal(saved.description,'Corrected note');assert.deepEqual(saved.journal,tx.journal);
 await assert.rejects(repo.updateTransaction('demo',tx.id,{amount:101},saved),/PayLater/);
});

test('failed local storage and competing edits do not silently replace saved money',async()=>{
 const tx=await make({merchant:'Storage test'});await repo.createTransactionPermanent('demo',tx);
 const before=memory.get('spendly:demo:v1'),save=localStorage.setItem;
 localStorage.setItem=()=>{throw new Error('Storage full');};
 await assert.rejects(repo.updateTransaction('demo',tx.id,{amount:500},tx),/Storage full/);
 localStorage.setItem=save;assert.equal(memory.get('spendly:demo:v1'),before);
 const results=await Promise.allSettled([repo.updateTransaction('demo',tx.id,{amount:200},tx),repo.updateTransaction('demo',tx.id,{amount:300},tx)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(read().transactions.find(t=>t.id===tx.id).amount,200);
});
