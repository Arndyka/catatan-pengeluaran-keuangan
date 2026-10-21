import {$,escapeHtml as e,formatDateLocal,formatDateId,parseLocalDate} from './utils.js';
import {state} from './state.js';
import {paylaterSnapshot,paymentMatches} from './paylater.js';
import {settlePaylaterBill} from './repository.js';
import {loanPlansHtml} from './loan-ui.js';
let ctx,view='',filter='unpaid';
const dateLabel=value=>formatDateId(parseLocalDate(value));
const periodLabel=value=>new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(parseLocalDate(value+'-01'));
export function resetPaylaterUI(){view='';filter='unpaid';}
export function setupPaylaterUI(context){
 ctx=context;
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-credit-view],[data-paylater-filter],[data-paylater-pay]');if(!button)return;
  if(button.dataset.creditView){view=button.dataset.creditView;renderPaylaterUI();}
  if(button.dataset.paylaterFilter){filter=button.dataset.paylaterFilter;renderPaylaterUI();}
  if(button.dataset.paylaterPay)openPayment(button.dataset.paylaterPay);
 });
}
export function renderPaylaterUI(){
 if(!ctx||!state.settings)return;
 const plan=state.paylater;
 if(!view)view=plan?.bills?.length?'paylater':'bank';
 $('creditBankView').classList.toggle('hidden',view!=='bank');$('paylaterView').classList.toggle('hidden',view!=='paylater');
 $('loanView').classList.toggle('hidden',view!=='loans');
 $('loanView').innerHTML=loanPlansHtml(state.settings.loanPlans,ctx.money);
 document.querySelectorAll('[data-credit-view]').forEach(b=>{b.classList.toggle('active',b.dataset.creditView===view);b.setAttribute('aria-pressed',String(b.dataset.creditView===view));});
 if(!plan?.accountId||!plan.bills?.length){$('paylaterView').innerHTML='<div class="panel empty-state"><h2>Tagihan PayLater</h2><p>Belum ada jadwal PayLater di akun ini. Jadwal dari rincian tagihan akan tampil terpisah dari kartu kredit.</p></div>';return;}
 let snapshot;try{snapshot=paylaterSnapshot(plan,state.transactions);}catch(error){$('paylaterView').innerHTML=`<div class="notice error" role="alert">${e(error.message)}</div>`;return;}
 const money=ctx.money,next=snapshot.next,visible=snapshot.bills.filter(b=>filter==='paid'?b.status==='paid':b.status!=='paid');
 const unlinked=state.transactions.filter(t=>t.type==='credit_payment'&&t.destinationAccountId===plan.accountId&&!t.sourceMeta?.paylaterBillId&&t.date>=plan.asOfDate&&t.date<=formatDateLocal());
 $('paylaterView').innerHTML=`<section class="paylater-hero panel"><div class="paylater-heading"><div><p class="section-label">BAYAR NANTI, RENCANAKAN SEKARANG</p><h2>${e(plan.name)}</h2></div><span class="pill">${snapshot.paidCount}/${snapshot.bills.length} tagihan lunas</span></div><div class="paylater-totals"><div><span>Total tagihan belum lunas</span><strong id="paylaterOutstanding">${money(snapshot.outstanding)}</strong></div><div><span>${next?'Jatuh tempo terdekat':'Semua jadwal selesai'}</span><strong>${next?dateLabel(next.dueDate):'Lunas'}</strong><p>${next?money(next.remaining):'Tidak ada tagihan tersisa.'}</p></div></div>${snapshot.overdue>0?`<p class="notice error">Tagihan lewat jatuh tempo: ${money(snapshot.overdue)}. Status berdasarkan pembayaran yang tercatat.</p>`:''}<div class="paylater-limit"><div><span>Jumlah limit</span><strong>${money(plan.limit)}</strong></div><div><span>Limit tersedia</span><strong>${money(plan.availableLimit)}</strong></div><div><span>Limit terpakai</span><strong>${money(snapshot.usedLimit)}</strong></div></div><p class="helper-note">Angka limit sesuai data ${dateLabel(plan.limitSnapshotDate||plan.asOfDate)}. Tidak otomatis dinaikkan setelah pembayaran; cocokkan kembali dengan aplikasi penerbit.</p></section>
 ${snapshot.limitDifference!==0?`<div class="notice info">Total jadwal ${snapshot.limitDifference>0?'lebih besar':'lebih kecil'} ${money(Math.abs(snapshot.limitDifference))} dari limit terpakai pada snapshot limit ${dateLabel(plan.limitSnapshotDate||plan.asOfDate)}. Penyebab selisih belum diketahui; tidak diasumsikan sebagai bunga atau biaya.</div>`:''}
 ${unlinked.length?`<div class="notice info">${unlinked.length} pembayaran belum ditautkan ke tagihan. Pilih “Catat lunas”, lalu tautkan catatan yang sudah ada agar tidak terhitung dua kali.</div>`:''}
 <section class="panel paylater-schedule"><div class="panel-header"><div><p class="section-label">JADWAL PEMBAYARAN</p><h2>Satu per satu, makin ringan.</h2></div></div><div class="investment-tabs" role="group" aria-label="Status tagihan PayLater"><button type="button" data-paylater-filter="unpaid" aria-pressed="${filter==='unpaid'}" class="${filter==='unpaid'?'active':''}">Belum lunas</button><button type="button" data-paylater-filter="paid" aria-pressed="${filter==='paid'}" class="${filter==='paid'?'active':''}">Lunas</button></div><div class="paylater-bills">${visible.length?visible.map(b=>`<article class="paylater-bill" data-paylater-bill="${e(b.id)}"><div><span class="section-label">Periode ${e(periodLabel(b.period))}</span><h3>${money(b.amount)}</h3><p>Jatuh tempo ${dateLabel(b.dueDate)}</p><span class="paylater-status ${b.daysUntilDue<0&&b.status!=='paid'?'is-overdue':''}">${b.status==='paid'?'Lunas':b.paid>0?'Periksa pembayaran tertaut':b.daysUntilDue<0?`${Math.abs(b.daysUntilDue)} hari lewat jatuh tempo`:b.daysUntilDue===0?'Jatuh tempo hari ini':`${b.daysUntilDue} hari lagi`}</span></div>${b.paid===0?`<button type="button" class="btn btn-light" data-paylater-pay="${e(b.id)}">Catat lunas</button>`:''}</article>`).join(''):'<p class="empty-state">Tidak ada tagihan pada bagian ini.</p>'}</div><p class="helper-note">Jadwal sudah tercatat sebagai kewajiban awal, bukan pengeluaran baru. Rincian pokok dan biaya belum dipisahkan. Catat pelunasan hanya setelah dibayar; Spendly tidak melakukan transfer uang.</p></section>`;
}
function openPayment(billId){
 const plan=state.paylater,uid=state.user?.uid,bill=paylaterSnapshot(plan,state.transactions).bills.find(b=>b.id===billId);if(!bill||bill.paid>0)return;
 const matches=paymentMatches(plan,billId,state.transactions,state.settings),accounts=state.settings.accounts.filter(a=>a.type==='asset'&&a.active!==false&&['bank','cash','ewallet'].includes(a.subtype));
 ctx.dialog('Catat tagihan yang sudah dibayar',`<p>${e(plan.name)} · ${dateLabel(bill.dueDate)}</p><h3>${ctx.money(bill.amount)}</h3><p class="helper-note">Mencatat pelunasan penuh. Jika pembayaran sudah ada dari scan bank, tautkan catatan tersebut.</p><form id="paylaterPaymentForm" class="form-stack"><label class="field">Cara mencatat<select name="existing" required><option value="">Pilih setelah memeriksa</option>${matches.map(t=>`<option value="${e(t.id)}">Tautkan ${e(t.date)} · ${e(ctx.money(t.amount))} · ${e(t.merchant||t.description||'Pembayaran')}</option>`).join('')}<option value="new">Pembayaran belum tercatat — buat catatan baru</option></select></label><div id="paylaterPaymentFields" class="form-pair hidden"><label class="field">Rekening pembayaran<select name="source" required><option value="">Pilih rekening</option>${accounts.map(a=>`<option value="${e(a.id)}">${e(a.name)}</option>`).join('')}</select></label><label class="field">Tanggal dibayar<input name="date" type="date" required min="${e(plan.asOfDate)}" max="${formatDateLocal()}" value="${formatDateLocal()}"></label></div><p class="form-error" role="alert"></p><button type="submit" class="btn btn-primary">Konfirmasi sudah dibayar</button></form>`);
 const form=$('paylaterPaymentForm');form.elements.existing.onchange=()=>{const isNew=form.elements.existing.value==='new';$('paylaterPaymentFields').classList.toggle('hidden',!isNew);form.elements.source.disabled=!isNew;form.elements.date.disabled=!isNew;};form.elements.existing.onchange();
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{
  if(state.user?.uid!==uid)throw new Error('Sesi berubah. Buka kembali tagihan.');
  const id=form.elements.existing.value;if(!id)throw new Error('Pilih transaksi yang sudah ada atau catatan baru.');
  const result=await settlePaylaterBill(uid,billId,{expectedBill:{accountId:plan.accountId,asOfDate:plan.asOfDate,dueDate:bill.dueDate,amount:bill.amount},...(id==='new'?{date:form.elements.date.value,sourceAccountId:form.elements.source.value}:{existingTransactionId:id})});
  if(state.user?.uid!==uid)return;state.paylater=result.plan;$('spendlyDialog').close();renderPaylaterUI();ctx.toast(result.duplicate?'Tagihan ini sudah tercatat lunas.':result.linked?'Pembayaran ditautkan. Saldo tidak dipotong lagi.':'Pelunasan dicatat; saldo dan kewajiban diperbarui.');
 }catch(error){form.querySelector('[role="alert"]').textContent=error.message;}finally{button.disabled=false;}};
}
