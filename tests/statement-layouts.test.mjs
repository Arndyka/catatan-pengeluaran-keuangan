import test from 'node:test';
import assert from 'node:assert/strict';
import {detectBankFromText,parseStatementTokenPagesForTest} from '../assets/js/scanner.js';
const t=(text,x,y)=>({text,x,y,width:80,height:10});
const page=tokens=>({pageWidth:600,pageHeight:840,tokens});
const read=(pages,fileName='statement.pdf')=>parseStatementTokenPagesForTest({pages,fileName,bankAccountMap:{blu:'asset-blu',mandiri:'asset-mandiri',krom:'asset-krom',bca:'asset-bca'}});
const bluHeader=[t('bluAccount - 0000 0000 0001',200,650),t('Nama / Name',30,740),t('NASABAH CONTOH',30,727),t('Periode / Period',195,740),t('June 2026',195,727)];
const bluTotals=[t('Saldo Awal / Initial Balance',30,410),t('1.000,07',535,410),t('Total Pemasukan / Total Income',30,390),t('200.000,58',535,390),t('Total Pengeluaran / Total Expense',30,370),t('-50.000,00',535,370),t('Saldo Akhir / Ending Balance',30,350),t('151.000,65',535,350)];

test('myBCA empty pocket appendix cannot overwrite the main account totals',()=>{
 const header=[t('REKENING TAHAPAN XPRESI',30,800),t('NO. REKENING : 0000000001',300,740),t('PERIODE : AGUSTUS 2026',300,700)];
 const totals=(opening,incoming,outgoing,closing)=>[t(`SALDO AWAL : ${opening}`,210,300),t(`MUTASI CR : ${incoming}`,210,280),t(`MUTASI DB : ${outgoing}`,210,260),t(`SALDO AKHIR : ${closing}`,210,240)];
 const r=read([page([...header,t('14/08',44,558),t('SETORAN VIA CDM',89,558),t('100.00',410,558),t('180.10',532,558),...totals('80.10','100.00','0.00','180.10')]),page([...header,t('FASILITAS : POKET RUPIAH - MENABUNG',300,675),t('TRANSAKSI TIDAK TERSEDIA',248,530),t('01/08',44,558),t('SALDO AWAL',89,558),t('0.00',552,558),...totals('0.00','0.00','0.00','0.00')])],'myBCA.pdf');
 assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].type,'income');assert.equal(r.statement.metadata.openingBalance,80.1);assert.equal(r.statement.metadata.closingBalance,180.1);assert.equal(r.statement.reconciliation.balanced,true);
});
test('issuer detection cannot mistake Mandiri credit-card explanatory text for Krom',()=>{
 assert.equal(detectBankFromText('Rekening Koran mandiri call bankmandiri.co.id Informasi tagihan dan rincian transaksi kartu kredit').bank,'mandiri');
 assert.equal(detectBankFromText('bluAccount blubybcadigital.id Dana Masuk BANK MANDIRI').bank,'blu');
});
test('blu native rows preserve cents, time, explicit references and printed totals',()=>{
 const r=read([page([...bluHeader,
  t('29 Jun 2026',26,600),t('08:50',26,588),t('Dana Masuk dari PENGIRIM CONTOH',140,598),t('BANK MANDIRI',140,580),t('200.000,00',420,591),t('201.000,07',520,591),
  t('29 Jun 2026',26,540),t('08:51',26,528),t('Pembayaran QRIS',140,538),t('TOKO CONTOH ID123456 |',140,520),t('REF_BLU_000001',140,508),t('- 50.000,00',420,531),t('151.000,07',520,531),
  t('30 Jun 2026',26,480),t('02:20',26,468),t('Bunga',140,478),t('bluAccount',140,460),t('0,58',450,471),t('151.000,65',520,471),...bluTotals])]);
 assert.equal(r.candidates.length,3);assert.deepEqual(r.candidates.map(x=>x.amount),[200000,50000,0.58]);
 assert.equal(r.candidates[1].time,'08:51:00');assert.equal(r.candidates[1].movementReference,'REF_BLU_000001');
 assert.equal(r.candidates[2].category,'Bunga');assert.equal(r.statement.metadata.periodStart,'2026-06-01');
 assert.equal(r.statement.metadata.periodEnd,'2026-06-30');assert.equal(r.statement.reconciliation.balanced,true);
 assert.equal(r.statement.reconciliation.rowMismatchCount,0);
});
test('blu continuation pages and partial periods keep own-account movements for manual mapping',()=>{
 const r=read([page([...bluHeader.filter(x=>x.text!=='June 2026'),t('01 - 16 Okt 2026 08:21',195,727),t('01 Oct 2026',26,600),t('Pembayaran QRIS',140,598),t('TOKO | REF000001',140,580),t('- 5.000,00',420,591),t('5.000,00',520,591)]),page([
 t('bluAccount',500,799),t('02 Oct 2026',26,740),t('10:00',26,728),t('Transfer ke NASABAH CONTOH',140,738),t('KROM | REF000002',140,720),t('- 1.000,00',420,731),t('4.000,00',520,731)
 ])]);
 assert.equal(r.candidates.length,2);assert.equal(r.statement.metadata.periodEnd,'2026-10-16');
 const own=r.candidates[1];assert.equal(own.type,'transfer');assert.equal(own.selected,false);assert.equal(own.sourceAccountId,'asset-blu');assert.equal(own.destinationAccountId,'asset-krom');assert.equal(own.signedAmount,-1000);
});
const mandiriHead=[t('Tanggal',35,760),t('Tanggal',85,760),t('Rincian Transaksi / Nomor Referensi',125,760),t('Debit / Kredit',415,760),t('Saldo',540,760),t('Date',35,727),t('Date',85,727)];
test('Mandiri consolidated excludes account/card summaries and joins split descriptions across pages',()=>{
 const r=read([page([t('Rekening Koran / Statement of Account',30,780),t('mandiri call bankmandiri.co.id',30,750),t('Periode / Period: 1/08/26 s/d 31/08/26',30,730),t('Kartu Kredit Total Tagihan 6,000,000.00',30,600)]),page([...mandiriHead,
  t('01/08',35,700),t('Saldo Awal',125,700),t('100.25',530,700),
  t('02/08',35,660),t('01/08',85,660),t('MCM InhouseTrf-',125,660),t('1,000.00',415,660),t('1,100.25',530,660),
  t('03/08',35,80),t('03/08',85,80),t('Pembayaran',125,80),t('200.00 D',415,80),t('900.25',530,80),t('Hal Page 2 of 3',500,28)
 ]),page([...mandiriHead,t('TOKO SAMBUNGAN',125,710),t('CATATAN PENTING',125,694),
  t('31/08',35,660),t('31/08',85,660),t('Biaya Adm -',125,660),t('10.00 D',415,660),t('890.25',530,660),
  t('Saldo Awal / Previous Balance',240,500),t('100.25',530,500),t('Mutasi Kredit / Total of Credit Transactions',240,480),t('1,000.00',530,480),t('Mutasi Debit / Total of Debit Transactions',240,460),t('210.00',530,460),t('Saldo Akhir / Current Balance',240,440),t('890.25',530,440)
 ])]);
 assert.equal(r.statement.bank,'mandiri');assert.equal(r.candidates.length,3);
 assert.deepEqual(r.candidates.map(x=>[x.date,x.type,x.amount]),[['2026-08-02','income',1000],['2026-08-03','expense',200],['2026-08-31','expense',10]]);
 assert.match(r.candidates[1].description,/TOKO SAMBUNGAN CATATAN PENTING/);assert.doesNotMatch(r.candidates[1].description,/Page/);
 assert.equal(r.statement.reconciliation.balanced,true);assert.equal(r.statement.reconciliation.rowMismatchCount,0);
 assert.equal(r.statement.metadata.periodEnd,'2026-08-31');
});

