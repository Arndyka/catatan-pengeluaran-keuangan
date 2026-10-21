import {journalEntries} from './accounting.js';
import {formatDateLocal} from './utils.js';
import {validDate} from './recurring-logic.js';
const touches=(t,id)=>t.sourceAccountId===id||t.destinationAccountId===id||journalEntries(t.journal).some(j=>j.accountId===id);
export const historyAccounts=(accounts,transactions)=>accounts.filter(a=>a.active!==false||transactions.some(t=>touches(t,a.id)));
const isAdjustment=t=>['opening_balance','balance_adjustment','investment_valuation'].includes(t.type);
// Import timestamps describe ingestion, not when money moved. Keep ties stable.
const activityKey=t=>{
 const time=String(t.sourceMeta?.time||'');
 return validDate(t.date)?`${t.date} ${/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)?time.padEnd(8,':00'):''}`:'';
};
export const sortTransactionHistory=transactions=>[...transactions].sort((a,b)=>activityKey(b).localeCompare(activityKey(a)));
export const recentActivity=(transactions,today=formatDateLocal())=>sortTransactionHistory(transactions.filter(t=>validDate(t.date)&&t.date<=today&&!isAdjustment(t)));
const movement=(t,id)=>journalEntries(t.journal).filter(j=>j.accountId===id).reduce((n,j)=>n+Math.round(j.debit*100)-Math.round(j.credit*100),0);

// SourceAccountId is the receiving bank for an income in the accounting model.
// Present economic endpoints without creating fictional counterparty accounts.
export function transactionPresentation(t,accounts=[],accountId='all'){
 const byId=new Map(accounts.map(a=>[a.id,a]));
 const endpoint=id=>byId.get(id)?.subtype==='clearing'?'unmapped':id||'';
 const party=t.sourceMeta?.counterparty||t.merchant||'Pihak lain';
 let source=endpoint(t.sourceAccountId),destination=endpoint(t.destinationAccountId);
 if(t.type==='income'){destination=source;source='external';}
 if(t.type==='loan_disbursement'){destination=source;source=endpoint(t.destinationAccountId);}
 if(['expense','credit_purchase'].includes(t.type))destination='external';
 const settled=!!t.sourceMeta?.loanSettled;
 const label=id=>id==='external'?party:id==='unmapped'?`${party} · ${settled?'pinjaman lunas (arsip)':'belum dirinci'}`:byId.get(id)?.name||'—';
 const accountName=id=>byId.get(id)?.name||'rekening belum dipetakan';
 const accountLabel=t.type==='loan_disbursement'?`Pencairan ${accountName(source)} → ${accountName(destination)}`:t.type==='income'?`Masuk ke ${accountName(destination)}`:
  t.type==='expense'?`Keluar dari ${accountName(source)}`:
  t.type==='credit_purchase'?`Dibebankan ke ${accountName(source)}`:
  source==='unmapped'?`Masuk ke ${accountName(destination)} · ${settled?'pinjaman lunas':'sumber belum dirinci'}`:
  destination==='unmapped'?`Keluar dari ${accountName(source)} · ${settled?'pinjaman lunas':'tujuan belum dirinci'}`:
  destination?`${accountName(source)} → ${accountName(destination)}`:`Rekening: ${accountName(source)}`;
 const unmapped=!settled&&!isAdjustment(t)&&(source==='unmapped'||destination==='unmapped');
 const pending=!settled&&(!!t.sourceMeta?.pendingAllocation||unmapped);
 let delta=0;
 if(!isAdjustment(t)){
  if(accountId&&accountId!=='all')delta=movement(t,accountId);
  else if(['income','loan_disbursement'].includes(t.type))delta=Math.round(t.amount*100);
  else if(['expense','credit_purchase','credit_payment'].includes(t.type))delta=-Math.round(t.amount*100);
  else if(source==='unmapped')delta=Math.round(t.amount*100);
  else if(destination==='unmapped')delta=-Math.round(t.amount*100);
 }
 const liability=byId.get(accountId)?.type==='liability';
 const cashDelta=isAdjustment(t)?0:journalEntries(t.journal).filter(j=>{
  const a=byId.get(j.accountId);
  return (!accountId||accountId==='all'||j.accountId===accountId)&&(a?.type||j.accountType)==='asset'&&!['clearing','investment'].includes(a?.subtype||j.accountSubtype);
 }).reduce((n,j)=>n+Math.round(j.debit*100)-Math.round(j.credit*100),0);
 const sign=isAdjustment(t)?'':delta?(liability?(delta>0?'−':'+'):(delta>0?'+':'−')):['transfer','investment','investment_buy','investment_sell'].includes(t.type)?'↔':'';
 return {source,destination,sourceLabel:label(source),destinationLabel:label(destination),accountLabel,pending,unmapped,settled,delta,cashDelta,sign,
  tone:delta>0?'positive':delta<0?'negative':'neutral',
  directionLabel:isAdjustment(t)?'Di luar aktivitas':!liability&&t.type==='credit_purchase'?'Belanja kredit · non-tunai':delta?(liability?(delta>0?'Utang berkurang':'Utang bertambah'):(delta>0?'Uang masuk':'Uang keluar')):'Transfer antar akun'};
}
export function filterTransactions(transactions,filter={},accounts=[]){
 const names=new Map(accounts.map(a=>[a.id,a.name])),search=String(filter.search||'').trim().toLocaleLowerCase('id');
 const recordIds=Array.isArray(filter.recordIds)?new Set(filter.recordIds):null;
 return transactions.filter(t=>{
  const p=transactionPresentation(t,accounts,filter.accountId);
  const typeMatch=!filter.type||filter.type==='all'||(filter.type==='cash_in'?p.cashDelta>0:filter.type==='cash_out'?p.cashDelta<0:t.type===filter.type);
  const statusMatch=!filter.status||filter.status==='all'||(filter.status==='pending'?p.pending:filter.status==='unmapped'?p.unmapped:filter.status==='settled'?p.settled:filter.status==='complete'?!p.pending&&!p.settled:false);
  const bookkeepingVisible=filter.includeBookkeeping!==false||!isAdjustment(t)||['opening_balance','balance_adjustment','investment_valuation'].includes(filter.type)||filter.status==='pending'||recordIds;
  return bookkeepingVisible&&(!recordIds||recordIds.has(t.id))&&(!filter.accountId||filter.accountId==='all'||touches(t,filter.accountId))&&typeMatch&&statusMatch&&
   (!filter.source||filter.source==='all'||p.source===filter.source)&&(!filter.destination||filter.destination==='all'||p.destination===filter.destination)&&
   (!filter.from||t.date>=filter.from)&&(!filter.to||t.date<=filter.to)&&(!search||[t.date,t.category,t.merchant,t.description,p.sourceLabel,p.destinationLabel,names.get(t.sourceAccountId),names.get(t.destinationAccountId)].join(' ').toLocaleLowerCase('id').includes(search));
 });
}
export function accountActivity(transactions,accountId,today=formatDateLocal()){
 let inflow=0,outflow=0,adjustments=0;
 for(const t of transactions){
  if(!t.date||t.date>today)continue;
  const delta=journalEntries(t.journal).filter(j=>j.accountId===accountId).reduce((n,j)=>n+Math.round(j.debit*100)-Math.round(j.credit*100),0);
  if(['opening_balance','balance_adjustment','investment_valuation'].includes(t.type)){adjustments+=delta;continue;}
  if(delta>0)inflow+=delta;else outflow-=delta;
 }
 return {inflow:inflow/100,outflow:outflow/100,adjustments:adjustments/100};
}
