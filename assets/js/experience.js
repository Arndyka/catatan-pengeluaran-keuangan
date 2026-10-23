import {investmentPortfolio} from './investment-ledger.js';
import {setupInvestmentUI,investmentPortfolioHtml} from './investment-ui.js';
import {setupPaylaterUI,renderPaylaterUI,resetPaylaterUI} from './paylater-ui.js';
import {setupRecurringUI} from './recurring-ui.js';
import { $, escapeHtml as e, formatRupiah, formatDateLocal, monthKey, formatDateId, parseLocalDate } from './utils.js';
import { state } from './state.js';
import { deriveLedger, netWorthSnapshot, incomeStatement, transactionExpense } from './accounting.js';
import { budgetAnalysis } from './budget.js';
import { dailyAllowance, goalProgress, validateGoal, cashPosition } from './finance-insights.js';
import { getSettings, saveSettings, getBudgetPlan } from './repository.js';
import { isDemo } from './demo.js';
import { icon, hydrateIcons } from './icons.js';
import { setupBankFeatures, renderBankFeatures } from './bank-ui.js';
import {accountBrand} from './bank-brand.js';
import {openingBalanceInput,financialHealth,balanceEvidenceIssues} from './financial-health.js';
import {saveTransaction} from './transactions.js';
import {filterTransactions,recentActivity,transactionPresentation} from './transaction-filters.js';

const DEFAULT_PLANNING = {monthlyLimit:0,goals:[]};
let planning = structuredClone(DEFAULT_PLANNING);
let dashboardPlan = {items:[]};
let navigate;
let installPrompt;
let toastTimer;
let planningUid = null;
const money = value => state.hideBalances ? 'Rp ••••••' : formatRupiah(value);
const descriptions = {
 dashboard:'Lebih dekat dengan rencana baikmu.',wallets:'Semua sumber uang, dalam satu pandangan.',transactions:'Catatan kecil yang membuat perbedaan.',budget:'Rencanakan sekarang, nikmati dengan tenang.',goals:'Mimpi besar dimulai dari langkah kecil.',investments:'Bangun masa depan, sedikit demi sedikit.',scanner:'Impor mutasi bank, periksa, lalu simpan.',recurring:'Rutinitas keuangan yang lebih teratur.','credit-card':'Kenali tagihan dan ruang limitmu.',reports:'Pahami ke mana uangmu pergi.',settings:'Sesuaikan Spendly dengan caramu.'
};
const empty = (title,text,action='',label='Mulai sekarang') => `<div class="friendly-empty"><span class="empty-symbol">${icon('sparkles')}</span><h3>${title}</h3><p>${text}</p>${action?`<button class="btn btn-primary" data-action="${action}" type="button">${label}</button>`:''}</div>`;
const dateLabel = value => formatDateId(parseLocalDate(value));

