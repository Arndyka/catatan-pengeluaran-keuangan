import test from 'node:test';import assert from 'node:assert/strict';
import {investmentPortfolio,investmentVersion,changeInvestment,investmentProtected,guardInvestmentProfileWrite} from '../assets/js/investment-ledger.js';
import {DEFAULT_SETTINGS,deriveLedger,incomeStatement,validateJournal,buildTransaction} from '../assets/js/accounting.js';
import {prepareTransactionEdit} from '../assets/js/transaction-edit.js';
const fixture=()=>{let profile={...structuredClone(DEFAULT_SETTINGS),accounts:[...structuredClone(DEFAULT_SETTINGS.accounts),{id:'rdn',name:'RDN uji',type:'asset',subtype:'investment',active:true}]},txs=[];return {get profile(){return profile;},get txs(){return txs;},async act(action){return changeInvestment({getProfile:async()=>structuredClone(profile),getTransaction:async id=>txs.find(t=>t.id===id),putProfile:p=>profile=structuredClone(p),putTransaction:t=>txs.push(t)}, {...action,id:action.id||crypto.randomUUID(),expectedVersion:action.expectedVersion||investmentVersion(profile)},'2026-10-21');},setProfile:p=>profile=p};};
const order={kind:'order',symbol:'TEST',name:'Saham contoh',quantity:400,limitPrice:1000,date:'2026-10-20'};
test('pending orders edit and cancel without changing money; matched fills cannot be duplicated',async()=>{
 const f=fixture();await f.act(order);let o=investmentPortfolio(f.profile).orders[0];assert.equal(f.txs.length,0);
 await f.act({...order,orderId:o.id,limitPrice:1100});o=investmentPortfolio(f.profile).orders[0];assert.equal(o.limitPrice,1100);
 const action={kind:'fill',id:'same-execution-id',orderId:o.id,quantity:200,price:1000,fee:1000,date:'2026-10-21',cashAccountId:'rdn',expectedVersion:investmentVersion(f.profile)};
 await f.act(action);assert.equal(f.txs.length,1);await f.act(action);assert.equal(f.txs.length,1);
 const p=investmentPortfolio(f.profile);assert.equal(p.positions[0].quantity,200);assert.equal(p.positions[0].cost,201000);assert.equal(p.orders[0].status,'partial');assert(validateJournal(f.txs[0].journal).valid);
 await f.act({kind:'cancel',orderId:o.id});assert.equal(f.txs.length,1);assert.equal(investmentPortfolio(f.profile).orders[0].status,'cancelled');
 await assert.rejects(f.act({...action,id:crypto.randomUUID(),expectedVersion:investmentVersion(f.profile)}));
});
test('partial and final sale use average cost including buy fees and net sale proceeds',async()=>{
 const f=fixture();await f.act(order);const o=investmentPortfolio(f.profile).orders[0];
 await f.act({kind:'fill',orderId:o.id,quantity:400,price:1000,fee:2000,date:'2026-10-20',cashAccountId:'rdn'});
 const p=investmentPortfolio(f.profile).positions[0];
 await f.act({kind:'sell',positionId:p.id,quantity:100,price:1200,fee:500,date:'2026-10-21',cashAccountId:'rdn'});
 let portfolio=investmentPortfolio(f.profile);assert.equal(portfolio.positions[0].quantity,300);assert.equal(portfolio.positions[0].cost,301500);assert.equal(portfolio.events.at(-1).profit,19000);
 await f.act({kind:'sell',positionId:p.id,quantity:300,price:900,fee:500,date:'2026-10-21',cashAccountId:'rdn'});
 portfolio=investmentPortfolio(f.profile);assert.equal(portfolio.positions[0].quantity,0);assert.equal(portfolio.positions[0].cost,0);assert.equal(portfolio.positions[0].bookValue,0);assert.equal(portfolio.events.at(-1).profit,-32000);
 assert(f.txs.every(t=>validateJournal(t.journal).valid));assert.equal(incomeStatement(f.txs,'2026-10').netIncome,-13000);
 assert.equal(deriveLedger(f.txs).accounts.find(a=>a.accountId==='rdn').balance,-13000);
});
test('legacy market-value evidence requires confirmed quantity and cost, and sale separates prior valuation from realized loss',async()=>{
 const f=fixture();f.setProfile({...f.profile,accounts:[...f.profile.accounts,{id:'legacy-stock',name:'LAMA',type:'asset',subtype:'investment',active:true}],investmentEvidence:{holdings:[{symbol:'LAMA',name:'Lama',accountId:'legacy-stock',value:500000,unrealizedChange:-900000,asOfDate:'2026-10-20'}],orders:[]}});
 const p=investmentPortfolio(f.profile).positions[0];assert.equal(p.cost,null);
 await assert.rejects(f.act({kind:'sell',positionId:p.id,quantity:100,price:5000,fee:1000,date:'2026-10-21',cashAccountId:'rdn'}));
 await f.act({kind:'position',positionId:p.id,name:'Lama',quantity:100,cost:1400000,bookValue:500000,date:'2026-10-21'});assert.equal(f.txs.length,0);
 await f.act({kind:'sell',positionId:p.id,quantity:100,price:5000,fee:1000,date:'2026-10-20',cashAccountId:'rdn'});
 assert.equal(investmentPortfolio(f.profile).events.at(-1).profit,-901000);assert(validateJournal(f.txs[0].journal).valid);assert.equal(incomeStatement(f.txs,'2026-10').expenses,901000);
 assert.equal(f.txs[0].journal.filter(j=>j.accountType==='equity').reduce((s,j)=>s+j.credit-j.debit,0),900000);
});

