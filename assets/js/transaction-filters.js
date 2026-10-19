import {journalEntries} from './accounting.js';
import {formatDateLocal} from './utils.js';
const touches=(t,id)=>t.sourceAccountId===id||t.destinationAccountId===id||journalEntries(t.journal).some(j=>j.accountId===id);
export const historyAccounts=(accounts,transactions)=>accounts.filter(a=>a.active!==false||transactions.some(t=>touches(t,a.id)));
export function filterTransactions(transactions,filter={},accounts=[]){
 const names=new Map(accounts.map(a=>[a.id,a.name])),search=String(filter.search||'').trim().toLocaleLowerCase('id');
 return transactions.filter(t=>(!filter.accountId||filter.accountId==='all'||touches(t,filter.accountId))&&(!filter.type||filter.type==='all'||t.type===filter.type)&&(!filter.from||t.date>=filter.from)&&(!filter.to||t.date<=filter.to)&&(!search||[t.date,t.category,t.merchant,t.description,names.get(t.sourceAccountId),names.get(t.destinationAccountId)].join(' ').toLocaleLowerCase('id').includes(search)));
}
export function accountActivity(transactions,accountId,today=formatDateLocal()){
 let inflow=0,outflow=0,adjustments=0;
 for(const t of transactions){
  if(!t.date||t.date>today)continue;
  const delta=journalEntries(t.journal).filter(j=>j.accountId===accountId).reduce((n,j)=>n+Math.round(j.debit*100)-Math.round(j.credit*100),0);
  if(['opening_balance','balance_adjustment'].includes(t.type)){adjustments+=delta;continue;}
  if(delta>0)inflow+=delta;else outflow-=delta;
 }
 return {inflow:inflow/100,outflow:outflow/100,adjustments:adjustments/100};
}
