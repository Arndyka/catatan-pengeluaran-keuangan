import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const BASE='http://127.0.0.1:4173';
const waitForDemo=page=>expect(page.locator('#syncStatus')).toHaveText(/Mode demo.*lokal/,{timeout:15000});

test('latest transactions and ordinary history hide bookkeeping but exact review opens it',async({page})=>{
 await page.evaluate(async()=>{
  const {buildTransaction}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));
  d.settings.profile.hideBalanceDefault=false;
  const make=async(id,type,date,merchant,time='')=>({...await buildTransaction({type,date,amount:100,sourceAccountId:'asset-bca',merchant},d.settings.profile),id,sourceMeta:{time}});
  const opening=await make('carry','opening_balance','2026-09-01','Saldo awal lama');opening.sourceMeta={verifiedOpening:false,pendingAllocation:'Periksa bukti saldo awal'};
  const adjustment=await make('adjustment','opening_balance','2026-10-19','Penyesuaian contoh');adjustment.type='balance_adjustment';
  d.transactions=[adjustment,await make('early','income','2026-10-19','Pelanggan pagi','08:30:00'),opening,await make('late','income','2026-10-19','Pelanggan sore','17:30:00'),await make('old','expense','2026-09-02','Belanja lama')];
  d.settings.scanner_knowledge={balanceObservations:[]};localStorage.setItem('spendly:demo:v1',JSON.stringify(d));
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='dashboard');
 await expect(page.locator('#recentTransactions .transaction-row')).toHaveCount(3);
 await expect(page.locator('#recentTransactions .transaction-row').first()).toContainText('Pelanggan sore');
 await page.locator('#recentTransactions [data-history-transaction="late"]').click();
 await expect(page.locator('[data-history-row]')).toHaveCount(1);await expect(page.locator('[data-history-row="late"]')).toBeVisible();
 await page.locator('#clearHistoryContext').click();await expect(page.locator('[data-history-row]')).toHaveCount(3);
 await page.locator('#transactionBookkeeping').check();await expect(page.locator('[data-history-row]')).toHaveCount(5);
 await page.locator('#resetTransactionFilters').click();await expect(page.locator('[data-history-row]')).toHaveCount(3);
 await page.locator('#transactionFilter').selectOption('balance_adjustment');await expect(page.locator('[data-history-row="adjustment"]')).toBeVisible();
 await page.locator('#transactionSearch').fill('tidak cocok');await page.evaluate(()=>location.hash='wallets');
 await page.locator('[data-history-issue="opening-review"]').click();
 await expect(page.locator('#transactionSearch')).toHaveValue('');await expect(page.locator('[data-history-row]')).toHaveCount(1);
 await expect(page.locator('[data-history-row="carry"]')).toBeVisible();await expect(page.locator('#transactionReviewContext')).toContainText('saldo awal');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.emulateMedia({reducedMotion:'reduce'});for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);expect((await new AxeBuilder({page}).include('#transactionHistoryPanel').analyze()).violations).toEqual([]);}
});

test('matched evidence is hidden; mismatch opens dated account history and source details',async({page})=>{
 await page.evaluate(async()=>{
  const {buildTransaction}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));
  d.settings.profile.hideBalanceDefault=false;
  const t=await buildTransaction({type:'income',date:'2026-10-01',amount:10.01,sourceAccountId:'asset-bca'},d.settings.profile);
  d.transactions=[{...t,id:'before'},{...t,id:'after',date:'2026-10-03'}];
  d.settings.scanner_knowledge={balanceObservations:[{accountId:'asset-bca',date:'2026-10-02',amount:11.02,sourceFile:'contoh.pdf'},{accountId:'asset-mandiri',date:'2026-10-02',amount:0}]};localStorage.setItem('spendly:demo:v1',JSON.stringify(d));
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='wallets');
 await expect(page.locator('[data-balance-observation]')).toHaveCount(1);
 await page.locator('[data-history-evidence="asset-bca"]').click();
 await expect(page.locator('#transactionAccountFilter')).toHaveValue('asset-bca');await expect(page.locator('#transactionDateTo')).toHaveValue('2026-10-02');
 await expect(page.locator('[data-history-row]')).toHaveCount(1);await expect(page.locator('[data-history-row="before"]')).toBeVisible();
 await expect(page.locator('#transactionReviewContext')).toContainText('contoh.pdf');await expect(page.locator('#transactionReviewContext')).toContainText('1,01');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.emulateMedia({reducedMotion:'reduce'});for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);expect((await new AxeBuilder({page}).include('#transactionReviewContext').analyze()).violations).toEqual([]);}
 await page.locator('#toggleBalanceButton').click();await expect(page.locator('#transactionReviewContext')).not.toContainText('1,01');
 await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js');state.scannerKnowledge.balanceObservations[0].amount=10.01;(await import('/assets/js/experience.js')).renderExperience();});
 await page.evaluate(()=>location.hash='wallets');await expect(page.locator('#walletReconciliation')).toHaveCount(0);
});

test('journal, future and negative-balance alerts open only the implicated records',async({page})=>{
 await page.evaluate(async()=>{
  const {buildTransaction}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));
  const expense=await buildTransaction({type:'expense',date:'2026-10-01',amount:100,sourceAccountId:'asset-bca'},d.settings.profile);
  const future=await buildTransaction({type:'income',date:'2099-10-01',amount:200,sourceAccountId:'asset-bca'},d.settings.profile);
  d.transactions=[{...expense,id:'expense'},{...expense,id:'broken',journal:[]},{...future,id:'future'}];localStorage.setItem('spendly:demo:v1',JSON.stringify(d));
 });
 await page.reload();await waitForDemo(page);
 for(const [kind,ids] of [['journal',['broken']],['future',['future']],['negative',['expense','broken']]]){
  await page.evaluate(()=>location.hash='wallets');await page.locator(`[data-history-issue="${kind}"]`).click();
  expect((await page.locator('[data-history-row]').evaluateAll(rows=>rows.map(r=>r.dataset.historyRow))).sort()).toEqual(ids.sort());
  await expect(page.locator('#transactionReviewContext')).toBeVisible();
 }
});

test('net worth excludes clearing and explains all debt without leaking hidden balances',async({page})=>{
 await page.evaluate(async()=>{const {buildTransaction}=await import('/assets/js/accounting.js');const d=JSON.parse(localStorage.getItem('spendly:demo:v1')),base={date:'2026-10-01',type:'opening_balance',sourceAccountId:'asset-bca',amount:1000.25};d.settings.profile.hideBalanceDefault=false;d.transactions=await Promise.all([buildTransaction(base,d.settings.profile),buildTransaction({...base,sourceAccountId:'liability-mandiri-cc',amount:2000.8},d.settings.profile),buildTransaction({...base,type:'transfer',sourceAccountId:'asset-transfer-clearing',destinationAccountId:'asset-bca',amount:125.5},d.settings.profile),buildTransaction({...base,type:'income',date:'2099-10-01',amount:5000},d.settings.profile)]);localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='dashboard');
 await expect(page.locator('#netWorthCard>div>strong')).toHaveText('-Rp 875,05');
 await page.locator('#netWorthDetails summary').click();await expect(page.locator('#netWorthDetails')).toContainText('1.125,75');await expect(page.locator('#netWorthDetails')).toContainText('2.000,8');await expect(page.locator('#netWorthDetails')).toContainText('bukan tagihan bulan ini');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.emulateMedia({reducedMotion:'reduce'});for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);expect((await new AxeBuilder({page}).include('#netWorthCard').analyze()).violations).toEqual([]);}
 await page.locator('#toggleBalanceButton').click();await expect(page.locator('#netWorthDetails')).toHaveAttribute('open','');await expect(page.locator('#netWorthCard')).not.toContainText(/\d/);
});

