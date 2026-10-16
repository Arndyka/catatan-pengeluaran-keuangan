import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const BASE='http://127.0.0.1:4173';
const waitForDemo=page=>expect(page.locator('#syncStatus')).toHaveText(/Mode demo.*lokal/,{timeout:15000});

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
 await page.route('http://127.0.0.1:9999/api/nvidia/read-page',route=>route.fulfill({json:{result:{bank:'bca',transactions:[
  {record_kind:'transaction',status:'posted',date:'2026-10-13',amount:76543,direction:'outgoing',description:'Pembelian contoh',merchant:'Mobile scan',reference:'MOBILE001',confidence:0.95},
  {record_kind:'transaction',status:'posted',date:'2026-10-14',amount:20000,direction:'internal_transfer',description:'Transfer ke tabungan',merchant:'Tabungan sendiri',reference:'MOBILE002',confidence:0.9}
 ]}}}));
 await page.evaluate(()=>location.hash='scanner');await page.locator('.ai-options summary').click();
 await page.locator('#nvidiaBackendUrlInput').fill('http://127.0.0.1:9999');await page.locator('#visionConsent').check();
 await page.locator('#scanMode').selectOption('ai');await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
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
 await page.setViewportSize({width:390,height:844});await row.locator('[data-scan-field="selected"]').check();
 await page.locator('#saveScanCandidates').click();await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')).transactions.filter(tx=>tx.merchant==='Mobile edit'));
 expect(saved).toHaveLength(1);expect(saved[0].amount).toBe(54321);
});

test('populated scan summaries and sticky review columns stay readable in both themes',async({page,context})=>{
 test.setTimeout(120000);
 await page.route('http://127.0.0.1:9999/api/nvidia/read-page',route=>route.fulfill({json:{result:{bank:'mandiri',transactions:[
  {record_kind:'transaction',status:'posted',date:'2026-10-01',amount:15000,direction:'incoming',description:'Transfer masuk contoh',merchant:'Pengirim contoh',reference:'THEME001',confidence:0.99},
  {record_kind:'transaction',status:'posted',date:'2026-10-02',amount:6000,direction:'internal_transfer',description:'Transfer tabungan contoh',merchant:'Tabungan sendiri',reference:'THEME002',confidence:0.9}
 ]}}}));
 await page.evaluate(()=>location.hash='scanner');
 const fixture=await context.newPage();await fixture.setContent('<h1>Statement layout test</h1>');const pdf=await fixture.pdf();await fixture.close();
 await page.locator('#scanInput').setInputFiles({name:'contoh-e-statement.pdf',mimeType:'application/pdf',buffer:pdf});
 await page.locator('.ai-options summary').click();await page.locator('#nvidiaBackendUrlInput').fill('http://127.0.0.1:9999');
 await page.locator('#visionConsent').check();await page.locator('#scanMode').selectOption('ai');await page.locator('#scanButton').click();
 await expect(page.locator('.statement-summary-header h3')).toHaveText('contoh-e-statement.pdf');
 await expect(page.locator('.internal-movement-row')).toHaveCount(1);
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
test.beforeEach(async({page})=>{await page.goto(`${BASE}/?demo=1`,{waitUntil:'domcontentloaded'});await expect(page.locator('#dailyAmount')).not.toHaveText('—');});
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

test('AI image and PDF import require consent, save once, and match across formats',async({page,context})=>{
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 let calls=0;
 await page.route('http://127.0.0.1:9999/api/nvidia/read-page',async route=>{
  calls++;const data=route.request().postDataJSON();expect(data.image_data_url).toMatch(/^data:image\/jpeg;base64,/);
  await route.fulfill({json:{result:{bank:'bca',transactions:[{record_kind:'transaction',status:'completed',date:'2026-10-15',time:'12:30:11',amount:76543,direction:'outgoing',description:'Test scan receipt',merchant:'QA Scan',reference:'TESTREF123456',confidence:0.9}]}}});
 });
 await page.evaluate(()=>location.hash='scanner');
 await page.locator('#scanInput').setInputFiles('assets/icon-192.png');
 await page.locator('#scanMode').selectOption('ai');
 await page.locator('#scanButton').click();
 await expect(page.locator('#scanMessage')).toContainText('setujui');expect(calls).toBe(0);
 await page.locator('.ai-options summary').click();
 await page.locator('#nvidiaBackendUrlInput').fill('http://127.0.0.1:9999');
 await page.locator('#visionConsent').check();
 await page.locator('#scanButton').click();
 await expect(page.locator('#scanReviewContainer')).toContainText('Transaksi baru');
 await page.locator('[data-scan-field="selected"]').check();
 await page.locator('#saveScanCandidates').click();
 await expect(page.locator('#scanMessage')).toContainText('1 transaksi disimpan');
 const fixture=await context.newPage();await fixture.setContent('<h1>Sample bank statement for automated testing</h1>');
 const pdf=await fixture.pdf();await fixture.close();
 await page.locator('#scanInput').setInputFiles({name:'test-statement.pdf',mimeType:'application/pdf',buffer:pdf});
 await page.locator('#scanButton').click();
 await expect(page.locator('#scanReviewContainer')).toContainText('Duplikat · dilewati');
 await expect(page.locator('[data-scan-field="selected"]')).toBeDisabled();
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('spendly:demo:v1')));
 expect(data.transactions.filter(tx=>tx.merchant==='QA Scan')).toHaveLength(1);
 expect(data.transactions.find(tx=>tx.merchant==='QA Scan').sourceAccountId).toBe('asset-bca');
 expect(calls).toBe(2);
 expect(errors).toEqual([]);
});

