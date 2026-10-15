import test from 'node:test';
import assert from 'node:assert/strict';
import {dueOccurrences,validateRecurringRule,occurrenceForMonth,recurringMatches,validateSettlement} from '../assets/js/recurring-logic.js';
const rule={id:'salary1',kind:'salary',type:'income',name:'Gaji',amount:10000000,dayOfMonth:31,startDate:'2024-01-01',sourceAccountId:'bca',active:true};
test('salary date 31 clamps at February including leap year',()=>{
 assert.equal(occurrenceForMonth(rule,'2024-02').date,'2024-02-29');assert.equal(occurrenceForMonth(rule,'2025-02').date,'2025-02-28');
});
test('paid and legacy periods stay settled, including posting out of order',()=>{
 assert.deepEqual(dueOccurrences({...rule,lastPostedPeriod:'2024-02',settledPeriods:{'2024-04':'tx4'}},new Date(2024,3,30)).map(o=>o.periodKey),['2024-03']);
 assert.deepEqual(dueOccurrences({...rule,active:false}),[]);
});
test('rules validate date range, amount, day and receiving account',()=>{
 const accounts=[{id:'bca',type:'asset',active:true}];
 assert.throws(()=>validateRecurringRule({...rule,amount:Infinity},accounts));assert.throws(()=>validateRecurringRule({...rule,dayOfMonth:32},accounts));assert.throws(()=>validateRecurringRule({...rule,endDate:'2023-12-01'},accounts));
 assert.equal(validateRecurringRule(rule,accounts).category,'Gaji');
});
test('salary matching allows shifted pay date but never assumes amount-only match is settled',()=>{
 const tx={id:'t1',type:'income',date:'2024-02-27',amount:10000000,sourceAccountId:'bca',category:'Gaji'};
 assert.equal(recurringMatches(rule,'2024-02',[tx])[0].id,'t1');assert.deepEqual(recurringMatches(rule,'2024-03',[tx]),[]);
 assert.throws(()=>validateSettlement(rule,'2024-02',{...tx,sourceAccountId:'other'},'2024-03-01'));
 assert.throws(()=>validateSettlement(rule,'2024-02',{...tx,date:'2024-03-01'},'2024-03-01'));
});
