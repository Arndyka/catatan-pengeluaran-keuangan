import {validDate} from './recurring-logic.js';
import {formatDateLocal} from './utils.js';

export function statementOpeningProposal(statement,statements,transactions,settings,today=formatDateLocal()){
 const m=statement.metadata||{},accountId=statement.openingAccountId;
 const account=settings.accounts.find(a=>a.id===accountId&&a.type==='asset'&&a.subtype!=='clearing'&&a.active!==false);
 if(!account||!['bca','blu','mandiri','krom'].includes(statement.bank))return {status:'blocked',reason:'Pilih rekening bank yang sesuai sebelum mencatat saldo awal.'};
 const existing=transactions.find(t=>t.type==='opening_balance'&&t.sourceAccountId===accountId);
 if(existing)return {status:'exists',reason:`Saldo awal ${account.name} sudah tercatat; tidak ditambahkan lagi.`,transactionId:existing.id};
 if(!validDate(m.periodStart)||!validDate(m.periodEnd)||m.periodStart>m.periodEnd||m.periodStart>today||!['openingBalance','closingBalance','incomingTotal','outgoingTotal'].every(k=>typeof m[k]==='number'&&Number.isFinite(m[k])&&m[k]>=0)||!statement.reconciliation?.balanced||statement.reconciliation?.rowMismatchCount||statement.failedPages){return {status:'blocked',reason:'Saldo awal belum bisa dimasukkan otomatis: ringkasan, periode, atau rekonsiliasi belum lengkap. Periksa bukti dan catat melalui Dompet.'};}
 if(Math.round(m.openingBalance*100)+Math.round(m.incomingTotal*100)-Math.round(m.outgoingTotal*100)!==Math.round(m.closingBalance*100))return {status:'blocked',reason:'Saldo awal + mutasi tidak sama dengan saldo akhir. Periksa statement dahulu.'};
 const earliest=statements.filter(s=>s.openingAccountId===accountId&&validDate(s.metadata?.periodStart)).sort((a,b)=>a.metadata.periodStart.localeCompare(b.metadata.periodStart))[0];
 if(earliest!==statement)return {status:'later',reason:'Saldo awal diambil satu kali dari statement paling awal untuk rekening ini.'};
 if(transactions.some(t=>(t.sourceAccountId===accountId||t.destinationAccountId===accountId||(Array.isArray(t.journal)&&t.journal.some(j=>j?.accountId===accountId)))&&(t.date<m.periodStart||t.type==='balance_adjustment'))){return {status:'blocked',reason:'Rekening ini sudah memiliki riwayat sebelumnya atau penyesuaian. Periksa saldo awal lewat Dompet agar dana tidak dihitung dua kali.'};}
 if(m.openingBalance===0)return {status:'zero',reason:'Saldo awal Rp0; tidak perlu menambah jurnal saldo awal.'};
 return {status:'ready',reason:`Sertakan saldo awal ${account.name} sebelum mutasi ${m.periodStart}. Ini dasar saldo, bukan pemasukan.`,input:{type:'opening_balance',date:m.periodStart,amount:m.openingBalance,sourceAccountId:accountId,category:'Saldo awal',merchant:`Saldo awal ${account.name}`,description:`Saldo awal e-statement periode ${m.periodStart} s.d. ${m.periodEnd}`,origin:'statement-opening',sourceMeta:{fileName:statement.fileName||'',fileHash:statement.sourceHash||'',bank:statement.bank,periodStart:m.periodStart,periodEnd:m.periodEnd,verifiedOpening:true,categoryReviewed:true,openingFromStatement:true}}};
}
