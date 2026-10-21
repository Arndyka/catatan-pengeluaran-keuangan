import {state} from './state.js';
import {changeInvestmentPortfolio,getSettings} from './repository.js';
import {investmentPortfolio,investmentVersion,investmentSalePreview} from './investment-ledger.js';
import {escapeHtml as e,formatDateLocal} from './utils.js';

const status={pending:'Menunggu matched',partial:'Matched sebagian',matched:'Matched seluruhnya',cancelled:'Dibatalkan'};
const button=(kind,id,label)=>`<button type="button" class="btn btn-light" data-investment-action="${kind}" data-id="${e(id||'')}">${label}</button>`;
const pnl=(v,money)=>`<strong class="${v<0?'investment-loss':'investment-gain'}">${v>0?'+ ':''}${money(v)}</strong>`;
export function investmentPortfolioHtml(profile,money){
 const p=investmentPortfolio(profile),realized=p.events.filter(x=>x.kind==='sell').reduce((n,x)=>n+x.profit,0);
 return `<section class="panel investment-portfolio"><div class="panel-header"><div><p class="section-label">INVESTASI SAHAM</p><h2>Posisi & order</h2></div>${button('order','','Tambah order')}</div>
 <p class="helper-note">Order belum mengubah saldo. Catat matched setelah pembelian berhasil; catat penjualan setelah benar-benar terjual. Harga pasar tidak diperbarui otomatis.</p>
 <div class="investment-summary"><span>Laba/rugi penjualan tercatat ${pnl(realized,money)}</span><span>Metode modal: rata-rata tertimbang, termasuk biaya beli.</span></div>
 <div class="investment-position-grid">${p.positions.map(h=>`<article class="investment-card" data-investment-position="${e(h.id)}"><div class="investment-card-heading"><h3>${e(h.symbol)} · ${e(h.name)}</h3><span class="pill">${h.quantity===0?'Posisi ditutup':'Posisi dimiliki'}</span></div>
 <dl class="investment-facts"><div><dt>Jumlah</dt><dd>${h.quantity===null?'Belum dirinci':`${e(h.quantity)} lembar · ${e(h.quantity/100)} lot`}</dd></div><div><dt>Modal tersisa</dt><dd>${h.cost===null?'Belum dirinci':money(h.cost)}</dd></div><div><dt>Nilai tercatat · ${e(h.asOfDate)}</dt><dd>${money(h.bookValue)}</dd></div><div><dt>Laba/rugi belum direalisasi</dt><dd>${h.cost===null?'Lengkapi modal':pnl(h.bookValue-h.cost,money)}</dd></div></dl>
 ${h.cost===null?`<p class="helper-note">Lengkapi jumlah lembar dan total modal termasuk biaya beli sebelum menjual. Nilai pada bukti bukan harga pembelian.${Number.isFinite(h.sourceChange)?` Perubahan nilai pada bukti: ${money(h.sourceChange)}.`:''}</p>`:''}
 <div class="investment-actions">${button('position',h.id,'Edit posisi')}${h.quantity>0&&h.cost!==null?button('sell',h.id,'Catat penjualan'):''}</div></article>`).join('')||'<p class="muted">Belum ada posisi saham tercatat. Mulai dengan membuat order.</p>'}</div>
 <h3 class="investment-subheading">Order pembelian</h3><div class="investment-position-grid">${p.orders.map(o=>`<article class="investment-card" data-investment-order="${e(o.id)}"><div class="investment-card-heading"><h3>${e(o.symbol)} · ${status[o.status]||e(o.status)}</h3><span>${e(o.date)}</span></div><p>${e(o.quantity/100)} lot · harga limit ${money(o.limitPrice)} · total order ${money(o.quantity*o.limitPrice)}</p><p class="helper-note">${e(o.filledQuantity)} dari ${e(o.quantity)} lembar sudah matched. Biaya mengikuti eksekusi yang dikonfirmasi.</p><div class="investment-actions">${o.status==='pending'?button('order',o.id,'Edit order'):''}${['pending','partial'].includes(o.status)?button('fill',o.id,'Catat matched')+button('cancel',o.id,o.filledQuantity?'Batalkan sisa':'Batalkan order'):''}</div></article>`).join('')||'<p class="muted">Belum ada order.</p>'}</div>
 <details class="investment-event-details" ${p.events.length?'open':''}><summary>Riwayat eksekusi & penilaian (${p.events.length})</summary><div class="investment-position-grid" data-investment-events>${[...p.events].reverse().map(x=>`<article class="investment-card"><div class="investment-card-heading"><h3>${x.kind==='sell'?'Jual':x.kind==='buy'?'Beli':'Penilaian'} ${e(x.symbol)}</h3><span>${e(x.date)}</span></div>${x.kind==='valuation'?`<p>Perubahan nilai ${money(x.total)} · tidak menjadi laba/rugi penjualan.</p>`:`<p>${e(x.quantity)} lembar × ${money(x.price)} · biaya ${money(x.fee)}</p><p>${x.kind==='sell'?'Hasil bersih':'Total modal'} ${money(x.total)} · ${e(profile.accounts.find(a=>a.id===x.cashAccountId)?.name||'Rekening penyelesaian')}</p>${x.kind==='sell'?`<p>Modal terjual ${money(x.allocatedCost)} · Laba/rugi ${pnl(x.profit,money)}</p>`:''}`}${x.reference?`<small>Referensi: ${e(x.reference)}</small>`:''}</article>`).join('')||'<p class="muted">Belum ada eksekusi tercatat.</p>'}</div></details></section>`;
}