test('unmapped funds are a review queue, not a bank wallet balance',async({page})=>{
 await page.evaluate(async()=>{const {buildTransaction}=await import('/assets/js/accounting.js');const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));const t=await buildTransaction({type:'transfer',date:'2026-10-18',amount:3456,sourceAccountId:'asset-transfer-clearing',destinationAccountId:'asset-bca'},d.settings.profile);t.sourceMeta={pendingAllocation:'Periksa sumber'};d.transactions=[t];localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='wallets');
 await expect(page.locator('[data-wallet-account="asset-transfer-clearing"]')).toHaveCount(0);
 await expect(page.locator('.wallet-review-card')).toContainText('1 transaksi');await expect(page.locator('.wallet-review-card')).not.toContainText('Rp');
 await page.locator('[data-history-review="unmapped"]').click();await expect(page.locator('#transactionStatusFilter')).toHaveValue('unmapped');await expect(page.locator('#transactionAccountFilter')).toHaveValue('all');await expect(page.locator('[data-history-row]')).toHaveCount(1);
});

test('history review filters, endpoints and signed amounts remain accessible on mobile',async({page})=>{
 await page.evaluate(async()=>{
  const {buildTransaction}=await import('/assets/js/accounting.js');const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));
  d.settings.profile.hideBalanceDefault=false;
  const input=(type,amount,sourceAccountId,destinationAccountId='',merchant='')=>({type,amount,sourceAccountId,destinationAccountId,merchant,date:'2026-10-18'});
  const pending=await buildTransaction(input('transfer',35,'asset-transfer-clearing','asset-bca','Pengirim contoh'),d.settings.profile);pending.sourceMeta={pendingAllocation:'Periksa rincian'};
  d.transactions=[pending,await buildTransaction(input('income',50,'asset-bca','','Pemberi kerja'),d.settings.profile),await buildTransaction(input('expense',10,'asset-bca','','Kedai'),d.settings.profile),await buildTransaction(input('transfer',20,'asset-bca','asset-mandiri'),d.settings.profile)];
  localStorage.setItem('spendly:demo:v1',JSON.stringify(d));
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='transactions');
 await page.locator('#transactionAccountFilter').selectOption('asset-bca');
 await page.locator('#transactionStatusFilter').selectOption('pending');
 await expect(page.locator('[data-history-row]')).toHaveCount(1);
 await expect(page.locator('[data-label="Nominal"]')).toContainText('+ Rp 35');
 await expect(page.locator('[data-label="Nominal"] .history-amount')).toHaveClass(/positive/);
 await expect(page.locator('[data-label="Sumber"]')).toContainText('Pengirim contoh');
 await page.locator('#transactionStatusFilter').selectOption('all');await page.locator('#transactionFilter').selectOption('cash_out');
 await expect(page.locator('[data-history-row]')).toHaveCount(2);
 await expect(page.locator('#transactionTableContainer .history-amount--negative')).toHaveCount(2);
 await page.locator('#resetTransactionFilters').click();await page.locator('.history-endpoint-filters summary').click();
 await page.locator('#transactionSourceFilter').selectOption('external');await page.locator('#transactionDestinationFilter').selectOption('asset-bca');
 await expect(page.locator('[data-history-row]')).toHaveCount(1);await expect(page.locator('[data-label="Tujuan"]')).toHaveText('BCA');
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);expect((await new AxeBuilder({page}).include('#transactionHistoryPanel').analyze()).violations).toEqual([]);}
 await page.locator('#toggleBalanceButton').click();await expect(page.locator('.history-amount')).not.toContainText(/[0-9+−]/);
 await page.locator('#resetTransactionFilters').click();await expect(page.locator('#transactionSourceFilter')).toHaveValue('all');await expect(page.locator('#transactionDestinationFilter')).toHaveValue('all');await expect(page.locator('[data-history-row]')).toHaveCount(4);
});

test('wallet cards open dynamic account history including incoming transfers on mobile',async({page})=>{
 await page.evaluate(async()=>{
  const {buildTransaction}=await import('/assets/js/accounting.js');
  const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));
  d.settings.profile.accounts=d.settings.profile.accounts.map(a=>a.id==='asset-dana'?{...a,active:false}:a);
  d.settings.profile.hideBalanceDefault=false;
  d.settings.profile.accounts.push({id:'asset-test-bank',name:'Bank Tambahan',type:'asset',subtype:'bank',active:true});
  d.transactions=[await buildTransaction({type:'transfer',date:'2026-10-15',amount:321,sourceAccountId:'asset-bca',destinationAccountId:'asset-test-bank',description:'Transfer contoh'},d.settings.profile),await buildTransaction({type:'expense',date:'2026-10-16',amount:123,sourceAccountId:'asset-test-bank',description:'Kopi contoh'},d.settings.profile)];
  localStorage.setItem('spendly:demo:v1',JSON.stringify(d));
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='wallets');
 await expect(page.locator('[data-wallet-account="asset-dana"]')).toHaveCount(0);
 await page.locator('[data-history-account="asset-test-bank"]').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#transactionAccountFilter')).toHaveValue('asset-test-bank');
 await expect(page.locator('#transactionHistoryTitle')).toHaveText('Riwayat Bank Tambahan');
 await expect(page.locator('[data-history-row]')).toHaveCount(2);
 await page.locator('#transactionFilter').selectOption('transfer');await expect(page.locator('[data-history-row]')).toHaveCount(1);
 await page.locator('#transactionDateFrom').fill('2026-10-16');await page.locator('#transactionDateFrom').dispatchEvent('change');await expect(page.locator('[data-history-row]')).toHaveCount(0);
 await page.locator('#resetTransactionFilters').click();await expect(page.locator('[data-history-row]')).toHaveCount(2);
 await page.locator('#transactionSearch').fill('kopi');await expect(page.locator('[data-history-row]')).toHaveCount(1);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.locator('#transactionAccountFilter').selectOption('asset-test-bank');await page.locator('#toggleBalanceButton').click();await expect(page.locator('#transactionFilterSummary')).not.toContainText('123');
});

