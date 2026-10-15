import {$,escapeHtml as e,formatDateLocal,monthKey,setNotice} from './utils.js';
import {state} from './state.js';
import {saveRecurringRule,updateRecurringRule,deleteRecurringRule} from './repository.js';
import {isSalaryRule,validateRecurringRule,dueOccurrences,occurrenceForMonth,isSettled,recurringMatches} from './recurring-logic.js';
import {confirmOccurrence,postDueRules} from './recurring.js';
let ctx;
function mode(){const salary=$('recurringKind').value==='salary';if(salary){$('recurringType').value='income';$('recurringCategory').value='Gaji';}const type=$('recurringType').value;$('recurringType').disabled=salary;$('recurringCategory').readOnly=salary;$('recurringSourceLabel').textContent=type==='income'?'Rekening penerima':'Akun sumber';const movement=['transfer','investment','credit_payment'].includes(type);$('recurringDestination').disabled=!movement;$('recurringDestination').closest('.field').classList.toggle('hidden',!movement);}
function resetForm(){ $('recurringForm').reset();$('recurringRuleId').value='';$('recurringStart').value=formatDateLocal();$('recurringSaveButton').textContent='Simpan jadwal';mode();}
function editRule(id){
 const rule=state.recurringRules.find(r=>r.id===id);if(!rule)return;
 const ids={name:'Name',kind:'Kind',type:'Type',dayOfMonth:'Day',amount:'Amount',sourceAccountId:'Source',destinationAccountId:'Destination',category:'Category',startDate:'Start',endDate:'End'};
 $('recurringRuleId').value=id;
 for(const [key,suffix] of Object.entries(ids))$('recurring'+suffix).value=rule[key]||(key==='kind'?(isSalaryRule(rule)?'salary':'standard'):'');
 $('recurringSaveButton').textContent='Simpan perubahan';mode();$('recurringForm').scrollIntoView({behavior:'smooth',block:'center'});$('recurringName').focus();
}
export function setupRecurringUI(context){
 ctx=context;
 $('recurringKind').onchange=mode;$('recurringType').onchange=mode;$('cancelRecurringEdit').onclick=resetForm;
 $('salarySetupButton').onclick=()=>{resetForm();$('recurringKind').value='salary';$('recurringStart').value=monthKey()+'-01';$('recurringName').value='Gaji bulanan';mode();$('recurringAmount').focus();};
 $('recurringForm').onsubmit=async event=>{
  event.preventDefault();const button=$('recurringSaveButton');button.disabled=true;
  try{const id=$('recurringRuleId').value,existing=state.recurringRules.find(r=>r.id===id);
   const rule=validateRecurringRule({name:$('recurringName').value,kind:$('recurringKind').value,type:$('recurringType').value,dayOfMonth:$('recurringDay').value,amount:$('recurringAmount').value,sourceAccountId:$('recurringSource').value,destinationAccountId:$('recurringDestination').value,category:$('recurringCategory').value,startDate:$('recurringStart').value,endDate:$('recurringEnd').value,active:existing?.active!==false},state.settings.accounts);
   if(id)await updateRecurringRule(state.user.uid,id,rule);else await saveRecurringRule(state.user.uid,{...rule,settledPeriods:{},lastPostedPeriod:''});
   setNotice($('recurringMessage'),'success','Jadwal disimpan. Saldo berubah setelah transaksi dikonfirmasi.');resetForm();
  }catch(error){setNotice($('recurringMessage'),'error',error.message);}finally{button.disabled=false;}
 };
 $('postDueRecurringButton').onclick=async()=>{const button=$('postDueRecurringButton');button.disabled=true;try{const r=await postDueRules(state.user.uid,state.recurringRules,state.settings,state.transactions);setNotice($('recurringMessage'),'success',`${r.created} transaksi dibuat; ${r.duplicate} sudah tercatat; ${r.needsReview} gaji/transaksi mirip perlu konfirmasi satu per satu.`);}catch(error){setNotice($('recurringMessage'),'error',error.message);}finally{button.disabled=false;}};
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-settle-rule],[data-edit-recurring],[data-pause-recurring],[data-delete-recurring]');if(!button)return;
  try{
   if(button.dataset.settleRule){settleForm(button.dataset.settleRule,button.dataset.period);return;}
   if(button.dataset.editRecurring){editRule(button.dataset.editRecurring);return;}
   button.disabled=true;
   if(button.dataset.pauseRecurring){const rule=state.recurringRules.find(r=>r.id===button.dataset.pauseRecurring);await updateRecurringRule(state.user.uid,rule.id,{active:rule.active===false});}
   if(button.dataset.deleteRecurring){await deleteRecurringRule(state.user.uid,button.dataset.deleteRecurring);if($('recurringRuleId').value===button.dataset.deleteRecurring)resetForm();}
  }catch(error){setNotice($('recurringMessage'),'error',error.message);}finally{button.disabled=false;}
 });
 mode();
}
function settleForm(id,period){
 const rule=state.recurringRules.find(r=>r.id===id),occurrence=rule&&occurrenceForMonth(rule,period);if(!occurrence)return;
 const matches=recurringMatches(rule,period,state.transactions);
 ctx.dialog(isSalaryRule(rule)?'Konfirmasi gaji diterima':'Konfirmasi transaksi rutin',`<p>${e(rule.name)} · periode ${e(period)}</p><p class="helper-note">Tautkan transaksi yang sudah ada agar tidak dihitung dua kali. Jika belum tercatat, isi tanggal dan nominal aktual.</p><form id="settleRecurringForm" class="form-stack"><label class="field">Cara mencatat<select name="existing" required>${matches.length?'<option value="">Pilih setelah memeriksa</option>':''}<option value="new">Buat transaksi baru</option>${matches.map(tx=>`<option value="${e(tx.id)}">${e(tx.date)} · ${e(ctx.money(tx.amount))} · ${e(tx.merchant||tx.description||tx.category)}</option>`).join('')}</select></label><div id="actualSalaryFields" class="form-pair"><label class="field">Tanggal aktual<input name="date" type="date" min="${e(period)}-01" max="${formatDateLocal()}" required value="${occurrence.date>formatDateLocal()?formatDateLocal():occurrence.date}"></label><label class="field">Nominal aktual (Rp)<input name="amount" type="number" min="1" step="any" required value="${e(rule.amount)}"></label></div><p role="alert" class="form-error"></p><button class="btn btn-primary" type="submit">Konfirmasi dan simpan</button></form>`);
 const form=$('settleRecurringForm');form.elements.existing.onchange=()=>{const linked=form.elements.existing.value!=='new';$('actualSalaryFields').classList.toggle('hidden',linked);form.elements.date.disabled=linked;form.elements.amount.disabled=linked;};form.elements.existing.onchange();
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const existing=form.elements.existing.value;if(!existing)throw new Error('Pilih catatan yang sudah ada atau transaksi baru.');const result=await confirmOccurrence(state.user.uid,rule,period,state.settings,{existingTransactionId:existing==='new'?'':existing,date:form.elements.date.value,amount:form.elements.amount.value});$('spendlyDialog').close();ctx.toast(result.duplicate?'Periode ini sudah dikonfirmasi.':result.linked?'Transaksi ditautkan. Saldo tidak ditambahkan lagi.':'Penerimaan dicatat. Saldo dan budget telah diperbarui.');}catch(error){form.querySelector('[role="alert"]').textContent=error.message;}finally{button.disabled=false;}};
}
export function renderRecurringUI(){
 if(!ctx||!state.settings)return;
 const money=ctx.money,month=monthKey(),rules=state.recurringRules;
 const salaries=rules.filter(r=>isSalaryRule(r)&&r.active!==false&&occurrenceForMonth(r,month));
 const planned=salaries.reduce((n,r)=>n+Number(r.amount),0);
 const actual=state.transactions.filter(tx=>tx.type==='income'&&tx.date<=formatDateLocal()&&tx.date?.startsWith(month)&&(tx.sourceMeta?.recurringKind==='salary'||rules.some(r=>isSalaryRule(r)&&r.id===tx.recurringRuleId))).reduce((n,tx)=>n+Number(tx.amount),0);
 $('salaryOverview').innerHTML=`<div class="salary-head"><div><p class="section-label">GAJIAN LEBIH TERATUR</p><h2>Rencana bulan ini</h2><p>Jadwal adalah rencana. Konfirmasi gaji saat benar-benar diterima.</p></div><span class="salary-symbol" aria-hidden="true">↙</span></div><div class="salary-totals"><div><span>Gaji dijadwalkan</span><strong>${money(planned)}</strong></div><div><span>Sudah dikonfirmasi</span><strong>${money(actual)}</strong></div><div><span>Jadwal aktif</span><strong>${salaries.length}</strong></div></div>`;
 $('salaryDashboard').innerHTML=`<div><p class="section-label">RITME PEMASUKAN</p><h2>${salaries.length?'Gaji bulan ini':'Beri gajimu jadwal'}</h2><p>${salaries.length?`${money(actual)} dikonfirmasi · ${money(planned)} dijadwalkan`:'Atur tanggal gajian, lalu hubungkan ke saldo dan budget saat diterima.'}</p></div><button class="btn btn-light" data-page="recurring">Kelola gaji & rutin</button>`;
 const due=rules.flatMap(rule=>dueOccurrences(rule).map(occurrence=>({rule,occurrence})));
 $('dueRecurringList').innerHTML=due.length?due.map(({rule,occurrence:o})=>`<article class="list-card"><div><strong>${e(rule.name)}</strong><p>${e(o.date)} · ${money(rule.amount)}</p><span class="helper-note">${recurringMatches(rule,o.periodKey,state.transactions).length?'Ada catatan mirip: tautkan agar tidak ganda.':'Belum dikonfirmasi'}</span></div><button class="btn btn-light" data-settle-rule="${e(rule.id)}" data-period="${o.periodKey}">Konfirmasi</button></article>`).join(''):'<div class="empty-state">Tidak ada transaksi yang jatuh jadwal.</div>';
 $('recurringRuleList').innerHTML=rules.length?rules.map(rule=>{const o=occurrenceForMonth(rule,month),settled=isSettled(rule,month);return `<article class="list-card recurring-rule"><div><strong>${e(rule.name)}</strong><p>${isSalaryRule(rule)?'Gaji bulanan':'Transaksi rutin'} · tanggal ${e(rule.dayOfMonth)} · ${money(rule.amount)}</p><span class="pill">${rule.active===false?'Dijeda':settled?'Bulan ini selesai':o?`Jadwal ${o.date}`:'Di luar periode'}</span></div><div class="recurring-actions">${rule.active!==false&&o&&!settled?`<button class="text-button" data-settle-rule="${e(rule.id)}" data-period="${month}">${o.date>formatDateLocal()?'Sudah diterima lebih awal?':'Konfirmasi'}</button>`:''}<button class="text-button" data-edit-recurring="${e(rule.id)}">Ubah</button><button class="text-button" data-pause-recurring="${e(rule.id)}">${rule.active===false?'Aktifkan':'Jeda'}</button><button class="text-button danger-text" data-delete-recurring="${e(rule.id)}">Hapus</button></div></article>`;}).join(''):'<div class="empty-state">Belum ada jadwal. Mulai dari gaji bulanan atau tagihan rutin.</div>';
}
