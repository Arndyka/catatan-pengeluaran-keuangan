import test from 'node:test';
import assert from 'node:assert/strict';
import {matchImport, reconcileImports, importIdentity} from '../assets/js/import-reconciliation.js';
import {buildTransaction,DEFAULT_SETTINGS} from '../assets/js/accounting.js';
test('reviewed cross-bank evidence aliases survive transfer consolidation and flag changed direction',()=>{
 const stored={date:'2026-10-16',type:'transfer',amount:100,sourceAccountId:'blu',destinationAccountId:'bca',sourceMeta:{bank:'blu',provenanceAliases:[{bank:'bca',fileHash:'bca-proof',page:1,row:2,signedAmount:100}]}};
 const candidate={date:stored.date,type:'income',amount:100,signedAmount:100,sourceAccountId:'bca',bank:'bca',sourceHash:'bca-proof',sourcePage:1,sourceRow:2};
 assert.equal(matchImport(candidate,[stored]).status,'duplicate');
 assert.equal(matchImport({...candidate,signedAmount:-100},[stored]).status,'review');
 assert.equal(matchImport({...candidate,bank:'mandiri'},[stored]).status,'new');
 assert.equal(matchImport({...candidate,sourceHash:'unproven'},[stored]).status,'new');
});
const tx={date:'2026-10-15',type:'expense',amount:50000,sourceAccountId:'bca',destinationAccountId:'',description:'Kopi',sourceMeta:{reference:'ABC123456'}};
test('same bank reference deduplicates across screenshot and PDF wording',()=>{
 assert.equal(matchImport({...tx,sourceMeta:null,reference:'ABC123456',description:'QRIS coffee'},[tx]).status,'duplicate');
});
test('different references, accounts, directions and unproven amounts stay distinct',()=>{
 for(const patch of [{reference:'XYZ654321',sourceMeta:null},{sourceAccountId:'krom'},{type:'income'},{amount:51000,sourceMeta:null}]) assert.equal(matchImport({...tx,...patch},[tx]).status,'new');
});
test('same date amount and text without reference needs review, never silently merged',()=>{
 const plain={...tx,sourceMeta:null};assert.equal(matchImport(plain,[plain]).status,'review');
});
test('identical file hash and row is idempotent, filenames alone are not',()=>{
 const a={...tx,sourceMeta:{fileHash:'a'.repeat(64),page:1,row:2}};
 assert.equal(matchImport({...tx,sourceMeta:null,sourceHash:'a'.repeat(64),sourcePage:1,sourceRow:2},[a]).status,'duplicate');
 assert.equal(matchImport({...tx,sourceMeta:null,sourceFile:'same.pdf'},[{...tx,sourceMeta:{fileName:'same.pdf'}}]).status,'review');
});
test('within-batch duplicates are excluded and ambiguity is unselected',()=>{
 const rows=reconcileImports([{...tx,reference:'ABC123456'},{...tx,reference:'ABC123456'},{...tx,sourceMeta:null}],[]);
 assert.deepEqual(rows.map(r=>r.importMatch.status),['new','duplicate','review']);
 assert.equal(rows[1].selected,false);assert.equal(rows[2].selected,false);
});
test('partial timestamps never hide a possible cross-format duplicate',()=>{
 assert.equal(matchImport({...tx,sourceMeta:null,time:'12:30'},[{...tx,sourceMeta:null,time:'12:30:00'}]).status,'review');
 assert.equal(matchImport({...tx,sourceMeta:null,time:'00:00:00'},[{...tx,sourceMeta:null,time:'12:30:11'}]).status,'review');
});
test('shifted salary scan is reviewed against a confirmed routine in the same month',()=>{
 const existing={...tx,type:'income',recurringRuleId:'salary',date:'2026-10-01',sourceMeta:null};
 assert.equal(matchImport({...existing,recurringRuleId:'',date:'2026-10-02'},[existing]).status,'review');
 assert.equal(matchImport({...existing,recurringRuleId:'',date:'2026-11-01'},[existing]).status,'new');
});
test('salary scan also reviews an advance receipt assigned to the next month',()=>{
 const existing={...tx,type:'income',recurringRuleId:'salary',date:'2026-10-30',sourceMeta:{recurringPeriod:'2026-11'}};
 assert.equal(matchImport({...existing,recurringRuleId:'',date:'2026-11-01',sourceMeta:null},[existing]).status,'review');
 assert.equal(matchImport({...existing,recurringRuleId:'',date:'2026-12-01',sourceMeta:null},[existing]).status,'new');
});

test('legacy incoming Krom rows reconcile despite an irrelevant destination field',()=>{
 const prior={...tx,type:'income',sourceAccountId:'krom',destinationAccountId:'krom'};
 assert.equal(matchImport({...prior,destinationAccountId:''},[prior]).status,'duplicate');
 assert.equal(matchImport({...prior,type:'transfer',destinationAccountId:'bca'},[{...prior,type:'transfer'}]).status,'new');
});

