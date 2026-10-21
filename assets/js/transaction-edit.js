import {investmentProtected} from './investment-ledger.js';
import {buildTransaction,validateJournal} from './accounting.js';
import {canonicalJson,formatDateLocal} from './utils.js';
import {validateSettlement} from './recurring-logic.js';

const fields=['type','date','amount','sourceAccountId','destinationAccountId','category','merchant','description','installmentTenor','adjustmentDirection'];
const financial=['type','date','amount','sourceAccountId','destinationAccountId','installmentTenor','adjustmentDirection'];
const snapshot=tx=>Object.fromEntries([...fields,'journal','sourceMeta','recurringRuleId','updatedAtClient','editRevision'].map(k=>[k,tx?.[k]??null]));
export const editVersion=tx=>canonicalJson(snapshot(tx));
export const transactionKeys=tx=>[...new Set([tx.id,tx.fingerprint,...(tx.editFingerprints||[])].filter(Boolean))];

export function editRestriction(tx,settings,plan){
 if(investmentProtected(tx,settings))return 'Catatan terhubung ke posisi saham. Hanya keterangan yang dapat diubah di sini.';
 if(tx.type==='loan_disbursement')return 'Pencairan terhubung ke rincian pinjaman. Keterangan dapat diubah; pokok, biaya, dan rekening mengikuti bukti pencairan.';
 if(settings.accounts.find(a=>a.id===tx.sourceAccountId)?.subtype==='clearing'&&['opening_balance','balance_adjustment'].includes(tx.type))return 'Saldo arsip sistem: hanya keterangan dan kategori yang dapat diubah di sini.';
 if(plan?.openingTransactionId===tx.id||Object.values(plan?.settlements||{}).includes(tx.id)||tx.sourceMeta?.paylaterBillId)return 'Catatan terhubung ke tagihan PayLater. Ubah keterangan di sini; nominal dan rekening mengikuti tagihan agar tidak terhitung dua kali.';
 return '';
}

export async function prepareTransactionEdit(old,patch,settings,{rule,plan}={}){
 const next={...old,...Object.fromEntries(fields.filter(k=>Object.hasOwn(patch,k)).map(k=>[k,patch[k]]))};
 const financialChanged=financial.some(k=>String(old[k]??'')!==String(next[k]??''));
 const restriction=editRestriction(old,settings,plan);
 if(restriction&&(financialChanged||((old.type==='loan_disbursement'||investmentProtected(old,settings))&&old.category!==next.category)))throw new Error(restriction);
 if(old.type==='opening_balance'&&['type','date','sourceAccountId'].some(k=>next[k]!==old[k]))throw new Error('Tanggal dan akun saldo awal tetap mengikuti awal pembukuan. Koreksi nominalnya di sini.');
 if(old.type!=='opening_balance'&&next.type==='opening_balance')throw new Error('Catat saldo awal melalui Dompet agar tidak membuat saldo awal ganda.');
 if(next.date>formatDateLocal())throw new Error('Transaksi aktual tidak boleh bertanggal masa depan. Gunakan jadwal rutin.');
 if(!['transfer','investment','investment_buy','investment_sell','credit_payment','loan_disbursement'].includes(next.type))next.destinationAccountId='';
 // Keeping an archived account is allowed; moving money to a different inactive account is not.
 const buildSettings={...settings,accounts:settings.accounts.map(a=>[old.sourceAccountId,old.destinationAccountId].includes(a.id)?{...a,active:true}:a)};
 const rebuilt=restriction?{...next}:await buildTransaction({...next,recurringPeriod:old.sourceMeta?.recurringPeriod},buildSettings);
 if(!validateJournal(rebuilt.journal||[]).valid)throw new Error('Jurnal lama perlu diperiksa sebelum dapat diedit.');
 if(rule&&financialChanged)validateSettlement(rule,old.sourceMeta?.recurringPeriod||old.date.slice(0,7),{...rebuilt,id:old.id});
 const sourceMeta={...old.sourceMeta,userEdited:true,categoryReviewed:true};
 // A correction is not proof that the original statement reconciles.
 if(financialChanged){sourceMeta.statementRecheckRequired=true;}
 if(patch.reviewConfirmed===true){
  sourceMeta.pendingAllocation='';
  if(old.type==='opening_balance')sourceMeta.verifiedOpening=true;
  sourceMeta.reviewConfirmedAt=new Date().toISOString();
 }
 return {...old,...rebuilt,id:old.id,fingerprint:old.fingerprint||old.id,
  editFingerprints:[...new Set([...(old.editFingerprints||[]),rebuilt.fingerprint].filter(Boolean))],
  editOriginal:old.editOriginal||snapshot(old),editRevision:Number(old.editRevision||0)+1,
  createdAtClient:old.createdAtClient||rebuilt.createdAtClient||new Date().toISOString(),updatedAtClient:new Date().toISOString(),sourceMeta,
  ...(financialChanged?{validationStatus:'review'}:{})};
}

// Both adapters execute all reads before writes, using a Firestore transaction or a local queue.
export async function updateStoredTransaction(io,id,patch,expected){
 const old=await io.getTransaction(id);
 if(!old)throw new Error('Transaksi sudah dihapus. Muat ulang riwayat.');
 if(!expected||editVersion(old)!==editVersion(expected))throw new Error('Transaksi berubah sejak formulir dibuka. Tutup dan buka Edit kembali.');
 const settings=await io.getProfile(),plan=await io.getPlan();
 const rule=old.recurringRuleId?await io.getRule(old.recurringRuleId):null;
 if(old.recurringRuleId&&!rule)throw new Error('Jadwal terkait tidak ditemukan. Periksa hubungan transaksi rutin dahulu.');
 const next=await prepareTransactionEdit(old,patch,settings,{rule,plan});
 for(const key of transactionKeys(next)){
  const owner=await io.keyOwner(key);if(owner&&owner!==id)throw new Error('Koreksi identik dengan transaksi lain. Periksa duplikat terlebih dahulu.');
 }
 if(editVersion(await io.getTransaction(id))!==editVersion(old))throw new Error('Transaksi berubah. Buka Edit kembali.');
 io.putTransaction(next);
 for(const key of transactionKeys(next))if(key!==id)io.putKey(key,id);
 return {id,updated:true};
}
