import test from 'node:test';
import assert from 'node:assert/strict';
import {openingBalanceInput,financialHealth,balanceEvidenceIssues} from '../assets/js/financial-health.js';
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

test('health links exact records and distinguishes carried balances from unmapped transfers',async()=>{
 const settings={...DEFAULT_SETTINGS,accounts:[...DEFAULT_SETTINGS.accounts,{id:'asset-transfer-clearing',name:'Akun sementara',type:'asset',subtype:'clearing',active:true}]};
 const opening=await buildTransaction({type:'opening_balance',date:'2026-09-01',amount:100,sourceAccountId:'asset-bca'},settings);
 opening.sourceAccountId='asset-transfer-clearing';opening.journal=opening.journal.map(j=>j.accountId==='asset-bca'?{...j,accountId:'asset-transfer-clearing',accountSubtype:'clearing'}:j);
 opening.id='carry';opening.sourceMeta={verifiedOpening:false,pendingAllocation:'Belum diverifikasi'};
 const settled=await buildTransaction({type:'transfer',date:'2026-10-01',amount:10,sourceAccountId:'asset-bca',destinationAccountId:'asset-transfer-clearing'},settings);
 settled.id='settled';settled.sourceMeta={loanSettled:true};
 const pending={...settled,id:'unmapped',sourceMeta:{pendingAllocation:'Periksa penerima'}};
 const before=JSON.stringify([opening,settled]);
 const checks=financialHealth([opening,settled],DEFAULT_SETTINGS,'2026-10-19');
 assert.equal(checks.some(c=>c.kind==='clearing'),false);
 assert.deepEqual(checks.find(c=>c.kind==='opening-review').transactionIds,['carry']);
 assert.deepEqual(checks.find(c=>c.kind==='negative').transactionIds,['settled']);
 assert.deepEqual(financialHealth([opening,settled,pending],DEFAULT_SETTINGS,'2026-10-19').find(c=>c.kind==='clearing').transactionIds,['unmapped']);
 assert.equal(JSON.stringify([opening,settled]),before);
});

test('evidence shows only latest mismatches at their own date with exact supporting records',async()=>{
 const base={type:'income',date:'2026-10-01',amount:10.01,sourceAccountId:'asset-bca'};
 const tx=await buildTransaction(base,DEFAULT_SETTINGS);tx.id='before';
 const later=await buildTransaction({...base,date:'2026-10-03',amount:20},DEFAULT_SETTINGS);later.id='after';
 const rows=[tx,later],obs=[{accountId:'asset-bca',date:'2026-09-30',amount:999},{accountId:'asset-bca',date:'2026-10-02',amount:10.01}];
 assert.deepEqual(balanceEvidenceIssues(rows,DEFAULT_SETTINGS,obs,'2026-10-19'),[]);
 obs[1].amount=11.02;
 const issues=balanceEvidenceIssues(rows,DEFAULT_SETTINGS,obs,'2026-10-19');
 assert.equal(issues.length,1);assert.equal(issues[0].difference,1.01);assert.equal(issues[0].ledgerBalance,10.01);assert.deepEqual(issues[0].transactionIds,['before']);
 const broken={id:'broken',date:'2026-10-01',sourceAccountId:'asset-bca',journal:[null]};
 obs[1].amount=10.01;
 assert.equal(balanceEvidenceIssues([...rows,broken],DEFAULT_SETTINGS,obs,'2026-10-19')[0].journalInvalid,true);
});
