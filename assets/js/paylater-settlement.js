import {buildTransaction,validateJournal} from './accounting.js';
import {validatePaylaterPlan,paylaterSnapshot,paylaterPaymentInput,prepareLinkedPayment} from './paylater.js';
import {formatDateLocal} from './utils.js';
// Both storage adapters run this inside their serialized/atomic transaction.
export async function settlePaylater(io,billId,details,today=formatDateLocal()){
 const plan=validatePaylaterPlan(await io.getPlan()),settings=await io.getProfile();
 const bill=plan.bills.find(b=>b.id===billId);if(!bill)throw new Error('Tagihan tidak ditemukan.');
 const expected=details.expectedBill;
 if(!expected||expected.accountId!==plan.accountId||expected.asOfDate!==plan.asOfDate||expected.dueDate!==bill.dueDate||Number(expected.amount)!==bill.amount)throw new Error('Data tagihan berubah. Muat ulang dan periksa kembali sebelum mencatat pembayaran.');
 const opening=plan.openingTransactionId?await io.getTransaction(plan.openingTransactionId):null;
 if(!opening||opening.type!=='opening_balance'||opening.sourceAccountId!==plan.accountId||!validateJournal(opening.journal).valid||opening.date!==plan.asOfDate||Math.round(opening.amount*100)!==plan.bills.reduce((n,b)=>n+Math.round(b.amount*100),0))throw new Error('Saldo awal kewajiban belum tersedia. Periksa data PayLater sebelum mencatat pembayaran.');
 const priorId=plan.settlements?.[billId],prior=priorId?await io.getTransaction(priorId):null;
 if(prior){
  if(paylaterSnapshot(plan,[prior],today).bills.find(b=>b.id===billId)?.status!=='paid')throw new Error('Pembayaran tertaut perlu diperiksa sebelum membuat catatan baru.');
  return {created:false,duplicate:true,id:priorId,plan};
 }
 let tx,linked=false;
 if(details.existingTransactionId){
  const existing=await io.getTransaction(details.existingTransactionId);if(!existing)throw new Error('Transaksi pembayaran sudah tidak tersedia.');
  tx=await prepareLinkedPayment(plan,billId,existing,settings,today);linked=true;
 }else tx=await buildTransaction(paylaterPaymentInput(plan,billId,details,settings,today),settings);
 const collision=linked?null:await io.getTransaction(tx.id);
 if(collision&&paylaterSnapshot(plan,[collision],today).bills.find(b=>b.id===billId)?.status!=='paid')throw new Error('ID transaksi sudah digunakan oleh catatan lain.');
 const next={...plan,settlements:{...plan.settlements,[billId]:tx.id}};
 if(!collision)io.putTransaction(tx,linked);
 io.putPlan(next);
 return {created:!linked&&!collision,linked,duplicate:!!collision,id:tx.id,plan:next};
}
