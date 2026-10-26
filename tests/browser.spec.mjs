import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const BASE='http://127.0.0.1:4173';
const waitForDemo=page=>expect(page.locator('#syncStatus')).toHaveText(/Mode demo.*lokal/,{timeout:15000});

test('credit funding and expense reimbursements retain accounts and journals in mobile editing',async({page})=>{
 await page.evaluate(async()=>{const {buildTransaction}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.transactions=[];for(const input of [{type:'credit_cash_advance',amount:100000,sourceAccountId:'liability-mandiri-cc',destinationAccountId:'asset-blu',merchant:'Card funding',category:'Pencairan Kartu'},{type:'expense_refund',amount:30000,sourceAccountId:'asset-mandiri',merchant:'Meal reimbursement',category:'Makan'}])d.transactions.push(await buildTransaction({...input,date:'2026-10-20'},d.settings.profile));localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});
 await page.reload();await waitForDemo(page);await expect(page.locator('#spendingChart .chart-bar.refund')).toHaveCount(1);await expect(page.locator('#spendingChart .chart-bar.refund')).toHaveAttribute('aria-label',/Penggantian pengeluaran/);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>location.hash='transactions');
 for(const type of ['credit_cash_advance','expense_refund']){
  await page.evaluate(async type=>{const {state}=await import('/assets/js/state.js'),{openTransactionEditor}=await import('/assets/js/transaction-editor-ui.js');await openTransactionEditor(state.transactions.find(t=>t.type===type).id);},type);
  const form=page.locator('#transactionEditForm');await expect(form.locator('[name=type] option[value=expense_refund]')).toHaveCount(1);await expect(form.locator('[name=type] option[value=credit_cash_advance]')).toHaveCount(1);await expect(form.locator('[name=type]')).toHaveValue(type);await expect(form.locator('[name=sourceAccountId]')).toHaveValue(type==='credit_cash_advance'?'liability-mandiri-cc':'asset-mandiri');
  if(type==='credit_cash_advance')await expect(form.locator('[name=destinationAccountId]')).toHaveValue('asset-blu');await form.locator('[name=description]').fill('Reviewed note');await form.locator('[type=submit]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const totals=await page.evaluate(async()=>{const {incomeStatement,deriveLedger}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));return {statement:incomeStatement(d.transactions,'2026-10'),accounts:deriveLedger(d.transactions).accounts};});
 expect(totals.statement.income).toBe(0);expect(totals.statement.expenses).toBe(-30000);expect(totals.accounts.find(a=>a.accountId==='asset-blu').balance).toBe(100000);
});

test('investment order editing, partial match and sale remain coherent on phone and desktop',async({page})=>{
 await page.evaluate(()=>location.hash='investments');
 await page.getByRole('button',{name:'Tambah order',exact:true}).click();
 const form=page.locator('#investmentForm');
 await form.locator('[name=symbol]').fill('TEST');await form.locator('[name=name]').fill('Saham uji');
 await form.locator('[name=quantity]').fill('400');await form.locator('[name=limitPrice]').fill('1000');
 await form.locator('[type=submit]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 const card=page.locator('[data-investment-order]');await expect(card).toContainText('Menunggu matched');
 await card.getByRole('button',{name:'Edit order',exact:true}).click();await form.locator('[name=limitPrice]').fill('1100');await form.locator('[type=submit]').click();
 await expect(card).toContainText('1.100');await card.getByRole('button',{name:'Catat matched',exact:true}).click();
 await form.locator('[name=quantity]').fill('200');await form.locator('[name=price]').fill('1000');await form.locator('[name=fee]').fill('1000');await form.locator('[name=cashAccountId]').selectOption('asset-mandiri');
 await form.locator('[type=submit]').click();await expect(card).toContainText('Matched sebagian');
 const pos=page.locator('[data-investment-position]');await expect(pos).toContainText('201.000');
 await pos.getByRole('button',{name:'Catat penjualan',exact:true}).click();await form.locator('[name=quantity]').fill('100');await form.locator('[name=price]').fill('1200');await form.locator('[name=fee]').fill('500');await form.locator('[name=cashAccountId]').selectOption('asset-mandiri');
 await expect(form.locator('[data-sale-preview]')).toContainText('19.000');await form.locator('[type=submit]').click();
 await expect(pos).toContainText('100 lembar');await expect(page.locator('[data-investment-events]')).toContainText('19.000');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).settings.profile.investmentPortfolio);expect(saved.events.map(e=>e.kind)).toEqual(['buy','sell']);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await pos.getByRole('button',{name:'Edit posisi',exact:true}).click();await expect(form.locator('[name=quantity]')).toHaveAttribute('readonly','');await expect(form.locator('[name=cost]')).toHaveAttribute('readonly','');await page.locator('.dialog-close').click();
 await page.locator('#toggleBalanceButton').click();await expect(page.locator('#investmentView')).not.toContainText('19.000');
 await page.reload();await waitForDemo(page);await expect(page.locator('[data-investment-position]')).toContainText('100 lembar');
});

