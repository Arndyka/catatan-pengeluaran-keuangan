import {journalEntries} from './accounting.js';
import {formatDateLocal} from './utils.js';
const touches=(t,id)=>t.sourceAccountId===id||t.destinationAccountId===id||journalEntries(t.journal).some(j=>j.accountId===id);
export const historyAccounts=(accounts,transactions)=>accounts.filter(a=>a.active!==false||transactions.some(t=>touches(t,a.id)));
const isAdjustment=t=>['opening_balance','balance_adjustment'].includes(t.type);
const movement=(t,id)=>journalEntries(t.journal).filter(j=>j.accountId===id).reduce((n,j)=>n+Math.round(j.debit*100)-Math.round(j.credit*100),0);

// SourceAccountId is the receiving bank for an income in the accounting model.
// Present economic endpoints without creating fictional counterparty accounts.
export function transactionPresentation(t,accounts=[],accountId='all'){
 const byId=new Map(accounts.map(a=>[a.id,a]));
 const endpoint=id=>byId.get(id)?.subtype==='clearing'?'unmapped':id||'';
 const party=t.sourceMeta?.counterparty||t.merchant||'Pihak lain';
 let source=endpoint(t.sourceAccountId),destination=endpoint(t.destinationAccountId);
 if(t.type==='income'){destination=source;source='external';}
 if(['expense','credit_purchase'].includes(t.type))destination='external';
 const settled=!!t.sourceMeta?.loanSettled;
 const label=id=>id==='external'?party:id==='unmapped'?`${party} · ${settled?'pinjaman lunas (arsip)':'belum dirinci'}`:byId.get(id)?.name||'—';
 const unmapped=!settled&&!isAdjustment(t)&&(source==='unmapped'||destination==='unmapped');
 const pending=!settled&&(!!t.sourceMeta?.pendingAllocation||unmapped);
 let delta=0;
 if(!isAdjustment(t)){
  if(accountId&&accountId!=='all')delta=movement(t,accountId);
  else if(t.type==='income')delta=Math.round(t.amount*100);
  else if(['expense','credit_purchase','credit_payment'].includes(t.type))delta=-Math.round(t.amount*100);
  else if(source==='unmapped')delta=Math.round(t.amount*100);
  else if(destination==='unmapped')delta=-Math.round(t.amount*100);
 }
 const liability=byId.get(accountId)?.type==='liability';
 const cashDelta=isAdjustment(t)?0:journalEntries(t.journal).filter(j=>{
  const a=byId.get(j.accountId);
  return (!accountId||accountId==='all'||j.accountId===accountId)&&(a?.type||j.accountType)==='asset'&&!['clearing','investment'].includes(a?.subtype||j.accountSubtype);
 }).reduce((n,j)=>n+Math.round(j.debit*100)-Math.round(j.credit*100),0);
 const sign=isAdjustment(t)?'':delta?(liability?(delta>0?'−':'+'):(delta>0?'+':'−')):['transfer','investment'].includes(t.type)?'↔':'';
 return {source,destination,sourceLabel:label(source),destinationLabel:label(destination),pending,unmapped,settled,delta,cashDelta,sign,
  tone:delta>0?'positive':delta<0?'negative':'neutral',
  directionLabel:isAdjustment(t)?'Di luar aktivitas':!liability&&t.type==='credit_purchase'?'Belanja kredit · non-tunai':delta?(liability?(delta>0?'Utang berkurang':'Utang bertambah'):(delta>0?'Uang masuk':'Uang keluar')):'Transfer antar akun'};
}
export function filterTransactions(transactions,filter={},accounts=[]){
 const names=new Map(accounts.map(a=>[a.id,a.name])),search=String(filter.search||'').trim().toLocaleLowerCase('id');
 return transactions.filter(t=>{
  const p=transactionPresentation(t,accounts,filter.accountId);
  const typeMatch=!filter.type||filter.type==='all'||(filter.type==='cash_in'?p.cashDelta>0:filter.type==='cash_out'?p.cashDelta<0:t.type===filter.type);
  const statusMatch=!filter.status||filter.status==='all'||(filter.status==='pending'?p.pending:filter.status==='unmapped'?p.unmapped:filter.status==='settled'?p.settled:filter.status==='complete'?!p.pending&&!p.settled:false);
  return (!filter.accountId||filter.accountId==='all'||touches(t,filter.accountId))&&typeMatch&&statusMatch&&
   (!filter.source||filter.source==='all'||p.source===filter.source)&&(!filter.destination||filter.destination==='all'||p.destination===filter.destination)&&
   (!filter.from||t.date>=filter.from)&&(!filter.to||t.date<=filter.to)&&(!search||[t.date,t.category,t.merchant,t.description,p.sourceLabel,p.destinationLabel,names.get(t.sourceAccountId),names.get(t.destinationAccountId)].join(' ').toLocaleLowerCase('id').includes(search));
 });
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
