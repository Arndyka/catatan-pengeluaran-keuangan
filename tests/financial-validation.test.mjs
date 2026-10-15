import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBudgetItem} from '../assets/js/budget.js';
import {validateRecurringRule} from '../assets/js/recurring-logic.js';
globalThis.location={search:'?demo=1'};
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const {validateCreditSettings}=await import('../assets/js/settings.js');
const {DEFAULT_CREDIT_SETTINGS}=await import('../assets/js/accounting.js');

test('budget prevents category double counting and allocations above 100 percent',()=>{
 const item={name:'Uji',category:'Makan',method:'percentage',value:60};
 assert.throws(()=>validateBudgetItem(item,[{...item,category:'needs',value:20}]),/tercakup/);
 assert.throws(()=>validateBudgetItem(item,[{...item,category:'Hiburan',value:50}]),/100/);
 assert.equal(validateBudgetItem({...item,value:0},[]).value,0);
 assert.throws(()=>validateBudgetItem({...item,value:NaN},[]));
});

test('recurring target roles agree with transaction posting rules',()=>{
 const accounts=[{id:'bank',type:'asset',subtype:'bank'},{id:'invest',type:'asset',subtype:'investment'},{id:'bank2',type:'asset',subtype:'bank'},{id:'loan',type:'liability',subtype:'other'},{id:'card',type:'liability',subtype:'credit_card'}];
 const rule={name:'Rutin',type:'investment',amount:100,sourceAccountId:'bank',destinationAccountId:'bank2',dayOfMonth:1,startDate:'2026-01-01'};
 assert.throws(()=>validateRecurringRule(rule,accounts),/tujuan/);
 assert.equal(validateRecurringRule({...rule,destinationAccountId:'invest'},accounts).destinationAccountId,'invest');
 assert.throws(()=>validateRecurringRule({...rule,type:'credit_payment',destinationAccountId:'loan'},accounts),/tujuan/);
 assert.equal(validateRecurringRule({...rule,type:'credit_payment',destinationAccountId:'card'},accounts).destinationAccountId,'card');
});

test('official credit statement settings require real dates and nonnegative values',()=>{
 const settings={...DEFAULT_CREDIT_SETTINGS,officialStatementDate:'2026-02-07',officialStatementAmount:0,officialDueDate:'2026-02-28'};
 assert.equal(validateCreditSettings(settings).officialStatementAmount,0);
 assert.throws(()=>validateCreditSettings({...settings,officialDueDate:'2026-02-30'}),/Jatuh tempo/);
 assert.throws(()=>validateCreditSettings({...settings,minimumPaymentPercent:101}));
 assert.throws(()=>validateCreditSettings({...settings,statementDay:0}));
 assert.throws(()=>validateCreditSettings({...settings,officialStatementDate:''}));
});