test('investment conflict refreshes the order before the editor is reopened',async({page})=>{
 await page.evaluate(async()=>{
  const {state}=await import('/assets/js/state.js'),{changeInvestmentPortfolio}=await import('/assets/js/repository.js'),{investmentVersion}=await import('/assets/js/investment-ledger.js');
  const r=await changeInvestmentPortfolio(state.user.uid,{id:crypto.randomUUID(),kind:'order',symbol:'TEST',name:'Test',quantity:100,limitPrice:1000,date:'2026-10-20',expectedVersion:investmentVersion(state.settings)});state.settings=r.profile;
 });await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='investments');
 await page.getByRole('button',{name:'Edit order',exact:true}).click();
 await page.evaluate(async()=>{
  const {state}=await import('/assets/js/state.js'),{changeInvestmentPortfolio}=await import('/assets/js/repository.js'),{investmentVersion,investmentPortfolio}=await import('/assets/js/investment-ledger.js'),o=investmentPortfolio(state.settings).orders[0];
  await changeInvestmentPortfolio(state.user.uid,{...o,orderId:o.id,id:crypto.randomUUID(),kind:'order',limitPrice:1500,expectedVersion:investmentVersion(state.settings)});
 });
 await page.locator('#investmentForm [type=submit]').click();await expect(page.locator('#investmentForm [role=alert]')).toContainText('Posisi atau order berubah');
 await page.locator('.dialog-close').click();await page.getByRole('button',{name:'Edit order',exact:true}).click();await expect(page.locator('#investmentForm [name=limitPrice]')).toHaveValue('1500');
 await page.locator('#investmentForm [name=limitPrice]').fill('1600');await page.locator('#investmentForm [type=submit]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();await expect(page.locator('[data-investment-order]')).toContainText('1.600');
});

test('deferred stock settlement waits for confirmation and never purchases shares twice',async({page})=>{
 await page.evaluate(()=>location.hash='investments');await page.getByRole('button',{name:'Tambah order',exact:true}).click();const form=page.locator('#investmentForm');
 await form.locator('[name=symbol]').fill('WAIT');await form.locator('[name=name]').fill('Pending settlement');await form.locator('[name=quantity]').fill('100');await form.locator('[name=limitPrice]').fill('1000');await form.locator('[name=date]').fill('2026-10-20');await form.locator('[type=submit]').click();
 await page.getByRole('button',{name:'Catat matched',exact:true}).click();await form.locator('[name=date]').fill('2026-10-20');await form.locator('[name=settlementDate]').fill('2026-10-21');await form.locator('[name=fee]').fill('500');await form.locator('[name=cashAccountId]').selectOption('asset-mandiri');await form.locator('[type=submit]').click();
 await expect(page.locator('.investment-portfolio')).toContainText('Dana menunggu penyelesaian');
 await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js'),{openTransactionEditor}=await import('/assets/js/transaction-editor-ui.js');await openTransactionEditor(state.transactions.find(t=>t.type==='investment_buy').id);});
 await expect(page.locator('#transactionEditForm [name=sourceAccountId]')).toHaveValue('liability-stock-settlement');await page.locator('#cancelTransactionEdit').click();
 const before=await page.evaluate(async()=>{const {deriveLedger}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));return deriveLedger(d.transactions).accounts.find(a=>a.accountId==='asset-mandiri').balance;});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Konfirmasi dana terpotong',exact:true}).click();await form.locator('[name=date]').fill('2026-10-21');await form.locator('[type=submit]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Konfirmasi dana terpotong',exact:true})).toHaveCount(0);
 const after=await page.evaluate(async()=>{const {deriveLedger}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));return {balance:deriveLedger(d.transactions).accounts.find(a=>a.accountId==='asset-mandiri').balance,position:d.settings.profile.investmentPortfolio.positions[0]};});
 expect(before-after.balance).toBe(100500);expect(after.position.quantity).toBe(100);await expect(page.locator('[data-investment-events]')).toContainText('Tidak membeli saham lagi');
 await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js'),{openTransactionEditor}=await import('/assets/js/transaction-editor-ui.js');await openTransactionEditor(state.transactions.find(t=>t.type==='investment_settlement').id);});
 await expect(page.locator('#transactionEditForm [name=destinationAccountId]')).toHaveValue('liability-stock-settlement');
});