test('confirmed card totals are dated, inclusive, private and fit small screens',async({page})=>{
 await page.evaluate(()=>{
  const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));
  d.settings.profile.hideBalanceDefault=false;
  d.settings.credit_card.limit=0;d.settings.credit_card.limitConfirmed=false;
  d.settings.credit_card.issuerSnapshot={accountId:d.settings.credit_card.cardAccountId,asOfDate:'2026-10-19',runningTotal:500.25,currentBill:300,availableCredit:99.5,dueDate:'2026-10-28',currentBillIncluded:true};
  localStorage.setItem('spendly:demo:v1',JSON.stringify(d));
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='credit-card');
 await expect(page.locator('#ccBankSnapshotNote')).toContainText('19 Oktober 2026');
 await expect(page.locator('#ccUsed')).toContainText('500,25');
 await expect(page.locator('#ccBilled')).toContainText('300');
 await expect(page.locator('#ccUnbilled')).toContainText('200,25');
 await expect(page.locator('#ccAvailable')).toContainText('99,5');
 await expect(page.locator('#ccLimit')).toHaveText('Belum dikonfirmasi');
 await expect(page.locator('#ccDueDate')).toHaveText('28 Oktober 2026');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.locator('#toggleBalanceButton').click();
 for(const id of ['ccUsed','ccBilled','ccUnbilled','ccAvailable'])await expect(page.locator('#'+id)).not.toContainText(/\d/);
 await expect(page.locator('#creditReconcileSummary')).not.toContainText('500,25');
 await page.locator('#toggleBalanceButton').click();
 await page.locator('#officialStatementAmount').fill('250');
 await page.locator('#officialStatementDate').fill('2026-10-07');
 await page.locator('#officialDueDate').fill('2026-10-27');
 await page.locator('#creditReconcileForm button[type="submit"]').click();
 await expect(page.locator('#creditReconcileMessage')).toContainText('disimpan');
 await expect(page.locator('#ccBankSnapshotNote')).toBeHidden();
 await expect(page.locator('#ccBilled')).toContainText('250');
 await expect(page.locator('#ccLimit')).toHaveText('Belum dikonfirmasi');
 await expect(page.locator('#ccAvailable')).toHaveText('Belum dikonfirmasi');
});


async function localOcr(page,text){
 await page.evaluate(text=>{window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text}}),terminate:async()=>{}})};},text);
}
async function statementPdf(context){
 const fixture=await context.newPage();
 const tokens=[['REKENING TAHAPAN XPRESI',30,800],['NO. REKENING : 0000000001',300,740],['PERIODE : AGUSTUS 2026',300,700],
 ['14/08',44,558],['TRANSAKSI DEBIT',89,558],['TOKO CONTOH',194,558],['100.25 DB',410,558],['899.75',532,558],
 ['15/08',44,510],['TRANSAKSI DEBIT',89,510],['TOKO KEDUA',194,510],['20.00 DB',410,510],['879.75',532,510],
 ['SALDO AWAL : 1,000.00',210,300],['MUTASI CR : 0.00',210,280],['MUTASI DB : 120.25',210,260],['SALDO AKHIR : 879.75',210,240]];
 await fixture.setContent(`<body style="margin:0"><div style="position:relative;width:600pt;height:840pt">${tokens.map(([text,x,y])=>`<span style="position:absolute;left:${x}pt;top:${840-y}pt;font:8pt Arial;white-space:nowrap">${text}</span>`).join('')}</div></body>`);
 const buffer=await fixture.pdf({width:'800px',height:'1120px',margin:{top:0,right:0,bottom:0,left:0}});await fixture.close();return buffer;
}

test('native myBCA PDF uses local suggestions and preserves original financial facts',async({page,context})=>{
 let calls=0;await page.route('**/api/nvidia/**',route=>{calls++;return route.abort();});
 await page.evaluate(()=>location.hash='scanner');
 await page.locator('#scanInput').setInputFiles({name:'synthetic-mybca.pdf',mimeType:'application/pdf',buffer:await statementPdf(context)});
 await page.locator('#scanButton').click();await expect(page.locator('[data-scan-index]')).toHaveCount(2);
 await expect(page.locator('#statementSummaryContainer')).toContainText('Rekonsiliasi sesuai');
 await page.locator('#optimizeWithNvidiaButton').click();await expect(page.locator('#scanMessage')).toContainText('Saran lokal');
 const row=page.locator('[data-scan-index="0"]');
 await expect(row.locator('[data-scan-field="amount"]')).toHaveValue('100.25');
 await expect(row.locator('[data-scan-field="date"]')).toHaveValue('2026-08-14');expect(calls).toBe(0);
 await expect(page.locator('#scannerKnowledgeSummary')).toContainText('0 contoh referensi');
});

test('native blu PDF keeps cent amounts editable and unknown transfer accounts blank',async({page,context})=>{
 const fixture=await context.newPage();
 const tokens=[['bluAccount',500,800],['Nama / Name',30,740],['NASABAH CONTOH',30,727],['Periode / Period',195,740],['June 2026',195,727],
  ['29 Jun 2026',26,600],['Bunga',140,598],['bluAccount',140,580],['0,31',450,591],['1.000,31',520,591],
  ['30 Jun 2026',26,540],['Dana Masuk dari NASABAH CONTOH',140,538],['SHOPEEPAY',140,520],['10.000,00',420,531],['11.000,31',520,531],
  ['Saldo Awal / Initial Balance',30,410],['1.000,00',535,410],['Total Pemasukan / Total Income',30,390],['10.000,31',535,390],['Total Pengeluaran / Total Expense',30,370],['0,00',535,370],['Saldo Akhir / Ending Balance',30,350],['11.000,31',535,350]];
 await fixture.setContent(`<body style="margin:0"><div style="position:relative;width:600pt;height:840pt">${tokens.map(([text,x,y])=>`<span style="position:absolute;left:${x}pt;top:${840-y}pt;font:8pt Arial;white-space:nowrap">${text}</span>`).join('')}</div></body>`);
 const buffer=await fixture.pdf({width:'800px',height:'1120px',margin:{top:0,right:0,bottom:0,left:0}});await fixture.close();
 await page.evaluate(()=>location.hash='scanner');
 const upload={name:'synthetic-blu.pdf',mimeType:'application/pdf',buffer};
 await page.locator('#scanInput').setInputFiles(upload);await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(2);
 const interest=page.locator('[data-scan-index="0"]'),transfer=page.locator('[data-scan-index="1"]');
 await expect(interest.locator('[data-scan-field="amount"]')).toHaveValue('0.31');
 expect(await interest.locator('[data-scan-field="amount"]').evaluate(el=>el.checkValidity())).toBe(true);
 await expect(transfer.locator('[data-scan-field="sourceAccountId"]')).toHaveValue('');
 await expect(transfer.locator('[data-scan-field="destinationAccountId"]')).toHaveValue('asset-blu');
 await expect(transfer.locator('[data-scan-field="selected"]')).not.toBeChecked();
 await interest.locator('[data-scan-field="selected"]').check();await page.locator('#saveScanCandidates').click();
 await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.filter(tx=>tx.sourceMeta?.fileName==='synthetic-blu.pdf'));
 expect(saved).toHaveLength(1);expect(saved[0].amount).toBe(0.31);
 await page.locator('#scanInput').setInputFiles(upload);await page.locator('#scanButton').click();
 await expect(interest.locator('[data-scan-field="selected"]')).toBeDisabled();
 await expect(interest).toContainText('Duplikat');
});

