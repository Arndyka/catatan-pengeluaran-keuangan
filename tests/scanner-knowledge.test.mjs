import test from 'node:test';
import assert from 'node:assert/strict';
import {consolidateStatements,predictLocalCategory} from '../assets/js/scanner-knowledge.js';
const row={date:'2026-06-01',time:'12:00:00',amount:10,signedAmount:-10,description:'Pembelian contoh',merchant:'TOKO',balanceAfter:90,category:'Belanja',type:'expense',sourcePage:1,sourceRow:1};
function source(name='one.pdf',changes={}){return {statement:{fileName:name,bank:'bca',pageCount:1,metadata:{accountMasked:'1234',periodStart:'2026-06-01',periodEnd:'2026-06-30',openingBalance:100,closingBalance:80,incomingTotal:0,outgoingTotal:20},reconciliation:{balanced:true,rowMismatchCount:0}},candidates:[row,{...row,balanceAfter:80,sourceRow:2}],...changes};}
test('consolidation collapses whole statement copies, preserving repeated real transactions and provenance',async()=>{
 const result=await consolidateStatements([source(),source('copy.pdf')]);
 assert.equal(result.statements.length,1);assert.equal(result.examples.length,2);assert.equal(result.duplicateFiles,1);assert.equal(result.duplicateRows,2);
 assert.deepEqual(result.statements[0].sourceFiles,['one.pdf','copy.pdf']);
 assert.notEqual(result.examples[0].id,result.examples[1].id);
 assert.equal(result.examples[0].labelStatus,'unreviewed');assert.equal(result.examples[0].category,'');
 assert.equal(result.examples[0].suggestedCategory,'Belanja');
 assert.deepEqual(await consolidateStatements([source(),source('copy.pdf')]),result);
});
test('different account, order, amount, or descriptions never collapse merely because totals match',async()=>{
 const different=source('different.pdf');different.statement.metadata.accountMasked='5678';
 const reordered=source('reordered.pdf');reordered.candidates=[...reordered.candidates].reverse();
 const revised=source('revised.pdf');revised.candidates=revised.candidates.map(r=>({...r,description:'Other transaction'}));
 const result=await consolidateStatements([source(),different,reordered,revised]);
 assert.equal(result.statements.length,4);assert.equal(result.examples.length,8);
});
test('unbalanced or empty-account statements are quarantined rather than used for knowledge',async()=>{
 const broken=source('broken.pdf');broken.statement.reconciliation.balanced=false;
 const unknown=source('unknown.pdf');unknown.statement.metadata.accountMasked='';
 const result=await consolidateStatements([source(),broken,unknown]);
 assert.equal(result.examples.length,2);assert.equal(result.rejected.length,2);
});

test('local category learning ignores unreviewed labels and financial numbers',()=>{
 const tx={type:'expense',merchant:'Toko Contoh',description:'Pembelian kebutuhan',amount:9999999};
 const examples=[1,2].map(id=>({...tx,id:String(id),category:'Belanja',labelStatus:'unreviewed'}));
 assert.equal(predictLocalCategory(tx,examples),null);
 const confirmed=examples.map(e=>({...e,labelStatus:'reviewed'}));
 assert.equal(predictLocalCategory(tx,confirmed).category,'Belanja');
 assert.equal(predictLocalCategory({...tx,amount:1,date:'2020-01-01'},confirmed).category,'Belanja');
 assert.equal(predictLocalCategory({...tx,merchant:'Klinik Sehat',description:'Konsultasi dokter'},confirmed),null);
 assert.equal(predictLocalCategory({...tx,type:'income'},confirmed),null);
});
test('conflicting or duplicated training examples cannot create a confident category',()=>{
 const example={id:'one',type:'expense',merchant:'Toko',description:'Pembelian',category:'Belanja',labelStatus:'reviewed'};
 assert.equal(predictLocalCategory(example,[example,example]),null);
 assert.equal(predictLocalCategory(example,[example,{...example,id:'two',category:'Makan'}]),null);
});
