import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,buildTransaction,deriveLedger,incomeStatement} from '../assets/js/accounting.js';
import * as module from '../assets/js/statement-opening.js';
const statement={bank:'bca',fileName:'synthetic.pdf',openingAccountId:'asset-bca',metadata:{periodStart:'2026-09-01',periodEnd:'2026-09-30',openingBalance:1000.96,incomingTotal:8000,outgoingTotal:6000,closingBalance:3000.96},reconciliation:{balanced:true},failedPages:0};
test('statement opening restores baseline exactly once, including previously imported movements',async()=>{
 const rows=await Promise.all([buildTransaction({type:'income',date:'2026-09-02',amount:8000,sourceAccountId:'asset-bca'},DEFAULT_SETTINGS),buildTransaction({type:'expense',date:'2026-09-03',amount:6000,sourceAccountId:'asset-bca'},DEFAULT_SETTINGS)]);
 const proposal=module.statementOpeningProposal(statement,[statement],rows,DEFAULT_SETTINGS,'2026-10-19');assert.equal(proposal.status,'ready');
 const opening=await buildTransaction(proposal.input,DEFAULT_SETTINGS),ledger=deriveLedger([...rows,opening]);
 assert.equal(ledger.accounts.find(a=>a.accountId==='asset-bca').balance,3000.96);
 assert.equal(incomeStatement([...rows,opening],'2026-09').income,8000);
 assert.equal(module.statementOpeningProposal(statement,[statement],[...rows,opening],DEFAULT_SETTINGS).status,'exists');
 assert.equal(module.statementOpeningProposal(statement,[statement],[{...rows[0],date:'2026-08-20'}],DEFAULT_SETTINGS).status,'blocked');
});
test('only earliest complete reconciled source can supply an initial balance',()=>{
 const later={...statement,metadata:{...statement.metadata,periodStart:'2026-10-01',periodEnd:'2026-10-19'}};
 assert.equal(module.statementOpeningProposal(later,[later,statement],[],DEFAULT_SETTINGS).status,'later');
 for(const bad of [{...statement,reconciliation:{balanced:false}},{...statement,failedPages:1},{...statement,metadata:{...statement.metadata,openingBalance:null}},{...statement,metadata:{...statement.metadata,closingBalance:1}}])assert.equal(module.statementOpeningProposal(bad,[bad],[],DEFAULT_SETTINGS).status,'blocked');
});