test('phone scan uses compact cards and keeps edits when switching to desktop',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await localOcr(page,'BCA Mutasi rekening\n13/10/2026 Mobile scan -76.543,00\n14/10/2026 Pembelian kedua -20.000,00');
 await page.evaluate(()=>location.hash='scanner');
 await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 const row=page.locator('[data-scan-index="0"]');await expect(row).toContainText('Mobile scan');
 for(const width of [320,390,600]){
  await page.setViewportSize({width,height:844});
  expect(await page.locator('.compact-review-table').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await expect(page.locator('.compact-review-table thead')).not.toBeVisible();
  await expect(row.locator('[data-scan-field="amount"]')).not.toBeVisible();
  expect((await row.boundingBox()).height).toBeLessThan(330);
  await page.locator('#scanReviewContainer').screenshot({path:`artifacts/previews/scan-cards-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});await row.locator('[data-toggle-scan]').click();
 await row.locator('[data-scan-field="amount"]').fill('54321');await row.locator('[data-scan-field="amount"]').dispatchEvent('change');
 await expect(row.locator('[data-scan-field="amount"]')).toBeVisible();
 for(const width of [320,390,600]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.compact-review-table').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});
 await row.locator('[data-scan-field="merchant"]').fill('Mobile edit');
 await row.locator('[data-toggle-scan]').click();await expect(row.locator('.scan-mobile-summary')).toContainText('54.321');
 await expect(row.locator('.scan-mobile-summary')).toContainText('Mobile edit');
 await page.setViewportSize({width:1440,height:950});await expect(page.locator('.compact-review-table thead')).toBeVisible();
 await expect(row.locator('[data-scan-field="amount"]')).toHaveValue('54321');await expect(row.locator('[data-scan-field="merchant"]')).toHaveValue('Mobile edit');
 await expect(page.locator('[data-scan-field="amount"]')).toHaveCount(2);
 await page.setViewportSize({width:390,height:844});await page.locator('[data-scan-index="1"] [data-scan-field="selected"]').uncheck();await row.locator('[data-scan-field="selected"]').check();
 await page.locator('#saveScanCandidates').click();await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.filter(tx=>tx.merchant==='Mobile edit'));
 expect(saved).toHaveLength(1);expect(saved[0].amount).toBe(54321);
});

test('populated scan summaries and sticky review columns stay readable in both themes',async({page,context})=>{
 test.setTimeout(120000);
 await page.evaluate(()=>location.hash='scanner');
 await page.locator('#scanInput').setInputFiles({name:'contoh-e-statement.pdf',mimeType:'application/pdf',buffer:await statementPdf(context)});
 await page.locator('#scanButton').click();
 await expect(page.locator('.statement-summary-header h3')).toHaveText('contoh-e-statement.pdf');
 await expect(page.locator('[data-scan-index]')).toHaveCount(2);
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:950});
   await page.locator('#statementSummaryContainer').screenshot({path:`artifacts/previews/scan-summary-${theme}-${width}.png`});
   await page.locator('#scanReviewContainer').screenshot({path:`artifacts/previews/scan-review-${theme}-${width}.png`});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   for(const left of [0,900]){
    await page.locator('.compact-review-table').evaluate((el,left)=>el.scrollLeft=left,left);
    const audit=await new AxeBuilder({page}).include('#statementSummaryContainer').include('#scanReviewContainer').withRules(['color-contrast']).analyze();
    expect(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),`${theme}, ${width}px, scroll ${left}`).toEqual([]);
   }
   if(width===390){
    await page.locator('[data-toggle-scan="0"]').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const expandedAudit=await new AxeBuilder({page}).include('#scanReviewContainer').withRules(['color-contrast','label']).analyze();
    expect(expandedAudit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
    await page.locator('[data-scan-index="0"]').screenshot({path:`artifacts/previews/scan-expanded-${theme}.png`});
    await page.locator('[data-toggle-scan="0"]').click();
   }
  }
 }
});

test('opening balances preserve cents without inflating monthly income and cannot be added twice',async({page})=>{
 const before=await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js'),{incomeStatement,balanceSheet}=await import('/assets/js/accounting.js');return {income:incomeStatement(state.transactions,'2026-10').income,assets:balanceSheet(state.transactions).assets};});
 await page.evaluate(()=>location.hash='wallets');await page.locator('[data-opening-account="asset-bca"]').click();
 await page.locator('#openingBalanceForm [name="date"]').fill('2026-10-01');await page.locator('#openingBalanceForm [name="amount"]').fill('1000000.25');
 await page.locator('#openingBalanceForm button[type="submit"]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 await expect(page.locator('[data-opening-account="asset-bca"]')).toHaveCount(0);
 const after=await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js'),{incomeStatement,balanceSheet}=await import('/assets/js/accounting.js');return {income:incomeStatement(state.transactions,'2026-10').income,assets:balanceSheet(state.transactions).assets};});
 expect(after.income).toBe(before.income);expect(after.assets).toBe(before.assets+1000000.25);
 await page.reload();await waitForDemo(page);await expect(page.locator('[data-opening-account="asset-bca"]')).toHaveCount(0);
 await expect(page.locator('#walletCards')).toContainText(',25');
});

test('bank logos are local, readable, and loaded at phone width',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>location.hash='wallets');
 const images=page.locator('#walletCards .bank-logo img');await expect(images).toHaveCount(5);
 for(const img of await images.all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);expect(await img.getAttribute('src')).toContain('127.0.0.1:4173/assets/banks/');}
});

test('stale budget load cannot overwrite a newer selected month',async({page})=>{
 await page.evaluate(async()=>{const {demoRepository}=await import('/assets/js/demo.js');demoRepository.getBudgetPlan=async(uid,month)=>{if(month==='2026-08')await new Promise(resolve=>window.releaseBudget=resolve);return {month,items:[{id:month,name:'Plan '+month,category:'Makan',method:'nominal',value:100}]};};});
 await page.evaluate(()=>location.hash='budget');await page.locator('#budgetMonth').fill('2026-08');await page.locator('#budgetMonth').dispatchEvent('change');
 await page.locator('#budgetMonth').fill('2026-09');await page.locator('#budgetMonth').dispatchEvent('change');await expect(page.locator('#budgetList')).toContainText('Plan 2026-09');
 await page.evaluate(()=>window.releaseBudget());await expect(page.locator('#budgetList')).toContainText('Plan 2026-09');
 expect(await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js');return state.budgetPlan.month;})).toBe('2026-09');
});

test('failed budget writes show error and leave the saved plan unchanged',async({page})=>{
 await page.evaluate(async()=>{const {demoRepository}=await import('/assets/js/demo.js');demoRepository.saveBudgetPlan=async()=>{throw new Error('Simulasi koneksi terputus');};});
 await page.evaluate(()=>location.hash='budget');const before=await page.locator('#budgetList').innerText();
 await page.locator('#budgetName').fill('Hiburan audit');await page.locator('#budgetCategory').selectOption('Hiburan');await page.locator('#budgetMethod').selectOption('nominal');await page.locator('#budgetValue').fill('50000');
 await page.locator('#budgetForm button[type="submit"]').click();await expect(page.locator('#budgetMessage')).toContainText('Simulasi koneksi terputus');await expect(page.locator('#budgetList')).toHaveText(before);
});
test.beforeEach(async({page})=>{
 await page.goto(`${BASE}/?demo=1`,{waitUntil:'domcontentloaded'});await expect(page.locator('#dailyAmount')).not.toHaveText('—');
});

test('phone scanner has no remote AI configuration or document transmission',async({page})=>{
 await page.setViewportSize({width:390,height:844});let calls=0;
 await page.route('**/api/nvidia/**',route=>{calls++;return route.abort();});
 await page.evaluate(()=>location.hash='scanner');await expect(page.locator('#scannerKnowledgeSummary')).toBeVisible();
 await expect(page.locator('#nvidiaBackendUrlInput')).toHaveCount(0);await expect(page.locator('#manualAiButton')).toHaveCount(0);
 await localOcr(page,'BCA Transfer berhasil\n15/10/2026\nNominal Rp76.543\nNo Referensi LOCAL123456');
 await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(1);expect(calls).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('all pages fit desktop and phone widths in light and dark themes',async({page})=>{
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 const pages=['dashboard','wallets','goals','investments','transactions','budget','recurring','credit-card','reports','scanner','settings'];
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  for(const name of pages){
   await page.evaluate(name=>{location.hash=name;},name);
   await expect(page.locator(`#page-${name}`)).toBeVisible();
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 }
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.locator('#themeButton').click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.locator('#themeButton').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('#page-settings')).toBeVisible();
 expect(errors).toEqual([]);
});
test('goals create, update and delete persist without changing wallet balances',async({page})=>{
 const before=await page.locator('#modernStats strong').allTextContents();
 await page.locator('.nav-link[data-page="goals"]').click();
 await page.locator('[data-action="new-goal"]').first().click();
 await page.locator('#goalForm [name="name"]').fill('Laptop untuk bekerja');
 await page.locator('#goalForm [name="target"]').fill('15000000');
 await page.locator('#goalForm [name="saved"]').fill('3000000');
 await page.locator('#goalForm [name="dueDate"]').fill('2027-12-31');
 await page.locator('#goalForm [type="submit"]').click();
 const card=page.locator('.goal-card').filter({hasText:'Laptop untuk bekerja'});
 await expect(card).toContainText('20%');
 await page.reload({waitUntil:'domcontentloaded'});await waitForDemo(page);
 await expect(card).toContainText('20%');
 await card.locator('[data-edit-goal]').click();
 await page.locator('#goalForm [name="saved"]').fill('6000000');
 await page.locator('#goalForm [type="submit"]').click();
 await expect(card).toContainText('40%');
 await card.locator('[data-edit-goal]').click();
 await page.locator('#deleteGoalButton').click();
 await page.locator('#confirmDeleteGoal').click();
 await expect(card).toHaveCount(0);
 expect(await page.locator('#modernStats strong').allTextContents()).toEqual(before);
});
test('budget limit persists and privacy hides dashboard, chart and goal amounts',async({page})=>{
 await page.locator('[data-action="limit"]').first().click();
 await page.locator('#limitForm input').fill('10000000');
 await page.locator('#limitForm button').click();
 await expect(page.locator('#monthlyBudgetCard')).toContainText('10.000.000');
 await page.reload({waitUntil:'domcontentloaded'});await waitForDemo(page);
 await expect(page.locator('#monthlyBudgetCard')).toContainText('10.000.000');
 await page.locator('#toggleBalanceButton').click();
 await expect(page.locator('#dailyAmount')).toContainText('••••••');
 await expect(page.locator('#spendingChart')).toContainText('Angkamu tetap privat');
 await expect(page.locator('#goalCards')).not.toContainText('6.500.000');
 await expect(page.locator('#goalsPreview .progress-fill').first()).toHaveCSS('width','0px');
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#dailyAmount')).toContainText('••••••');
});
test('new expense changes monthly spending, persists, and deletion restores it',async({page})=>{
 const before=await page.locator('#modernStats strong').allTextContents();
 await page.locator('.welcome-row [data-action="transaction"]').click();
 await page.locator('#transactionAmount').fill('123456');
 await page.locator('#transactionCategory').selectOption('Makan');
 await page.locator('#transactionMerchant').fill('QA makan siang');
 await page.locator('#transactionForm [type="submit"]').click();
 await expect(page.locator('#transactionMessage')).toContainText('berhasil');
 const row=page.locator('#transactionTableContainer tr').filter({hasText:'QA makan siang'});
 await expect(row).toContainText('123.456');
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(row).toContainText('123.456');
 expect(await page.locator('#modernStats strong').allTextContents()).not.toEqual(before);
 page.once('dialog',dialog=>dialog.accept());
 await row.locator('button').click();
 await expect(row).toHaveCount(0);
 expect(await page.locator('#modernStats strong').allTextContents()).toEqual(before);
});
test('new wallet shows zero balance and demo never calls Firebase',async({page})=>{
 const cloud=[];page.on('request',req=>{if(/firestore.googleapis|identitytoolkit|securetoken/.test(req.url()))cloud.push(req.url());});
 await page.locator('.nav-link[data-page="wallets"]').click();
 await page.locator('[data-action="account"]').first().click();
 await page.locator('#accountName').fill('Dompet pengujian');
 await page.locator('#accountSubtype').selectOption('ewallet');
 await page.locator('#accountForm button').click();
 await expect(page.locator('#accountMessage')).toContainText('Akun baru');
 await expect(page.locator('#accountSettingsList')).toContainText('Dompet pengujian');
 const setting=page.locator('#accountSettingsList .list-card').filter({hasText:'Dompet pengujian'});
 await setting.getByRole('button',{name:'Nonaktifkan',exact:true}).click();
 await expect(setting.getByRole('button',{name:'Aktifkan',exact:true})).toBeVisible();
 await setting.getByRole('button',{name:'Aktifkan',exact:true}).click();
 await page.locator('.nav-link[data-page="wallets"]').click();
 await expect(page.locator('.wallet-card').filter({hasText:'Dompet pengujian'})).toContainText('Rp 0');
 expect(cloud).toEqual([]);
});
test('mobile menu and add action work with keyboard-accessible dialogs',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.locator('#bottomNav [data-action="menu"]').click();
 await expect(page.locator('#spendlyDialog')).toBeVisible();
 await page.locator('.menu-grid [data-page="goals"]').click();
 await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 await expect(page.locator('#page-goals')).toBeVisible();
 await page.locator('#page-goals [data-action="new-goal"]').click();
 await page.keyboard.press('Escape');
 await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 await page.locator('#bottomNav [data-action="transaction"]').click();
 await expect(page.locator('#transactionAmount')).toBeFocused();
});
test('PWA works at repository prefix and displays honest offline screen',async({page,context})=>{
 await page.goto(`${BASE}/catatan-pengeluaran-keuangan/?demo=1`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('#appShell')).toBeVisible();
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 const manifest=await page.evaluate(async()=>{const url=document.querySelector('link[rel=manifest]').href;return (await fetch(url)).json();});
 expect(manifest.display).toBe('standalone');
 expect(manifest.scope).toBe('./');
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('h1')).toHaveText('Ambil jeda sebentar.');
 await context.setOffline(false);
 await page.getByText('Coba lagi').click();
 await expect(page.locator('#authScreen')).toBeVisible();
});
test('browser back returns to the previous page inside Spendly',async({page})=>{
 await page.locator('.nav-link[data-page="goals"]').click();
 await page.locator('.nav-link[data-page="wallets"]').click();
 await page.goBack();
 await expect(page.locator('#page-goals')).toBeVisible();
});


