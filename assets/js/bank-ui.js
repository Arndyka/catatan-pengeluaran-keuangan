import {moneyFormData,refreshMoneyInputs} from './money-input.js';
import {journalEntries} from './accounting.js';
import {$,escapeHtml as e,formatDateLocal,monthKey} from './utils.js';
import {state} from './state.js';
import {deriveLedger} from './accounting.js';
import {icon} from './icons.js';
import {BANK_PRODUCTS,VERIFIED_ON,suggestedProduct,interestEstimate,dailyAccountBalances,bankForecast} from './bank-planning.js';

let ctx;
const bankAccounts=()=>state.settings.accounts.filter(a=>a.type==='asset'&&a.subtype==='bank'&&a.active!==false);
function savingsConfig(){return {name:'Tabungan kita',accountId:bankAccounts().find(a=>a.name.toLowerCase().includes('krom'))?.id||'',rate:6,...ctx.getPlanning().savings};}
function accountRule(account){const saved=ctx.getPlanning().bankRules?.[account.id];const product=saved?.product||suggestedProduct(account);return BANK_PRODUCTS[product]?{...BANK_PRODUCTS[product],...saved,product}:null;}
export function setupBankFeatures(context){
 ctx=context;
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-bank-action]');if(!button)return;
  const action=button.dataset.bankAction;
  if(action==='savings-settings')savingsForm();
  if(action==='bank-rule')ruleForm(button.dataset.account);
  if(action==='savings'||action==='portfolio'){
   $('savingsView').classList.toggle('hidden',action!=='savings');$('investmentView').classList.toggle('hidden',action==='savings');
   document.querySelectorAll('.investment-tabs button').forEach(b=>{const active=b.dataset.bankAction===action;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
 });
}
function feedback(form,error){form.querySelector('[role="alert"]').textContent=error.message;}
function savingsForm(){
 const s=savingsConfig();
 ctx.dialog('Tabungan bersama di Krom',`<form id="savingsForm" class="form-stack"><label class="field">Nama tabungan<input name="name" required maxlength="80" value="${e(s.name)}"></label><label class="field">Dompet yang dipantau<select name="accountId" required><option value="">Pilih rekening</option>${bankAccounts().map(a=>`<option value="${e(a.id)}" ${s.accountId===a.id?'selected':''}>${e(a.name)}</option>`).join('')}</select></label><label class="field">Bunga tahunan (% p.a.)<input name="rate" type="number" min="0" max="100" step="0.01" required value="${e(s.rate)}"></label><p class="helper-note">Default Krom Basic 6% p.a. Saldo mengikuti transaksi dompet pilihanmu. Total bersama saja, tanpa pembagian kontribusi. Jika menggunakan Boost atau produk lain, sesuaikan bunga dengan aplikasi bank.</p><p role="alert" class="form-error"></p><button class="btn btn-primary" type="submit">Simpan tabungan</button></form>`);
 $('savingsForm').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
  try{const data=moneyFormData(form);data.name=data.name.trim();data.rate=Number(data.rate);if(!data.name||!bankAccounts().some(a=>a.id===data.accountId))throw new Error('Pilih nama dan rekening yang valid.');interestEstimate(0,data.rate,monthKey());await ctx.savePlanning({...ctx.getPlanning(),savings:data});$('spendlyDialog').close();ctx.toast('Tabungan bersama diperbarui.');}catch(error){feedback(form,error);}finally{button.disabled=false;}
 };
}
function ruleForm(id){
 const account=bankAccounts().find(a=>a.id===id);if(!account)return;
 const rule=accountRule(account)||{product:'',admin:0,card:0,minimum:0,held:0,penalty:0,basis:'none'};
 ctx.dialog(`Aturan rekening ${e(account.name)}`,`<form id="bankRuleForm" class="form-stack"><label class="field">Produk bank<select name="product" required><option value="">Pilih produk</option>${Object.entries(BANK_PRODUCTS).map(([key,p])=>`<option value="${key}" ${key===rule.product?'selected':''}>${p.name}</option>`).join('')}</select></label><div class="form-pair">${[['admin','Admin rekening / bulan'],['card','Admin kartu / bulan'],['minimum','Batas untuk penalti'],['penalty','Penalti / bulan'],['held','Saldo ditahan']].map(([key,label])=>`<label class="field">${label} (Rp)<input name="${key}" type="number" min="0" step="1" required value="${e(rule[key])}"></label>`).join('')}<label class="field">Dasar penalti<select name="basis"><option value="none">Tidak ada penalti saldo</option><option value="current">Saldo saat ini (indikasi)</option><option value="closing">Saldo akhir bulan</option><option value="average">Saldo rata-rata bulanan</option></select></label></div><p class="helper-note">Tarif awal diperiksa ${VERIFIED_ON}. Kamu dapat mengubahnya sesuai produk dan tarif terbaru. Perkiraan tidak membuat transaksi otomatis.</p><p role="alert" class="form-error"></p><button class="btn btn-primary" type="submit">Simpan aturan</button></form>`);
 const form=$('bankRuleForm');form.elements.basis.value=rule.basis;
 form.elements.product.onchange=()=>{const p=BANK_PRODUCTS[form.elements.product.value];if(p)for(const key of ['admin','card','minimum','penalty','held','basis'])form.elements[key].value=p[key];refreshMoneyInputs();};
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  try{const data=moneyFormData(form);if(!BANK_PRODUCTS[data.product]||!['none','current','closing','average'].includes(data.basis))throw new Error('Pilih produk dan dasar penalti.');for(const key of ['admin','card','minimum','penalty','held']){data[key]=Number(data[key]);if(!Number.isFinite(data[key])||data[key]<0)throw new Error('Nominal harus nol atau lebih.');}await ctx.savePlanning({...ctx.getPlanning(),bankRules:{...ctx.getPlanning().bankRules,[id]:data}});$('spendlyDialog').close();ctx.toast('Aturan rekening disimpan.');}catch(error){feedback(form,error);}finally{button.disabled=false;}
 };
}
export function renderBankFeatures(transactions){
 const money=ctx.money,s=savingsConfig(),account=state.settings.accounts.find(a=>a.id===s.accountId);
 const balance=deriveLedger(transactions).accounts.find(a=>a.accountId===s.accountId)?.balance||0;
 const interest=interestEstimate(balance,Number(s.rate),monthKey());
 const history=transactions.filter(tx=>journalEntries(tx.journal).some(j=>j.accountId===s.accountId)).slice(0,6);
 $('savingsView').innerHTML=`<section class="savings-hero"><div class="panel-header"><div><p class="section-label">UNTUK RENCANA KITA</p><h2>${e(s.name)}</h2></div><span class="savings-heart">${icon('heart')}</span></div><p>${account?e(account.name)+' · Total tabungan bersama':'Pilih rekening Krom untuk mulai memantau'}</p><strong class="savings-total">${money(balance)}</strong><div class="savings-footer"><span class="pill">${e(s.rate)}% p.a. · sebelum pajak</span><button class="btn btn-light" data-bank-action="savings-settings">Atur tabungan</button></div></section><div class="savings-estimates">${[['Per hari',interest.daily],['Bulan ini · '+interest.days+' hari',interest.monthly],['Per tahun · 365 hari',interest.annual]].map(([label,value])=>`<article class="metric-card"><div><p>Estimasi bunga ${label.toLowerCase()}</p><strong>${money(value)}</strong></div></article>`).join('')}</div><section class="panel"><div class="panel-header"><div><p class="section-label">SEDIKIT DEMI SEDIKIT</p><h2>Aktivitas tabungan</h2></div><button class="text-button" data-page="scanner">Impor mutasi ${icon('chevron')}</button></div>${history.length?history.map(tx=>{const delta=journalEntries(tx.journal).filter(j=>j.accountId===s.accountId).reduce((n,j)=>n+Number(j.debit||0)-Number(j.credit||0),0);return `<div class="savings-activity"><div><strong>${e(tx.merchant||tx.description||tx.category)}</strong><p>${e(tx.date)}</p></div><strong>${state.hideBalances?'':delta>=0?'+':'−'}${money(Math.abs(delta))}</strong></div>`;}).join(''):'<p class="muted">Belum ada transaksi di rekening ini. Impor mutasi atau catat transfer ke Krom untuk memperbarui saldo.</p>'}</section><div class="insight-note">${icon('sparkles')}<p>Estimasi bruto = saldo tercatat × bunga tahunan × jumlah hari / 365, dengan asumsi saldo tetap. Bunga Krom aktual memakai saldo akhir harian dan cair tanggal 28; pajak belum dikurangi. Estimasi tidak ditambahkan ke saldo. <a href="https://krom.id/faq/" target="_blank" rel="noopener">Ketentuan Krom</a> · diperiksa ${VERIFIED_ON}.</p></div>`;
 const today=formatDateLocal(),days=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate();
 $('bankMonitor').innerHTML=`<div class="panel-header"><div><p class="section-label">JAGA SALDO, KENALI BIAYA</p><h2>Pengingat rekening</h2></div></div><p class="muted">Perkiraan dari jurnal Spendly. Untuk Mandiri, saldo saat ini dipakai sebagai indikator risiko; bukan keputusan penalti bank. Lengkapi saldo awal dan mutasi agar mendekati saldo bank. Tidak memotong saldo otomatis.</p><div class="bank-monitor-grid">${bankAccounts().map(a=>{
  const rule=accountRule(a);if(!rule)return `<article class="bank-rule-card"><h3>${e(a.name)}</h3><p>Aturan produk belum dipilih.</p><button class="text-button" data-bank-action="bank-rule" data-account="${e(a.id)}">Atur biaya</button></article>`;
  const f=bankForecast(rule,dailyAccountBalances(transactions,a.id,today),days);
  return `<article class="bank-rule-card"><div class="panel-header"><h3>${e(a.name)}</h3><span class="pill">${f.penalty?'Risiko penalti':'Terpantau'}</span></div><p>${e(rule.name)}</p><dl><div><dt>Admin rekening + kartu</dt><dd>${money(f.fixedFee)} / bulan</dd></div><div><dt>${rule.basis==='average'?'Minimum rata-rata':rule.basis==='closing'?'Minimum akhir bulan':rule.basis==='current'?'Saldo minimum acuan':'Penalti saldo minimum'}</dt><dd>${money(rule.basis==='none'?0:rule.minimum)}</dd></div>${rule.held?`<div><dt>Saldo ditahan</dt><dd>${money(rule.held)}</dd></div>`:''}<div><dt>Perkiraan total biaya</dt><dd>${money(f.total)}</dd></div></dl><p class="helper-note">${rule.basis==='average'?`Rata-rata hingga hari ini ${money(f.average)}. `:''}${f.penalty?`Potensi penalti ${money(f.penalty)} jika saldo tidak berubah. Tambahan saldo sekitar ${money(Math.ceil(f.topUp))} mulai hari ini membantu mencapai batas.`:rule.basis==='none'?'Tidak ada penalti saldo minimum untuk produk ini.':'Saldo tercatat memenuhi batas saat ini.'}${f.heldShortfall?' Saldo tercatat di bawah saldo ditahan.':''}</p><div class="bank-rule-footer"><a href="${rule.source}" target="_blank" rel="noopener">Sumber tarif</a><button class="text-button" data-bank-action="bank-rule" data-account="${e(a.id)}">Ubah aturan</button></div></article>`;
 }).join('')}</div><p class="helper-note">Tarif diperiksa ${VERIFIED_ON}. Proyeksi menganggap saldo terakhir tetap hingga akhir bulan; biaya transaksi, rekening pasif, dan perubahan tarif belum termasuk.</p>`;
}