test('blu wide negative amounts stay in the amount column instead of description',()=>{
 const r=read([page([...bluHeader,t('29 Jun 2026',26,600),t('Transfer ke PENERIMA CONTOH',140,598),t('KROM | REF000003',140,580),t('- 3.600.500,00',410,591),t('1.000,00',530,591)])]);
 assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].amount,3600500);assert.equal(r.candidates[0].type,'expense');assert.doesNotMatch(r.candidates[0].description,/3\.600\.500/);
});

test('statement reconciliation catches missing cents instead of accepting a rupiah-wide tolerance',()=>{
 const r=read([page([...bluHeader,t('30 Jun 2026',26,600),t('Bunga',140,598),t('0,31',450,591),t('1.000,39',530,591),t('Saldo Awal / Initial Balance',30,410),t('1.000,07',535,410),t('Total Pemasukan / Total Income',30,390),t('0,32',535,390),t('Total Pengeluaran / Total Expense',30,370),t('0,00',535,370),t('Saldo Akhir / Ending Balance',30,350),t('1.000,39',535,350)])]);
 assert.equal(r.statement.reconciliation.balanced,false);assert.equal(r.statement.reconciliation.rowMismatchCount,1);assert.equal(r.statement.reconciliation.incomingDifference,0.01);
});