test.describe('scanner selection regression',()=>{
test.use({serviceWorkers:'block'});
test('opening import respects incoming transfer direction and skips same-account pocket movements',async({page})=>{
 const candidates=[{bank:'bca',type:'transfer',amount:20,signedAmount:20,sourceAccountId:'asset-mandiri',destinationAccountId:'asset-bca',internalMovement:true,merchant:'Incoming own transfer'},{bank:'bca',type:'expense',amount:5,signedAmount:-5,sourceAccountId:'asset-bca',merchant:'Purchase'},{bank:'krom',type:'transfer',amount:10,signedAmount:0,sourceAccountId:'asset-krom',destinationAccountId:'asset-krom',internalMovement:true,merchant:'Same-account pockets'}].map((t,i)=>({...t,date:'2026-10-02',sourceFile:'synthetic.pdf',sourceHash:'synthetic-hash',sourcePage:1,sourceRow:i+1,selected:!t.internalMovement}));
 const statement={fileName:'synthetic.pdf',bank:'bca',pageCount:1,nativePages:1,metadata:{periodStart:'2026-10-01',periodEnd:'2026-10-19',openingBalance:100,incomingTotal:20,outgoingTotal:5,closingBalance:115},reconciliation:{balanced:true}};
 await page.route('**/assets/js/scanner.js*',route=>route.fulfill({contentType:'text/javascript',body:`export async function scanStatementFiles(){return ${JSON.stringify({candidates,statements:[statement],excluded:[]})};}`}));
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.transactions=[];localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});await page.reload();await waitForDemo(page);
 await page.evaluate(()=>location.hash='scanner');await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(3);await expect(page.locator('[data-scan-index="2"] [data-scan-field=selected]')).toBeDisabled();
 await page.locator('#selectAllScanCandidates').click();await expect(page.locator('[data-scan-field=selected]:checked')).toHaveCount(2);
 await page.locator('#saveScanCandidates').click();await expect(page.locator('#scanMessage')).toContainText('2 transaksi disimpan');await expect(page.locator('#scanMessage')).toContainText('1 saldo awal');
 const ledger=await page.evaluate(async()=>{const {deriveLedger}=await import('/assets/js/accounting.js');return deriveLedger(JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions);});
 expect(ledger.accounts.find(a=>a.accountId==='asset-bca').balance).toBe(115);
});
});

test('an opening-only selection keeps a reachable Save action after removing movement candidates',async({page,context})=>{
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.transactions=[];localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});await page.reload();await waitForDemo(page);
 await page.evaluate(()=>location.hash='scanner');await page.locator('#scanInput').setInputFiles({name:'synthetic-empty-selection.pdf',mimeType:'application/pdf',buffer:await statementPdf(context)});await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(2);await page.locator('[data-remove-scan]').first().click();await page.locator('[data-remove-scan]').first().click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(0);await expect(page.locator('#saveScanCandidates')).toBeVisible();await page.locator('#saveScanCandidates').click();
 await expect(page.locator('#scanMessage')).toContainText('1 saldo awal');
});

