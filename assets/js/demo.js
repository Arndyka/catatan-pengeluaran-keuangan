import { DEFAULT_SETTINGS, DEFAULT_CREDIT_SETTINGS, buildTransaction } from './accounting.js';
import {settlePaylater} from './paylater-settlement.js';
import { monthKey, formatDateLocal } from './utils.js';
import {reopenRecurringTransaction,isSalaryRule,isSettled,validateSettlement} from './recurring-logic.js';
import {updateStoredTransaction,transactionKeys,editVersion} from './transaction-edit.js';

export const isDemo = new URLSearchParams(location.search).get('demo') === '1';
export const DEMO_UID = 'spendly-demo';
const KEY = 'spendly:demo:v1';
const listeners = new Map();
let data;
let paylaterQueue=Promise.resolve();
const clone = value => structuredClone(value);
function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
function notify(name) { for (const callback of listeners.get(name) || []) callback(clone(data[name] || [])); }
function listen(name, callback) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(callback);
  queueMicrotask(() => callback(clone(data[name] || [])));
  return () => listeners.get(name).delete(callback);
}
export async function initializeDemo() {
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
  if (data?.settings && data?.transactions && data?.budgets) return;
  const now = new Date();
  const month = monthKey(now);
  const date = day => `${month}-${String(Math.min(day,now.getDate())).padStart(2,'0')}`;
  const profile = {...clone(DEFAULT_SETTINGS), hideBalanceDefault:false};
  const fixtures = [
    ['income',18000000,'Gaji','Gaji bulanan','asset-mandiri','',1],
    ['transfer',4500000,'Transfer','Tabungan utama','asset-mandiri','asset-bca',2],
    ['transfer',2500000,'Transfer','Dana cadangan','asset-mandiri','asset-krom',2],
    ['investment',2000000,'Investasi','Investasi bulanan','asset-mandiri','asset-investment',3],
    ['expense',2100000,'Tagihan','Sewa apartemen','asset-mandiri','',3],
    ['expense',350000,'Belanja','Belanja bulanan','asset-bca','',5],
    ['expense',125000,'Transportasi','Transportasi','asset-mandiri','',6],
    ['expense',189000,'Hiburan','Langganan musik & film','asset-bca','',7],
    ['expense',275000,'Makan','Makan bersama','asset-mandiri','',9],
    ['expense',480000,'Belanja','Kebutuhan rumah','asset-bca','',11],
    ['expense',45000,'Makan','Kopi sore','asset-mandiri','',now.getDate()],
    ['credit_purchase',640000,'Belanja','Sepatu olahraga','liability-mandiri-cc','',12]
  ];
  const transactions = [];
  for (const [type,amount,category,merchant,sourceAccountId,destinationAccountId,day] of fixtures) {
    const tx = await buildTransaction({type,amount,category,merchant,sourceAccountId,destinationAccountId,date:date(day),origin:'demo'},profile);
    transactions.push({...tx,id:tx.fingerprint});
  }
  const year = now.getFullYear();
  data = {settings:{profile,credit_card:clone(DEFAULT_CREDIT_SETTINGS),planning:{monthlyLimit:8000000,goals:[
    {id:'demo-emergency',name:'Dana darurat',target:30000000,saved:6500000,dueDate:`${year+1}-06-30`,icon:'shield'},
    {id:'demo-travel',name:'Liburan ke Jepang',target:25000000,saved:8500000,dueDate:`${year+1}-03-31`,icon:'plane'},
    {id:'demo-home',name:'Rumah pertama',target:250000000,saved:18000000,dueDate:`${year+4}-12-31`,icon:'home'}
  ]}},transactions:transactions.sort((a,b)=>b.date.localeCompare(a.date)),recurring:[],budgets:{[month]:{month,items:[
    {id:'food',name:'Makan & minum',category:'Makan',method:'nominal',value:1800000},
    {id:'bills',name:'Tagihan rutin',category:'Tagihan',method:'nominal',value:2500000},
    {id:'shopping',name:'Belanja',category:'Belanja',method:'nominal',value:2000000},
    {id:'transport',name:'Transportasi',category:'Transportasi',method:'nominal',value:700000}
  ]}}};
  save();
}
export const demoRepository = {
  async getSettings(uid,id,fallback) { return clone(data.settings[id] || fallback); },
  async saveSettings(uid,id,value) { data.settings[id] = {...data.settings[id],...clone(value)}; save(); },
  settlePaylaterBill(uid,billId,details) {
    const task=paylaterQueue.then(async()=>{
      const next=clone(data);
      const result=await settlePaylater({getPlan:async()=>next.settings.paylater,getProfile:async()=>next.settings.profile,getTransaction:async id=>next.transactions.find(t=>t.id===id)||null,
        putTransaction:tx=>{next.transactions=next.transactions.filter(t=>t.id!==tx.id);next.transactions.push(clone(tx));},putPlan:plan=>{next.settings.paylater=clone(plan);}},billId,details);
      data=next;save();notify('transactions');return result;
    });
    paylaterQueue=task.catch(()=>{});return task;
  },
  listenTransactions(uid,callback) { return listen('transactions',callback); },
  async createTransactionPermanent(uid,tx) { const duplicate=data.transactions.find(item=>transactionKeys(item).includes(tx.fingerprint));if(duplicate) return {created:false,duplicate:true,id:duplicate.id}; data.transactions.unshift({...clone(tx),id:tx.fingerprint}); data.transactions.sort((a,b)=>b.date.localeCompare(a.date)); save(); notify('transactions'); return {created:true,duplicate:false,id:tx.fingerprint}; },
  updateTransaction(uid,id,patch,expected) {
    const task=paylaterQueue.then(async()=>{
      let edited;
      const result=await updateStoredTransaction({
        getTransaction:async id=>clone(data.transactions.find(t=>t.id===id)||null),getProfile:async()=>clone(data.settings.profile),getPlan:async()=>clone(data.settings.paylater||null),getRule:async id=>clone(data.recurring.find(r=>r.id===id)||null),
        keyOwner:async key=>data.transactions.find(t=>transactionKeys(t).includes(key))?.id,
        putTransaction:tx=>{edited=clone(tx);},putKey:()=>{}
      },id,patch,expected);
      if(editVersion(data.transactions.find(t=>t.id===id))!==editVersion(expected))throw new Error('Transaksi berubah. Buka Edit kembali.');
      if(data.transactions.some(t=>t.id!==id&&transactionKeys(t).some(k=>transactionKeys(edited).includes(k))))throw new Error('Koreksi identik dengan transaksi lain.');
      const next={...data,transactions:data.transactions.map(t=>t.id===id?edited:t).sort((a,b)=>b.date.localeCompare(a.date))};
      localStorage.setItem(KEY,JSON.stringify(next));data=next;notify('transactions');return result;
    });paylaterQueue=task.catch(()=>{});return task;
  },
  async deleteTransaction(uid,id) {
    const tx=data.transactions.find(tx=>tx.id===id);
    const rule=tx&&data.recurring.find(r=>r.id===tx.recurringRuleId);
    if(rule)Object.assign(rule,reopenRecurringTransaction(rule,tx,id));
    data.transactions=data.transactions.filter(tx=>tx.id!==id);save();notify('transactions');notify('recurring');
  },
  async deleteAllTransactions() {
    const n=data.transactions.length;
    for(const tx of data.transactions){const rule=data.recurring.find(r=>r.id===tx.recurringRuleId);if(rule)Object.assign(rule,reopenRecurringTransaction(rule,tx,tx.id));}
    data.transactions=[];save();notify('transactions');notify('recurring');return n;
  },
  listenRecurringRules(uid,callback) {return listen('recurring',callback);},
  async saveRecurringRule(uid,rule) {const id=crypto.randomUUID();data.recurring.push({...clone(rule),id});save();notify('recurring');return id;},
  async updateRecurringRule(uid,id,value) {data.recurring=data.recurring.map(r=>r.id===id?{...r,...clone(value)}:r);save();notify('recurring');},
  async settleRecurringOccurrence(uid,ruleId,period,{transactionData,existingTransactionId}){
    const rule=data.recurring.find(r=>r.id===ruleId);if(!rule)throw new Error('Jadwal tidak ditemukan.');
    if(isSettled(rule,period))return {created:false,duplicate:true,id:rule.settledPeriods?.[period]||''};
    const id=existingTransactionId||transactionData?.id,existing=data.transactions.find(t=>t.id===id);
    if(existingTransactionId&&!existing)throw new Error('Transaksi yang dipilih sudah tidak tersedia.');
    const tx=clone(existing||transactionData);validateSettlement(rule,period,tx);
    tx.recurringRuleId=ruleId;tx.sourceMeta={...tx.sourceMeta,recurringPeriod:period,recurringKind:isSalaryRule(rule)?'salary':'standard'};
    if(existing)data.transactions=data.transactions.map(t=>t.id===id?tx:t);else data.transactions.unshift(tx);
    rule.settledPeriods={...rule.settledPeriods,[period]:id};data.transactions.sort((a,b)=>b.date.localeCompare(a.date));save();notify('transactions');notify('recurring');
    return {created:!existing,duplicate:false,linked:!!existing,id};
  },
  async deleteRecurringRule(uid,id) {data.recurring=data.recurring.filter(r=>r.id!==id);save();notify('recurring');},
  async getBudgetPlan(uid,month) {return clone(data.budgets[month] || {month,items:[]});},
  async saveBudgetPlan(uid,month,value) {data.budgets[month]=clone(value);save();},
  async migrateLegacyCollections() {return {created:0,duplicate:0};}
};