for(const width of [1440,390]) test(`ambiguous imports require an explicit decision and distinct payments are preserved at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:950});
 await page.route('http://127.0.0.1:9999/api/nvidia/read-page',route=>route.fulfill({json:{result:{bank:'krom',transactions:[{record_kind:'transaction',status:'completed',date:'2026-10-15',amount:87654,direction:'outgoing',description:'Repeated payment',merchant:'QA Similar',confidence:0.8}]}}}));
 await page.evaluate(()=>location.hash='scanner');
 await page.locator('.ai-options summary').click();await page.locator('#nvidiaBackendUrlInput').fill('http://127.0.0.1:9999');
 await page.locator('#visionConsent').check();await page.locator('#scanMode').selectOption('ai');
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

test('manual typo and AI suggestions need acceptance and stale AI replies cannot replace edited input',async({page})=>{
 await page.evaluate(()=>location.hash='transactions');await page.locator('#transactionMerchant').fill('Alfamrt');
 await page.locator('#checkManualButton').click();await expect(page.locator('#manualSuggestions')).toContainText('Alfamart');
 await expect(page.locator('#transactionMerchant')).toHaveValue('Alfamrt');
 await page.locator('#manualSuggestions').getByRole('button',{name:'Terapkan saran'}).first().click();
 await expect(page.locator('#transactionMerchant')).toHaveValue('Alfamart');
 await page.evaluate(()=>location.hash='scanner');await page.locator('.ai-options summary').click();await page.locator('#nvidiaBackendUrlInput').fill('http://127.0.0.1:9999');
 await page.evaluate(()=>location.hash='transactions');await page.locator('.manual-review summary').click();await page.locator('#manualAiConsent').check();
 let release,requested;const seen=new Promise(resolve=>requested=resolve);
 await page.route('http://127.0.0.1:9999/api/nvidia/normalize-statement',async route=>{requested();await new Promise(resolve=>release=resolve);await route.fulfill({json:{updates:[{index:0,merchant:'Usulan AI',amount:1,date:'2000-01-01',reason:'Perbaiki penulisan'}]}});});
 await page.locator('#manualAiButton').click();await seen;
 await page.locator('#transactionMerchant').fill('Input yang lebih baru');release();
 await expect(page.locator('#manualReviewMessage')).toContainText('Input berubah');
 await expect(page.locator('#transactionMerchant')).toHaveValue('Input yang lebih baru');
});

test('nontransaction AI rows are excluded and scan edits stay suggestions until accepted',async({page})=>{
 await page.route('http://127.0.0.1:9999/api/nvidia/read-page',route=>route.fulfill({json:{result:{bank:'bca',transactions:[
  {record_kind:'transaction',status:'completed',date:'2026-10-15',amount:55555,direction:'outgoing',merchant:'Alfamrt',description:'Pembayaran belanja'},
  {record_kind:'summary',status:'completed',date:'2026-10-15',amount:999999,direction:'incoming',description:'Saldo akhir'},
  {record_kind:'transaction',status:'pending',date:'2026-10-15',amount:12345,direction:'outgoing',description:'Belum dibayar'}
 ]}}}));
 await page.route('http://127.0.0.1:9999/api/nvidia/normalize-statement',route=>route.fulfill({json:{updates:[{index:0,description:'Belanja kebutuhan',category:'Kebutuhan Rumah',reason:'Rapikan keterangan',amount:1}]}}));
 await page.evaluate(()=>location.hash='scanner');await page.locator('.ai-options summary').click();
 await page.locator('#nvidiaBackendUrlInput').fill('http://127.0.0.1:9999');await page.locator('#visionConsent').check();await page.locator('#nvidiaAiConsent').check();
 await page.locator('#scanMode').selectOption('ai');await page.locator('#scanInput').setInputFiles('assets/icon-192.png');await page.locator('#scanButton').click();
 await expect(page.locator('[data-scan-index]')).toHaveCount(1);await expect(page.locator('#scanExcludedContainer')).toContainText('2 baris');
 await page.locator('#optimizeWithNvidiaButton').click();await expect(page.locator('#scanMessage')).toContainText('saran AI tersedia');
 await expect(page.locator('[data-scan-field="description"]')).toHaveValue('Pembayaran belanja');
 await page.locator('.suggestion-card').filter({hasText:'Belanja kebutuhan'}).getByRole('button',{name:'Terapkan saran'}).click();
 await expect(page.locator('[data-scan-field="description"]')).toHaveValue('Belanja kebutuhan');
 await page.locator('.suggestion-card').filter({hasText:'Kebutuhan Rumah'}).getByRole('button',{name:'Terapkan saran'}).click();
 await expect(page.locator('[data-scan-field="category"]')).toHaveValue('Kebutuhan Rumah');
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
