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

test('salary payday moves Saturday/Sunday to Friday and keeps its nominal monthly period',()=>{
 const salary={...rule,dayOfMonth:25,startDate:'2022-01-01'};
 assert.equal(occurrenceForMonth(salary,'2026-10').date,'2026-10-23');
 assert.equal(occurrenceForMonth(salary,'2026-10').nominalDate,'2026-10-25');
 assert.equal(occurrenceForMonth(salary,'2026-04').date,'2026-04-24');
 assert.equal(occurrenceForMonth(salary,'2026-11').date,'2026-11-25');
 assert.equal(occurrenceForMonth({...salary,dayOfMonth:31},'2026-02').date,'2026-02-27');
 assert.deepEqual(occurrenceForMonth({...salary,dayOfMonth:1},'2023-01'),{periodKey:'2023-01',nominalDate:'2023-01-01',date:'2022-12-30'});
 assert.equal(occurrenceForMonth({...salary,weekendPolicy:'none'},'2026-10').date,'2026-10-25');
 assert.equal(occurrenceForMonth({...salary,kind:'standard'},'2026-10').date,'2026-10-25');
 assert.equal(occurrenceForMonth({...salary,startDate:'2026-10-24'},'2026-10'),null);
 assert.equal(occurrenceForMonth({...salary,endDate:'2026-10-22'},'2026-10'),null);
 assert.equal(occurrenceForMonth({...salary,endDate:'2026-10-24'},'2026-10').date,'2026-10-23');
});

test('salary weekend policy is validated and regular routines retain their calendar day',()=>{
 const accounts=[{id:'bca',type:'asset',active:true}];
 assert.equal(validateRecurringRule(rule,accounts).weekendPolicy,'previous_weekday');
 assert.equal(validateRecurringRule({...rule,weekendPolicy:'none'},accounts).weekendPolicy,'none');
 assert.equal(validateRecurringRule({...rule,kind:'standard'},accounts).weekendPolicy,'none');
 assert.throws(()=>validateRecurringRule({...rule,weekendPolicy:'invented'},accounts));
});

test('shifted salary becomes due on Friday, including a payday advanced into the previous month',()=>{
 const salary={...rule,dayOfMonth:25,startDate:'2026-10-01'};
 assert.deepEqual(dueOccurrences(salary,new Date(2026,9,22)),[]);
 assert.deepEqual(dueOccurrences(salary,new Date(2026,9,23)).map(o=>o.date),['2026-10-23']);
 const nextMonth={...salary,dayOfMonth:1,settledPeriods:{'2026-10':'paid'}};
 assert.deepEqual(dueOccurrences(nextMonth,new Date(2026,9,29)),[]);
 assert.deepEqual(dueOccurrences(nextMonth,new Date(2026,9,30)).map(o=>o.periodKey),['2026-11']);
 assert.deepEqual(dueOccurrences({...nextMonth,settledPeriods:{'2026-10':'paid','2026-11':'paid-next'}},new Date(2026,9,30)),[]);
});

test('cross-month confirmation and matching retain the salary period and reject reuse',()=>{
 const salary={...rule,dayOfMonth:1,startDate:'2026-10-01'};
 const tx={id:'pay',type:'income',date:'2026-10-30',amount:10000000,sourceAccountId:'bca',category:'Gaji'};
 assert.doesNotThrow(()=>validateSettlement(salary,'2026-11',tx,'2026-10-30'));
 assert.throws(()=>validateSettlement(salary,'2026-11',{...tx,date:'2026-10-29'},'2026-10-30'));
 assert.throws(()=>validateSettlement(salary,'2026-11',{...tx,date:'2026-11-01'},'2026-10-30'));
 const used={...tx,recurringRuleId:salary.id,sourceMeta:{recurringPeriod:'2026-10'}};
 assert.throws(()=>validateSettlement(salary,'2026-11',used,'2026-10-30'));
 assert.deepEqual(recurringMatches(salary,'2026-11',[tx,used]).map(t=>t.id),['pay']);
});
test('legacy receipts cannot be reused across months even when period metadata is missing',()=>{
 const salary={...rule,dayOfMonth:1,startDate:'2026-10-01'},tx={id:'legacy-pay',type:'income',date:'2026-10-30',amount:10000000,sourceAccountId:'bca',recurringRuleId:salary.id};
 const mapped={...salary,settledPeriods:{'2026-10':tx.id}};
 assert.throws(()=>validateSettlement(mapped,'2026-11',tx,'2026-11-01'),/periode lain/);
 assert.deepEqual(recurringMatches(mapped,'2026-11',[tx]),[]);
 assert.throws(()=>validateSettlement(salary,'2026-11',tx,'2026-11-01'),/periode lain/);
 assert.throws(()=>validateSettlement(mapped,'2026-11',{...tx,sourceMeta:{recurringPeriod:'2026-11'}},'2026-11-01'),/periode lain/);
 assert.doesNotThrow(()=>validateSettlement({...salary,settledPeriods:{'2026-11':tx.id}},'2026-11',tx,'2026-11-01'));
});
