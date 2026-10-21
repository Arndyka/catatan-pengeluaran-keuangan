import {validDate} from './recurring-logic.js';
import {screenshotHistory} from './screenshot-history.js';
const months={jan:1,feb:2,mar:3,apr:4,mei:5,may:5,jun:6,jul:7,agu:8,aug:8,sep:9,okt:10,oct:10,nov:11,des:12,dec:12};
const dateRE=/\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b/;
const dateOf=text=>{const m=text.match(dateRE);if(!m)return '';const d=`${m[3]}-${String(months[m[2].slice(0,3).toLowerCase()]||0).padStart(2,'0')}-${m[1].padStart(2,'0')}`;return validDate(d)?d:'';};
const amountOf=(text,parseMoney)=>{const m=String(text).match(/(?:Rp|IDR)\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)(?![\w.,])/i);return m&&!/^\s+[0-9OIl]/.test(String(text).slice(m.index+m[0].length))?parseMoney(m[1])?.amount:null;};
export function isShopeeScreen(text){
 const header=String(text).split(/riwayat transaksi|metode pembayaran/i)[0].split('\n').map(l=>l.trim()).filter(Boolean).slice(0,6);
 return header.some(l=>/^[<{\u2190]?\s*(?:Shopee(?:Pay)?|SPayLater|SPinjam)\b/i.test(l)&&!/(?:Rp|IDR)\s*\d|[+-]\s*\d|metode|pembayaran/i.test(l))||(/rincian pinjaman/i.test(text)&&/biaya pencairan/i.test(text)&&/rincian pembayaran bulanan/i.test(text));
}
// Informational evidence is returned separately: it must never enter the ledger.
export function shopeeScreenshot(text,{bank,parseMoney,accountId='',paylaterAccountId=''}={}){
 if(bank!=='shopee')return {handled:false};
 const empty=(reason,evidence)=>({handled:true,rows:[],excluded:[{row:1,reason}],evidence});
 const lines=String(text).split('\n').map(s=>s.trim()).filter(Boolean);
 const bills=[];
 for(let i=0;i<lines.length;i++)if(/jatuh tempo/i.test(lines[i])){
  const date=dateOf(lines[i]),amount=amountOf(lines.slice(Math.max(0,i-2),i+1).reverse().find(l=>/Rp\s*\d/.test(l))||'',parseMoney);
  if(date&&amount>0)bills.push({date,amount});
 }
 if(/rincian pinjaman|total pinjaman|pencairan pinjaman|pengajuan pinjaman/i.test(text)||/\bSPinjam\b/i.test(text)&&/berhasil|cair/i.test(text)){
  const fields=[];
  for(const [label,pattern] of [['Pokok pinjaman',/total pinjaman/i],['Biaya pencairan',/biaya pencairan/i],['Total biaya cicilan',/biaya cicilan/i]]){
   const i=lines.findIndex(l=>pattern.test(l));if(i<0)continue;
   const value=amountOf(lines[i],parseMoney)??amountOf(label==='Pokok pinjaman'?lines[i-1]:lines[i+1],parseMoney);
   if(value!==null)fields.push({label,amount:value});
  }
  return empty('Bukti pinjaman: pokok, biaya, rekening pencairan dan jadwal perlu dicocokkan; bukan pemasukan biasa.',{kind:'loan',title:'Rincian pinjaman terbaca',fields,bills});
 }
 if(/tagihan saya|tagihan saat ini|kredit tersedia|jumlah kredit|limit xtra/i.test(text))return empty('Ringkasan tagihan atau limit bukan transaksi belanja baru.',{kind:'bills',title:'Tagihan / limit',fields:[],bills});
 if(/riwayat transaksi/i.test(text)&&/shopeepay/i.test(text))return screenshotHistory(text,{bank:'shopee',parseMoney});
 if(/rincian pesanan|detail pesanan|metode pembayaran|rincian transaksi/i.test(text)){
  if(/belum bayar|menunggu|pending|gagal|dibatalkan|pengembalian dana|refund/i.test(text))return empty('Pesanan belum selesai, dibatalkan, atau memiliki pengembalian dana; periksa rinciannya.');
  if(!/pesanan selesai|pembayaran berhasil|transaksi berhasil|transfer berhasil|isi saldo berhasil/i.test(text))return empty('Status pembayaran berhasil belum terbaca.');
  const paymentLine=lines.findIndex(l=>/waktu pembayaran|tanggal pembayaran|waktu transaksi|tanggal transaksi/i.test(l));
  const date=paymentLine>=0?dateOf(lines.slice(paymentLine,paymentLine+2).join(' ')):'';
  const totalLine=lines.findIndex(l=>/^(?:total pembayaran|total transaksi|jumlah transfer|nominal)\b/i.test(l));
  const totalText=totalLine>=0?lines.slice(totalLine,totalLine+2).join(' '):'';
  const amount=amountOf(totalText,parseMoney);
  if(!date||!amount)return empty('Tanggal pembayaran atau total transaksi belum terbaca lengkap.');
  const methodLine=lines.findIndex(l=>/metode pembayaran|sumber dana/i.test(l));
  const method=methodLine>=0?lines.slice(methodLine,methodLine+2).join(' '):'';
  const paylater=/spaylater/i.test(method),wallet=/shopeepay/i.test(method);
  if(/shopeepay/i.test(method)&&paylater)return empty('Pembayaran campuran perlu dirinci per sumber dana.');
  const incoming=/transfer masuk|dana diterima|isi saldo berhasil/i.test(text);
  if(incoming&&paylater)return empty('Dana masuk dengan sumber kredit perlu diperiksa.');
  const time=lines.slice(paymentLine,paymentLine+2).join(' ').match(/\b([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
  const reference=text.match(/(?:no\.?\s*pesanan|id transaksi|no\.?\s*referensi)\s*:?\s*([A-Z0-9-]{6,})/i)?.[1]||'';
  return {handled:true,excluded:[],rows:[{date,time:time?`${time[1]}:${time[2]}:${time[3]||'00'}`:'',amount,signedAmount:incoming?amount:-amount,type:paylater?'credit_purchase':incoming?'income':'expense',sourceAccountId:paylater?paylaterAccountId:wallet?accountId:'',reference,description:lines.join(' ').slice(0,1000),row:1}]};
 }
 return empty('Halaman saldo, menu, atau format Shopee belum cukup rinci. Gunakan riwayat bertanggal lengkap atau detail pembayaran berhasil.',{kind:'overview',title:'Informasi akun Shopee',fields:[],bills:[]});
}