test('credit card sections have breathing room on desktop and mobile',async({page})=>{
 await page.evaluate(()=>location.hash='credit-card');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const stats=await page.locator('.credit-stats').boundingBox(),grid=await page.locator('.credit-grid').boundingBox();
  expect(grid.y-(stats.y+stats.height)).toBeGreaterThanOrEqual(23);
 }
});

test('shared savings and bank rules persist, respect privacy, and do not post ledger entries',async({page})=>{
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length);
 await page.evaluate(()=>location.hash='investments');
 await page.locator('[data-bank-action="savings"]').click();
 await expect(page.locator('#savingsView')).toContainText('Tabungan kita');
 await page.locator('[data-bank-action="savings-settings"]').click();
 await page.locator('#savingsForm [name="name"]').fill('Masa depan kita');
 await page.locator('#savingsForm [name="rate"]').fill('6.25');
 await page.locator('#savingsForm button').click();
 await expect(page.locator('#savingsView')).toContainText('6.25%');
 await page.reload();await page.locator('[data-bank-action="savings"]').click();
 await expect(page.locator('#savingsView')).toContainText('Masa depan kita');
 await page.locator('#toggleBalanceButton').click();
 await expect(page.locator('.savings-total')).toContainText('••');
 await page.evaluate(()=>location.hash='wallets');
 await page.locator('[data-bank-action="bank-rule"][data-account="asset-mandiri"]').click();
 await expect(page.locator('#bankRuleForm [name="card"]')).toHaveValue('6000');
 await page.locator('#bankRuleForm [name="minimum"]').fill('200000');
 await page.locator('#bankRuleForm button').click();
 await page.reload();
 await page.locator('[data-bank-action="bank-rule"][data-account="asset-mandiri"]').click();
 await expect(page.locator('#bankRuleForm [name="minimum"]')).toHaveValue('200000');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(before);
});