test('PayLater editor permits a note correction without changing a linked bill',async({page})=>{
 await page.evaluate(async()=>{const {buildTransaction}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.transactions=[await buildTransaction({type:'credit_payment',date:'2026-10-10',amount:100,sourceAccountId:'asset-bca',destinationAccountId:'liability-mandiri-cc',merchant:'Linked payment',sourceMeta:{paylaterBillId:'synthetic-bill'}},d.settings.profile)];localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='transactions');
 await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('#transactionEditForm [name=amount]')).toBeDisabled();
 await page.locator('#transactionEditForm [name=description]').fill('Corrected note');await page.locator('#transactionEditForm [type=submit]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 await expect(page.locator('[data-history-row]')).toContainText('Corrected note');
});

test('statement import includes opening balance once and supports recovering a missing baseline',async({page,context})=>{
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.transactions=[];d.settings.profile.hideBalanceDefault=false;localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='scanner');
 const upload={name:'synthetic-opening.pdf',mimeType:'application/pdf',buffer:await statementPdf(context)};
 await page.locator('#scanInput').setInputFiles(upload);await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(2);
 await expect(page.locator('[data-scan-opening]')).toBeChecked();
 await page.locator('#selectAllScanCandidates').click();await page.locator('#saveScanCandidates').click();
 await expect(page.locator('#scanMessage')).toContainText('1 saldo awal disertakan');
 await page.evaluate(()=>location.hash='wallets');await expect(page.locator('[data-wallet-account=asset-bca]>strong')).toHaveText('Rp 879,75');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(3);
 await page.evaluate(()=>location.hash='scanner');await page.locator('#scanInput').setInputFiles(upload);await page.locator('#scanButton').click();
 await expect(page.locator('#statementSummaryContainer')).toContainText('Saldo awal BCA sudah tercatat');
 await expect(page.locator('[data-scan-field=selected]:disabled')).toHaveCount(2);
 // Older imports have only movements: re-scan can add the missing baseline without re-importing them.
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.transactions=d.transactions.filter(t=>t.type!=='opening_balance');localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='scanner');
 await page.locator('#scanInput').setInputFiles(upload);await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-field=selected]:disabled')).toHaveCount(2);await expect(page.locator('[data-scan-opening]')).toBeChecked();
 await page.locator('#saveScanCandidates').click();await expect(page.locator('#scanMessage')).toContainText('0 transaksi disimpan');await expect(page.locator('#scanMessage')).toContainText('1 saldo awal disertakan');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(3);
});

test('transaction editing replaces one record and shows opening cash without counting income',async({page})=>{
 await page.evaluate(async()=>{const {buildTransaction}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.settings.profile.hideBalanceDefault=false;d.transactions=[await buildTransaction({type:'opening_balance',date:'2026-10-01',amount:1000,sourceAccountId:'asset-bca'},d.settings.profile),await buildTransaction({type:'expense',date:'2026-10-02',amount:100,sourceAccountId:'asset-bca',merchant:'Correction example'},d.settings.profile)];localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='transactions');
 const row=page.locator('[data-history-row]').filter({hasText:'Correction example'});
 await row.getByRole('button',{name:'Edit',exact:true}).click();
 await page.locator('#transactionEditForm [name=amount]').fill('125.25');await page.locator('#transactionEditForm [type=submit]').click();
 await expect(page.locator('#spendlyDialog')).not.toBeVisible();await expect(row).toContainText('125,25');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(2);
 await page.locator('#transactionBookkeeping').check();
 await page.locator('[data-history-row]').filter({hasText:'Saldo Awal'}).getByRole('button',{name:'Edit',exact:true}).click();
 await page.locator('#transactionEditForm [name=amount]').fill('1500');await page.locator('#transactionEditForm [type=submit]').click();
 await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 await page.evaluate(()=>location.hash='dashboard');await expect(page.locator('#cashPositionCard')).toContainText('1.374,75');
 await expect(page.locator('#modernStats')).toContainText('Pemasukan bulan ini');
 await page.evaluate(()=>location.hash='wallets');await expect(page.locator('[data-wallet-account=asset-bca]>strong')).toHaveText('Rp 1.374,75');
});

test('phone scan can select collapsed new and review rows; unresolved matches cannot be saved',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(async()=>{const {buildTransaction}=await import('/assets/js/accounting.js'),d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.transactions=[await buildTransaction({type:'expense',date:'2026-10-13',amount:76543,sourceAccountId:'asset-bca',merchant:'Different receipt'},d.settings.profile)];localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});
 await page.reload();await waitForDemo(page);
 await localOcr(page,'BCA Mutasi rekening\n13/10/2026 Mobile scan -76.543,00\n14/10/2026 Pembelian kedua -20.000,00');
 await page.evaluate(()=>location.hash='scanner');await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 const row=page.locator('[data-scan-index="0"]');await expect(row).toContainText('Mobile scan');
 await page.locator('#clearAllScanCandidates').click();await row.locator('[data-scan-field=selected]').check();
 await expect(row).toHaveAttribute('data-scan-expanded','false');
 await page.locator('#selectAllScanCandidates').click();await expect(page.locator('[data-scan-field=selected]:checked')).toHaveCount(2);
 await page.locator('#saveScanCandidates').click();await expect(page.locator('#scanMessage')).toContainText('transaksi mirip');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.length)).toBe(1);
 await expect(row).toHaveAttribute('data-scan-expanded','true');await row.locator('[data-scan-field=importDecision]').selectOption('skip');
 await page.locator('#saveScanCandidates').click();await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
});

