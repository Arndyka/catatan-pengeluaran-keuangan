import test from 'node:test';import assert from 'node:assert/strict';
import {investmentVersion} from '../assets/js/investment-ledger.js';
import {buildTransaction} from '../assets/js/accounting.js';
globalThis.location={search:'?demo=1'};
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const {initializeDemo,demoRepository:repo}=await import('../assets/js/demo.js');
const read=()=>JSON.parse(memory.get('spendly:demo:v1'));
const order=profile=>({id:crypto.randomUUID(),kind:'order',symbol:'TEST',name:'Test',quantity:100,limitPrice:1000,date:'2026-10-20',expectedVersion:investmentVersion(profile)});

test('concurrent ordinary transaction survives a conflicting investment save',async()=>{
 await initializeDemo();const profile=read().settings.profile;
 const tx=await buildTransaction({type:'income',date:'2026-10-20',amount:123,sourceAccountId:'asset-bca',description:'Concurrent'},profile);
 const pending=repo.changeInvestmentPortfolio('demo',order(profile));
 const assertion=assert.rejects(pending,/Data berubah/);await Promise.resolve();
 await repo.createTransactionPermanent('demo',tx);await assertion;
 assert(read().transactions.some(t=>t.id===tx.id));assert(!read().settings.profile.investmentPortfolio);
 await repo.changeInvestmentPortfolio('demo',order(profile));assert(read().transactions.some(t=>t.id===tx.id));
});

test('failed storage cannot partially save a trade, and retries do not duplicate it',async()=>{
 const profile=read().settings.profile,o=profile.investmentPortfolio.orders[0],before=read();
 const fill={id:crypto.randomUUID(),kind:'fill',orderId:o.id,quantity:100,price:1000,fee:500,date:'2026-10-21',cashAccountId:'asset-mandiri',expectedVersion:investmentVersion(profile)};
 const write=localStorage.setItem;localStorage.setItem=()=>{throw new Error('Quota exceeded');};
 await assert.rejects(repo.changeInvestmentPortfolio('demo',fill),/Quota/);localStorage.setItem=write;
 assert.deepEqual(read(),before);assert.deepEqual(await repo.getSettings('demo','profile'),profile);
 await repo.changeInvestmentPortfolio('demo',fill);const after=read();await repo.changeInvestmentPortfolio('demo',fill);assert.deepEqual(read(),after);
 const tx=after.transactions.find(t=>t.type==='investment_buy');
 await assert.rejects(repo.deleteTransaction('demo',tx.id),/posisi saham/);await assert.rejects(repo.deleteAllTransactions('demo'),/posisi saham/);
 const stale=await buildTransaction({type:'investment',date:'2026-10-21',amount:1,sourceAccountId:'asset-mandiri',destinationAccountId:tx.destinationAccountId},{...profile,accounts:[...profile.accounts,{id:tx.destinationAccountId,type:'asset',subtype:'investment',name:'Old tab'}]});
 await assert.rejects(repo.createTransactionPermanent('demo',stale),/Posisi & order/);
});
