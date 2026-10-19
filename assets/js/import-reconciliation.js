// Conservative matching: equal value/date alone is never proof of a duplicate.
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
const isMovement=tx=>['transfer','investment','credit_payment'].includes(tx.type);
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
 return hash && page && row ? `${hash}:${page}:${row}` : '';
}
export function matchImport(candidate, existing) {
 let possible=null;
 for(const other of existing) {
  const a=reference(candidate),b=reference(other),p=provenance(candidate),q=provenance(other);
  const candidateBank=candidate.bank||meta(candidate).bank, otherBank=other.bank||meta(other).bank;
  const differentBanks=candidateBank&&otherBank&&candidateBank!=='generic'&&otherBank!=='generic'&&candidateBank!==otherBank;
  // Reviewed consolidation retains exact source rows, including evidence from
  // both banks of one transfer. Amount alone never establishes this link.
  const aliases=meta(other).provenanceAliases||[];
  const sourceAlias=p&&aliases.find(alias=>`${alias.fileHash}:${alias.page}:${alias.row}`===p&&(!differentBanks||alias.bank===candidateBank));
  if(sourceAlias){
   const signed=candidate.signedAmount??meta(candidate).statementSignedAmount;
   const directionConflict=Number.isFinite(signed)&&Number.isFinite(sourceAlias.signedAmount)&&signed!==sourceAlias.signedAmount;
   if(!directionConflict&&candidate.date===other.date&&Number(candidate.amount)>0&&Number(candidate.amount)===Number(other.amount))return {status:'duplicate',reason:'Baris sumber sudah tercatat dalam hasil konsolidasi',matchId:other.id||'',matched:other};
   possible={status:'review',reason:'Baris sumber sudah ada, tetapi tanggal, nominal, atau arah dana berbeda. Periksa sebelum menyimpan.',matchId:other.id||'',matched:other};continue;
  }
  if(differentBanks&&!isMovement(candidate))continue;
  if(!sameCore(candidate,other)) {
   if(!differentBanks&&sameAccounts(candidate,other)&&((a&&a===b)||(p&&p===q)))possible={status:'review',reason:'Referensi atau baris dokumen sama, tetapi tanggal atau nominal berbeda. Periksa catatan lama sebelum menyimpan lagi.',matchId:other.id||'',matched:other};
   else if(!differentBanks&&other.recurringRuleId&&sameAccounts(candidate,other)&&candidate.date?.slice(0,7)===other.date?.slice(0,7)&&Number(candidate.amount)===Number(other.amount)&&!(a&&b&&a!==b))possible={status:'review',reason:'Mirip transaksi rutin yang sudah tercatat bulan ini; tanggal pembayaran bisa bergeser. Periksa agar tidak ganda.',matchId:other.id||'',matched:other};
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
