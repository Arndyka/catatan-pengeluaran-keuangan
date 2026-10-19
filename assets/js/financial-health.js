import {deriveLedger,validateJournal,actualTransactions,journalEntries} from './accounting.js';
import {transactionPresentation} from './transaction-filters.js';
import {formatDateLocal} from './utils.js';
import {validDate} from './recurring-logic.js';

export function openingBalanceInput(input,transactions,today=formatDateLocal()){
 const date=String(input.date||'');
 if(!validDate(date)||date>today)throw new Error('Tanggal saldo awal harus valid dan sudah terjadi.');
 if(transactions.some(tx=>tx.type==='opening_balance'&&tx.sourceAccountId===input.sourceAccountId))throw new Error('Saldo awal akun ini sudah ada. Koreksi dengan menghapus catatan saldo awal lama terlebih dahulu.');
 const first=transactions.filter(tx=>(Array.isArray(tx.journal)?tx.journal:[]).some(j=>j?.accountId===input.sourceAccountId)).map(tx=>tx.date).sort()[0];
 if(first&&date>first)throw new Error(`Gunakan saldo sebelum transaksi pertama (${first}), dengan tanggal paling lambat ${first}. Jangan masukkan saldo terkini jika mutasinya sudah dicatat.`);
 return {...input,type:'opening_balance',category:'Saldo awal',merchant:'Saldo awal',description:'Saldo sebelum riwayat transaksi Spendly',destinationAccountId:'',origin:'opening-balance'};
}

export function financialHealth(transactions,settings,today=formatDateLocal()){
 const actual=actualTransactions(transactions,today),ledger=deriveLedger(actual),findings=[];
 const ids=rows=>rows.map(t=>t.id).filter(Boolean);
 const accounts=[...new Map([...ledger.accounts.map(a=>({id:a.accountId,type:a.accountType,subtype:a.accountSubtype})),...(settings?.accounts||[])].map(a=>[a.id,a])).values()];
 const broken=actual.filter(tx=>!validateJournal(tx.journal||[]).valid);
 if(broken.length)findings.push({kind:'journal',count:broken.length,transactionIds:ids(broken),text:`${broken.length} catatan memiliki jurnal kosong/tidak seimbang. Periksa sumber data sebelum mengandalkan total.`});
 const future=transactions.filter(tx=>tx.date>today);
 if(future.length)findings.push({kind:'future',count:future.length,transactionIds:ids(future),text:`${future.length} catatan bertanggal masa depan belum masuk saldo aktual. Periksa tanggal atau gunakan jadwal rutin.`});
 const clearing=actual.filter(t=>transactionPresentation(t,accounts).unmapped);
 if(clearing.length)findings.push({kind:'clearing',count:clearing.length,transactionIds:ids(clearing),text:`${clearing.length} transaksi belum memiliki rincian sumber atau tujuan. Periksa transaksi berikut, bukan saldo akun sementara.`});
 const openings=actual.filter(t=>t.type==='opening_balance'&&(t.sourceMeta?.verifiedOpening===false||t.sourceMeta?.pendingAllocation));
 if(openings.length)findings.push({kind:'opening-review',count:openings.length,transactionIds:ids(openings),text:`${openings.length} saldo awal dari catatan lama belum diverifikasi. Ini catatan awal pembukuan, bukan transaksi baru. Periksa bukti saldo pada tanggal mulai.`});
 const negative=ledger.accounts.filter(a=>a.accountType==='asset'&&a.accountSubtype!=='clearing'&&a.balance<0);
 if(negative.length){const accountIds=negative.map(a=>a.accountId);findings.push({kind:'negative',count:negative.length,accountIds,transactionIds:ids(actual.filter(t=>accountIds.includes(t.sourceAccountId)||accountIds.includes(t.destinationAccountId)||journalEntries(t.journal).some(j=>accountIds.includes(j.accountId)))),text:`${negative.length} akun aset bersaldo negatif. Berikut catatan pembentuk saldonya; periksa saldo awal, mutasi yang belum masuk, atau transaksi ganda.`});}
 const oldOpening=actual.filter(tx=>tx.type==='income'&&/saldo awal|opening balance/i.test([tx.category,tx.description].join(' ')));
 if(oldOpening.length)findings.push({kind:'opening-income',count:oldOpening.length,transactionIds:ids(oldOpening),text:'Ada saldo awal yang dicatat sebagai pemasukan. Periksa dahulu sebelum mengganti; jangan tambahkan saldo awal kedua.'});
 return findings;
}

// Compare each observation with the ledger at its date, never today's balance.
// A damaged supporting journal must not be reported as a successful match.
export function balanceEvidenceIssues(transactions,settings,observations=[],today=formatDateLocal()){
 const latest=new Map();
 for(const o of Array.isArray(observations)?observations:[]){
  if(!o||!validDate(o.date)||o.date>today||!Number.isFinite(o.amount)||o.amount<0||!settings.accounts.some(a=>a.id===o.accountId&&a.type==='asset'&&a.active!==false))continue;
  if(!latest.has(o.accountId)||latest.get(o.accountId).date<o.date)latest.set(o.accountId,o);
 }
 return [...latest.values()].map(o=>{
  const rows=transactions.filter(t=>validDate(t.date)&&t.date<=o.date&&(t.sourceAccountId===o.accountId||t.destinationAccountId===o.accountId||journalEntries(t.journal).some(j=>j.accountId===o.accountId)));
  const ledgerCents=rows.flatMap(t=>journalEntries(t.journal)).filter(j=>j.accountId===o.accountId).reduce((n,j)=>n+Math.round(j.debit*100)-Math.round(j.credit*100),0);
  return {...o,ledgerBalance:ledgerCents/100,difference:(Math.round(o.amount*100)-ledgerCents)/100,journalInvalid:rows.some(t=>!validateJournal(t.journal||[]).valid),transactionIds:rows.map(t=>t.id).filter(Boolean)};
 }).filter(o=>o.difference!==0||o.journalInvalid);
}