test('historical inferred bank codes and sender account IDs require review',()=>{
 for(const [bank,reference,description,extractionMethod] of [
  ['bca','BIF TRANSFER DR 014','BIF TRANSFER DR 014','bca-native-layout-v3'],
  ['bca','1510/FTSCY/WS95011','TRSF E-BANKING 1510/FTSCY/WS95011','bca-native-layout-v3'],
  ['krom','123456789012','Transfer dari 123456789012','krom-native-layout']
 ]){
  const prior={...tx,description,sourceMeta:{bank,reference,extractionMethod}};
  assert.equal(matchImport({...prior},[prior]).status,'review');
 }
});

test('opposite bank statements for the same mapped movement require review despite different references',()=>{
 const outgoing={...tx,type:'transfer',sourceAccountId:'bca',destinationAccountId:'krom',bank:'bca',reference:'SOURCE12345',sourceMeta:null};
 const incoming={...outgoing,bank:'krom',reference:'TARGET98765'};
 assert.equal(matchImport(incoming,[outgoing]).status,'review');
 assert.deepEqual(reconcileImports([outgoing,incoming],[]).map(row=>row.selected),[true,false]);
 assert.equal(matchImport({...outgoing,reference:'OTHER123456'},[outgoing]).status,'new');
});

test('same strong reference with corrected cents or date requires review instead of another posting',()=>{
 const rounded={...tx,amount:1001,bank:'bca'};
 for(const patch of [{amount:1000.56},{date:'2026-10-14'},{amount:1000.56,date:'2026-10-14'}]){
  const corrected={...rounded,...patch};
  assert.equal(matchImport(corrected,[rounded]).status,'review');
  assert.equal(reconcileImports([corrected],[rounded])[0].selected,false);
 }
});

test('same document row with conflicting facts requires review even without a reference',()=>{
 const stored={...tx,amount:1001,sourceMeta:{fileHash:'proofhash',page:2,row:3}};
 for(const patch of [{amount:1000.56},{date:'2026-10-14'}]){
  const corrected={...stored,...patch};
  assert.equal(matchImport(corrected,[stored]).status,'review');
 }
 const conflictingReferences={...stored,sourceMeta:{...stored.sourceMeta,reference:'REF123456'}};
 assert.equal(matchImport({...conflictingReferences,reference:'REF654321'},[conflictingReferences]).status,'review');
});

test('conflicting-fact review never matches another known bank, account, type or transfer destination',()=>{
 const stored={...tx,bank:'bca',amount:1001,sourceMeta:{reference:'ABC123456',fileHash:'proofhash',page:2,row:3}};
 for(const patch of [{bank:'krom'},{sourceAccountId:'krom'},{type:'income'}]){
  assert.equal(matchImport({...stored,...patch,amount:1000.56},[stored]).status,'new');
 }
 assert.equal(matchImport({...stored,bank:'krom'},[stored]).status,'new');
 const movement={...stored,type:'transfer',destinationAccountId:'krom'};
 assert.equal(matchImport({...movement,amount:1000.56,destinationAccountId:'mandiri'},[movement]).status,'new');
});

test('same bank-local reference from different banks cannot collide at permanent transaction storage',async()=>{
 const bca={...tx,sourceAccountId:'asset-bca',bank:'bca'};
 const otherBank={...bca,bank:'krom'};
 const first=await buildTransaction({...bca,importIdentity:importIdentity(bca)},DEFAULT_SETTINGS);
 const second=await buildTransaction({...otherBank,importIdentity:importIdentity(otherBank)},DEFAULT_SETTINGS);
 assert.notEqual(first.fingerprint,second.fingerprint);
 const sameBankMeta={...bca,bank:'',sourceMeta:{...bca.sourceMeta,bank:'bca'}};
 assert.equal(importIdentity(bca),importIdentity(sameBankMeta));
});

test('private consolidated source aliases catch copies even after accounting classification changed',()=>{
 const stored={...tx,type:'transfer',destinationAccountId:'clearing',sourceMeta:{bank:'bca',fileHash:'original',page:2,row:3,provenanceAliases:[{fileHash:'copy',page:2,row:3}]}};
 const candidate={...tx,bank:'bca',sourceMeta:null,sourceHash:'copy',sourcePage:2,sourceRow:3};
 assert.equal(matchImport(candidate,[stored]).status,'duplicate');
 assert.equal(matchImport({...candidate,amount:60000},[stored]).status,'review');
 assert.equal(matchImport({...candidate,sourceRow:4},[stored]).status,'new');
 assert.equal(matchImport({...candidate,bank:'mandiri'},[stored]).status,'new');
});
