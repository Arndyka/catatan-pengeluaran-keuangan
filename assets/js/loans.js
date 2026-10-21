import {validDate} from './recurring-logic.js';
const cents=n=>Math.round(n*100);
const money=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&Number.isSafeInteger(cents(n))&&Math.abs(n*100-cents(n))<.0001;
// Contract amounts are a schedule, not a second journal or an accrued fee.
export function loanSchedule(plan){
 if(!plan?.id||!plan.accountId||!plan.name||!validDate(plan.date)||![plan.principal,plan.disbursementFee,plan.installmentFee].every(money)||plan.principal<=plan.disbursementFee||!Array.isArray(plan.bills)||!plan.bills.length)throw new Error('Rincian pinjaman belum lengkap.');
 const ids=new Set();let total=0;
 for(const bill of plan.bills){
  if(!bill.id||ids.has(bill.id)||!validDate(bill.dueDate)||bill.dueDate<plan.date||!money(bill.amount)||!bill.amount)throw new Error('Periksa jadwal dan nominal cicilan pinjaman.');
  ids.add(bill.id);total+=cents(bill.amount);
 }
 if(total!==cents(plan.principal)+cents(plan.installmentFee))throw new Error('Total cicilan tidak sama dengan pokok dan biaya cicilan.');
 return {...plan,bills:[...plan.bills].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),total:total/100,received:(cents(plan.principal)-cents(plan.disbursementFee))/100};
}