test('bank statement separates future installments from the current bill and protects amounts',async({page})=>{
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));d.settings.profile.hideBalanceDefault=false;d.settings.credit_card.issuerSnapshot={accountId:d.settings.credit_card.cardAccountId,asOfDate:'2026-10-19',dueDate:'2026-10-28',currentBillIncluded:true,runningTotal:500.25,currentBill:300,availableCredit:99.5,remainingInstallments:1000,installmentsIncludedInRunningTotal:false,statementDate:'2026-10-08',minimumPayment:20,installmentThisMonth:125,installments:[{name:'Purchase A',monthly:125,tenor:10,billedCount:2,remainingPrincipal:1000}]};localStorage.setItem('spendly:demo:v1',JSON.stringify(d));});
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='credit-card');
 await expect(page.locator('#ccUsed')).toHaveText('Rp 1.500,25');await expect(page.locator('#ccBilled')).toHaveText('Rp 300');await expect(page.locator('#ccMinimum')).toHaveText('Rp 20');
 await expect(page.locator('#ccInstallmentList')).toContainText('8 angsuran tersisa');await expect(page.locator('#ccCycleSummary')).toContainText('Sisa cicilan belum ditagihkan');await expect(page.locator('#ccCycleSummary')).toContainText('08 Oktober 2026');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.locator('#toggleBalanceButton').click();await expect(page.locator('#ccInstallmentList')).not.toContainText('1.000');await expect(page.locator('#ccUsed')).not.toContainText('1.500');
});

test('desktop sidebar collapses, remembers preference and keeps navigation usable on mobile',async({page})=>{
 const before=await page.locator('#mainContent').boundingBox();
 const toggle=page.getByRole('button',{name:'Ringkas sidebar',exact:true});await toggle.click();
 await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-expanded','false');
 await expect.poll(async()=>Math.round((await page.locator('#mainContent').boundingBox()).x)).toBeLessThan(Math.round(before.x)-80);
 await expect(page.locator('#sidebar .nav-link[data-page="wallets"]')).toHaveAccessibleName('Dompet');
 await page.locator('#sidebar .nav-link[data-page="wallets"]').click();await expect(page.locator('#page-wallets')).toBeVisible();
 await page.reload();await waitForDemo(page);await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-expanded','false');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('#sidebar')).not.toBeVisible();await expect(page.locator('#sidebarToggle')).not.toBeVisible();
 await page.locator('#bottomNav [data-page="transactions"]').click();await expect(page.locator('#page-transactions')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Buka sidebar',exact:true}).click();
 await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-expanded','true');await expect(page.locator('#sidebar .sidebar-brand h1')).toBeVisible();
});

test('subscription form chooses card accounts and confirms a credit charge without withdrawing bank money',async({page})=>{
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions);
 await page.evaluate(()=>location.hash='recurring');await page.locator('#recurringKind').selectOption('subscription');
 await page.locator('#recurringName').fill('Music membership');await page.locator('#recurringType').selectOption('credit_purchase');
 await expect(page.locator('#recurringSource option[value="asset-bca"]')).toHaveCount(0);
 await page.locator('#recurringSource').selectOption('liability-mandiri-cc');await page.locator('#recurringAmount').fill('30000');await page.locator('#recurringDay').fill('12');await page.locator('#recurringStart').fill('2026-10-01');
 await page.locator('#recurringSaveButton').click();await expect(page.locator('#recurringMessage')).toContainText('Jadwal disimpan');
 const card=page.locator('#recurringRuleList .recurring-rule').filter({hasText:'Music membership'});await expect(card).toContainText('Dibebankan ke Mandiri Credit Card');
 await page.locator('#postDueRecurringButton').click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions)).toEqual(before);
 await card.getByRole('button',{name:'Ubah',exact:true}).click();await expect(page.locator('#recurringSource')).toHaveValue('liability-mandiri-cc');await page.locator('#cancelRecurringEdit').click();
 await card.getByRole('button',{name:'Konfirmasi',exact:true}).click();await page.locator('#settleRecurringForm [name="existing"]').selectOption('new');await page.locator('#settleRecurringForm button[type="submit"]').click();await expect(page.locator('#spendlyDialog')).not.toBeVisible();
 const tx=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.find(t=>t.merchant==='Music membership'));
 expect(tx.type).toBe('credit_purchase');expect(tx.sourceAccountId).toBe('liability-mandiri-cc');expect(tx.journal.some(j=>j.accountType==='asset')).toBe(false);
 await page.locator('#recurringKind').selectOption('subscription');await page.locator('#recurringType').selectOption('expense');await expect(page.locator('#recurringSource option[value="liability-mandiri-cc"]')).toHaveCount(0);
});