export function resetExperience() {resetPaylaterUI();planningUid=null;planning=structuredClone(DEFAULT_PLANNING);dashboardPlan={items:[]};$('bottomNav').classList.add('hidden');$('spendlyDialog').close();}
export async function loadExperience(uid) {
 planningUid=uid;
 const [saved,plan] = await Promise.all([getSettings(uid,'planning',DEFAULT_PLANNING),getBudgetPlan(uid,monthKey())]);
 if (state.user?.uid!==uid) return;
 planning={...DEFAULT_PLANNING,...saved,goals:Array.isArray(saved.goals)?saved.goals:[]};
 dashboardPlan=plan;
 $('bottomNav').classList.remove('hidden');
 $('demoBanner').classList.toggle('hidden',!isDemo);
 renderExperience();
}
export function refreshBudgetPreview(plan) {if(plan.month===monthKey()) dashboardPlan=plan;renderExperience();}
export function onPageChange(page) {
 $('pageDescription').textContent=descriptions[page] || '';
 document.querySelectorAll('[data-page]').forEach(button=>{
   const active=button.dataset.page===page;
   button.classList.toggle('active',active);
   if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
 });
}
function toast(message) {$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
function dialog(title,body) {
 $('dialogContent').innerHTML=`<p class="section-label">RUANG RENCANAMU</p><h2 id="dialogTitle">${title}</h2>${body}`;
 hydrateIcons($('spendlyDialog'));
 if(!$('spendlyDialog').open) $('spendlyDialog').showModal();
}
async function savePlanning(next) {
 const uid=state.user?.uid;
 if (!uid || uid!==planningUid) throw new Error('Sesi berubah. Muat ulang sebelum menyimpan.');
 await saveSettings(uid,'planning',next);
 planning=next;
 renderExperience();
}
function formFeedback(form,error) {const el=form.querySelector('[role="alert"]');if(el) el.textContent=error.message || 'Tidak dapat menyimpan. Coba lagi.';}
function openingForm(accountId){
 const account=state.settings.accounts.find(a=>a.id===accountId);if(!account||account.active===false)return;
 const first=state.transactions.filter(tx=>(Array.isArray(tx.journal)?tx.journal:[]).some(j=>j?.accountId===accountId)).map(tx=>tx.date).sort()[0];
 dialog(`Saldo awal ${e(account.name)}`,`<form id="openingBalanceForm" class="form-stack"><p class="helper-note">Masukkan saldo sebelum transaksi pertama yang kamu catat, bukan saldo terkini setelah transaksi tersebut. Saldo awal tidak dihitung sebagai pemasukan atau belanja.</p><label class="field">Tanggal mulai<input name="date" type="date" max="${first||formatDateLocal()}" value="${first||formatDateLocal()}" required></label><label class="field">${account.type==='liability'?'Utang awal':'Saldo awal'} (Rp)<input name="amount" type="number" min="0.01" step="0.01" required></label><p role="alert" class="form-error"></p><button type="submit" class="btn btn-primary">Simpan saldo awal</button></form>`);
 $('openingBalanceForm').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
  try{const input=openingBalanceInput({date:form.elements.date.value,amount:Number(form.elements.amount.value),sourceAccountId:accountId},state.transactions);const result=await saveTransaction(state.user.uid,input,state.settings);if(!result.created)throw new Error('Saldo awal sudah tersimpan. Tidak ditambahkan lagi.');$('spendlyDialog').close();toast('Saldo awal disimpan tanpa menambah pemasukan bulanan.');}catch(error){formFeedback(form,error);}finally{button.disabled=false;}
 };
}
function goalForm(id='') {
 const goal=planning.goals.find(g=>g.id===id) || {name:'',target:'',saved:0,dueDate:'',icon:'sparkles'};
 dialog(id?'Satu langkah lebih dekat.':'Apa mimpi berikutnya?',`<p class="muted">Beri tujuanmu nama, angka, dan waktu.</p><form id="goalForm" class="form-stack"><label class="field">Nama goal<input name="name" maxlength="80" required placeholder="Misalnya: Dana darurat" value="${e(goal.name)}"></label><div class="form-pair"><label class="field">Target tabungan (Rp)<input name="target" type="number" min="1" step="1" required value="${e(goal.target)}"></label><label class="field">Sudah terkumpul (Rp)<input name="saved" type="number" min="0" step="1" required value="${e(goal.saved)}"></label></div><div class="form-pair"><label class="field">Tanggal target<input name="dueDate" type="date" required value="${e(goal.dueDate)}"></label><label class="field">Simbol<select name="icon">${[['shield','Dana darurat'],['home','Rumah'],['plane','Perjalanan'],['book','Pendidikan'],['heart','Keluarga'],['sparkles','Mimpi lainnya']].map(([value,label])=>`<option value="${value}" ${goal.icon===value?'selected':''}>${label}</option>`).join('')}</select></label></div><p class="helper-note">Jumlah terkumpul adalah catatan manual. Tidak membuat transaksi baru.</p><p role="alert" class="form-error"></p><button class="btn btn-primary" type="submit">${id?'Simpan perubahan':'Buat goal'}</button>${id?'<button class="text-button danger-text" type="button" id="deleteGoalButton">Hapus goal ini</button>':''}</form>`);
 $('goalForm').addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('[type="submit"]');submit.disabled=true;
   try {
     const valid=validateGoal(Object.fromEntries(new FormData(form)));
     const next={...valid,id:id || crypto.randomUUID()};
     await savePlanning({...planning,goals:id?planning.goals.map(g=>g.id===id?next:g):[...planning.goals,next]});
     $('spendlyDialog').close();toast(id?'Goal diperbarui. Terus melangkah!':'Mimpi baru sudah punya rencana.');
   } catch(error) {formFeedback(form,error);} finally{submit.disabled=false;}
 });
 $('deleteGoalButton')?.addEventListener('click',()=>{
   dialog('Hapus tujuan ini?',`<p>Catatan goal <strong>${e(goal.name)}</strong> akan dihapus. Saldo dompet tidak berubah.</p><p role="alert" id="deleteGoalError" class="form-error"></p><div class="dialog-actions"><button class="btn btn-light" id="cancelDeleteGoal">Batal</button><button class="btn btn-danger" id="confirmDeleteGoal">Hapus goal</button></div>`);
   $('cancelDeleteGoal').onclick=()=>goalForm(id);
   $('confirmDeleteGoal').onclick=async event=>{event.currentTarget.disabled=true;try{await savePlanning({...planning,goals:planning.goals.filter(g=>g.id!==id)});$('spendlyDialog').close();toast('Goal dihapus.');}catch(error){$('deleteGoalError').textContent=error.message;$('confirmDeleteGoal').disabled=false;}};
 });
}
function limitForm() {
 dialog('Beri ruang untuk belanja.',`<p class="muted">Batas pengeluaran bulanan untuk menghitung sisa belanja harian. Terpisah dari alokasi per kategori.</p><form id="limitForm" class="form-stack"><label class="field">Batas belanja per bulan (Rp)<input name="limit" type="number" min="1" step="1" value="${planning.monthlyLimit || ''}" required placeholder="8000000"></label><p class="helper-note">Sisa budget dibagi jumlah hari tersisa, termasuk hari ini. Belanja kartu kredit ikut dihitung; transfer dan investasi tidak.</p><p role="alert" class="form-error"></p><button class="btn btn-primary" type="submit">Simpan batas belanja</button></form>`);
 $('limitForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{const limit=Number(new FormData(form).get('limit'));if(!Number.isFinite(limit)||limit<=0)throw new Error('Masukkan nominal lebih dari nol.');await savePlanning({...planning,monthlyLimit:limit});$('spendlyDialog').close();toast('Rencana belanja diperbarui.');}catch(error){formFeedback(form,error);}finally{button.disabled=false;}};
}
function toggleTheme() {const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('spendly:theme',next);}catch{}$('themeButton').innerHTML=icon(next==='dark'?'sun':'moon');$('themeButton').setAttribute('aria-label',next==='dark'?'Aktifkan tema terang':'Aktifkan tema gelap');document.querySelector('meta[name="theme-color"]').content=next==='dark'?'#211e25':'#faf8f6';}
async function install() {
 if(installPrompt){await installPrompt.prompt();installPrompt=null;return;}
 dialog('Spendly, dekat di layar utama.',`<div class="install-illustration">${icon('download')}</div><p>Buka Spendly dari ikon di HP, seperti aplikasi.</p><div class="install-step"><strong>Android · Chrome</strong><p>Buka menu ⋮ → Tambahkan ke layar utama → Instal aplikasi (jika tersedia).</p></div><div class="install-step"><strong>iPhone · Safari</strong><p>Ketuk Bagikan → Tambahkan ke Layar Utama → Tambah.</p></div><p class="helper-note">Gunakan alamat website HTTPS. Login, sinkronisasi, dan AI membutuhkan internet. Saat ini bukan paket APK atau aplikasi App Store.</p>`);
}
export function setupExperience({setPage,updateTransactionFormMode,refresh=renderExperience}) {
 navigate=setPage;hydrateIcons();
 setupDesktopSidebar();
 setupBankFeatures({getPlanning:()=>planning,savePlanning,dialog,toast,money});
 setupRecurringUI({dialog,toast,money});
 setupInvestmentUI({dialog,toast,money,refresh});
 setupPaylaterUI({dialog,toast,money});
 const dark=document.documentElement.dataset.theme==='dark';$('themeButton').innerHTML=icon(dark?'sun':'moon');$('themeButton').setAttribute('aria-label',dark?'Aktifkan tema terang':'Aktifkan tema gelap');
 document.querySelector('meta[name="theme-color"]').content=dark?'#211e25':'#faf8f6';
 document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('mainContent').focus();});
 document.querySelectorAll(".section-intro>[data-action]").forEach(button=>button.setAttribute("aria-label",button.textContent.trim()));
 $('themeButton').onclick=toggleTheme;$('installButton').onclick=install;
 $('spendlyDialog').querySelector('.dialog-close').onclick=()=>$('spendlyDialog').close();
 $('spendlyDialog').addEventListener('click',event=>{if(event.target===$('spendlyDialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
 document.addEventListener('click',event=>{
   const button=event.target.closest('[data-action], [data-edit-goal], [data-page], [data-opening-account]');if(!button)return;
   if(button.dataset.openingAccount){openingForm(button.dataset.openingAccount);return;}
   if(button.dataset.page){$('spendlyDialog').close();navigate(button.dataset.page);return;}
   if(button.dataset.editGoal){goalForm(button.dataset.editGoal);return;}
   const action=button.dataset.action;
   if(action==='new-goal')goalForm();
   if(action==='limit')limitForm();
   if(action==='theme')toggleTheme();
   if(action==='install')install();
   if(action==='logout')$('logoutButton').click();
   if(action==='account'){navigate('settings');$('accountName').focus();$('accountForm').scrollIntoView({behavior:'smooth',block:'center'});}
   if(action==='transaction'||action==='investment'){
     navigate('transactions');$('transactionType').value=action==='investment'?'investment':'expense';updateTransactionFormMode();$('transactionAmount').focus();$('transactionForm').scrollIntoView({behavior:'smooth',block:'center'});
   }
   if(action==='menu')dialog('Ruang keuanganmu.',`<div class="menu-grid">${Object.entries(descriptions).filter(([key])=>key!=='dashboard').map(([key])=>{const source=document.querySelector(`.nav-link[data-page="${key}"]`);return `<button data-page="${key}" type="button">${source?.innerHTML || key}</button>`;}).join('')}</div>`);
 });
 window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
 window.addEventListener('offline',()=>toast('Kamu sedang offline. Sinkronisasi dan AI menunggu internet.'));
 window.addEventListener('online',()=>toast('Koneksi kembali tersedia.'));
 // A write may still be waiting for a server acknowledgement; keep its form visible.
 document.querySelectorAll('.notice').forEach(el=>el.setAttribute('role','status'));
}

function setupDesktopSidebar(){
 const toggle=$('sidebarToggle');
 for(const button of document.querySelectorAll('#sidebar .nav-link')){
  const label=button.textContent.trim();button.setAttribute('aria-label',label);button.title=label;
 }
 const update=collapsed=>{
  document.documentElement.dataset.sidebar=collapsed?'collapsed':'expanded';
  toggle.setAttribute('aria-expanded',String(!collapsed));
  const label=collapsed?'Buka sidebar':'Ringkas sidebar';toggle.setAttribute('aria-label',label);toggle.title=label;
 };
 update(document.documentElement.dataset.sidebar==='collapsed');
 toggle.addEventListener('click',()=>{
  const collapsed=document.documentElement.dataset.sidebar!=='collapsed';update(collapsed);
  try{localStorage.setItem('spendly:sidebar',collapsed?'collapsed':'expanded');}catch{}
 });
}

function smallGoal(goal) {
 const progress=goalProgress(goal);
 return `<button class="goal-mini" data-edit-goal="${e(goal.id)}" type="button"><span class="goal-symbol">${icon(goal.icon)}</span><span class="goal-mini-body"><strong>${e(goal.name)}</strong><span>${money(goal.saved)} <small>/ ${money(goal.target)}</small></span><span class="progress-track"><span class="progress-fill" style="width:${state.hideBalances?0:progress.percent}%"></span></span></span><span class="goal-percent">${state.hideBalances?'••':Math.round(progress.percent)+'%'}</span></button>`;
}
export function renderExperience() {
 renderPaylaterUI();
 if(!state.user || !state.settings)return;
 const today=formatDateLocal();const month=monthKey();
 const checks=financialHealth(state.transactions,state.settings,today);$('financialHealth').innerHTML=checks.length?`<section class="panel health-panel"><div><p class="section-label">PERIKSA CATATAN</p><h2>${checks.length} hal perlu ditinjau</h2></div>${checks.map(check=>`<div class="health-row">${icon('shield')}<p>${e(check.text)}</p><button type="button" class="text-button" data-history-issue="${e(check.kind)}">Periksa ${check.transactionIds.length} catatan ↗</button></div>`).join('')}</section>`:'';
 const monthLabel=new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(new Date());
 const current=state.transactions.filter(tx=>tx.date<=today);
 const statement=incomeStatement(current,month);const worth=netWorthSnapshot(current,state.settings);const allowance=dailyAllowance(current,planning.monthlyLimit,today);
 const name=state.user.displayName || state.user.email?.split('@')[0] || 'Teman Spendly';
 $('welcomeTitle').innerHTML=`Halo, ${e(name)} <span class="wave">✦</span>`;
 $('heroMonth').textContent=monthLabel;$('chartMonth').textContent=monthLabel;
 $('dailyAmount').textContent=allowance.configured?money(allowance.daily):'Mulai rencanamu';
 $('dailyHint').textContent=allowance.configured?(allowance.remaining<0?'Batas bulan ini terlewati. Saatnya menata ulang.':'Sisa belanja per hari, sampai akhir bulan.'):'Tentukan batas belanja bulanan yang nyaman untukmu.';
 $('todaySpent').textContent=money(allowance.todaySpent);
 const usage=allowance.configured?Math.min(100,allowance.spent/planning.monthlyLimit*100):0;
 $('monthRing').style.setProperty('--progress',`${state.hideBalances?0:usage}%`);
 $('monthPercent').textContent=state.hideBalances?'••':`${Math.round(usage)}%`;
 $('paceTitle').textContent=!allowance.configured?'Yuk, mulai atur.':usage>=100?'Waktunya evaluasi.':usage>=80?'Jaga ritmenya.':'Masih dalam rencana.';
 $('paceHint').textContent=allowance.configured?`${money(allowance.remaining)} tersisa dari batas bulanan.`:'Tentukan batas, lalu pantau langkahmu di sini.';
 $('daysRemaining').textContent=`${allowance.daysLeft} hari tersisa`;
 const worthOpen=$('netWorthDetails')?.open;
 const worthDetails=`<details id="netWorthDetails" ${worthOpen?'open':''}><summary>Lihat perhitungan</summary><dl><div><dt>Aset tercatat</dt><dd>${money(worth.assets)}</dd></div><div><dt>Total utang tercatat</dt><dd>${money(worth.liabilities)}</dd></div></dl><p>Aset dikurangi seluruh utang, termasuk sisa cicilan; bukan tagihan bulan ini. Akun sementara tidak dihitung sebagai aset. Aset yang belum dicatat belum termasuk.</p>${!worth.balanced?'<p>Ada jurnal yang perlu diperiksa.</p>':''}</details>`;
 $('modernStats').innerHTML=[['down','Pemasukan bulan ini',statement.income,'mint'],['up','Pengeluaran bulan ini',statement.expenses,'coral'],['wallet','Kekayaan bersih tercatat',worth.netWorth,'lavender']].map(([ico,label,value,color])=>`<article ${ico==='wallet'?'id="netWorthCard"':''} class="metric-card"><span class="metric-icon ${color}">${icon(ico)}</span><div><p>${label}</p><strong>${money(value)}</strong>${ico==='wallet'?worthDetails:''}</div></article>`).join('');
 const cash=cashPosition(current,state.settings,month,today),cashOpen=$('cashPositionDetails')?.open;
 const cashHtml=`<div class="cash-position-total"><div><p class="section-label">SALDO DANA</p><strong>${money(cash.balance)}</strong><p>Rekening, dompet digital, dan tunai · termasuk saldo awal</p></div><button class="text-button" data-page="wallets" type="button">Lihat dompet ↗</button></div><details id="cashPositionDetails" ${cashOpen?'open':''}><summary>Lihat perhitungan saldo</summary><dl><div><dt>Saldo bawaan + saldo awal</dt><dd>${money(cash.baseline)}</dd></div><div><dt>Uang masuk bulan ini</dt><dd>+ ${money(cash.inflow)}</dd></div><div><dt>Uang keluar bulan ini</dt><dd>− ${money(cash.outflow)}</dd></div>${cash.adjustments?`<div><dt>Penyesuaian pembukuan</dt><dd>${money(cash.adjustments)}</dd></div>`:''}<div><dt>Saldo terakhir</dt><dd>${money(cash.balance)}</dd></div></dl><p>Saldo bawaan berasal dari sebelum bulan ini. Transfer antar dompet sendiri tidak menambah total dana. Pembayaran kartu mengurangi dana; belanja kartu baru mengurangi dana saat dibayar. Investasi dan akun sementara tidak termasuk.</p>${!cash.valid?'<p class="danger-text">Ada jurnal bermasalah; periksa catatan sebelum mengandalkan saldo.</p>':''}</details>`;
 if(!$('cashPositionCard'))$('modernStats').insertAdjacentHTML('beforebegin','<section id="cashPositionCard" class="panel cash-position-card" aria-label="Saldo dana"></section>');
 $('cashPositionCard').innerHTML=cashHtml;
 renderChart(current,month);
 const budget=budgetAnalysis(current,month,dashboardPlan);
 $('budgetPreview').innerHTML=budget.rows.length?budget.rows.slice(0,4).map(row=>`<div class="budget-mini"><div><strong>${e(row.name)}</strong><span class="${row.overBudget?'danger-text':''}">${state.hideBalances?'••':Math.round(row.usage)+'%'}</span></div><div class="progress-track"><div class="progress-fill ${row.overBudget?'over':''}" style="width:${state.hideBalances?0:Math.min(100,row.usage)}%"></div></div><p>${money(row.actual)} <span>dari ${money(row.target)}</span></p></div>`).join(''):empty('Ruang untuk setiap kebutuhan.','Buat alokasi makan, transportasi, dan hal yang penting bagimu.');
 $('recentTransactions').innerHTML=transactionList(recentActivity(current,today).slice(0,5));
 $('goalsPreview').innerHTML=planning.goals.length?planning.goals.slice(0,3).map(smallGoal).join(''):empty('Mimpimu berikutnya?','Mulai dengan dana darurat atau liburan impian.','new-goal','Buat goal pertama');
 $('monthlyBudgetCard').innerHTML=`<div><p class="section-label">BATAS BELANJA BULANAN</p><h2>${planning.monthlyLimit?money(planning.monthlyLimit):'Mulai dengan batas yang nyaman.'}</h2><p>${allowance.configured?`${money(allowance.remaining)} tersisa · ${allowance.daysLeft} hari lagi`:'Atur batas untuk mendapatkan panduan belanja harian.'}</p></div><button class="btn btn-primary" data-action="limit" type="button">${planning.monthlyLimit?'Ubah batas':'Atur batas'}</button>`;
 renderWallets(current);renderGoals();renderInvestments(current);renderBankFeatures(current);
}
function transactionList(items) {
 if(!items.length)return empty('Belum ada cerita uang.','Catat pemasukan atau pengeluaran pertamamu.','transaction','Catat transaksi');
 return items.map(tx=>{const view=transactionPresentation(tx,state.settings.accounts);return `<button type="button" class="transaction-row transaction-link" data-history-transaction="${e(tx.id)}"><span class="transaction-symbol ${view.tone==='positive'?'mint':'coral'}">${icon(tx.type==='income'?'down':tx.type==='transfer'?'arrows':tx.type==='investment'?'chart':tx.category==='Makan'?'coffee':'bag')}</span><span class="transaction-copy"><strong>${e(tx.merchant || tx.category || 'Transaksi')}</strong><span class="transaction-account">${e(view.accountLabel)}</span><span>${e(tx.category)} · ${e(tx.date)}</span></span><strong class="transaction-value history-amount--${view.tone}">${state.hideBalances?'':view.sign+' '}${money(tx.amount)}</strong></button>`;}).join('');
}
function renderChart(transactions,month) {
 const totalDays=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 const values=Array.from({length:totalDays},()=>0);
 transactions.filter(tx=>tx.date?.startsWith(month)&&tx.date<=formatDateLocal()&&transactionExpense(tx)>0).forEach(tx=>values[Number(tx.date.slice(8))-1]+=transactionExpense(tx));
 if(state.hideBalances){$('spendingChart').innerHTML=empty('Angkamu tetap privat.','Tampilkan saldo untuk melihat grafik pengeluaran.');return;}
 const max=Math.max(...values,1);const total=values.reduce((a,b)=>a+b,0);
 $('spendingChart').innerHTML=`<div class="chart-total"><strong>${money(total)}</strong><span>pengeluaran tercatat</span></div><div class="bar-chart" role="group" aria-label="Pengeluaran per hari ${e(month)}. Total ${e(money(total))}">${values.map((value,i)=>`<div class="bar-column"><div role="img" class="chart-bar ${i+1===new Date().getDate()?'today':''}" style="height:${value?Math.max(5,value/max*100):2}%" tabindex="${value?0:-1}" aria-label="Tanggal ${i+1}: ${e(money(value))}"><span class="bar-tooltip">${i+1} · ${money(value)}</span></div>${[0,6,13,20,totalDays-1].includes(i)?`<span class="bar-label">${i+1}</span>`:''}</div>`).join('')}</div><div class="chart-legend"><span class="legend-dot"></span> Pengeluaran harian <span>Termasuk belanja kartu kredit</span></div>`;
}
function walletBalanceEvidence(transactions){
 const issues=balanceEvidenceIssues(transactions,state.settings,state.scannerKnowledge?.balanceObservations);
 if(!issues.length)return '';
 return `<section id="walletReconciliation" class="panel balance-evidence"><p class="section-label">PERLU DICOCOKKAN</p><h2>${issues.length} saldo perlu diperiksa</h2><p class="helper-note">Hanya akun yang berbeda atau jurnalnya bermasalah yang ditampilkan. Perbandingan memakai catatan sampai tanggal bukti, termasuk saldo awal dan penyesuaian. Saldo aktif dapat berbeda karena dana tertahan atau transaksi pada hari yang sama.</p><div class="balance-evidence-grid">${issues.map(o=>{
  const name=state.settings.accounts.find(a=>a.id===o.accountId).name;
  return `<article data-balance-observation="${e(o.accountId)}"><h3>${e(name)}</h3><p class="helper-note">${dateLabel(o.date)} · ${o.kind==='active-balance'?'Saldo aktif dari bukti':'Saldo dari bukti'}</p><strong>${money(o.amount)}</strong><p>Catatan sampai tanggal tersebut: ${money(o.ledgerBalance)}</p><p class="helper-note">${o.journalInvalid?'Jurnal bermasalah; selisih belum dapat diandalkan.':`Bukti ${o.difference>0?'lebih besar':'lebih kecil'} ${money(Math.abs(o.difference))} dari catatan.`}</p><button type="button" class="text-button" data-history-evidence="${e(o.accountId)}">Lihat rincian &amp; riwayat ↗</button></article>`;
 }).join('')}</div></section>`;
}
function renderWallets(transactions) {
 const ledger=deriveLedger(transactions);
 const accounts=state.settings.accounts.filter(a=>a.active!==false || ledger.accounts.some(l=>l.accountId===a.id&&l.balance!==0)).map(a=>({...a,balance:ledger.accounts.find(l=>l.accountId===a.id)?.balance || 0}));
 const {assets,liabilities:debt}=netWorthSnapshot(transactions,state.settings);
 $('walletOverview').innerHTML=`<div class="wallet-overview"><div><span>SALDO & ASET (DI LUAR TRANSFER BELUM DIPETAKAN)</span><strong>${money(assets)}</strong></div><div><span>KEWAJIBAN KARTU & AKUN</span><strong>${money(debt)}</strong></div><span class="wallet-decoration" aria-hidden="true">${icon('wallet')}</span></div>`+walletBalanceEvidence(transactions);
 const types={bank:'Rekening bank',cash:'Uang tunai',ewallet:'Dompet digital',investment:'Investasi',credit_card:'Kartu kredit',paylater:'PayLater',loan:'Pinjaman',clearing:'Perlu dipetakan',other:'Lainnya'};
 $('walletCards').innerHTML=accounts.filter(a=>a.subtype!=='clearing').map((a,i)=>`<article data-wallet-account="${e(a.id)}" class="wallet-card ${a.type==='liability'?'debt-card':''}"><button type="button" class="wallet-history-link" data-history-account="${e(a.id)}" aria-label="Lihat riwayat ${e(a.name)}"></button><div class="wallet-card-top">${accountBrand(a)}<span class="account-kind">${e(types[a.subtype]||a.type)}${a.active===false?' · Nonaktif':''}</span></div><h3>${e(a.name)}</h3><strong>${money(a.balance)}</strong><div class="wallet-card-bottom"><span>${a.subtype==='clearing'?'Periksa pemetaan transfer':'Lihat riwayat transaksi ?'}</span>${!a.system&&a.active!==false&&!state.transactions.some(tx=>tx.type==='opening_balance'&&tx.sourceAccountId===a.id)?`<button class="text-button" data-opening-account="${e(a.id)}" aria-label="Catat saldo awal ${e(a.name)}">Saldo awal ${icon('plus')}</button>`:icon(a.type==='liability'?'card':'wallet')}</div></article>`).join('');
 const unmapped=filterTransactions(transactions,{status:'unmapped'},state.settings.accounts);
 if(unmapped.length)$('walletCards').insertAdjacentHTML('beforeend',`<article class="wallet-card wallet-review-card"><button type="button" class="wallet-history-link" data-history-review="unmapped" aria-label="Periksa transaksi yang belum dipetakan"></button><div class="wallet-card-top"><span class="account-kind">CATATAN SEMENTARA</span>${icon('shield')}</div><h3>Perlu diperiksa</h3><strong>${unmapped.length} transaksi</strong><p class="muted">Rincian sumber atau tujuan belum lengkap. Ini bukan rekening atau saldo uangmu.</p><div class="wallet-card-bottom"><span>Periksa rincian</span>${icon('chevron')}</div></article>`);
}
function renderGoals() {
 const goals=planning.goals;const saved=goals.reduce((n,g)=>n+Number(g.saved||0),0);const complete=goals.filter(g=>goalProgress(g).complete).length;
 $('goalsOverview').innerHTML=`<div><span>DITABUNG UNTUK MIMPI</span><strong>${money(saved)}</strong></div><div><strong>${goals.length}</strong><span>tujuan direncanakan</span></div><div><strong>${complete}</strong><span>mimpi tercapai</span></div><span class="goal-overview-art" aria-hidden="true">✦</span>`;
 $('goalCards').innerHTML=goals.length?goals.map(goal=>{const p=goalProgress(goal);return `<article class="goal-card ${p.complete?'completed':''}"><div class="goal-card-top"><span class="goal-symbol">${icon(goal.icon)}</span><span class="pill">${p.complete?'Tercapai':p.overdue?'Tinjau target':'Sedang diusahakan'}</span></div><h3>${e(goal.name)}</h3><p class="goal-deadline">Target ${e(dateLabel(goal.dueDate))}</p><div class="goal-progress"><div class="progress-ring" style="--progress:${state.hideBalances?0:p.percent}%"><span>${state.hideBalances?'••':Math.round(p.percent)+'%'}</span></div><div><strong>${money(goal.saved)}</strong><p>dari ${money(goal.target)}</p></div></div><div class="goal-card-footer"><span>${p.complete?'Selamat! Satu mimpi terwujud.':`${money(p.monthly)} / bulan menuju target`}</span><button class="text-button" data-edit-goal="${e(goal.id)}" type="button">Perbarui ${icon('chevron')}</button></div></article>`;}).join(''):empty('Mimpimu layak direncanakan.','Mulai dari satu tujuan. Kamu bisa memperbarui tabungannya kapan saja.','new-goal','Buat goal pertama');
}
function renderInvestments(transactions) {
 const ledger=deriveLedger(transactions);const accounts=state.settings.accounts.filter(a=>a.subtype==='investment'&&(a.active!==false||ledger.accounts.some(l=>l.accountId===a.id&&l.balance!==0)));
 const pending=investmentPortfolio(state.settings).events.filter(x=>x.kind==='buy'&&x.settlementStatus==='pending');
 const rows=accounts.map(a=>({...a,balance:(ledger.accounts.find(l=>l.accountId===a.id)?.balance || 0)-pending.filter(x=>x.cashAccountId===a.id).reduce((n,x)=>n+x.total,0)}));
 const outsidePending=pending.filter(x=>!accounts.some(a=>a.id===x.cashAccountId)).reduce((n,x)=>n+x.total,0);
 if(outsidePending)rows.push({id:'pending-bank-funded',name:'Pembelian belum dibayar dari rekening bank',balance:-outsidePending});
 const total=rows.reduce((sum,a)=>sum+a.balance,0);const investments=transactions.filter(tx=>tx.type==='investment');
 const contributions=investments.filter(tx=>tx.date.startsWith(monthKey())).reduce((sum,tx)=>sum+Number(tx.amount),0);
 $('investmentView').innerHTML=`<div class="investment-hero"><div><span class="eyebrow">PORTOFOLIO TERCATAT</span><h2>${money(total)}</h2><p>Nilai berdasarkan jurnal, bukan harga pasar real-time. Dana RDN untuk pembelian yang menunggu penyelesaian sudah disisihkan dari tampilan alokasi ini.</p></div><div class="investment-art" aria-hidden="true">${icon('chart')}</div><div class="investment-hero-bottom"><span>Alokasi bulan ini <strong>${money(contributions)}</strong></span><span>${accounts.length} akun investasi</span></div></div><div class="dashboard-main-grid"><section class="panel"><div class="panel-header"><div><p class="section-label">GAMBARAN ALOKASI</p><h2>Di mana danamu tumbuh</h2></div></div>${rows.map(a=>`<div class="allocation-row"><span class="metric-icon lavender">${icon('chart')}</span><div><strong>${e(a.name)}</strong><div class="progress-track"><div class="progress-fill" style="width:${!state.hideBalances&&total>0?Math.max(0,Math.min(100,a.balance/total*100)):0}%"></div></div></div><strong>${money(a.balance)}</strong></div>`).join('')||empty('Belum ada akun investasi.','Tambahkan akun bertipe investasi di pengaturan.','account','Tambah akun')}</section><section class="panel"><div class="panel-header"><div><p class="section-label">KONSISTENSI ITU BERARTI</p><h2>Riwayat alokasi</h2></div></div>${transactionList(investments.slice(0,5))}</section></div><div class="insight-note">${icon('sparkles')}<p>Gunakan <strong>Catat investasi</strong> untuk memindahkan dana ke RDN. Untuk saham, kelola pembelian dan penjualan melalui <strong>Posisi &amp; order</strong> di bawah.</p></div>`;
 $('investmentView').insertAdjacentHTML('beforeend',investmentPortfolioHtml(state.settings,money));

}