test('readable blu disclaimer-only page does not invoke OCR or AI',async()=>{
 const {scanStatementFiles}=await import('../assets/js/scanner.js');
 const old=globalThis.window;
 const tokens=[t('bluAccount',500,800),t('Disclaimer',25,700),t('Laporan ini sesuai dengan transaksi nasabah.',25,670),t('This report is generated by the system.',25,650)];
 globalThis.window={pdfjsLib:{GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getViewport:()=>({width:600,height:840}),getTextContent:async()=>({items:tokens.map(t=>({str:t.text,transform:[1,0,0,1,t.x,t.y],width:t.width,height:t.height}))}),cleanup(){}})})})}};
 try{
  const r=await scanStatementFiles({files:[new File(['test'],'blu.pdf',{type:'application/pdf'})],bankAccountMap:{blu:'asset-blu'},visionReader:()=>{throw new Error('Informational page must not be sent to AI');}});
  assert.equal(r.candidates.length,0);assert.equal(r.statements[0].informationalPages,1);assert.equal(r.statements[0].failedPages,0);
 }finally{globalThis.window=old;}
});

test('matching statement totals cannot hide an incorrect running balance',()=>{
 const r=read([page([...bluHeader,
  t('29 Jun 2026',26,600),t('Dana Masuk',140,598),t('200.000,00',420,591),t('200.000,07',520,591),
  t('29 Jun 2026',26,540),t('Pembayaran QRIS',140,538),t('- 50.000,00',420,531),t('151.000,07',520,531),
  t('30 Jun 2026',26,480),t('Bunga',140,478),t('0,58',450,471),t('151.000,65',520,471),...bluTotals])]);
 assert.equal(r.statement.reconciliation.incomingDifference,0);assert.equal(r.statement.reconciliation.outgoingDifference,0);assert.equal(r.statement.reconciliation.closingDifference,0);
 assert.equal(r.statement.reconciliation.rowMismatchCount,1);assert.equal(r.statement.reconciliation.balanced,false);
});

test('blu wrapped account-holder names remain unselected own-account transfers',()=>{
 const header=bluHeader.map(token=>token.text==='NASABAH CONTOH'?{...token,text:'NASABAH CONTOH PANJANG'}:token);
 const r=read([page([...header,t('29 Jun 2026',26,600),t('Dana Masuk dari NASABAH',140,598),t('CONTOH PANJANG',140,582),t('KROM | REF000004',140,566),t('1.000,00',420,591),t('2.000,00',530,591)])]);
 assert.equal(r.candidates[0].type,'transfer');assert.equal(r.candidates[0].selected,false);assert.equal(r.candidates[0].sourceAccountId,'asset-krom');assert.equal(r.candidates[0].destinationAccountId,'asset-blu');
});
