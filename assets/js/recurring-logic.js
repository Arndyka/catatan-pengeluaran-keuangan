import {formatDateLocal} from './utils.js';
export const isSalaryRule=rule=>rule.kind==='salary'||(!rule.kind&&rule.type==='income'&&/gaji|salary|payroll/i.test([rule.name,rule.category].join(' ')));
export const salaryWeekendPolicy=rule=>isSalaryRule(rule)?(rule.weekendPolicy||'previous_weekday'):'none';
export function recurringReceiptInPeriod(receipt,candidate){
 const month=candidate.date?.slice(0,7);
 return !!month&&(receipt.date?.slice(0,7)===month||(receipt.sourceMeta?.recurringPeriod||receipt.recurringPeriod)===month);
}
export function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function validateRecurringRule(input,accounts){
 const rule={...input,name:String(input.name||'').trim(),amount:Number(input.amount),dayOfMonth:Number(input.dayOfMonth)};
 if(!rule.name||rule.name.length>100)throw new Error('Nama aturan wajib diisi, maksimal 100 karakter.');
 if(!Number.isFinite(rule.amount)||rule.amount<=0||!Number.isInteger(rule.dayOfMonth)||rule.dayOfMonth<1||rule.dayOfMonth>31)throw new Error('Nominal harus positif dan tanggal bulanan antara 1–31.');
 if(!validDate(rule.startDate)||(rule.endDate&&(!validDate(rule.endDate)||rule.endDate<rule.startDate)))throw new Error('Rentang tanggal aturan tidak valid.');
 if(!['income','expense','transfer','credit_payment','investment'].includes(rule.type))throw new Error('Jenis transaksi rutin tidak valid.');
 const source=accounts.find(a=>a.id===rule.sourceAccountId&&a.active!==false);
 if(!source||source.type!=='asset')throw new Error('Pilih rekening sumber/penerima aset yang aktif.');
 if(rule.kind==='salary'){rule.type='income';rule.category='Gaji';rule.destinationAccountId='';}
 if(rule.weekendPolicy!=null&&!['none','previous_weekday'].includes(rule.weekendPolicy))throw new Error('Pilih aturan akhir pekan yang valid.');
 rule.weekendPolicy=salaryWeekendPolicy(rule);
 if(['transfer','investment','credit_payment'].includes(rule.type)){
  const target=accounts.find(a=>a.id===rule.destinationAccountId&&a.active!==false);
  if(!target||target.id===source.id)throw new Error('Pilih rekening tujuan aktif yang berbeda.');
  if((rule.type==='credit_payment'&&(target.type!=='liability'||!['credit_card','paylater'].includes(target.subtype)))||(rule.type!=='credit_payment'&&target.type!=='asset')||(rule.type==='investment'&&target.subtype!=='investment'))throw new Error('Jenis akun tujuan tidak sesuai.');
 }else rule.destinationAccountId='';
 return rule;
}
export function occurrenceForMonth(rule,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!validDate(rule.startDate))return null;
 const [year,m]=month.split('-').map(Number),day=Math.max(1,Math.min(Number(rule.dayOfMonth)||1,new Date(Date.UTC(year,m,0)).getUTCDate()));
 const nominalDate=`${month}-${String(day).padStart(2,'0')}`,paymentDate=new Date(nominalDate+'T12:00:00Z');
 if(salaryWeekendPolicy(rule)==='previous_weekday'){
  const weekday=paymentDate.getUTCDay();
  if(weekday===6||weekday===0)paymentDate.setUTCDate(paymentDate.getUTCDate()-(weekday===6?1:2));
 }
 const date=paymentDate.toISOString().slice(0,10);
 if(date<rule.startDate||(rule.endDate&&date>rule.endDate))return null;
 return {periodKey:month,nominalDate,date};
}
export function settlementDateRange(rule,month){
 const occurrence=occurrenceForMonth(rule,month);if(!occurrence)return null;
 const [year,m]=month.split('-').map(Number),lastDate=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
 // A payday moved into the previous month still belongs to its nominal salary period.
 const firstDate=occurrence.date<month+'-01'?occurrence.date:month+'-01';
 return {from:rule.startDate>firstDate?rule.startDate:firstDate,to:rule.endDate&&rule.endDate<lastDate?rule.endDate:lastDate};
}
export function isSettled(rule,month){return !!rule.settledPeriods?.[month]||(!rule.reopenedPeriods?.[month]&&!!(rule.lastPostedPeriod&&month<=rule.lastPostedPeriod));}
export function reopenRecurringTransaction(rule,tx,id){
 const settledPeriods={...rule.settledPeriods},reopenedPeriods={...rule.reopenedPeriods};
 for(const [period,txId] of Object.entries(settledPeriods))if(txId===id){delete settledPeriods[period];reopenedPeriods[period]=true;}
 const period=tx.sourceMeta?.recurringPeriod||tx.date?.slice(0,7);
 if(period&&rule.lastPostedPeriod&&period<=rule.lastPostedPeriod)reopenedPeriods[period]=true;
 return {settledPeriods,reopenedPeriods};
}
export function dueOccurrences(rule,throughDate=new Date()){
 if(rule.active===false||!validDate(rule.startDate))return [];
 const today=formatDateLocal(throughDate),cursor=new Date(rule.startDate.slice(0,7)+'-01T12:00:00Z'),limit=new Date(today.slice(0,7)+'-01T12:00:00Z'),rows=[];
 limit.setUTCMonth(limit.getUTCMonth()+1);
 while(cursor<=limit){
  const month=cursor.toISOString().slice(0,7),o=occurrenceForMonth(rule,month);
  if(o&&o.date<=today&&!isSettled(rule,month))rows.push(o);
  cursor.setUTCMonth(cursor.getUTCMonth()+1);
 }
 return rows;
}
function receiptPeriodConflict(rule,month,tx){
 const assigned=Object.entries(rule.settledPeriods||{}).filter(([,id])=>tx.id&&id===tx.id).map(([period])=>period);
 const declared=tx.sourceMeta?.recurringPeriod||tx.recurringPeriod;
 if(declared)assigned.push(declared);
 // Legacy linked receipts belonged to their calendar month unless an explicit link says otherwise.
 if(!assigned.length&&tx.recurringRuleId)assigned.push(tx.date?.slice(0,7));
 return assigned.some(period=>period!==month);
}
export function recurringMatches(rule,month,transactions){
 const range=settlementDateRange(rule,month);if(!range)return [];
 return transactions.filter(tx=>tx.type===rule.type&&tx.sourceAccountId===rule.sourceAccountId&&(tx.destinationAccountId||'')===(rule.destinationAccountId||'')&&validDate(tx.date)&&tx.date>=range.from&&tx.date<=range.to&&(!tx.recurringRuleId||tx.recurringRuleId===rule.id)&&!receiptPeriodConflict(rule,month,tx)&&
  (tx.recurringRuleId===rule.id||Number(tx.amount)===Number(rule.amount)||(isSalaryRule(rule)&&/gaji|payroll|salary/i.test([tx.category,tx.merchant,tx.description].join(' ')))));
}
export function validateSettlement(rule,month,tx,today=formatDateLocal()){
 if(!rule||rule.active===false||!occurrenceForMonth(rule,month))throw new Error('Jadwal tidak aktif atau periode tidak berlaku.');
 const range=settlementDateRange(rule,month);
 if(!validDate(tx.date)||tx.date>today||tx.date<range.from||tx.date>range.to)throw new Error('Tanggal penerimaan harus sudah terjadi dan berada dalam periode jadwal.');
 if(tx.type!==rule.type||tx.sourceAccountId!==rule.sourceAccountId||Number(tx.amount)<=0||!Number.isFinite(Number(tx.amount)))throw new Error('Transaksi tidak cocok dengan jenis atau rekening jadwal.');
 if(['transfer','investment','credit_payment'].includes(rule.type)&&tx.destinationAccountId!==rule.destinationAccountId)throw new Error('Rekening tujuan tidak cocok dengan jadwal.');
 if(tx.recurringRuleId&&tx.recurringRuleId!==rule.id)throw new Error('Transaksi sudah terhubung ke jadwal lain.');
 if(receiptPeriodConflict(rule,month,tx))throw new Error('Transaksi sudah terhubung ke periode lain.');
}
