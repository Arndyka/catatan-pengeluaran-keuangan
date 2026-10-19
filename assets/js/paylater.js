import {buildTransaction,validateJournal} from './accounting.js';
import {validDate} from './recurring-logic.js';
import {formatDateLocal} from './utils.js';
const cents=value=>Math.round(Number(value)*100);
const validMoney=value=>Number.isFinite(Number(value))&&Number(value)>=0&&Number.isSafeInteger(cents(value))&&Math.abs(Number(value)*100-cents(value))<0.0001;
export const DEFAULT_PAYLATER={version:1,bills:[]};
export function validatePaylaterPlan(input){
 if(!input)throw new Error('Data PayLater belum tersedia.');
 const plan={...input,name:String(input.name||'').trim(),limit:Number(input.limit),availableLimit:Number(input.availableLimit)};
 if(!plan.accountId||!plan.name||!validDate(plan.asOfDate)||!validMoney(plan.limit)||!validMoney(plan.availableLimit)||plan.availableLimit>plan.limit)throw new Error('Periksa nama, tanggal data, limit, dan sisa limit PayLater.');
 if(plan.limitSnapshotDate&&(!validDate(plan.limitSnapshotDate)||plan.limitSnapshotDate<plan.asOfDate))throw new Error('Tanggal pembaruan limit PayLater tidak valid.');
 if(!Array.isArray(plan.bills)||!plan.bills.length)throw new Error('Isi setidaknya satu tagihan PayLater.');
 const ids=new Set();
 plan.bills=plan.bills.map(b=>{if(!b.id||ids.has(b.id)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.period)||!validDate(b.dueDate)||!validMoney(b.amount)||Number(b.amount)<=0)throw new Error('ID tagihan harus unik; periksa periode, jatuh tempo, dan nominal.');ids.add(b.id);return {...b,amount:Number(b.amount)};});
 return plan;
}
const fundingAccount=(settings,id)=>settings.accounts.find(a=>a.id===id&&a.active!==false&&a.type==='asset'&&['bank','cash','ewallet'].includes(a.subtype));
function billFor(plan,id){const bill=plan.bills.find(b=>b.id===id);if(!bill)throw new Error('Tagihan PayLater tidak ditemukan.');return bill;}
function validPayment(tx,plan,bill,today){
 return tx.type==='credit_payment'&&tx.destinationAccountId===plan.accountId&&tx.sourceMeta?.paylaterBillId===bill.id&&tx.sourceMeta?.paylaterAccountId===plan.accountId&&validDate(tx.date)&&tx.date>=plan.asOfDate&&tx.date<=today&&Number(tx.amount)>0&&validateJournal(tx.journal).valid&&tx.journal.filter(j=>j.accountId===plan.accountId).reduce((n,j)=>n+cents(j.debit)-cents(j.credit),0)===cents(tx.amount);
}
export function paylaterSnapshot(input,transactions=[],today=formatDateLocal()){
 const plan=validatePaylaterPlan(input);
 const bills=plan.bills.map(b=>{
  const payments=transactions.filter(tx=>validPayment(tx,plan,b,today));
  const paid=payments.reduce((n,t)=>n+cents(t.amount),0),amount=cents(b.amount),remaining=Math.max(0,amount-paid)/100;
  return {...b,paid:paid/100,remaining,payments,status:paid>amount?'review':paid===amount?'paid':'unpaid',daysUntilDue:Math.round((Date.parse(b.dueDate+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000)};
 }).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id));
 const total=plan.bills.reduce((n,b)=>n+cents(b.amount),0)/100,usedLimit=(cents(plan.limit)-cents(plan.availableLimit))/100;
 return {...plan,bills,total,usedLimit,limitDifference:(cents(total)-cents(usedLimit))/100,outstanding:bills.reduce((n,b)=>n+cents(b.remaining),0)/100,overdue:bills.filter(b=>b.dueDate<today).reduce((n,b)=>n+cents(b.remaining),0)/100,next:bills.find(b=>b.remaining>0)||null,paidCount:bills.filter(b=>b.status==='paid').length};
}
export function paylaterPaymentInput(input,billId,details,settings,today=formatDateLocal()){
 const plan=validatePaylaterPlan(input),bill=billFor(plan,billId);
 if(!validDate(details.date)||details.date<plan.asOfDate||details.date>today)throw new Error('Tanggal pembayaran harus sudah terjadi dan tidak sebelum tanggal data awal.');
 if(!fundingAccount(settings,details.sourceAccountId))throw new Error('Pilih rekening bank, tunai, atau dompet digital yang aktif.');
 if(!settings.accounts.some(a=>a.id===plan.accountId&&a.type==='liability'&&a.subtype==='paylater'&&a.active!==false))throw new Error('Akun PayLater tidak aktif atau belum tersedia.');
 return {type:'credit_payment',date:details.date,amount:bill.amount,sourceAccountId:details.sourceAccountId,destinationAccountId:plan.accountId,category:'Pembayaran PayLater',merchant:plan.name,description:`Pembayaran ${plan.name} · jatuh tempo ${bill.dueDate}`,origin:'paylater-payment',importIdentity:`paylater:${plan.accountId}:${bill.id}`,sourceMeta:{paylaterBillId:bill.id,paylaterAccountId:plan.accountId,paylaterDueDate:bill.dueDate,categoryReviewed:false,pendingAllocation:''}};
}
export function paymentMatches(plan,billId,transactions,settings,today=formatDateLocal()){
 const bill=billFor(plan,billId);
 return transactions.filter(t=>{
  if(t.sourceMeta?.paylaterBillId||t.recurringRuleId||cents(t.amount)!==cents(bill.amount)||!validDate(t.date)||t.date<plan.asOfDate||t.date>today||!fundingAccount(settings,t.sourceAccountId)||!validateJournal(t.journal).valid)return false;
  const eligible=t.type==='expense'||(t.type==='credit_payment'&&t.destinationAccountId===plan.accountId)||(t.type==='transfer'&&settings.accounts.some(a=>a.id===t.destinationAccountId&&a.subtype==='clearing'));
  return eligible&&t.journal.filter(j=>j.accountId===t.sourceAccountId).reduce((n,j)=>n+cents(j.credit)-cents(j.debit),0)===cents(t.amount);
 });
}
export async function prepareLinkedPayment(plan,billId,existing,settings,today=formatDateLocal()){
 if(!paymentMatches(plan,billId,[existing],settings,today).length)throw new Error('Transaksi tidak cocok atau sudah ditautkan ke jadwal lain.');
 const input=paylaterPaymentInput(plan,billId,existing,settings,today);
 // Keep source-row identity when the reviewed accounting type changes.
 const meta=existing.sourceMeta||{},aliases=[...(meta.provenanceAliases||[])];
 const proof={fileHash:existing.sourceHash||meta.fileHash,page:existing.sourcePage||meta.page,row:existing.sourceRow||meta.row};
 if(proof.fileHash&&proof.page&&proof.row&&!aliases.some(a=>a.fileHash===proof.fileHash&&a.page===proof.page&&a.row===proof.row))aliases.push(proof);
 const tx=await buildTransaction({...input,description:existing.description||input.description,sourceMeta:{...meta,...input.sourceMeta,provenanceAliases:aliases,previousClassification:existing.type},externalBalance:existing.externalBalance,validationStatus:'user-confirmed-paylater'},settings);
 return {...existing,...tx,id:existing.id,fingerprint:existing.fingerprint,createdAtClient:existing.createdAtClient};
}
