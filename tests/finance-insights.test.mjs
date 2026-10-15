import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyAllowance, goalProgress, validateGoal } from '../assets/js/finance-insights.js';

test('daily allowance includes today and excludes transfers and future expenses', () => {
 const tx = [{date:'2026-10-01',type:'expense',amount:100},{date:'2026-10-31',type:'credit_purchase',amount:50},{date:'2026-11-01',type:'expense',amount:999},{date:'2026-10-31',type:'transfer',amount:500}];
 assert.deepEqual(dailyAllowance(tx, 1000, '2026-10-31'), {spent:150, remaining:850, daysLeft:1, daily:850, todaySpent:50, configured:true});
});
test('overspending never yields negative daily allowance',()=>{assert.equal(dailyAllowance([{date:'2026-02-28',type:'expense',amount:120}],100,'2026-02-28').daily,0)});
test('missing limit does not invent an available budget',()=>{assert.equal(dailyAllowance([],0,'2026-10-15').configured,false)});
test('goal monthly target includes current month and caps display progress',()=>{
 assert.deepEqual(goalProgress({target:1000,saved:400,dueDate:'2026-12-31'},'2026-10-15'),{percent:40,remaining:600,monthly:200,monthsLeft:3,complete:false,overdue:false});
 assert.equal(goalProgress({target:100,saved:120,dueDate:'2026-01-01'},'2026-10-15').percent,100);
});
test('goal validation rejects invalid money and impossible calendar dates',()=>{
 for(const input of [{name:'A',target:0,saved:0,dueDate:'2026-12-01'},{name:'A',target:100,saved:-1,dueDate:'2026-12-01'},{name:'A',target:Infinity,saved:0,dueDate:'2026-12-01'},{name:'A',target:100,saved:0,dueDate:'2026-02-30'}]) assert.throws(()=>validateGoal(input));
 assert.equal(validateGoal({name:'  Rumah  ',target:'100',saved:'20',dueDate:'2026-12-31'}).name,'Rumah');
});