test.describe('cached module upgrade',()=>{
test.use({serviceWorkers:'block'});
test('money story loads versioned account labels even when older unversioned modules are cached',async({page})=>{
 const requested=[];
 await page.route('**/assets/js/experience.js*',async route=>{
  const response=await route.fetch(),url=new URL(route.request().url());requested.push(url.search);
  const body=await response.text();
  await route.fulfill({response,body:url.search?body:body.replace('<span class="transaction-account">${e(view.accountLabel)}</span>','')});
 });
 await page.route('**/assets/js/transaction-filters.js*',async route=>{
  const response=await route.fetch(),url=new URL(route.request().url());requested.push(url.search);
  const body=await response.text();await route.fulfill({response,body:url.search?body:body.replace('accountLabel,pending','pending')});
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='dashboard');
 const rows=page.locator('#recentTransactions .transaction-row');expect(await rows.count()).toBeGreaterThan(0);
 for(const row of await rows.all()){await expect(row.locator('.transaction-account')).toContainText(/Masuk ke|Keluar dari|Dibebankan ke|→/);await expect(row).not.toContainText('undefined');}
 expect(requested.length).toBeGreaterThanOrEqual(2);expect(requested.every(Boolean)).toBe(true);
});
});

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
 await expect(page.locator('#recentTransactions [data-history-transaction="late"] .transaction-account')).toHaveText('Masuk ke BCA');
 await expect(page.locator('#recentTransactions [data-history-transaction="old"] .transaction-account')).toHaveText('Keluar dari BCA');
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
test('loan schedule and pending investments show evidence without making extra transactions',async({page})=>{
 await page.evaluate(async()=>{
  const d=JSON.parse(localStorage.getItem('spendly:demo:v1'));
  d.settings.profile.loanPlans=[{id:'loan-demo',accountId:'loan-demo',name:'Pinjaman uji',date:'2026-10-21',principal:1000000,disbursementFee:10000,installmentFee:60000,bills:[{id:'loan-a',dueDate:'2026-11-21',amount:530000},{id:'loan-b',dueDate:'2026-12-21',amount:530000}]}];
  d.settings.profile.investmentEvidence={holdings:[{symbol:'TEST',name:'Saham contoh',asOfDate:'2026-10-21',value:123000,unrealizedChange:-1000}],orders:[{symbol:'WAIT',quantityLots:2,limitPrice:1000,total:200000,status:'pending',asOfDate:'2026-10-21'}]};
  localStorage.setItem('spendly:demo:v1',JSON.stringify(d));
 });
 await page.reload();await waitForDemo(page);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions);
 await page.evaluate(()=>location.hash='credit-card');await page.locator('[data-credit-view=loans]').click();
 await expect(page.locator('[data-loan-bill]')).toHaveCount(2);await expect(page.locator('#loanView')).toContainText('1.060.000');await expect(page.locator('#creditBankView')).toBeHidden();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.evaluate(()=>location.hash='investments');await expect(page.locator('[data-investment-order]')).toContainText('Menunggu matched');
 await page.locator('#toggleBalanceButton').click();await expect(page.locator('#investmentView')).not.toContainText('200.000');
 await page.evaluate(()=>location.hash='credit-card');await expect(page.locator('#loanView')).not.toContainText('1.060.000');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions)).toEqual(before);
});
test('recorded repayment settles the official card bill despite an older issuer snapshot',async({page})=>{
 await page.evaluate(async()=>{
  const d=JSON.parse(localStorage.getItem('spendly:demo:v1')),{buildTransaction}=await import('/assets/js/accounting.js');
  d.settings.credit_card.officialStatementDate='2026-10-07';d.settings.credit_card.officialStatementAmount=300;
  d.settings.credit_card.issuerSnapshot={accountId:'liability-mandiri-cc',asOfDate:'2026-10-19',statementDate:'2026-10-07',runningTotal:500,currentBill:300,availableCredit:100,dueDate:'2026-10-27',currentBillIncluded:true,minimumPayment:30};
  d.transactions.push(await buildTransaction({type:'credit_payment',date:'2026-10-21',amount:300,sourceAccountId:'asset-mandiri',destinationAccountId:'liability-mandiri-cc'},d.settings.profile));
  localStorage.setItem('spendly:demo:v1',JSON.stringify(d));
 });
 await page.reload();await waitForDemo(page);await page.evaluate(()=>location.hash='credit-card');
 await expect(page.locator('#ccBilled')).toHaveText('Rp 0');await expect(page.locator('#ccMinimum')).toHaveText('Rp 0');
 await expect(page.locator('#ccAvailable')).toHaveText('Rp 100');
});

