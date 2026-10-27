import {investmentProtected} from './investment-ledger.js';
import {$,escapeHtml as e,formatDateLocal} from './utils.js';
import {parseMoneyInput} from './money-input.js';
import {state} from './state.js';
import {getSettings,updateTransaction} from './repository.js';
import {transactionTypeLabel} from './transactions.js';
import {editRestriction} from './transaction-edit.js';

export async function openTransactionEditor(id){
 const uid=state.user?.uid,old=structuredClone(state.transactions.find(t=>t.id===id));
 if(!old)return;
 const plan=await getSettings(uid,'paylater',{});
 if(state.user?.uid!==uid)return;
 const restriction=editRestriction(old,state.settings,plan),opening=old.type==='opening_balance';
 const types=['income','expense','expense_refund','credit_cash_advance','transfer','investment','credit_purchase','credit_payment',...(['loan_disbursement','investment_buy','investment_sell','investment_settlement','investment_valuation'].includes(old.type)?[old.type]:[]),...(opening?['opening_balance']:[]),...(old.type==='balance_adjustment'?['balance_adjustment']:[])];
 const textInput=(name,label,value,type='text',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${e(value??'')}" ${extra}></label>`;
 $('dialogContent').innerHTML=`<p class="section-label">KOREKSI CATATAN</p><h2 id="dialogTitle">Edit transaksi</h2><form id="transactionEditForm" class="form-stack"><p class="helper-note">Perubahan mengganti catatan ini dan menghitung ulang saldo. Bukti impor asli tetap tersimpan; tidak membuat transaksi baru.</p>${restriction?`<p class="helper-note">${e(restriction)}</p>`:''}<div class="form-pair">${textInput('date','Tanggal',old.date,'date',`required max="${formatDateLocal()}" ${opening||restriction?'disabled':''}`)}<label class="field">Tipe<select name="type" ${opening||restriction?'disabled':''}>${types.map(t=>`<option value="${t}" ${old.type===t?'selected':''}>${e(transactionTypeLabel(t))}</option>`).join('')}</select></label></div><div class="form-pair"><label class="field"><span id="editSourceLabel">Rekening</span><select name="sourceAccountId" required ${opening||restriction?'disabled':''}></select></label><label class="field" id="editDestinationField">Rekening tujuan<select name="destinationAccountId" ${restriction?'disabled':''}></select></label></div><div class="form-pair">${textInput('amount','Nominal (Rp)',old.amount,'number',`required min="0.01" step="0.01" ${restriction?'disabled':''}`)}${textInput('category','Kategori',old.category,'text',`required maxlength="100" ${old.type==='loan_disbursement'||investmentProtected(old,state.settings)?'disabled':''}`)}</div><label class="field" id="editDirectionField">Arah penyesuaian<select name="adjustmentDirection" ${restriction?'disabled':''}><option value="increase">Tambah saldo / utang</option><option value="decrease" ${old.adjustmentDirection==='decrease'?'selected':''}>Kurangi saldo / utang</option></select></label>${textInput('merchant','Merchant / pihak terkait',old.merchant,'text','maxlength="200"')}<label class="field">Keterangan<textarea name="description" rows="3" maxlength="2000">${e(old.description||'')}</textarea></label>${old.sourceMeta?.pendingAllocation||old.sourceMeta?.verifiedOpening===false?'<label class="edit-review-confirm"><input type="checkbox" name="reviewConfirmed"> Saya sudah memeriksa rincian ini dengan bukti yang benar.</label>':''}<p role="alert" class="form-error"></p><div class="edit-actions"><button type="button" class="btn btn-light" id="cancelTransactionEdit">Batal</button><button type="submit" class="btn btn-primary">Simpan perubahan</button></div></form>`;
 const form=$('transactionEditForm');
 function accountOptions(selected,predicate){return '<option value="">Pilih akun</option>'+state.settings.accounts.filter(a=>(a.active!==false||[old.sourceAccountId,old.destinationAccountId].includes(a.id))&&(predicate(a)||(restriction&&a.id===selected))).map(a=>`<option value="${e(a.id)}" ${a.id===selected?'selected':''}>${e(a.name)}${a.active===false?' · Arsip':''}</option>`).join('');}
 function mode(initial=false){
  const type=form.elements.type.value,source=initial?old.sourceAccountId:form.elements.sourceAccountId.value,destination=initial?old.destinationAccountId:form.elements.destinationAccountId.value;
  const movement=['transfer','investment','investment_buy','investment_sell','investment_settlement','credit_cash_advance','credit_payment','loan_disbursement'].includes(type);
  $('editSourceLabel').textContent=['income','expense_refund','loan_disbursement'].includes(type)?'Masuk ke rekening':['credit_purchase','credit_cash_advance'].includes(type)?'Dibebankan ke kartu':opening?'Rekening saldo awal':'Keluar dari rekening';
  form.elements.sourceAccountId.innerHTML=accountOptions(source,a=>opening||type==='balance_adjustment'?['asset','liability'].includes(a.type):type==='credit_cash_advance'?a.type==='liability'&&a.subtype==='credit_card':type==='credit_purchase'?a.type==='liability'&&['credit_card','paylater'].includes(a.subtype):a.type==='asset');
  form.elements.destinationAccountId.innerHTML=accountOptions(destination,a=>type==='credit_cash_advance'?a.type==='asset'&&['bank','cash','ewallet'].includes(a.subtype):type==='loan_disbursement'?a.type==='liability'&&a.subtype==='loan':type==='credit_payment'?a.type==='liability'&&['credit_card','paylater'].includes(a.subtype):type==='investment'?a.subtype==='investment':a.type==='asset');
  $('editDestinationField').hidden=!movement;form.elements.destinationAccountId.required=movement;
  $('editDirectionField').hidden=type!=='balance_adjustment';
 }
 mode(true);form.elements.type.onchange=()=>mode();
 $('cancelTransactionEdit').onclick=()=>$('spendlyDialog').close();
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');button.disabled=true;error.textContent='';
  try{
   if(state.user?.uid!==uid)throw new Error('Sesi berubah. Buka kembali transaksi.');
   const patch=Object.fromEntries(['date','type','sourceAccountId','destinationAccountId','amount','category','merchant','description','adjustmentDirection'].filter(k=>!form.elements[k].disabled&&(k!=='adjustmentDirection'||form.elements.type.value==='balance_adjustment')).map(k=>[k,k==='amount'?parseMoneyInput(form.elements[k].value):form.elements[k].value]));
   if(Object.hasOwn(patch,'amount'))patch.amount=Number(patch.amount);patch.reviewConfirmed=Boolean(form.elements.reviewConfirmed?.checked);
   await updateTransaction(uid,id,patch,old);
   $('spendlyDialog').close();
   document.querySelector(`[data-edit-transaction="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
  }catch(err){error.textContent=err.message;}finally{button.disabled=false;}
 };
 $('spendlyDialog').showModal();
}