test('local OCR screenshot saves once and recognizes a repeat upload',async({page})=>{
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await localOcr(page,'BCA Transfer berhasil\n15/10/2026 12:30:11\nNominal Rp76.543\nNo Referensi LOCAL123456');
 await page.evaluate(()=>location.hash='scanner');
 await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(1);
 await page.locator('[data-scan-field="selected"]').check();await page.locator('#saveScanCandidates').click();
 await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
 await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-field="selected"]')).toBeDisabled();
 await expect(page.locator('#scanReviewContainer')).toContainText('Duplikat');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')));
 expect(data.transactions.filter(tx=>tx.sourceMeta?.reference==='LOCAL123456')).toHaveLength(1);expect(errors).toEqual([]);
});

for(const width of [1440,390]) test(`ambiguous imports require an explicit decision and distinct payments are preserved at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:950});
 await localOcr(page,'Krom Mutasi rekening\n15/10/2026 QA Similar -87.654,00');
 await page.evaluate(()=>location.hash='scanner');
 await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('#scanReviewContainer')).toContainText('Transaksi baru');
 await page.locator('[data-scan-field="selected"]').check();await page.locator('#saveScanCandidates').click();
 await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
 await page.locator('#scanInput').setInputFiles('assets/icon-512.png');await page.locator('#scanButton').click();
 await expect(page.locator('#scanReviewContainer')).toContainText('Mirip');
 await expect(page.locator('[data-scan-field="selected"]')).toBeDisabled();
 if(width===390){
  await expect(page.locator('.scan-mobile-summary')).toContainText('Mirip');
  await page.locator('[data-toggle-scan="0"]').click();
 }
 await page.locator('[data-scan-field="importDecision"]').selectOption('skip');
 await expect(page.locator('[data-scan-field="selected"]')).not.toBeChecked();
 await page.locator('[data-scan-field="importDecision"]').selectOption('new');
 await expect(page.locator('[data-scan-field="selected"]')).toBeChecked();
 await page.locator('[data-scan-field="amount"]').fill('87655');await page.locator('[data-scan-field="amount"]').blur();
 await page.locator('[data-scan-field="amount"]').fill('87654');await page.locator('[data-scan-field="amount"]').blur();
 await expect(page.locator('[data-scan-field="selected"]')).toBeDisabled();
 await page.locator('[data-scan-field="importDecision"]').selectOption('new');
 await page.locator('#saveScanCandidates').click();await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')));
 expect(data.transactions.filter(tx=>tx.merchant==='QA Similar')).toHaveLength(2);
 expect(data.transactions.filter(tx=>tx.merchant==='QA Similar').every(tx=>tx.sourceAccountId==='asset-krom')).toBe(true);
});

async function salaryRule(page,{name='Gaji pengujian',amount='1234567',account='asset-bca',day='1'}={}){
 await page.evaluate(()=>location.hash='recurring');await page.locator('#salarySetupButton').click();
 await page.locator('#recurringName').fill(name);await page.locator('#recurringAmount').fill(amount);
 await page.locator('#recurringDay').fill(day);await page.locator('#recurringStart').fill('2026-10-01');
 await page.locator('#recurringSource').selectOption(account);await page.locator('#recurringSaveButton').click();
 await expect(page.locator('#recurringMessage')).toContainText('Jadwal disimpan');
}
test('salary planning does not inflate money; confirmation updates income and stays settled after edits',async({page})=>{
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions);
 await salaryRule(page);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(before.length);
 await page.locator('#dueRecurringList .list-card').filter({hasText:'Gaji pengujian'}).getByRole('button',{name:'Konfirmasi'}).click();
 await page.locator('#settleRecurringForm [name="existing"]').selectOption('new');
 await page.locator('#settleRecurringForm [name="amount"]').fill('1250000');
 await page.locator('#settleRecurringForm [type="submit"]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 await expect(page.locator('#salaryOverview')).toContainText('1.250.000');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')));
 expect(data.transactions.length).toBe(before.length+1);
 expect(data.transactions.filter(t=>t.type==='income').reduce((n,t)=>n+t.amount,0)).toBe(before.filter(t=>t.type==='income').reduce((n,t)=>n+t.amount,0)+1250000);
 const target=await page.evaluate(async()=>{const {budgetTarget}=await import('/assets/js/budget.js');const data=JSON.parse(localStorage.getItem('spendly:demo:v1'));return budgetTarget(data.transactions,'2026-10',{method:'percentage',value:50});});
 expect(target).toBe(data.transactions.filter(t=>t.type==='income').reduce((n,t)=>n+t.amount,0)*0.5);
 await page.reload();await waitForDemo(page);await expect(page.locator('#dueRecurringList')).not.toContainText('Gaji pengujian');
 await page.locator('#recurringRuleList .list-card').filter({hasText:'Gaji pengujian'}).getByRole('button',{name:'Ubah',exact:true}).click();
 await page.locator('#recurringAmount').fill('1500000');await page.locator('#recurringSaveButton').click();
 await expect(page.locator('#dueRecurringList')).not.toContainText('Gaji pengujian');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(before.length+1);
 await page.locator('#recurringRuleList .list-card').filter({hasText:'Gaji pengujian'}).getByRole('button',{name:'Hapus',exact:true}).click();
 await expect(page.locator('#salaryOverview')).toContainText('1.250.000');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(before.length+1);
});

test('salary confirmation links an existing imported transaction without adding money twice',async({page})=>{
 const imported=await page.evaluate(async()=>{
  const {saveTransaction}=await import('/assets/js/transactions.js'),{state}=await import('/assets/js/state.js');
  return saveTransaction(state.user.uid,{date:'2026-10-02',type:'income',amount:2345678,sourceAccountId:'asset-bca',category:'Gaji',merchant:'Payroll hasil scan',origin:'statement-reader'},state.settings);
 });
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length);
 await salaryRule(page,{name:'Gaji scan',amount:'2345678',day:'10'});
 await page.locator('#dueRecurringList .list-card').filter({hasText:'Gaji scan'}).getByRole('button',{name:'Konfirmasi'}).click();
 await page.locator('#settleRecurringForm [name="existing"]').selectOption(imported.id);
 await page.locator('#settleRecurringForm [type="submit"]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')));
 expect(data.transactions.length).toBe(before);expect(data.transactions.find(t=>t.id===imported.id).recurringRuleId).toBeTruthy();
 await expect(page.locator('#salaryOverview')).toContainText('2.345.678');
});

test('manual local learning uses only reviewed examples and requires acceptance',async({page})=>{
 await page.evaluate(()=>location.hash='transactions');await page.locator('#transactionMerchant').fill('Alfamrt');
 await page.locator('#checkManualButton').click();await expect(page.locator('#manualSuggestions')).toContainText('Alfamart');
 await expect(page.locator('#transactionMerchant')).toHaveValue('Alfamrt');
 await page.locator('#manualSuggestions').getByRole('button',{name:'Terapkan saran'}).first().click();
 await expect(page.locator('#transactionMerchant')).toHaveValue('Alfamart');
 await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js');state.scannerKnowledge={examples:[1,2].map(id=>({id:String(id),type:'expense',merchant:'Alfamart',description:'',category:'Kebutuhan Rumah',labelStatus:'reviewed'}))};});
 await page.locator('#checkManualButton').click();await expect(page.locator('#manualSuggestions')).toContainText('Belajar lokal');
 await expect(page.locator('#transactionCategory')).not.toHaveValue('Kebutuhan Rumah');
 await page.locator('#manualSuggestions').getByRole('button',{name:'Terapkan saran'}).first().click();
 await expect(page.locator('#transactionCategory')).toHaveValue('Kebutuhan Rumah');
});

test('local OCR excludes summaries and pending payments',async({page})=>{
 await localOcr(page,'BCA Mutasi rekening\n15/10/2026 Pembayaran belanja -55.555,00\n15/10/2026 Saldo akhir +999.999,00\n15/10/2026 Belum dibayar -12.345,00');
 await page.evaluate(()=>location.hash='scanner');
 await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(1);
 await page.locator('#optimizeWithNvidiaButton').click();await expect(page.locator('#scanMessage')).toContainText('Saran lokal');
 await expect(page.locator('[data-scan-field="amount"]')).toHaveValue('55555');
});

test('manual salary entry warns about a confirmed salary and can cancel the duplicate',async({page})=>{
 await salaryRule(page);await page.locator('#dueRecurringList .list-card').filter({hasText:'Gaji pengujian'}).getByRole('button',{name:'Konfirmasi'}).click();
 await page.locator('#settleRecurringForm [name="existing"]').selectOption('new');
 await page.locator('#settleRecurringForm button[type="submit"]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length);
 await page.evaluate(()=>location.hash='transactions');await page.locator('#transactionType').selectOption('income');
 await page.locator('#transactionDate').fill('2026-10-01');await page.locator('#transactionAmount').fill('1234567');
 await page.locator('#sourceAccount').selectOption('asset-bca');await page.locator('#transactionMerchant').fill('Gaji pengujian');
 page.once('dialog',async dialog=>{expect(dialog.message()).toContain('sudah tercatat');await dialog.dismiss();});
 await page.locator('#transactionForm button[type="submit"]').click();await expect(page.locator('#transactionMessage')).toContainText('Tidak ada transaksi tambahan');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(before);
});

test('private scanner references survive reload without posting ledger entries',async({page})=>{
 const before=await page.evaluate(async()=>{
  const {state}=await import('/assets/js/state.js'),{demoRepository}=await import('/assets/js/demo.js');
  const count=state.transactions.length;
  await demoRepository.saveSettings(state.user.uid,'scanner_knowledge',{version:1,statements:[{id:'synthetic'}],examples:[{id:'reference',type:'expense',category:'',suggestedCategory:'Belanja',labelStatus:'unreviewed'}],coverageNote:'Cakupan belum lengkap; laporan sementara.'});return count;
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='scanner');
 await expect(page.locator('#scannerKnowledgeSummary')).toContainText('1 contoh referensi · 0 label kategori terkonfirmasi');
 await expect(page.locator('#accountCoverageNotice')).toContainText('laporan sementara');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(before);
});

test('wallet evidence snapshots remain separate from the ledger and respect balance privacy',async({page})=>{
 const before=await page.evaluate(async()=>{
  const {state}=await import('/assets/js/state.js'),{demoRepository:repo}=await import('/assets/js/demo.js');
  await repo.saveSettings(state.user.uid,'scanner_knowledge',{balanceObservations:[{accountId:'asset-bca',date:'2026-10-19',amount:3210.34,kind:'active-balance'},{accountId:'asset-blu',date:'2099-01-01',amount:555,kind:'balance'}]});return JSON.stringify(state.transactions);
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='wallets');
 await expect(page.locator('[data-balance-observation]')).toHaveCount(1);
 await expect(page.locator('#walletReconciliation')).toContainText('Saldo aktif dari bukti');
 if((await page.locator('#toggleBalanceButton').textContent()).includes('Tampilkan'))await page.locator('#toggleBalanceButton').click();
 await expect(page.locator('#walletReconciliation')).toContainText('3.210,34');
 await page.locator('#toggleBalanceButton').click();await expect(page.locator('#walletReconciliation')).not.toContainText('3.210,34');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 expect(await page.evaluate(async()=>JSON.stringify((await import('/assets/js/state.js')).state.transactions))).toBe(before);
});
test('wallet evidence tolerates damaged journal entries and still reports the issue',async({page})=>{
 await page.evaluate(async()=>{
  const {state}=await import('/assets/js/state.js');state.scannerKnowledge={balanceObservations:[{accountId:'asset-bca',date:'2026-10-19',amount:10}]};
  state.transactions.push({id:'damaged',date:'2026-10-19',type:'expense',amount:1,sourceAccountId:'asset-bca',journal:[null]});
  (await import('/assets/js/experience.js')).renderExperience();
 });
 await page.evaluate(()=>location.hash='wallets');await expect(page.locator('#walletReconciliation')).toBeVisible();await expect(page.locator('#financialHealth')).toContainText('jurnal kosong/tidak seimbang');
});

test('unallocated loan payment is visibly pending and does not become consumption expense',async({page})=>{
 const values=await page.evaluate(async()=>{
  const {state}=await import('/assets/js/state.js'),{saveTransaction}=await import('/assets/js/transactions.js'),{incomeStatement}=await import('/assets/js/accounting.js');
  const before=incomeStatement(state.transactions,'2026-10').expenses;
  await saveTransaction(state.user.uid,{type:'transfer',date:'2026-10-01',amount:12345,sourceAccountId:'asset-bca',destinationAccountId:'asset-transfer-clearing',category:'Perlu rincian',description:'Pembayaran pinjaman contoh',sourceMeta:{pendingAllocation:'Rincian pokok, bunga, dan biaya belum tersedia.',categoryReviewed:false}},state.settings);
  return {before};
 });
 await page.evaluate(()=>location.hash='transactions');
 const row=page.locator('#transactionTableContainer tr').filter({hasText:'Pembayaran pinjaman contoh'});
 await expect(row).toContainText('Perlu rincian');await expect(row).toContainText('Rincian pokok, bunga, dan biaya belum tersedia.');
 expect(await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js'),{incomeStatement}=await import('/assets/js/accounting.js');return incomeStatement(state.transactions,'2026-10').expenses;})).toBe(values.before);
});

async function seedPaylater(page){
 return page.evaluate(async()=>{
  const {state}=await import('/assets/js/state.js'),{demoRepository:repo}=await import('/assets/js/demo.js'),{buildTransaction}=await import('/assets/js/accounting.js');
  const profile=structuredClone(state.settings);profile.accounts.push({id:'liability-paylater-demo',name:'PayLater contoh',type:'liability',subtype:'paylater',active:true});await repo.saveSettings(state.user.uid,'profile',profile);
  const bills=[300,200,175,125,100,50].map((amount,i)=>({id:'bill-'+i,period:['2026-09','2026-10','2026-11','2026-12','2027-01','2027-02'][i],dueDate:['2026-10-25','2026-11-25','2026-12-25','2027-01-25','2027-02-25','2027-03-25'][i],amount}));
  const opening=await buildTransaction({type:'opening_balance',date:'2026-10-16',amount:950,sourceAccountId:'liability-paylater-demo'},profile);await repo.createTransactionPermanent(state.user.uid,opening);
  const plan={version:1,name:'PayLater contoh',accountId:'liability-paylater-demo',asOfDate:'2026-10-16',limit:2000,availableLimit:1057,openingTransactionId:opening.id,bills};await repo.saveSettings(state.user.uid,'paylater',plan);return plan;
 });
}
test('PayLater schedule separates limit snapshot, respects privacy and fits phone and laptop',async({page})=>{
 await seedPaylater(page);await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='credit-card');
 await expect(page.locator('#paylaterView')).toBeVisible();await expect(page.locator('[data-paylater-bill]')).toHaveCount(6);
 await expect(page.locator('#paylaterOutstanding')).toContainText('950');await expect(page.locator('#paylaterView')).toContainText('lebih besar Rp 7');
 await expect(page.locator('[data-paylater-bill="bill-0"]')).toContainText('25 Oktober 2026');await expect(page.locator('[data-paylater-bill="bill-5"]')).toContainText('25 Maret 2027');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 for(const theme of ['dark','light']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);const audit=await new AxeBuilder({page}).include('#paylaterView').withRules(['color-contrast','button-name']).analyze();expect(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);}
 await page.locator('#toggleBalanceButton').click();await expect(page.locator('#paylaterOutstanding')).toHaveText('Rp ••••••');await expect(page.locator('#paylaterView')).not.toContainText('Rp 950');
 await page.locator('[data-credit-view="bank"]').click();await expect(page.locator('#ccUsed')).toBeVisible();
});
test('PayLater records actual payment once and linking a bank import never subtracts cash again',async({page})=>{
 await seedPaylater(page);await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='credit-card');
 const totals=()=>page.evaluate(async()=>{const {state}=await import('/assets/js/state.js'),{balanceSheet,incomeStatement}=await import('/assets/js/accounting.js');return {assets:balanceSheet(state.transactions).assets,liabilities:balanceSheet(state.transactions).liabilities,expenses:incomeStatement(state.transactions,'2026-10').expenses,count:state.transactions.length};});
 const before=await totals();await page.locator('[data-paylater-pay="bill-0"]').click();await page.locator('#paylaterPaymentForm [name="existing"]').selectOption('new');await page.locator('#paylaterPaymentForm [name="source"]').selectOption('asset-bca');await page.locator('#paylaterPaymentForm [type="submit"]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 await expect(page.locator('[data-paylater-bill]')).toHaveCount(5);const after=await totals();expect(after.assets).toBe(before.assets-300);expect(after.liabilities).toBe(before.liabilities-300);expect(after.expenses).toBe(before.expenses);
 await page.reload();await waitForDemo(page);await expect(page.locator('[data-paylater-pay="bill-0"]')).toHaveCount(0);await page.locator('[data-paylater-filter="paid"]').click();await expect(page.locator('[data-paylater-bill="bill-0"]')).toContainText('Lunas');
 const imported=await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js'),{saveTransaction}=await import('/assets/js/transactions.js');return saveTransaction(state.user.uid,{type:'expense',amount:200,date:'2026-10-16',sourceAccountId:'asset-bca',merchant:'Pembayaran contoh'},state.settings);});
 const beforeLink=await totals();await page.locator('[data-paylater-filter="unpaid"]').click();await page.locator('[data-paylater-pay="bill-1"]').click();await page.locator('#paylaterPaymentForm [name="existing"]').selectOption(imported.id);await page.locator('#paylaterPaymentForm [type="submit"]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 const afterLink=await totals();expect(afterLink.count).toBe(beforeLink.count);expect(afterLink.assets).toBe(beforeLink.assets);expect(afterLink.expenses).toBe(beforeLink.expenses-200);expect(afterLink.liabilities).toBe(beforeLink.liabilities-200);
 const payment=await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js');return state.transactions.find(t=>t.sourceMeta?.paylaterBillId==='bill-0').id;});
 await page.evaluate(async id=>{const {state}=await import('/assets/js/state.js'),{deleteTransaction}=await import('/assets/js/repository.js');await deleteTransaction(state.user.uid,id);},payment);
 await expect(page.locator('[data-paylater-pay="bill-0"]')).toBeVisible();
});