test('card scan posts only to credit liability after review and detects repeated images',async({page})=>{
 const text='Transaksi e-Billing\n09 Sep - 08 Okt Belum Tertagih\n14 Okt 2026\nToko Uji Rp 123.456,78\nKOTA ID';
 await localOcr(page,text);
 const before=await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js');const {balanceSheet}=await import('/assets/js/accounting.js');return {count:state.transactions.length,...balanceSheet(state.transactions)};});
 await page.evaluate(()=>location.hash='scanner');await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 const row=page.locator('[data-scan-index]');await expect(row).toHaveCount(1);
 await expect(row.locator('[data-scan-field=type]')).toHaveValue('credit_purchase');
 await expect(row.locator('[data-scan-field=sourceAccountId]')).toHaveValue('liability-mandiri-cc');
 await expect(row.locator('[data-scan-field=selected]')).not.toBeChecked();
 await expect(row.locator('[data-scan-field=sourceAccountId] option[value=asset-mandiri]')).toHaveCount(0);
 for(const width of [390,320,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await row.locator('[data-scan-field=selected]').check();await page.locator('#saveScanCandidates').click();
 await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
 const after=await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js');const {balanceSheet}=await import('/assets/js/accounting.js');return {count:state.transactions.length,...balanceSheet(state.transactions)};});
 expect(after.count).toBe(before.count+1);expect(after.assets).toBe(before.assets);expect(after.liabilities).toBeCloseTo(before.liabilities+123456.78,2);
 await page.locator('#scanButton').click();await expect(row.locator('[data-scan-field=selected]')).toBeDisabled();
});

test('card scan with several Mandiri cards requires an explicit card choice',async({page})=>{
 await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js');state.settings.accounts.push({id:'card-second',name:'Mandiri kedua',type:'liability',subtype:'credit_card',active:true});});
 await localOcr(page,'Transaksi e-Billing\nBelum Tertagih\n14 Okt 2026\nToko Uji Rp 31.500,00');
 await page.evaluate(()=>location.hash='scanner');await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(1);await expect(page.locator('[data-scan-field=sourceAccountId]')).toHaveValue('');
 await page.locator('[data-scan-field=selected]').check();await page.locator('#saveScanCandidates').click();
 await expect(page.locator('#scanMessage')).toHaveClass(/error/);
 await page.locator('[data-scan-field=sourceAccountId]').selectOption('card-second');await expect(page.locator('[data-scan-field=selected]')).not.toBeChecked();
});
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
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.filter(tx=>tx.sourceMeta?.fileName==='synthetic-blu.pdf'&&tx.type!=='opening_balance'));
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
 await row.getByRole('button',{name:'Hapus',exact:true}).click();
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
  await expect.poll(()=>page.evaluate(()=>{const stats=document.querySelector('.credit-stats').getBoundingClientRect(),grid=document.querySelector('.credit-grid').getBoundingClientRect();return grid.y-stats.bottom;})).toBeGreaterThanOrEqual(23);
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
 await expect(page.locator('[data-scan-field="selected"]')).toBeEnabled();
 await page.locator('[data-scan-field="selected"]').check();await page.locator('#saveScanCandidates').click();await expect(page.locator('#scanMessage')).toContainText('transaksi mirip');
 if(width===390){
  await expect(page.locator('.scan-mobile-summary')).toContainText('Mirip');
  await expect(page.locator('[data-scan-index="0"]')).toHaveAttribute('data-scan-expanded','true');
 }
 await page.locator('[data-scan-field="importDecision"]').selectOption('skip');
 await expect(page.locator('[data-scan-field="selected"]')).not.toBeChecked();
 await page.locator('[data-scan-field="importDecision"]').selectOption('new');
 await expect(page.locator('[data-scan-field="selected"]')).toBeChecked();
 await page.locator('[data-scan-field="amount"]').fill('87655');await page.locator('[data-scan-field="amount"]').blur();
 await page.locator('[data-scan-field="amount"]').fill('87654');await page.locator('[data-scan-field="amount"]').blur();
 await expect(page.locator('[data-scan-field="selected"]')).toBeEnabled();
 await expect(page.locator('[data-scan-field="importDecision"]')).toHaveValue('');
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
test('salary setup previews Friday payday, persists policy, and leaves balances unchanged',async({page})=>{
 // Keep this pre-payday scenario deterministic when the real calendar reaches payday.
 await page.clock.setFixedTime(new Date('2026-10-21T12:00:00+07:00'));await page.reload();await waitForDemo(page);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions);
 await page.evaluate(()=>location.hash='recurring');await page.locator('#salarySetupButton').click();
 await expect(page.locator('#recurringDay')).toHaveValue('25');
 await expect(page.locator('#recurringWeekendPolicy')).toHaveValue('previous_weekday');
 await expect(page.locator('#recurringSchedulePreview')).toContainText('Jumat, 23 Oktober 2026');
 await expect(page.locator('#recurringSchedulePreview')).toContainText('25 Oktober');
 await page.locator('#recurringAmount').fill('7654321');await page.locator('#recurringSource').selectOption('asset-bca');
 await page.locator('#recurringSaveButton').click();await expect(page.locator('#recurringMessage')).toContainText('Jadwal disimpan');
 const card=page.locator('#recurringRuleList .recurring-rule').filter({hasText:'Gaji bulanan'});
 await expect(card).toContainText('Jumat, 23 Oktober 2026');
 await expect(page.locator('#dueRecurringList')).not.toContainText('Gaji bulanan');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#syncStatus')?.textContent.includes('Mode demo'));
 await page.evaluate(()=>location.hash='recurring');await card.getByRole('button',{name:'Ubah',exact:true}).click();
 await expect(page.locator('#recurringWeekendPolicy')).toHaveValue('previous_weekday');
 await page.locator('#recurringWeekendPolicy').selectOption('none');
 await expect(page.locator('#recurringSchedulePreview')).toContainText('Minggu, 25 Oktober 2026');
 await page.locator('#recurringSaveButton').click();await expect(card).toContainText('Minggu, 25 Oktober 2026');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')));
 expect(data.recurring.find(r=>r.name==='Gaji bulanan').weekendPolicy).toBe('none');expect(data.transactions).toEqual(before);
 await page.locator('#recurringKind').selectOption('standard');await expect(page.locator('#recurringWeekendPolicy')).not.toBeVisible();
});
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

