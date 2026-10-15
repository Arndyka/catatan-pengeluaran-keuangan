import {deriveLedger,validateJournal,actualTransactions} from './accounting.js';
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
 const broken=actual.filter(tx=>!validateJournal(tx.journal||[]).valid);
 if(broken.length)findings.push({kind:'journal',count:broken.length,text:`${broken.length} catatan memiliki jurnal kosong/tidak seimbang. Periksa sumber data sebelum mengandalkan total.`,page:'transactions'});
 const future=transactions.filter(tx=>tx.date>today);
 if(future.length)findings.push({kind:'future',count:future.length,text:`${future.length} catatan bertanggal masa depan belum masuk saldo aktual. Periksa tanggal atau gunakan jadwal rutin.`,page:'transactions'});
 const clearing=ledger.accounts.filter(a=>a.accountSubtype==='clearing'&&a.balance!==0);
 if(clearing.length)findings.push({kind:'clearing',count:clearing.length,text:'Ada transfer yang belum selesai dipetakan. Cocokkan rekening lawannya pada riwayat impor.',page:'transactions'});
 const negative=ledger.accounts.filter(a=>a.accountType==='asset'&&a.accountSubtype!=='clearing'&&a.balance<0);
 if(negative.length)findings.push({kind:'negative',count:negative.length,text:`${negative.length} akun aset bersaldo negatif. Periksa saldo awal, mutasi yang belum masuk, atau transaksi ganda.`,page:'wallets'});
 const oldOpening=actual.filter(tx=>tx.type==='income'&&/saldo awal|opening balance/i.test([tx.category,tx.description].join(' ')));
 if(oldOpening.length)findings.push({kind:'opening-income',count:oldOpening.length,text:'Ada saldo awal yang dicatat sebagai pemasukan. Periksa dahulu sebelum mengganti; jangan tambahkan saldo awal kedua.',page:'transactions'});
 return findings;
}
