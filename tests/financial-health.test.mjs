import test from 'node:test';
import assert from 'node:assert/strict';
import {openingBalanceInput,financialHealth} from '../assets/js/financial-health.js';
import {buildTransaction,DEFAULT_SETTINGS,deriveLedger,validateJournal,cashFlowStatement} from '../assets/js/accounting.js';

test('malformed persisted journals are flagged without crashing financial views',()=>{
 const records=[{date:'2026-10-01',journal:{}},{date:'2026-10-02',journal:[null,null]},{date:'2026-10-03',journal:[{debit:'bad',credit:0}]}];
 const before=JSON.stringify(records);
 for(const row of records)assert.equal(validateJournal(row.journal).valid,false);
 assert.equal(deriveLedger(records).balanced,false);
 assert.equal(financialHealth(records,DEFAULT_SETTINGS,'2026-10-15').find(i=>i.kind==='journal').count,3);
 assert.equal(cashFlowStatement(records,'2026-10',DEFAULT_SETTINGS).netCashFlow,0);
 assert.equal(openingBalanceInput({date:'2026-10-01',sourceAccountId:'bca'},records,'2026-10-15').type,'opening_balance');
 assert.equal(JSON.stringify(records),before);
});
test('opening balance cannot be added over an existing ledger as a current balance',()=>{
 const tx={date:'2026-10-05',journal:[{accountId:'bca'}]};
 assert.throws(()=>openingBalanceInput({date:'2026-10-10',sourceAccountId:'bca'},[tx],'2026-10-15'));
 assert.throws(()=>openingBalanceInput({date:'2026-10-01',sourceAccountId:'bca'},[{type:'opening_balance',sourceAccountId:'bca'}],'2026-10-15'));
 assert.equal(openingBalanceInput({date:'2026-10-01',sourceAccountId:'bca'},[tx],'2026-10-15').type,'opening_balance');
});
test('health check flags missing starting money and damaged journals without writing data',async()=>{
 const tx=await buildTransaction({type:'expense',date:'2026-10-01',amount:100,sourceAccountId:'asset-bca'},DEFAULT_SETTINGS);
 const data=[tx,{date:'2026-10-02',journal:[]}],before=JSON.stringify(data);
 const issues=financialHealth(data,DEFAULT_SETTINGS,'2026-10-15');
 assert.ok(issues.some(i=>i.kind==='negative'));assert.ok(issues.some(i=>i.kind==='journal'));
 assert.equal(JSON.stringify(data),before);
});