test('Shopee paid order routes to its wallet or PayLater and leaves external bank payments unmapped',async({page})=>{
 const prefix='Shopee\nRincian Pesanan\nPesanan Selesai\nWaktu Pembayaran 21 Okt 2026 10:11\nTotal Pembayaran Rp45.000\nMetode Pembayaran ';
 await page.evaluate(async()=>{const {state}=await import('/assets/js/state.js');state.settings.accounts.push({id:'shopee-wallet-test',name:'ShopeePay',type:'asset',subtype:'ewallet',active:true},{id:'spay-test',name:'SPayLater',type:'liability',subtype:'paylater',active:true});});
 await page.evaluate(()=>location.hash='scanner');
 for(const [method,type,account] of [['ShopeePay','expense','shopee-wallet-test'],['SPayLater','credit_purchase','spay-test'],['Transfer Bank BCA','expense','']]){
  await localOcr(page,prefix+method);await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
  const row=page.locator('[data-scan-index]');await expect(row).toHaveCount(1);await expect(row.locator('[data-scan-field=sourceAccountId]')).toHaveValue(account);await expect(row.locator('[data-scan-field=type]')).toHaveValue(type);await expect(row.locator('[data-scan-field=selected]')).not.toBeChecked();
 }
});
test('Shopee loan evidence is readable on phones but never enters transaction selection',async({page})=>{
 const text='Rincian Pinjaman\nRp1.000.000\nTotal pinjaman\nWaktu Pengajuan 21 Okt 2026 10:11\nDurasi Pinjaman 2 bulan\nBiaya Pencairan Rp10.000\nBiaya Cicilan Rp60.000\nRincian Pembayaran Bulanan\n1/2, Rp530.000\nJatuh Tempo:21 Nov 2026 Belum Dibayar\n2/2, Rp530.000\nJatuh Tempo:21 Des 2026 Belum Dibayar';
 await localOcr(page,text);const before=await page.evaluate(()=>localStorage.getItem('spendly:demo:v1'));
 await page.evaluate(()=>location.hash='scanner');await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-evidence]')).toContainText('1.000.000');await expect(page.locator('[data-scan-evidence]')).toContainText('530.000');await expect(page.locator('[data-scan-index]')).toHaveCount(0);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 expect(await page.evaluate(()=>localStorage.getItem('spendly:demo:v1'))).toBe(before);
});
