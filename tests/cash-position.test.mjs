import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransaction,DEFAULT_SETTINGS} from '../assets/js/accounting.js';
import * as insights from '../assets/js/finance-insights.js';
test('cash baseline carries prior months, adds opening cash, ignores card charges and internal transfers',async()=>{
 const make=(type,date,amount,sourceAccountId='asset-bca',destinationAccountId='')=>buildTransaction({type,date,amount,sourceAccountId,destinationAccountId},DEFAULT_SETTINGS);
 const txs=await Promise.all([make('opening_balance','2026-09-01',1000),make('expense','2026-09-02',100),make('opening_balance','2026-10-01',200,'asset-cash'),make('income','2026-10-02',500),make('expense','2026-10-03',50),make('transfer','2026-10-04',100,'asset-bca','asset-cash'),make('credit_purchase','2026-10-05',75,'liability-mandiri-cc'),make('credit_payment','2026-10-06',25,'asset-bca','liability-mandiri-cc'),make('income','2026-11-01',999)]);
 assert.equal(typeof insights.cashPosition,'function');
 assert.deepEqual(insights.cashPosition(txs,DEFAULT_SETTINGS,'2026-10','2026-10-19'),{baseline:1100,inflow:500,outflow:75,adjustments:0,balance:1525,valid:true});
});
