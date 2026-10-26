// Conservative matching: equal value/date alone is never proof of a duplicate.
import {recurringReceiptInPeriod} from './recurring-logic.js';
const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
const meta = tx => tx.sourceMeta || {};
export function explicitBankReference(text) {
 return String(text||'').match(/\b(?:no\.?\s*(?:referensi|ref)|nomor referensi|reference|ref(?:erensi)?\.?|id transaksi|transaction id)(?:\s*[:#]\s*|\s+)([A-Z0-9][A-Z0-9/-]{5,})\b/i)?.[1] || '';
}
function reference(tx) {
 const value=norm(tx.reference || tx.movementReference || meta(tx).reference || meta(tx).movementReference);
 // Older native parsers mistook sender accounts, merchant words and bank/channel
 // codes for unique references. Only a labeled reference proves native identity.
 const method=tx.extractionMethod || meta(tx).extractionMethod || '';
 if(/^(krom-native-layout|bca-native-layout)/.test(method)&&value!==norm(explicitBankReference(tx.description)))return '';
 return value.length>=6 && !/^(0+|unknown|undefined|null|na)$/.test(value) ? value : '';
}
const isMovement=tx=>['transfer','investment','credit_payment','credit_cash_advance'].includes(tx.type);
function sameAccounts(a,b) {
 return a.type===b.type &&
  !!a.sourceAccountId && a.sourceAccountId===b.sourceAccountId &&
  (!isMovement(a)||(a.destinationAccountId||'')===(b.destinationAccountId||''));
}
function sameCore(a,b) {
 return a.date===b.date && Number(a.amount)>0 && Number(a.amount)===Number(b.amount) && sameAccounts(a,b);
}
function provenance(tx) {
 const m=meta(tx), hash=tx.sourceHash || m.fileHash;
 const page=tx.sourcePage || m.page, row=tx.sourceRow || m.row;
 const revision=tx.sourceRevision||m.sourceRevision;
 return hash && page && row ? `${hash}:${revision?revision+':':''}${page}:${row}` : '';
}
export function matchImport(candidate, existing) {
 let possible=null;
 for(const other of existing) {
  const a=reference(candidate),b=reference(other),p=provenance(candidate),q=provenance(other);
  const candidateBank=candidate.bank||meta(candidate).bank, otherBank=other.bank||meta(other).bank;
  const differentBanks=candidateBank&&otherBank&&candidateBank!=='generic'&&otherBank!=='generic'&&candidateBank!==otherBank;
  // A net bank payout may already be represented by gross card funding plus a separate fee.
  const receiptAccount=isMovement(candidate)&&candidate.signedAmount>0?candidate.destinationAccountId:candidate.sourceAccountId;
  if(other.type==='credit_cash_advance'&&candidate.date===other.date&&receiptAccount===other.destinationAccountId&&Number(candidate.amount)>0&&Number(candidate.amount)===Number(meta(other).netProceeds)&&(candidate.signedAmount??(candidate.type==='income'?candidate.amount:0))>0){
   possible={status:'review',reason:'Dana bersih ini mungkin sudah tercatat sebagai pencairan kartu dan potongan biaya. Periksa catatan terkait agar tidak menjadi pemasukan kedua.',matchId:other.id||'',matched:other};continue;
  }
  // Reviewed consolidation retains exact source rows, including evidence from
  // both banks of one transfer. Amount alone never establishes this link.
  const aliases=meta(other).provenanceAliases||[];
  const sourceAlias=p&&aliases.find(alias=>`${alias.fileHash}:${alias.sourceRevision?alias.sourceRevision+':':''}${alias.page}:${alias.row}`===p&&(!differentBanks||alias.bank===candidateBank));
  if(sourceAlias){
   const signed=candidate.signedAmount??meta(candidate).statementSignedAmount;
   const directionConflict=Number.isFinite(signed)&&Number.isFinite(sourceAlias.signedAmount)&&signed!==sourceAlias.signedAmount;
   if(!directionConflict&&candidate.date===other.date&&Number(candidate.amount)>0&&Number(candidate.amount)===Number(other.amount))return {status:'duplicate',reason:'Baris sumber sudah tercatat dalam hasil konsolidasi',matchId:other.id||'',matched:other};
   possible={status:'review',reason:'Baris sumber sudah ada, tetapi tanggal, nominal, atau arah dana berbeda. Periksa sebelum menyimpan.',matchId:other.id||'',matched:other};continue;
  }
  if(differentBanks&&!isMovement(candidate)&&!isMovement(other))continue;
  if(!sameCore(candidate,other)) {
   // Screenshot history has only a bank direction, while a reviewed record may
   // already be classified as an own transfer or debt repayment. Do not import
   // it again merely because that classification changed.
   const statementAccount=candidate.signedAmount>0&&isMovement(candidate)?candidate.destinationAccountId:candidate.sourceAccountId;
   const oldMovement=(Array.isArray(other.journal)?other.journal:[]).filter(j=>j?.accountId===statementAccount).reduce((n,j)=>n+Math.round(Number(j.debit||0)*100)-Math.round(Number(j.credit||0)*100),0);
   const signed=candidate.signedAmount??(candidate.type==='income'?candidate.amount:-candidate.amount);
   if(candidate.type!==other.type&&candidate.date===other.date&&Number(candidate.amount)>0&&Number(candidate.amount)===Number(other.amount)&&oldMovement===Math.round(signed*100)&&!(a&&b&&a!==b))possible={status:'review',reason:'Mutasi akun yang sama sudah ada dengan jenis pencatatan berbeda. Periksa transfer atau pembayaran agar tidak dicatat ulang.',matchId:other.id||'',matched:other};
   if(!differentBanks&&sameAccounts(candidate,other)&&((a&&a===b)||(p&&p===q)))possible={status:'review',reason:'Referensi atau baris dokumen sama, tetapi tanggal atau nominal berbeda. Periksa catatan lama sebelum menyimpan lagi.',matchId:other.id||'',matched:other};
   else if(!differentBanks&&other.recurringRuleId&&sameAccounts(candidate,other)&&recurringReceiptInPeriod(other,candidate)&&Number(candidate.amount)===Number(other.amount)&&!(a&&b&&a!==b))possible={status:'review',reason:'Mirip transaksi rutin yang sudah tercatat untuk periode ini; tanggal pembayaran bisa bergeser. Periksa agar tidak ganda.',matchId:other.id||'',matched:other};
   continue;
  }
  if(isMovement(candidate)&&differentBanks){
   possible={status:'review',reason:'Mutasi dua bank mungkin mencatat perpindahan dana yang sama. Periksa agar transfer tidak dihitung dua kali.',matchId:other.id||'',matched:other};
   continue;
  }
  if(a && b && a!==b) {
   if(p&&p===q)possible={status:'review',reason:'Baris dokumen sama, tetapi referensi berbeda. Periksa bukti transaksi sebelum menyimpan lagi.',matchId:other.id||'',matched:other};
   continue;
  }
  if((a && a===b)||(p && p===q)) return {status:'duplicate',reason:a&&a===b?'Referensi bank sama':'Dokumen dan baris sudah diimpor',matchId:other.id||'',matched:other};
  // OCR and statements have different timestamp precision, and OCR may misread time.
  // Without a distinct bank reference, let the user resolve equal date/value/account.
  possible={status:'review',reason:'Tanggal, nominal, jenis, dan akun sama. Periksa sebelum menyimpan.',matchId:other.id||'',matched:other};
 }
 return possible || {status:'new',reason:'Belum ditemukan kecocokan'};
}
export function reconcileImports(candidates,existing) {
 const seen=[...existing];
 return candidates.map(candidate=>{
  const importMatch=matchImport(candidate,seen);
  const next={...candidate,importMatch,selected:importMatch.status==='new' && candidate.selected!==false};
  if(importMatch.status!=='duplicate')seen.push(candidate);
  return next;
 });
}
export function importIdentity(tx) {
 const ref=reference(tx);
 const bank=norm(tx.bank||meta(tx).bank);
 if(ref)return `reference:${bank&&bank!=='generic'?bank+':':''}${ref}`;
 const proof=provenance(tx);
 return proof?`document:${proof}`:tx.importIdentity||crypto.randomUUID();
}