export function setupInvestmentUI({dialog,toast,money,refresh}){
 const input=(name,label,val='',attrs='')=>`<label class="field">${label}<input name="${name}" value="${e(val??'')}" ${attrs} required></label>`;
 const number=(name,label,val='',attrs='')=>input(name,label,val,`type="number" inputmode="decimal" min="0" step="0.01" ${attrs}`);
 document.addEventListener('click',event=>{
  const target=event.target.closest('[data-investment-action]');if(!target)return;
  const profile=state.settings,p=investmentPortfolio(profile),kind=target.dataset.investmentAction,id=target.dataset.id,uid=state.user?.uid,version=investmentVersion(profile);
  const position=p.positions.find(x=>x.id===id),order=p.orders.find(x=>x.id===id),today=formatDateLocal();
  if(!uid)return;
  const dateField=input('date','Tanggal aktual',today,`type="date" max="${today}"`);
  const quantityField=(val,max='',readonly=false)=>input('quantity','Jumlah lembar (100 lembar = 1 lot)',val,`type="number" inputmode="numeric" min="${readonly?0:1}" step="1" ${max?`max="${max}"`:''} ${readonly?'readonly':''}`);
  const accounts=profile.accounts.filter(a=>a.active!==false&&a.type==='asset'&&!a.managedInvestment&&['investment','bank','cash'].includes(a.subtype)&&!p.positions.some(x=>x.accountId===a.id));
  const cashField=`<label class="field">Rekening ${kind==='sell'?'penerima hasil jual':'pembayaran'}<select name="cashAccountId" required><option value="">Pilih RDN / rekening</option>${accounts.map(a=>`<option value="${e(a.id)}">${e(a.name)}</option>`).join('')}</select></label>`;
  let title='',fields='',submit='Simpan perubahan';
  if(kind==='order'){
   title=order?'Edit order pembelian':'Tambah order pembelian';fields=`${input('symbol','Kode saham',order?.symbol||'','maxlength="15"')}${input('name','Nama saham',order?.name||'','maxlength="100"')}${quantityField(order?.quantity||'')}${number('limitPrice','Harga limit per lembar (Rp)',order?.limitPrice||'')}${input('date','Tanggal order',order?.date||today,`type="date" max="${today}"`)}<p class="helper-note">Menyimpan order belum mengurangi saldo RDN atau menambah saham.</p>`;
  }else if(kind==='fill'||kind==='sell'){
   if(kind==='fill'&&!order||kind==='sell'&&!position)return;
   title=kind==='fill'?`Catat matched ${e(order.symbol)}`:`Catat penjualan ${e(position.symbol)}`;submit=kind==='fill'?'Konfirmasi pembelian berhasil':'Konfirmasi penjualan berhasil';
   fields=`${quantityField(kind==='fill'?order.quantity-order.filledQuantity:'',kind==='fill'?order.quantity-order.filledQuantity:position.quantity)}${number('price',`Harga ${kind==='fill'?'beli aktual':'jual'} per lembar (Rp)`,kind==='fill'?order.limitPrice:'')}${number('fee',`Total biaya ${kind==='fill'?'beli':'jual'} & pajak (Rp)`)}${dateField}${cashField}<label class="field">Referensi broker (opsional)<input name="reference" maxlength="120"></label><div class="investment-preview" data-sale-preview aria-live="polite"></div><p class="helper-note">Isi biaya sesuai bukti broker; isi 0 hanya jika memang tidak ada biaya. ${kind==='fill'?'Total pembelian termasuk biaya akan dipindahkan dari rekening pembayaran ke saham.':'Hasil jual setelah biaya akan masuk ke rekening pilihan. Modal dihitung rata-rata dari pembelian yang tercatat.'}</p>`;
  }else if(kind==='position'){
   if(!position)return;title=`Edit posisi ${e(position.symbol)}`;
   fields=`${input('name','Nama saham',position.name,'maxlength="100"')}${quantityField(position.quantity,'',position.traded)}${number('cost','Total modal tersisa termasuk biaya beli (Rp)',position.cost,position.traded?'readonly':'')}${number('bookValue','Nilai seluruh posisi saat ini (Rp)',position.bookValue)}${dateField}<p class="helper-note">${position.traded?'Jumlah dan modal mengikuti riwayat eksekusi.':'Gunakan jumlah saham dan modal pembelian asli dari broker. Mengisi rinciannya tidak menarik uang dari RDN lagi.'} Perubahan nilai posisi memperbarui nilai aset, bukan laba/rugi penjualan.</p>`;
  }else if(kind==='cancel'){
   if(!order)return;title=`Batalkan sisa order ${e(order.symbol)}?`;submit='Ya, batalkan sisa order';fields='<p>Hanya sisa yang belum matched dibatalkan. Saham yang sudah terbeli dan saldo rekening tetap.</p>';
  }else return;
  dialog(title,`<form id="investmentForm" class="form-stack">${fields}<p role="alert" class="form-error"></p><button class="btn btn-primary" type="submit">${submit}</button></form>`);
  const form=document.getElementById('investmentForm'),actionId=crypto.randomUUID();
  const preview=()=>{const out=form.querySelector('[data-sale-preview]');if(!out)return;try{const v=Object.fromEntries(new FormData(form));if(['quantity','price','fee'].some(k=>v[k]==='')){out.textContent='Lengkapi jumlah, harga, dan biaya untuk melihat perhitungan.';return;}if(kind==='sell'){const r=investmentSalePreview(position,Number(v.quantity),Number(v.price),Number(v.fee));out.innerHTML=`<p>Hasil jual bersih: <strong>${money(r.net)}</strong></p><p>Modal terjual: ${money(r.cost)}</p><p>Laba/rugi penjualan: ${pnl(r.profit,money)}</p>`;}else out.innerHTML=`<p>Total pembayaran: <strong>${money(Number(v.quantity)*Number(v.price)+Number(v.fee))}</strong></p>`;}catch(error){out.textContent=error.message;}};
  form.addEventListener('input',preview);preview();
  form.onsubmit=async event=>{
   event.preventDefault();const submitButton=form.querySelector('[type=submit]');submitButton.disabled=true;form.querySelector('[role=alert]').textContent='';
   try{
    if(state.user?.uid!==uid)throw new Error('Sesi berubah. Buka formulir kembali.');
    const data=Object.fromEntries(new FormData(form));for(const key of ['quantity','price','fee','limitPrice','cost','bookValue'])if(Object.hasOwn(data,key))data[key]=Number(data[key]);
    const result=await changeInvestmentPortfolio(uid,{...data,kind,id:actionId,expectedVersion:version,...(['order','fill','cancel'].includes(kind)?{orderId:id}:{positionId:id})});
    if(state.user?.uid!==uid)return;state.settings=result.profile;refresh();document.getElementById('spendlyDialog').close();toast('Posisi dan order berhasil diperbarui.');
   }catch(error){
    if(error.message?.startsWith('Posisi atau order berubah')){
     try{const latest=await getSettings(uid,'profile',profile);if(state.user?.uid===uid){state.settings=latest;refresh();}}catch{error.message='Belum dapat memuat posisi terbaru. Muat ulang halaman sebelum mencoba kembali.';}
    }
    form.querySelector('[role=alert]').textContent=error.message||'Belum berhasil menyimpan. Coba lagi.';
   }finally{submitButton.disabled=false;}
  };
 });
}
