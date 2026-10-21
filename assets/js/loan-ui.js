import {loanSchedule} from './loans.js';
import {escapeHtml as e,formatDateId,parseLocalDate} from './utils.js';
const date=value=>formatDateId(parseLocalDate(value));
export function loanPlansHtml(plans,money){
 if(!plans?.length)return '<div class="panel empty-state"><h2>Tagihan pinjaman</h2><p>Belum ada rincian pinjaman yang dicatat.</p></div>';
 return plans.map(plan=>{
  try{
   const p=loanSchedule(plan);
   return `<section class="panel paylater-schedule"><div class="panel-header"><div><p class="section-label">PINJAMAN · ${e(date(p.date))}</p><h2>${e(p.name)}</h2></div><span class="pill">${p.bills.length} cicilan</span></div><div class="paylater-totals"><div><span>Pokok saat pencairan</span><strong>${money(p.principal)}</strong></div><div><span>Total jadwal pembayaran</span><strong>${money(p.total)}</strong></div></div><div class="paylater-limit"><div><span>Dana bersih diterima</span><strong>${money(p.received)}</strong></div><div><span>Potongan pencairan</span><strong>${money(p.disbursementFee)}</strong></div><div><span>Total biaya cicilan</span><strong>${money(p.installmentFee)}</strong></div></div><p class="helper-note">Pokok dicatat sebagai utang; pencairan bukan penghasilan. Biaya cicilan pada jadwal belum dicatat sebagai beban yang sudah terjadi. Pembagian pokok dan biaya per bulan mengikuti rincian pemberi pinjaman.</p><div class="paylater-bills">${p.bills.map((b,i)=>`<article class="paylater-bill" data-loan-bill="${e(b.id)}"><div><span class="section-label">Cicilan ${i+1}/${p.bills.length}</span><h3>${money(b.amount)}</h3><p>Jatuh tempo ${e(date(b.dueDate))}</p><span class="paylater-status">Belum dibayar pada bukti ${e(date(p.date))}</span></div></article>`).join('')}</div><p class="helper-note">Jadwal dari bukti pencairan; tidak otomatis memotong rekening atau menandai pembayaran lunas. Perbarui berdasarkan bukti pembayaran berikutnya.</p>${p.transactionId?`<button type="button" class="btn btn-light" data-history-transaction="${e(p.transactionId)}">Lihat pencairan dan rincian biaya</button>`:''}</section>`;
  }catch(error){return `<div class="notice error">${e(error.message)}</div>`;}
 }).join('');
}
