import {canonicalJson,formatDateLocal} from './utils.js';
import {validDate} from './recurring-logic.js';
import {validateJournal,isPositionAccount} from './accounting.js';
const cents=n=>Math.round(n*100),value=n=>n/100;
const money=(n,label='Nominal')=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||!Number.isSafeInteger(cents(n))||Math.abs(n*100-cents(n))>.0001)throw new Error(`${label} harus berupa angka valid hingga dua desimal.`);return cents(n);};
const quantity=n=>{if(!Number.isSafeInteger(n)||n<=0||n>1e9)throw new Error('Jumlah lembar harus berupa bilangan bulat positif.');return n;};
const date=(d,today)=>{if(!validDate(d)||d>today)throw new Error('Tanggal aktual harus valid dan tidak di masa depan.');return d;};
const symbol=s=>{const v=String(s||'').trim().toUpperCase();if(!/^[A-Z][A-Z0-9.-]{1,14}$/.test(v))throw new Error('Isi kode saham yang valid.');return v;};
const entry=(a,debit=0,credit=0)=>({accountId:a.id,accountName:a.name,accountType:a.type,accountSubtype:a.subtype,debit:value(debit),credit:value(credit)});
const reserve={id:'equity-investment-valuation',name:'Selisih penilaian investasi',type:'equity',subtype:'valuation'};
const portion=(total,q,held)=>Number((BigInt(total)*BigInt(q)+BigInt(Math.floor(held/2)))/BigInt(held));
export function investmentSalePreview(p,q,price,fee){
 quantity(q);if(!Number.isSafeInteger(p.quantity)||q>p.quantity||p.cost===null)throw new Error('Lengkapi posisi dan jumlah jual terlebih dahulu.');
 const gross=money(price,'Harga jual')*q,charge=money(fee,'Biaya jual');
 if(!Number.isSafeInteger(gross)||gross<=charge)throw new Error('Harga jual harus positif dan biaya lebih kecil dari hasil jual.');
 const cost=portion(money(p.cost),q,p.quantity),carrying=portion(money(p.bookValue),q,p.quantity);
 return {gross:value(gross),net:value(gross-charge),cost:value(cost),carrying:value(carrying),profit:value(gross-charge-cost)};
}
export function investmentPortfolio(profile){
 if(profile.investmentPortfolio)return structuredClone(profile.investmentPortfolio);
 const evidence=profile.investmentEvidence||{};
 return {revision:0,operations:[],events:[],positions:(evidence.holdings||[]).map((h,i)=>({id:`evidence-position-${i}`,symbol:h.symbol,name:h.name||h.symbol,accountId:h.accountId,quantity:null,cost:null,bookValue:h.value,asOfDate:h.asOfDate,lastEventDate:h.asOfDate,...(Number.isFinite(h.unrealizedChange)?{sourceChange:h.unrealizedChange}:{}),traded:false})),orders:(evidence.orders||[]).map((o,i)=>({id:`evidence-order-${i}`,symbol:o.symbol,name:o.symbol,quantity:Number(o.quantityLots)*100,filledQuantity:0,limitPrice:o.limitPrice,date:o.asOfDate,status:o.status==='pending'?'pending':o.status}))};
}
export const investmentVersion=profile=>canonicalJson(investmentPortfolio(profile));
export function guardInvestmentProfileWrite(current,patch){
 if(current?.investmentPortfolio&&(patch.accounts||patch.investmentPortfolio)&&investmentVersion(current)!==investmentVersion(patch))throw new Error('Portofolio berubah di sesi lain. Muat ulang sebelum mengubah pengaturan akun.');
}
export const investmentProtected=(tx,profile)=>!!tx?.sourceMeta?.investmentEventId||(tx?.journal||[]).some(j=>isPositionAccount(profile||{},j.accountId));
// All reads precede writes. Both adapters execute this inside an atomic operation.
export async function changeInvestment(io,action,today=formatDateLocal()){
 const profile=await io.getProfile();if(!profile)throw new Error('Profil belum tersedia.');
 const portfolio=investmentPortfolio(profile),accounts=structuredClone(profile.accounts);
 if(!/^[a-zA-Z0-9-]{8,100}$/.test(action.id||''))throw new Error('Identitas perubahan tidak valid.');
 if(portfolio.operations.includes(action.id))return {profile,duplicate:true};
 if(action.expectedVersion!==investmentVersion(profile))throw new Error('Posisi atau order berubah. Tutup formulir lalu buka kembali.');
 let journal=[],type='',amount=0,sourceAccountId='',destinationAccountId='',event=null;
 const account=id=>accounts.find(a=>a.id===id);
 const cash=()=>{const a=account(action.cashAccountId);if(!a||a.active===false||a.type!=='asset'||a.managedInvestment||!['investment','bank','cash'].includes(a.subtype)||portfolio.positions.some(p=>p.accountId===a.id))throw new Error('Pilih RDN atau rekening penyelesaian yang aktif, bukan akun saham.');return a;};
 const position=()=>{const p=portfolio.positions.find(p=>p.id===action.positionId);if(!p)throw new Error('Posisi tidak ditemukan.');return p;};
 const chronological=(p,d)=>{if(p.lastEventDate&&d<p.lastEventDate)throw new Error('Tanggal mendahului perubahan posisi terakhir. Catat transaksi secara berurutan.');};
 const stock=p=>{const a=account(p.accountId);if(!a||a.type!=='asset'||a.subtype!=='investment'||a.active===false)throw new Error('Akun saham tidak tersedia atau nonaktif.');return a;};
 const known=p=>{if(p.quantity===null||p.cost===null)throw new Error('Lengkapi jumlah lembar dan total modal posisi lama sebelum mencatat transaksi.');money(p.cost,'Modal');money(p.bookValue,'Nilai tercatat');};
 if(action.kind==='order'){
  const code=symbol(action.symbol),q=quantity(action.quantity),price=money(action.limitPrice,'Harga limit');if(!price)throw new Error('Harga limit harus lebih dari nol.');
  const d=date(action.date,today),old=action.orderId?portfolio.orders.find(o=>o.id===action.orderId):null;
  if(action.orderId&&!old)throw new Error('Order tidak ditemukan.');
  if(old&&(old.status!=='pending'||old.filledQuantity))throw new Error('Order sudah memiliki eksekusi atau dibatalkan. Catat sisa matched atau batalkan sisanya.');
  const next={id:old?.id||`order-${action.id}`,symbol:code,name:String(action.name||code).trim().slice(0,100),quantity:q,filledQuantity:0,limitPrice:value(price),date:d,status:'pending'};
  if(old)Object.assign(old,next);else portfolio.orders.push(next);
 }else if(action.kind==='cancel'){
  const o=portfolio.orders.find(o=>o.id===action.orderId);if(!o||!['pending','partial'].includes(o.status))throw new Error('Tidak ada sisa order yang dapat dibatalkan.');o.status='cancelled';
 }else if(action.kind==='fill'){
  const o=portfolio.orders.find(o=>o.id===action.orderId);if(!o||!['pending','partial'].includes(o.status))throw new Error('Order tidak lagi menunggu matched.');
  const q=quantity(action.quantity),price=money(action.price,'Harga eksekusi'),fee=money(action.fee,'Biaya beli'),d=date(action.date,today);
  if(!price||q>o.quantity-o.filledQuantity||d<o.date)throw new Error('Jumlah matched atau tanggal tidak sesuai sisa order.');
  const total=price*q+fee;if(!Number.isSafeInteger(total))throw new Error('Nilai transaksi terlalu besar.');
  const settlement=cash();let p=portfolio.positions.find(p=>p.symbol===o.symbol);
  if(!p){const id=`asset-stock-${o.symbol.toLowerCase()}`;if(account(id))throw new Error('Kode akun saham sudah digunakan. Periksa akun investasi.');accounts.push({id,name:`Saham ${o.symbol}`,type:'asset',subtype:'investment',active:true,managedInvestment:true});p={id:`position-${o.symbol}`,symbol:o.symbol,name:o.name,accountId:id,quantity:0,cost:0,bookValue:0,traded:false};portfolio.positions.push(p);}
  known(p);chronological(p,d);const a=stock(p);journal=[entry(a,total),entry(settlement,0,total)];
  quantity(p.quantity+q);money(value(money(p.cost)+total));money(value(money(p.bookValue)+total));
  p.quantity+=q;p.cost=value(money(p.cost)+total);p.bookValue=value(money(p.bookValue)+total);p.asOfDate=d;p.lastEventDate=d;p.traded=true;
  o.filledQuantity+=q;o.status=o.filledQuantity===o.quantity?'matched':'partial';
  type='investment_buy';amount=value(total);sourceAccountId=settlement.id;destinationAccountId=a.id;
  event={kind:'buy',positionId:p.id,orderId:o.id,symbol:p.symbol,date:d,quantity:q,price:action.price,fee:action.fee,total:amount,cashAccountId:settlement.id};
 }else if(action.kind==='sell'){
  const p=position();known(p);const q=quantity(action.quantity),price=money(action.price,'Harga jual'),fee=money(action.fee,'Biaya jual'),d=date(action.date,today);chronological(p,d);
  if(!price||q>p.quantity)throw new Error('Jumlah jual melebihi saham yang dimiliki atau harga belum valid.');
  const gross=price*q;if(!Number.isSafeInteger(gross)||fee>=gross)throw new Error('Biaya jual harus lebih kecil dari hasil jual.');
  const preview=investmentSalePreview(p,q,action.price,action.fee),net=cents(preview.net),cost=cents(preview.cost),carrying=cents(preview.carrying),profit=net-cost;
  const settlement=cash(),a=stock(p);journal=[entry(settlement,net),entry(a,0,carrying)];
  if(profit>0)journal.push(entry({id:'income-investment-realized',name:'Laba realisasi investasi',type:'income',subtype:'investment'},0,profit));
  if(profit<0)journal.push(entry({id:'expense-investment-realized',name:'Rugi realisasi investasi',type:'expense',subtype:'investment'},-profit));
  // Release prior unrealized valuation through equity, never count it as profit twice.
  if(cost!==carrying)journal.push(entry(reserve,Math.max(0,carrying-cost),Math.max(0,cost-carrying)));
  p.quantity-=q;p.cost=value(money(p.cost)-cost);p.bookValue=value(money(p.bookValue)-carrying);p.lastEventDate=d;p.asOfDate=d;p.traded=true;
  type='investment_sell';amount=value(net);sourceAccountId=a.id;destinationAccountId=settlement.id;
  event={kind:'sell',positionId:p.id,symbol:p.symbol,date:d,quantity:q,price:action.price,fee:action.fee,total:amount,allocatedCost:value(cost),profit:value(profit),cashAccountId:settlement.id};
 }else if(action.kind==='position'){
  const p=position(),q=p.traded&&p.quantity===0&&action.quantity===0?0:quantity(action.quantity),cost=money(action.cost,'Total modal'),book=money(action.bookValue,'Nilai posisi'),d=date(action.date,today);chronological(p,d);const a=stock(p);
  if(q===0&&(cost||book))throw new Error('Posisi yang sudah habis harus bernilai nol.');
  if(p.traded&&(q!==p.quantity||cost!==money(p.cost)))throw new Error('Jumlah dan modal mengikuti transaksi beli/jual. Keduanya tidak dapat ditimpa lewat edit posisi.');
  const delta=book-money(p.bookValue);p.name=String(action.name||p.symbol).trim().slice(0,100);p.quantity=q;p.cost=value(cost);p.bookValue=value(book);
  if(delta){p.asOfDate=d;p.lastEventDate=d;journal=[entry(a,Math.max(0,delta),Math.max(0,-delta)),entry(reserve,Math.max(0,-delta),Math.max(0,delta))];type='investment_valuation';amount=value(Math.abs(delta));sourceAccountId=a.id;event={kind:'valuation',positionId:p.id,symbol:p.symbol,date:d,total:value(delta)};}
 }else throw new Error('Perubahan investasi tidak dikenali.');
 const id=`investment-${action.id}`;let tx=null;
 if(event){
  if(!validateJournal(journal).valid)throw new Error('Jurnal investasi tidak seimbang.');
  if(await io.getTransaction(id))throw new Error('ID transaksi sudah digunakan. Muat ulang posisi.');
  event={...event,id:action.id,transactionId:id,reference:String(action.reference||'').trim().slice(0,120)};
  tx={id,fingerprint:id,type,date:event.date,amount,sourceAccountId,destinationAccountId,category:type==='investment_valuation'?'Penilaian Investasi':'Investasi Saham',merchant:event.symbol,description:`${type==='investment_buy'?'Beli':type==='investment_sell'?'Jual':'Perbarui nilai'} ${event.symbol}${event.quantity?` ${event.quantity} lembar`:''}`,journal,journalCheck:validateJournal(journal),origin:'investment-portfolio',sourceMeta:{investmentEventId:action.id,positionId:event.positionId,reference:event.reference,profit:event.profit??null},createdAtClient:new Date().toISOString()};
  portfolio.events.push(event);
 }
 for(const a of accounts)if(portfolio.positions.some(p=>p.accountId===a.id))a.managedInvestment=true;
 portfolio.operations.push(action.id);portfolio.revision++;
 const next={...profile,accounts,investmentPortfolio:portfolio};if(tx)io.putTransaction(tx);io.putProfile(next);
 return {profile:next,transaction:tx,duplicate:false};
}
