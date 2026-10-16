import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaylaterPlan,paylaterSnapshot,paylaterPaymentInput,paymentMatches,prepareLinkedPayment} from '../assets/js/paylater.js';
import {buildTransaction,DEFAULT_SETTINGS,balanceSheet,incomeStatement} from '../assets/js/accounting.js';
import {creditCardSnapshot} from '../assets/js/credit-card.js';
import {matchImport} from '../assets/js/import-reconciliation.js';
const settings={...DEFAULT_SETTINGS,accounts:[...DEFAULT_SETTINGS.accounts,{id:'liability-paylater-test',name:'PayLater contoh',type:'liability',subtype:'paylater',active:true}]};
const plan={accountId:'liability-paylater-test',name:'PayLater contoh',asOfDate:'2026-10-16',limit:1000,availableLimit:507,bills:[{id:'bill-1',period:'2026-09',dueDate:'2026-10-25',amount:300},{id:'bill-2',period:'2026-10',dueDate:'2026-11-25',amount:200}]};
test('rescanning a linked expense or clearing payment preserves duplicate detection',async()=>{
 for(const type of ['expense','transfer']){
  const raw=await buildTransaction({type,date:'2026-10-16',amount:300,sourceAccountId:'asset-bca',destinationAccountId:type==='transfer'?'asset-transfer-clearing':'',sourceMeta:{bank:'bca',fileHash:'proof',page:1,row:2,provenanceAliases:[{fileHash:'other-copy',page:1,row:2}]}},settings);
  const linked=await prepareLinkedPayment(plan,'bill-1',raw,settings,'2026-10-16');
  assert.equal(matchImport(raw,[linked]).status,'duplicate');
  assert.equal(matchImport({...raw,sourceMeta:{...raw.sourceMeta,fileHash:'other-copy'}},[linked]).status,'duplicate');
  assert.equal(matchImport({...raw,amount:301},[linked]).status,'review');
  assert.equal(matchImport({...raw,sourceMeta:{fileHash:'different-proof',page:1,row:2}},[linked]).status,'new');
 }
});
test('paylater schedule preserves amounts, due dates and separate issuer limit figures',()=>{
 const s=paylaterSnapshot(validatePaylaterPlan(plan),[],'2026-10-16');
 assert.equal(s.total,500);assert.equal(s.outstanding,500);assert.equal(s.usedLimit,493);assert.equal(s.limitDifference,7);assert.equal(s.next.dueDate,'2026-10-25');assert.equal(s.bills[0].daysUntilDue,9);
 assert.equal(paylaterSnapshot(plan,[],'2026-10-26').overdue,300);
 assert.equal(paylaterSnapshot(plan,[],'2026-10-25').overdue,0);
 for(const patch of [{availableLimit:1001},{asOfDate:'2026-02-30'},{bills:[plan.bills[0],plan.bills[0]]},{bills:[{...plan.bills[0],amount:-1}]},{bills:[{...plan.bills[0],dueDate:'2026-02-30'}]}])assert.throws(()=>validatePaylaterPlan({...plan,...patch}));
});
test('opening payable creates debt only; paying reduces cash and debt without second expense or Mandiri effects',async()=>{
 const opening=await buildTransaction({type:'opening_balance',date:plan.asOfDate,amount:500,sourceAccountId:plan.accountId},settings);
 const input=paylaterPaymentInput(plan,'bill-1',{sourceAccountId:'asset-bca',date:'2026-10-16'},settings,'2026-10-16');
 const payment=await buildTransaction(input,settings);const txs=[opening,payment];
 assert.equal(balanceSheet(txs).liabilities,200);assert.equal(balanceSheet(txs).assets,-300);assert.equal(incomeStatement(txs,'2026-10').expenses,0);
 assert.equal(creditCardSnapshot(txs,{cardAccountId:'liability-mandiri-cc',limit:1000}).used,0);
 const snapshot=paylaterSnapshot(plan,txs,'2026-10-16');assert.equal(snapshot.outstanding,200);assert.equal(snapshot.bills[0].status,'paid');assert.equal(snapshot.next.id,'bill-2');assert.equal(snapshot.availableLimit,507);
 assert.equal(paylaterSnapshot(plan,txs,'2026-10-15').outstanding,500);
 assert.equal(paylaterSnapshot(plan,[opening],'2026-10-16').bills[0].status,'unpaid');
});
test('payments reject future dates, wrong accounts and cannot infer fees or a minimum payment',()=>{
 for(const patch of [{date:'2026-11-01'},{date:'2026-10-15'},{sourceAccountId:plan.accountId},{sourceAccountId:'asset-transfer-clearing'},{sourceAccountId:'asset-investment'}])assert.throws(()=>paylaterPaymentInput(plan,'bill-1',{date:'2026-10-16',sourceAccountId:'asset-bca',...patch},settings,'2026-10-16'));
 assert.throws(()=>paylaterPaymentInput(plan,'missing',{date:'2026-10-16',sourceAccountId:'asset-bca'},settings,'2026-10-16'));
 assert.equal(paylaterSnapshot(plan,[]).minimumPayment,undefined);
});
test('linking a bank payment reclassifies the same journal instead of reducing cash twice',async()=>{
 const raw=await buildTransaction({type:'expense',date:'2026-10-16',amount:300,sourceAccountId:'asset-bca',category:'Lainnya',sourceMeta:{fileHash:'proof',pendingAllocation:'unknown'}},settings);
 assert.equal(paymentMatches(plan,'bill-1',[raw],settings,'2026-10-16').length,1);
 const linked=await prepareLinkedPayment(plan,'bill-1',raw,settings,'2026-10-16');
 assert.equal(linked.id,raw.id);assert.equal(linked.fingerprint,raw.fingerprint);assert.equal(linked.amount,raw.amount);assert.equal(linked.sourceMeta.fileHash,'proof');assert.equal(linked.sourceMeta.pendingAllocation,'');
 assert.equal(balanceSheet([raw]).assets,balanceSheet([linked]).assets);assert.equal(linked.type,'credit_payment');
 assert.equal(paylaterSnapshot(plan,[linked],'2026-10-16').bills[0].status,'paid');
 assert.equal(paymentMatches(plan,'bill-2',[linked],settings,'2026-10-16').length,0);
 await assert.rejects(()=>prepareLinkedPayment(plan,'bill-2',linked,settings,'2026-10-16'));
 for(const patch of [{amount:301},{date:'2026-10-15'},{type:'income'},{sourceMeta:{paylaterBillId:'other'}}])assert.equal(paymentMatches(plan,'bill-1',[{...raw,...patch}],settings,'2026-10-16').length,0);
});