test('a revaluation is not realized income; later buys and sales retain weighted historical cost',async()=>{
 const f=fixture();await f.act(order);let o=investmentPortfolio(f.profile).orders[0];
 await f.act({kind:'fill',orderId:o.id,quantity:400,price:1000,fee:0,date:'2026-10-20',cashAccountId:'rdn'});
 const p=investmentPortfolio(f.profile).positions[0];
 await f.act({kind:'position',positionId:p.id,quantity:400,cost:400000,bookValue:600000,date:'2026-10-20'});
 assert.equal(incomeStatement(f.txs,'2026-10').netIncome,0);
 await f.act({...order,quantity:100,limitPrice:2000});o=investmentPortfolio(f.profile).orders.at(-1);
 await f.act({kind:'fill',orderId:o.id,quantity:100,price:2000,fee:0,date:'2026-10-20',cashAccountId:'rdn'});
 await f.act({kind:'sell',positionId:p.id,quantity:100,price:2000,fee:0,date:'2026-10-21',cashAccountId:'rdn'});
 const portfolio=investmentPortfolio(f.profile);assert.equal(portfolio.events.at(-1).allocatedCost,120000);assert.equal(portfolio.events.at(-1).profit,80000);
 assert.equal(portfolio.positions[0].cost,480000);assert.equal(portfolio.positions[0].bookValue,640000);assert.equal(deriveLedger(f.txs).accounts.find(a=>a.accountId===p.accountId).balance,640000);
 assert.equal(incomeStatement(f.txs,'2026-10').netIncome,80000);
 const tx=f.txs.at(-1),edited=await prepareTransactionEdit(tx,{description:'Corrected note'},f.profile);
 assert.deepEqual(edited.journal,tx.journal);assert.equal(edited.destinationAccountId,'rdn');
 await assert.rejects(prepareTransactionEdit(tx,{amount:1},f.profile),/posisi saham/);
 await assert.rejects(buildTransaction({type:'transfer',amount:1,date:'2026-10-21',sourceAccountId:'rdn',destinationAccountId:p.accountId},f.profile),/Posisi & order/);
});

test('legacy evidence accounts are protected before first edit and stale settings cannot erase investments',async()=>{
 const f=fixture();const base=f.profile,account={id:'legacy',name:'Legacy',type:'asset',subtype:'investment',active:true};
 const profile={...base,accounts:[...base.accounts,account],investmentEvidence:{holdings:[{accountId:'legacy',symbol:'TEST',value:100,asOfDate:'2026-10-20'}]}};
 assert(investmentProtected({journal:[{accountId:'legacy'}]},profile));
 await assert.rejects(buildTransaction({type:'investment',amount:20,date:'2026-10-21',sourceAccountId:'rdn',destinationAccountId:'legacy'},profile),/Posisi & order/);
 await f.act(order);assert.throws(()=>guardInvestmentProfileWrite(f.profile,base),/Portofolio berubah/);
 assert.doesNotThrow(()=>guardInvestmentProfileWrite(f.profile,{...f.profile,hideBalanceDefault:true}));
});
test('overselling, stale forms, future dates, invalid fees and editing a filled order are rejected',async()=>{
 const f=fixture(),version=investmentVersion(f.profile);await f.act(order);const o=investmentPortfolio(f.profile).orders[0];
 await assert.rejects(f.act({...order,expectedVersion:version}));
 const fill={kind:'fill',orderId:o.id,quantity:400,price:1000,fee:0,date:'2026-10-21',cashAccountId:'rdn'};
 for(const patch of [{quantity:500},{fee:-1},{date:'2026-10-22'},{quantity:1.5},{cashAccountId:'liability-mandiri-cc'}])await assert.rejects(f.act({...fill,...patch}));
 await f.act(fill);await assert.rejects(f.act({...order,orderId:o.id}));
 const p=investmentPortfolio(f.profile).positions[0];await assert.rejects(f.act({kind:'sell',positionId:p.id,quantity:401,price:1000,fee:0,date:'2026-10-21',cashAccountId:'rdn'}));
 await assert.rejects(f.act({kind:'position',positionId:p.id,name:'Changed',quantity:401,cost:1,bookValue:400000,date:'2026-10-21'}));assert.equal(f.txs.length,1);
});
