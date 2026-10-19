import {validDate} from './recurring-logic.js';
import {scanExclusionReason} from './transaction-quality.js';
const months={jan:1,feb:2,mar:3,apr:4,mei:5,may:5,jun:6,jul:7,agu:8,aug:8,sep:9,okt:10,oct:10,nov:11,des:12,dec:12};
const datePattern=/\b(\d{1,2})\s+(Jan\w*|Feb\w*|Mar\w*|Apr\w*|Mei|May|Jun\w*|Jul\w*|Agu\w*|Aug\w*|Sep\w*|Okt\w*|Oct\w*|Nov\w*|Des\w*|Dec\w*)\s+(20\d{2})\b/i;
const dateValue=(day,month,year)=>{const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return validDate(value)?value:'';};
const dated=line=>{const m=line.match(datePattern);return m?{date:dateValue(+m[1],months[m[2].slice(0,3).toLowerCase()],m[3]),token:m[0]}:null;};
const currencies=text=>[...text.matchAll(/([+−–-]?)\s*(?:Rp|IDR)\s*([0-9OIl][0-9OIl.,]*(?:[ \t]+[0-9OIl][0-9OIl.,]*)*)/gi)];
const isHeader=line=>/^(?:[<>]\s*)?(?:riwayat transaksi|account transactions|account information|transaksi\s*(?:e-statement)?$|q\s+(?:cari|search)|oktober|october)/i.test(line.trim());
const plain=lines=>lines.map(l=>l.replace(/^\s*(?:[©®=~]+|\d\))\s*/,'')).filter(l=>!isHeader(l)&&!/^\s*(?:anda telah mencapai|home\s|beranda\s)/i.test(l)).join(' ').replace(/\s+/g,' ').trim();

// Each bank places dates differently. Never use the phone clock, filename date,
// or neighbouring screenshots to fill a clipped transaction's missing date.
export function screenshotHistory(rawText,{bank,parseMoney}){
 const text=String(rawText||'').replace(/[−–]/g,'-');
 const handled=bank==='bca'?/account transactions/i.test(text):bank==='blu'||bank==='krom'?/riwayat transaksi/i.test(text):bank==='mandiri'?/\btransaksi\b/i.test(text)&&(/e-statement|Transfer Rupiah|QR\s?Bayar/i.test(text)):false;
 if(!handled)return {handled:false,rows:[],excluded:[]};
 let lines=text.split('\n').map(l=>l.trimEnd()).filter(l=>l.trim()),rows=[],excluded=[],ordinal=0;
 const reject=reason=>excluded.push({row:++ordinal,reason});
 const emit=(block,date,time='')=>{
  const joined=block.join('\n'),matches=currencies(joined);
  if(!matches.length)return;
  const row=++ordinal;
  const omit=reason=>excluded.push({row,reason});
  if(/pemindahan saldo/i.test(joined)&&bank==='krom'){omit('Pemindahan antar-kantong Krom tidak mengubah total saldo.');return;}
  if(!date){omit('Tanggal terpotong atau tidak valid; lengkapi bukti sebelum mencatat.');return;}
  if(matches.length!==1){omit('Beberapa nominal dalam satu baris; perlu memeriksa bukti.');return;}
  const token=matches[0],number=token[2];
  if(!/^(?:\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:[.,]\d{2})?)$/.test(number)||/[\p{L}\d]/u.test(joined[token.index+token[0].length]||'')){omit('Nominal OCR ambigu; periksa angka pada gambar, jangan menebak.');return;}
  const value=parseMoney(number)?.amount;
  if(!Number.isFinite(value)||value<=0){omit('Nominal tidak cukup terbaca.');return;}
  let sign=token[1]==='-'?-1:token[1]==='+'?1:0;
  if(bank==='bca'){
   const incoming=/\b(?:BI-FAST|TRSF E-BANKING)\s+CR\b/i.test(joined),outgoing=/\b(?:BI-FAST|TRSF E-BANKING)\s+DB\b|TRANSAKSI DEBIT/i.test(joined);
   if(incoming===outgoing){omit('Kode debit/kredit BCA tidak jelas.');return;}sign=incoming?1:-1;
  }else if(!sign&&bank==='blu'){
   const incoming=/dana masuk|uang masuk/i.test(joined),outgoing=/uang keluar|transfer ke|pembayaran/i.test(joined);
   if(incoming!==outgoing)sign=incoming?1:-1;
  }
  if(!sign){omit('Arah uang masuk/keluar tidak cukup jelas.');return;}
  let description=plain(block).replace(token[0].trim(),'').replace(datePattern,'').replace(/\b\d{2}:\d{2}(?::\d{2})?\s*(?:WIB)?/g,'').trim();
  const reason=scanExclusionReason({description});if(reason){omit(reason);return;}
  rows.push({date,time,amount:value,signedAmount:sign*value,description,row});
 };
 if(bank==='blu'){
  let block=[];
  for(const line of lines){const d=dated(line);if(d){const t=line.match(/\b([0-2]\d):([0-5]\d)(?::([0-5]\d))?/);emit([...block,line],d.date,t?`${t[1]}:${t[2]}:${t[3]||'00'}`:'');block=[];}else block.push(line);}
  if(currencies(block.join(' ')).length)reject('Bagian bawah screenshot terpotong sebelum tanggal transaksi.');
 }else if(bank==='bca'){
  const marker=lines.findIndex(l=>/account transactions/i.test(l));lines=lines.slice(marker+1);let block=[];
  for(const line of lines){block.push(line);if(!/\bIDR\s*[0-9OIl]/i.test(line))continue;
   const day=block.map(l=>l.match(/^\s*([0-3]?\d)(?:\s+([0-9]))?(?=\s|$)/)).find(Boolean);
   const month=block.map(l=>l.match(/^\s*(Jan|Feb|Mar|Apr|Mei|May|Jun|Jul|Agu|Aug|Sep|Okt|Oct|Nov|Des|Dec)\b/i)).find(Boolean);
   const year=block.join(' ').match(/\b(20\d{2})\b/);
   const date=day&&month&&year?dateValue(Number(day[1]+(day[2]||'')),months[month[1].toLowerCase()],year[1]):'';
   emit(block,date);block=[];
  }
  if(block.some(l=>/TRSF|TRANSAKSI DEBIT|BI-FAST/.test(l)))reject('Baris BCA terpotong sebelum nominal atau tanggal lengkap.');
 }else{
  let date='',block=[];
  const flush=()=>{emit(block,date);block=[];};
  for(const line of lines){const d=dated(line);if(d){flush();date=d.date;continue;}
   if(currencies(line).length){flush();block=[line];}else if(block.length)block.push(line);
  }flush();
 }
 return {handled,rows,excluded};
}
