import {renderRecurringUI} from './recurring-ui.js';
import {setupManualSuggestions,suggestionsFor,suggestionsHtml,transactionSignature,remainingAiSuggestions} from './suggestions-ui.js';
import {stageAiSuggestions,suggestionKey,scanExclusionReason,manualRecurringMatches} from './transaction-quality.js';
import { setupExperience, loadExperience, resetExperience, renderExperience, onPageChange, refreshBudgetPreview } from './experience.js';
import { isDemo } from './demo.js';
import {matchImport,reconcileImports,importIdentity} from './import-reconciliation.js';
import { $, cleanText, downloadText, escapeHtml, formatDateId, formatDateLocal, formatRupiah, hideNotice, monthKey, parseLocalDate, setNotice, slugText } from "./utils.js";
import { setupAuth, observeAuth, logout } from "./auth.js";
import { state, resetState } from "./state.js";
import { DEFAULT_CREDIT_SETTINGS, DEFAULT_SETTINGS, balanceSheet, buildTransaction, deriveLedger, incomeStatement,validateJournal } from "./accounting.js";
import { loadUserSettings, saveCreditSettings, saveProfileSettings, addAccount, toggleAccountActive, accountOptions } from "./settings.js";
import { listenTransactions, deleteTransaction, deleteAllTransactions, listenRecurringRules, getBudgetPlan, saveBudgetPlan, migrateLegacyCollections } from "./repository.js";
import { saveTransaction, transactionTypeLabel } from "./transactions.js";
import { budgetAnalysis,validateBudgetItem } from "./budget.js";
import { creditCardSnapshot } from "./credit-card.js";
import { buildMonthlyReport } from "./reports.js";
import { scanStatementFiles } from "./scanner.js?v=statements-20261016";
import {
  checkNvidiaBackend,
  readPageWithNvidia,
  optimizeCandidatesWithNvidia
} from "./nvidia-ai.js?v=bca-ai-20261016";

const authScreen = $("authScreen");
const appShell = $("appShell");
const userEmail = $("userEmail");
const syncStatus = $("syncStatus");
const pageEyebrow = $("pageEyebrow");
const pageTitle = $("pageTitle");

const PAGE_META = {
  dashboard: ["Overview", "Ringkasan"],
  wallets: ["Accounts", "Dompet"],
  goals: ["Planning", "Goals"],
  investments: ["Growth", "Investasi"],
  transactions: ["Journal", "Transaksi"],
  recurring: ["Automation", "Transaksi Berulang"],
  "credit-card": ["Liability", "Kartu Kredit"],
  budget: ["Planning", "Budget"],
  reports: ["Accounting Reports", "Laporan Bulanan"],
  scanner: ["OCR / PDF", "Review Transaksi"],
  settings: ["Configuration", "Pengaturan"]
};

function transferRuleKey(candidate) {
  const stableDescription =
    cleanText(
      candidate.counterpartyRaw ||
      candidate.description ||
      candidate.merchant ||
      ""
    )
      .toLowerCase()
      .replace(/\b\d{6,}\b/g, "#")
      .replace(/\s+/g, " ");

  return slugText(
    [
      candidate.bank || "generic",
      candidate.signedAmount >= 0
        ? "incoming"
        : "outgoing",
      stableDescription
    ].join("|")
  );
}

function money(value) {
  return state.hideBalances ? "Rp ••••••" : formatRupiah(value);
}

function accountName(id) {
  return state.settings?.accounts?.find((account) => account.id === id)?.name || id || "-";
}

function accountOptionsHtml(selected = "", filter = {}) {
  const options = accountOptions(state.settings, filter);

  return [
    `<option value="">Pilih akun</option>`,
    ...options.map((account) => `
      <option value="${account.id}" ${account.id === selected ? "selected" : ""}>
        ${escapeHtml(account.name)} · ${account.type}
      </option>
    `)
  ].join("");
}

function setPage(page, { replace = false } = {}) {
  const activePage = PAGE_META[page] ? page : "dashboard";

  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === activePage);
  });

  document.querySelectorAll(".page-section").forEach((section) => {
    section.classList.add("hidden");
  });

  $(`page-${activePage}`).classList.remove("hidden");
  pageEyebrow.textContent = PAGE_META[activePage][0];
  pageTitle.textContent = PAGE_META[activePage][1];
  if (window.location.hash !== `#${activePage}`) {
    history[replace ? "replaceState" : "pushState"](null, "", `#${activePage}`);
  }
  onPageChange(activePage);
  window.scrollTo({ top: 0, behavior: "smooth" });

  renderAll();
}

function renderAll() {
  if (!state.user || !state.settings) return;

  renderAccountSelects();
  renderDashboard();
  renderTransactions();
  renderRecurring();
  renderCreditCard();
  renderBudget();
  renderReports();
  renderSettings();
  renderExperience();
}

function renderAccountSelects() {
  const allSelectIds = [
    "sourceAccount",
    "destinationAccount",
    "recurringSource",
    "recurringDestination"
  ];

  allSelectIds.forEach((id) => {
    const element = $(id);
    if (!element || element.form?.contains(document.activeElement)) return;
    const previous = element.value;
    element.innerHTML = accountOptionsHtml(previous,id==='sourceAccount'?($('transactionType').value==='credit_purchase'?{includeAssets:false,includeLiabilities:true,subtype:'credit_card'}:{includeAssets:true,includeLiabilities:false}):{});
  });

  const cardAccountId = state.creditSettings.cardAccountId;

  if (!$("sourceAccount").value) {
    $("sourceAccount").value =
      state.settings.accounts.find((account) => account.type === "asset")?.id || "";
  }

  if (!$("destinationAccount").value) {
    $("destinationAccount").value = cardAccountId;
  }
}

function renderDashboard() {
  const balance = balanceSheet(state.transactions);
  const statement = incomeStatement(state.transactions, monthKey());

  $("dashboardAssets").textContent = money(balance.assets);
  $("dashboardLiabilities").textContent = money(balance.liabilities);
  $("dashboardEquity").textContent = money(balance.equity);
  $("dashboardNetIncome").textContent = money(statement.netIncome);

  $("equationAssets").textContent = money(balance.assets);
  $("equationLiabilities").textContent = money(balance.liabilities);
  $("equationEquity").textContent = money(balance.equity);

  $("accountingEquationStatus").textContent =
    balance.balanced ? "Seimbang" : "Tidak Seimbang";

  $("accountingEquationStatus").className =
    `pill ${balance.balanced ? "" : "warning"}`;

  const ledger = deriveLedger(state.transactions);
  const accountRows = ledger.accounts
    .filter((account) => ["asset", "liability"].includes(account.accountType))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  $("accountBalanceGrid").innerHTML = accountRows.length
    ? accountRows.map((account) => `
        <article class="account-card">
          <h3>${escapeHtml(account.accountName)}</h3>
          <div class="amount">${money(account.balance)}</div>
          <div class="meta">${escapeHtml(account.accountType)} · ${escapeHtml(account.accountSubtype || "-")}</div>
        </article>
      `).join("")
    : `<div class="empty-state">Belum ada saldo akun.</div>`;

  $("monthSummary").innerHTML = [
    ["Pendapatan", statement.income],
    ["Beban", statement.expenses],
    ["Surplus/Defisit", statement.netIncome],
    ["Jumlah Transaksi", state.transactions.filter((tx) => tx.date?.startsWith(monthKey())).length]
  ].map(([label, value], index) => `
      <div class="summary-row">
        <span>${label}</span>
        <strong>${index === 3 ? value : money(value)}</strong>
      </div>
    `).join("");
}

function updateTransactionFormMode() {
  const type = $("transactionType").value;
  const destinationWrap = $("destinationAccountWrap");
  const installmentWrap = $("installmentWrap");

  destinationWrap.classList.toggle(
    "hidden",
    !["transfer", "credit_payment", "investment"].includes(type)
  );

  installmentWrap.classList.toggle("hidden", type !== "credit_purchase");

  $("sourceAccountLabel").textContent =
    type === "income"
      ? "Akun Penerima"
      : type === "credit_purchase"
        ? "Kartu Kredit"
        : "Akun Sumber";

  $("destinationAccountLabel").textContent =
    type === "credit_payment"
      ? "Kartu Kredit"
      : type === "investment"
        ? "Akun Investasi"
        : "Akun Tujuan";

  if (type === "credit_purchase") {
    $("sourceAccount").innerHTML = accountOptionsHtml(
      state.creditSettings.cardAccountId,
      { includeAssets: false, includeLiabilities: true, subtype: "credit_card" }
    );
    $("sourceAccount").value = state.creditSettings.cardAccountId;
  } else {
    $("sourceAccount").innerHTML = accountOptionsHtml(
      $("sourceAccount").value,{includeAssets:true,includeLiabilities:false}
    );
  }

  if (type === "credit_payment") {
    $("destinationAccount").innerHTML = accountOptionsHtml(
      state.creditSettings.cardAccountId,
      { includeAssets: false, includeLiabilities: true, subtype: "credit_card" }
    );
    $("destinationAccount").value = state.creditSettings.cardAccountId;
  }

  if (type === "investment") {
    const investmentAccount = state.settings.accounts.find(
      (account) => account.subtype === "investment"
    );
    $("destinationAccount").value = investmentAccount?.id || "";
  }
}

function filteredTransactions() {
  const filter = $("transactionFilter").value;
  const search = cleanText($("transactionSearch").value).toLowerCase();

  return state.transactions.filter((tx) => {
    const typeMatch = filter === "all" || tx.type === filter;
    const haystack = [
      tx.date,
      tx.category,
      tx.merchant,
      tx.description,
      accountName(tx.sourceAccountId),
      accountName(tx.destinationAccountId)
    ].join(" ").toLowerCase();

    return typeMatch && (!search || haystack.includes(search));
  });
}

function renderTransactions() {
  const rows = filteredTransactions();

  $("transactionTableContainer").innerHTML = rows.length
    ? `
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Tipe</th>
            <th>Sumber</th>
            <th>Tujuan</th>
            <th>Kategori</th>
            <th>Nominal</th>
            <th>Keterangan</th>
            <th>Jurnal</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((tx) => `
            <tr>
              <td>${escapeHtml(tx.date)}</td>
              <td><span class="badge ${tx.type}">${escapeHtml(transactionTypeLabel(tx.type))}</span></td>
              <td>${escapeHtml(accountName(tx.sourceAccountId))}</td>
              <td>${escapeHtml(accountName(tx.destinationAccountId))}</td>
              <td>${escapeHtml(tx.category)}</td>
              <td>${money(tx.amount)}</td>
              <td>${escapeHtml(tx.description || tx.merchant || "-")}</td>
              <td>${validateJournal(tx.journal||[]).valid ? "Seimbang" : "Periksa"}${tx.date>formatDateLocal()?'<br><small>Belum masuk saldo aktual</small>':''}</td>
              <td>
                <button class="small-btn danger" data-delete-transaction="${tx.id}" type="button">Hapus</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : `<div class="empty-state">Belum ada transaksi.</div>`;
}

function renderRecurring(){renderRecurringUI();}

function renderCreditCard() {
  const snapshot = creditCardSnapshot(
    state.transactions,
    state.creditSettings
  );

  $("ccLimit").textContent = money(snapshot.limit);
  $("ccUsed").textContent = money(snapshot.used);
  $("ccAvailable").textContent = money(snapshot.available);
  $("ccBilled").textContent = money(snapshot.billed);
  $("ccUnbilled").textContent = money(snapshot.unbilled);
  $("ccInstallment").textContent = money(snapshot.installmentThisMonth);
  $("ccMinimum").textContent = money(snapshot.minimumPayment);
  $("ccDueDate").textContent = formatDateId(snapshot.cycle.dueDate);

  $("ccCycleSummary").innerHTML = [
    ["Tanggal Cetak Terakhir", formatDateId(snapshot.cycle.lastStatement)],
    ["Tanggal Cetak Berikutnya", formatDateId(snapshot.cycle.nextStatement)],
    ["Tanggal Pengingat", formatDateId(snapshot.cycle.reminderDate)],
    ["Pembayaran/kredit setelah cetak", money(snapshot.paymentsAfterStatement)],
    ["Kelebihan pembayaran", money(snapshot.creditBalance)]
  ].map(([label, value]) => `
      <div class="summary-row">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");

  $("ccInstallmentList").innerHTML = snapshot.activeInstallments.length
    ? snapshot.activeInstallments.map((item) => `
        <article class="list-card">
          <div>
            <strong>${escapeHtml(item.description || item.merchant || item.category)}</strong>
            <p>${item.remainingSchedules} bulan tersisa · ${money(item.monthly)}/bulan</p>
          </div>
          <span>${money(item.remainingPrincipal)}</span>
        </article>
      `).join("")
    : `<div class="empty-state">Belum ada cicilan aktif.</div>`;

  $("creditReconcileSummary").innerHTML = `
    <p class="helper-note">${snapshot.officialStatementApplied?'Menggunakan tagihan resmi untuk siklus ini.':snapshot.officialStatementStale?'Data tagihan resmi berasal dari siklus lain atau tanggal belum sesuai. Estimasi jurnal digunakan; perbarui tanggal cetak/jadwal kartu.':'Menggunakan estimasi jurnal. Cocokkan dengan e-Billing bank.'} Bunga, biaya, dan denda hanya masuk jika dicatat sebagai transaksi aktual.</p>
    <div class="summary-row">
      <span>Estimasi aplikasi</span>
      <strong>${money(snapshot.estimatedBilled)}</strong>
    </div>
    <div class="summary-row">
      <span>Tagihan resmi</span>
      <strong>${money(snapshot.officialBilled)}</strong>
    </div>
    <div class="summary-row">
      <span>Selisih rekonsiliasi</span>
      <strong>${money(snapshot.reconciliationDifference)}</strong>
    </div>
  `;

  if($("creditReconcileForm").contains(document.activeElement))return;
  $("officialStatementAmount").value =
    Number(state.creditSettings.officialStatementAmount || 0);
  $("officialStatementDate").value =
    state.creditSettings.officialStatementDate || "";
  $("officialDueDate").value =
    state.creditSettings.officialDueDate || "";
  $("reconciliationNote").value =
    state.creditSettings.reconciliationNote || "";
}

let budgetRequest=0;
async function loadBudget(month) {
  const request=++budgetRequest,uid=state.user.uid;
  const plan=await getBudgetPlan(uid,month);
  if(request!==budgetRequest||state.user?.uid!==uid)return;
  state.budgetPlan = plan;
  renderBudget();
  refreshBudgetPreview(state.budgetPlan);
}

function renderBudget() {
  if (!state.budgetPlan?.month) return;

  const analysis = budgetAnalysis(
    state.transactions,
    state.budgetPlan.month,
    state.budgetPlan
  );

  $("budgetSummary").innerHTML = `
    <div class="summary-row">
      <span>Pemasukan bulan</span>
      <strong>${money(analysis.income)}</strong>
    </div>
    <div class="summary-row">
      <span>Total alokasi persentase</span>
      <strong>${analysis.totalPercentage}%</strong>
    </div>
    <div class="summary-row">
      <span>Status alokasi</span>
      <strong>${!analysis.percentageValid ? "Persentase tidak valid" : analysis.overlap ? "Kategori bertumpuk: tinjau pos lama" : "Valid"}</strong>
    </div>
  `;

  $("budgetList").innerHTML = analysis.rows.length
    ? analysis.rows.map((item) => `
        <article class="budget-card">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <p>${item.method === "percentage" ? `${item.value}% pemasukan` : money(item.value)}</p>
          </div>
          <div>
            <p>Target ${money(item.target)} · Aktual ${money(item.actual)} · Sisa ${money(item.remaining)}</p>
            <div class="progress-track">
              <div class="progress-fill ${item.overBudget ? "over" : ""}" style="width:${state.hideBalances?0:Math.min(100, item.usage)}%"></div>
            </div>
          </div>
          <button class="small-btn danger" data-delete-budget="${item.id}" type="button">Hapus</button>
        </article>
      `).join("")
    : `<div class="empty-state">Belum ada budget.</div>`;
}

function renderReports() {
  const month = $("reportMonth").value || monthKey();
  const report = buildMonthlyReport(
    state.transactions,
    month,
    state.settings
  );

  $("incomeStatementReport").innerHTML = [
    ["Pendapatan", report.income.income],
    ["Beban", report.income.expenses],
    ["Surplus/Defisit", report.income.netIncome]
  ].map(([label, value]) => `
      <div class="summary-row">
        <span>${label}</span>
        <strong>${money(value)}</strong>
      </div>
    `).join("");

  $("cashFlowReport").innerHTML = [
    ["Arus Kas Operasi Bersih", report.cashFlow.netOperating],
    ["Arus Kas Investasi Bersih", report.cashFlow.netInvesting],
    ["Transfer belum terklasifikasi", report.cashFlow.otherNet],
    ["Saldo awal kas (bukan arus kas)", report.cashFlow.openingAdjustments],
    ["Pembayaran Liabilitas", -report.cashFlow.financingOutflow],
    ["Perubahan Kas Bersih", report.cashFlow.netCashFlow]
  ].map(([label, value]) => `
      <div class="summary-row">
        <span>${label}</span>
        <strong>${money(value)}</strong>
      </div>
    `).join("");

  $("balanceSheetReport").innerHTML = [
    ["Aset", report.balance.assets],
    ["Liabilitas", report.balance.liabilities],
    ["Ekuitas", report.balance.equity],
    ["Persamaan Akuntansi", report.balance.balanced ? "Seimbang" : "Tidak seimbang"]
  ].map(([label, value]) => `
      <div class="summary-row">
        <span>${label}</span>
        <strong>${typeof value === "number" ? money(value) : value}</strong>
      </div>
    `).join("");

  $("trialBalanceContainer").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Akun</th>
          <th>Tipe</th>
          <th>Debit</th>
          <th>Kredit</th>
          <th>Saldo Normal</th>
        </tr>
      </thead>
      <tbody>
        ${report.trial.rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.accountName)}</td>
            <td>${escapeHtml(row.accountType)}</td>
            <td>${money(row.debit)}</td>
            <td>${money(row.credit)}</td>
            <td>${money(row.balance)}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="2">Total</th>
          <th>${money(report.trial.totalDebits)}</th>
          <th>${money(report.trial.totalCredits)}</th>
          <th>${report.trial.balanced ? "Seimbang" : "Periksa"}</th>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderSettings() {
  $("accountSettingsList").innerHTML = state.settings.accounts.map((account) => `
    <article class="list-card">
      <div>
        <strong>${escapeHtml(account.name)}</strong>
        <p>${escapeHtml(account.type)} · ${escapeHtml(account.subtype)} · ${account.active === false ? "nonaktif" : "aktif"}</p>
      </div>
      <button class="small-btn" data-toggle-account="${account.id}" type="button">
        ${account.active === false ? "Aktifkan" : "Nonaktifkan"}
      </button>
    </article>
  `).join("");

  if ($("creditSettingsForm").contains(document.activeElement)) return;
  $("ccLimitInput").value = Number(state.creditSettings.limit ?? 0);
  $("ccStatementDayInput").value = Number(state.creditSettings.statementDay ?? 7);
  $("ccDueDaysInput").value = Number(state.creditSettings.dueDays ?? 20);
  $("ccReminderDaysInput").value = Number(state.creditSettings.reminderDays ?? 5);
  $("ccMinimumPercentInput").value = Number(state.creditSettings.minimumPaymentPercent ?? 5);
  $("ccMinimumFloorInput").value = Number(state.creditSettings.minimumPaymentFloor ?? 50000);
}

function csvFromReport() {
  const month = $("reportMonth").value || monthKey();
  const report = buildMonthlyReport(state.transactions, month, state.settings);

  const rows = [
    ["LAPORAN SURPLUS/DEFISIT", ""],
    ["Pendapatan", report.income.income],
    ["Beban", report.income.expenses],
    ["Surplus/Defisit", report.income.netIncome],
    [],
    ["NERACA", ""],
    ["Aset", report.balance.assets],
    ["Liabilitas", report.balance.liabilities],
    ["Ekuitas", report.balance.equity],
    [],
    ["ARUS KAS", ""],
    ["Operasi Bersih", report.cashFlow.netOperating],
    ["Investasi Bersih", report.cashFlow.netInvesting],
    ["Transfer belum terklasifikasi", report.cashFlow.otherNet],
    ["Saldo awal kas (bukan arus kas)", report.cashFlow.openingAdjustments],
    ["Pembayaran Liabilitas", -report.cashFlow.financingOutflow],
    ["Perubahan Kas Bersih", report.cashFlow.netCashFlow]
  ];

  return rows.map((row) =>
    row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")
  ).join("\n");
}

function setupNavigation() {

  const requested = window.location.hash.replace("#", "");
  setPage(PAGE_META[requested] ? requested : "dashboard", { replace: true });
}

function setupEvents() {
  $("logoutButton").addEventListener("click", logout);

  $("toggleBalanceButton").addEventListener("click", async () => {
    state.hideBalances = !state.hideBalances;
    $("toggleBalanceButton").textContent =
      state.hideBalances ? "Tampilkan saldo" : "Sembunyikan saldo";

    state.settings.hideBalanceDefault = state.hideBalances;
    renderAll();
    try { await saveProfileSettings(state.user.uid, state.settings); } catch (error) { console.error(error); }
  });

  $("transactionType").addEventListener("change", updateTransactionFormMode);

  $("transactionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideNotice($("transactionMessage"));

    const type = $("transactionType").value;

    try {
      const input = {
          type,
          date: $("transactionDate").value,
          amount: Number($("transactionAmount").value),
          sourceAccountId: $("sourceAccount").value,
          destinationAccountId: ['transfer','investment','credit_payment'].includes(type) ? $("destinationAccount").value : '',
          category: $("transactionCategory").value,
          merchant: $("transactionMerchant").value,
          description: $("transactionDescription").value,
          installmentTenor: Number($("installmentTenor").value || 1),
          origin: "manual"
        };
      const matches=manualRecurringMatches(input,state.transactions);
      if(matches.length){
        const details=matches.slice(0,3).map(tx=>`${tx.date} · ${state.hideBalances?'••••':formatRupiah(tx.amount)} · ${tx.merchant||tx.category}`).join('\n');
        if(!confirm(`Ada transaksi rutin/gaji mirip yang sudah tercatat:\n${details}\n\nJika ini transaksi yang sama, pilih Batal agar tidak dihitung dua kali. Pilih OK hanya jika ini transaksi yang berbeda dan tetap ingin menambahkannya.`)){
          setNotice($("transactionMessage"),'info','Tidak ada transaksi tambahan. Catatan rutin/gaji yang sudah ada tetap digunakan.');return;
        }
      }
      const result = await saveTransaction(state.user.uid,input,state.settings);

      if (result.created) {
        setNotice($("transactionMessage"), "success", "Transaksi dan jurnal berhasil disimpan.");
        event.target.reset();
        $("transactionDate").value = formatDateLocal();
        updateTransactionFormMode();
      } else {
        setNotice($("transactionMessage"), "info", "Transaksi identik sudah ada. Duplikat tidak disimpan.");
      }
    } catch (error) {
      setNotice($("transactionMessage"), "error", error.message);
    }
  });

  $("transactionFilter").addEventListener("change", renderTransactions);
  $("transactionSearch").addEventListener("input", renderTransactions);

  $("transactionTableContainer").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-transaction]");
    if (!button) return;

    if (!confirm("Hapus transaksi ini?")) return;
    await deleteTransaction(state.user.uid, button.dataset.deleteTransaction);
  });

  $("deleteAllTransactionsButton").addEventListener("click", async () => {
    if (!state.transactions.length) {
      alert("Belum ada transaksi.");
      return;
    }

    if (!confirm(`Hapus semua ${state.transactions.length} transaksi?`)) return;

    const confirmation = prompt("Ketik HAPUS SEMUA untuk melanjutkan.");

    if (confirmation !== "HAPUS SEMUA") {
      alert("Penghapusan dibatalkan.");
      return;
    }

    const deleted = await deleteAllTransactions(state.user.uid);
    alert(`${deleted} transaksi dihapus.`);
  });

  $("migrateLegacyButton").addEventListener("click", async () => {
    $("migrateLegacyButton").disabled = true;
    $("migrateLegacyButton").textContent = "Memigrasikan...";

    try {
      const result = await migrateLegacyCollections(
        state.user.uid,
        buildTransaction,
        state.settings
      );

      alert(`${result.created} data berhasil dimigrasikan. ${result.duplicate} duplikat dilewati.`);
    } catch (error) {
      alert(error.message);
    } finally {
      $("migrateLegacyButton").disabled = false;
      $("migrateLegacyButton").textContent = "Migrasi Data Lama";
    }
  });

  $("creditReconcileForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const next={...state.creditSettings,officialStatementAmount:Number($("officialStatementAmount").value||0),officialStatementDate:$("officialStatementDate").value,officialDueDate:$("officialDueDate").value,reconciliationNote:cleanText($("reconciliationNote").value)};
    const uid=state.user.uid,button=event.target.querySelector('button[type="submit"]');button.disabled=true;
    try{await saveCreditSettings(uid,next);if(state.user?.uid!==uid)return;state.creditSettings=next;setNotice($("creditReconcileMessage"),'success','Rekonsiliasi kartu kredit disimpan.');renderCreditCard();}catch(error){setNotice($("creditReconcileMessage"),'error',error.message);}finally{button.disabled=false;}
  });

  $("budgetMonth").addEventListener("change", () => {
    loadBudget($("budgetMonth").value);
  });

  $("budgetForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const button=event.target.querySelector('button[type="submit"]');button.disabled=true;
    const uid=state.user.uid;
    try{
      const item=validateBudgetItem({id:crypto.randomUUID(),name:cleanText($("budgetName").value),category:$("budgetCategory").value,method:$("budgetMethod").value,value:Number($("budgetValue").value)},state.budgetPlan.items);
      const next={...state.budgetPlan,items:[...state.budgetPlan.items,item]};
      await saveBudgetPlan(uid,next.month,next);
      if(state.user?.uid!==uid)return;
      if(state.budgetPlan.month===next.month)state.budgetPlan=next;
      setNotice($("budgetMessage"),'success','Pos budget ditambahkan.');event.target.reset();renderBudget();refreshBudgetPreview(next);
    }catch(error){setNotice($("budgetMessage"),'error',error.message);}finally{button.disabled=false;}
  });
  $("budgetList").addEventListener('click',async event=>{
    const button=event.target.closest('[data-delete-budget]');if(!button)return;button.disabled=true;
    const uid=state.user.uid,next={...state.budgetPlan,items:state.budgetPlan.items.filter(item=>item.id!==button.dataset.deleteBudget)};
    try{await saveBudgetPlan(uid,next.month,next);if(state.user?.uid!==uid)return;if(state.budgetPlan.month===next.month)state.budgetPlan=next;renderBudget();refreshBudgetPreview(next);}catch(error){setNotice($("budgetMessage"),'error',error.message);}finally{button.disabled=false;}
  });

  $("reportMonth").addEventListener("change", renderReports);

  $("exportReportCsv").addEventListener("click", () => {
    const month = $("reportMonth").value || monthKey();
    downloadText(
      `spendly-report-${month}.csv`,
      csvFromReport(),
      "text/csv"
    );
  });

  $("accountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const uid=state.user.uid,button=event.target.querySelector('button[type="submit"]');button.disabled=true;
    try {
      const next = addAccount(state.settings, {
        name: $("accountName").value,
        type: $("accountType").value,
        subtype: $("accountSubtype").value
      });

      await saveProfileSettings(uid, next);
      if(state.user?.uid!==uid)return;
      state.settings=next;
      setNotice($("accountMessage"), "success", "Akun baru disimpan dan tersinkronisasi.");
      event.target.reset();
      renderAll();
    } catch (error) {
      if(state.user?.uid===uid)setNotice($("accountMessage"), "error", error.message);
    } finally {button.disabled=false;}
  });

  $("accountSettingsList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-toggle-account]");
    if (!button) return;

    const uid=state.user.uid,next=toggleAccountActive(state.settings,button.dataset.toggleAccount);button.disabled=true;
    try{await saveProfileSettings(uid,next);if(state.user?.uid!==uid)return;state.settings=next;renderAll();}catch(error){if(state.user?.uid===uid)setNotice($("accountMessage"),'error',error.message);}finally{button.disabled=false;}
  });

  $("creditSettingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const next={...state.creditSettings,limit:Number($("ccLimitInput").value),statementDay:Number($("ccStatementDayInput").value),dueDays:Number($("ccDueDaysInput").value),reminderDays:Number($("ccReminderDaysInput").value),minimumPaymentPercent:Number($("ccMinimumPercentInput").value),minimumPaymentFloor:Number($("ccMinimumFloorInput").value)};
    const uid=state.user.uid,button=event.target.querySelector('button[type="submit"]');button.disabled=true;
    try{await saveCreditSettings(uid,next);if(state.user?.uid!==uid)return;state.creditSettings=next;setNotice($("creditSettingsMessage"),'success','Pengaturan kartu kredit berhasil disimpan.');renderAll();}catch(error){setNotice($("creditSettingsMessage"),'error',error.message);}finally{button.disabled=false;}
  });

  $("scanInput").addEventListener("change", () => {
    const files = [...($("scanInput").files || [])];
    const hasPdf = files.some(
      (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
    );

    $("pdfPasswordWrap").classList.toggle("hidden", !hasPdf);

    if (!files.length) {
      $("scanPreview").textContent = "Preview file akan muncul di sini.";
      $("pdfPasswordInput").value = "";
      return;
    }

    const first = files[0];

    if (first.type.startsWith("image/")) {
      $("scanPreview").innerHTML = `<img src="${URL.createObjectURL(first)}" alt="Preview">`;
    } else {
      $("scanPreview").innerHTML = `
        <div>
          <strong>${files.length} file PDF dipilih.</strong><br>
          <span>Jika e-Statement dilindungi, isi Password PDF sebelum scan.</span>
        </div>
      `;
    }
  });

  $("togglePdfPasswordButton").addEventListener("click", () => {
    const passwordInput = $("pdfPasswordInput");
    const showPassword = passwordInput.type === "password";

    passwordInput.type = showPassword ? "text" : "password";
    $("togglePdfPasswordButton").textContent =
      showPassword ? "Sembunyikan" : "Tampilkan";
  });

  const savedNvidiaBackendUrl =
    localStorage.getItem("spendlyNvidiaBackendUrl") || "";

  $("nvidiaBackendUrlInput").value =
    savedNvidiaBackendUrl;

  updateNvidiaBackendBadge(
    savedNvidiaBackendUrl
      ? "configured"
      : "missing"
  );

  $("nvidiaBackendUrlInput").addEventListener("change", async () => {
    const url =
      cleanText($("nvidiaBackendUrlInput").value)
        .replace(/\/+$/, "");

    $("nvidiaBackendUrlInput").value = url;

    if (!url) {
      localStorage.removeItem("spendlyNvidiaBackendUrl");
      updateNvidiaBackendBadge("missing");
      return;
    }

    localStorage.setItem(
      "spendlyNvidiaBackendUrl",
      url
    );

    updateNvidiaBackendBadge("checking");

    try {
      await checkNvidiaBackend(url);
      updateNvidiaBackendBadge("ready");
    } catch (error) {
      updateNvidiaBackendBadge("error");
      setNotice(
        $("scanMessage"),
        "error",
        `Backend NVIDIA AI belum dapat diakses: ${error.message}`
      );
    }
  });

  $("scanButton").addEventListener("click", scanFiles);

  $("cancelScanButton").addEventListener("click", () => {
    scanCancelled = true;
    $("cancelScanButton").disabled = true;
    $("cancelScanButton").textContent = "Membatalkan...";
  });

  $("scanReviewContainer").addEventListener("click", event => {handleScanReviewClick(event).catch(error=>setNotice($("scanMessage"),"error",error.message));});

  $("scanReviewContainer").addEventListener("change", event=>{
    if(['importDecision','date','amount','type','sourceAccountId','destinationAccountId'].includes(event.target.dataset.scanField)){
      syncScanCandidates();const item=scanCandidates[Number(event.target.closest('[data-scan-index]').dataset.scanIndex)];
      if(event.target.dataset.scanField==='importDecision')item.selected=event.target.value==='new';renderScanCandidates();
    }
  });


}

let scanCandidates = [];
let scanStatements = [];
let scanCancelled = false;
let nvidiaOptimizationRunning = false;
let scanBatchVersion=0;
let scanSaving = false;

function updateNvidiaBackendBadge(status) {
  const badge = $("nvidiaAiStatusBadge");

  if (!badge) return;

  const states = {
    missing: ["Belum dikonfigurasi", ""],
    configured: ["URL tersimpan", ""],
    checking: ["Memeriksa...", ""],
    ready: ["Backend terkonfigurasi", "validation-ok"],
    error: ["Backend bermasalah", "validation-error"],
    running: ["AI memproses...", ""],
    done: ["AI selesai", "validation-ok"]
  };

  const [label, className] =
    states[status] || states.missing;

  badge.textContent = label;
  badge.className =
    `pill ${className}`.trim();
}

async function optimizeCurrentScanWithNvidia() {
  if (nvidiaOptimizationRunning) {
    return;
  }

  syncScanCandidates();

  if (!scanCandidates.length) {
    setNotice(
      $("scanMessage"),
      "error",
      "Belum ada hasil scan yang dapat dioptimalkan."
    );
    return;
  }

  if (!$("nvidiaAiConsent").checked) {
    setNotice(
      $("scanMessage"),
      "error",
      "Centang persetujuan pengiriman keterangan transaksi ke NVIDIA AI."
    );
    return;
  }

  const backendUrl =
    cleanText($("nvidiaBackendUrlInput").value)
      .replace(/\/+$/, "");

  if (!backendUrl) {
    setNotice(
      $("scanMessage"),
      "error",
      "Isi URL backend NVIDIA AI terlebih dahulu."
    );
    return;
  }

  nvidiaOptimizationRunning = true;
  const startedBatch=scanBatchVersion;
  const originals=scanCandidates.map(item=>({...item}));
  updateNvidiaBackendBadge("running");

  const button =
    $("optimizeWithNvidiaButton");

  if (button) {
    button.disabled = true;
    button.textContent =
      "NVIDIA AI memproses...";
  }

  try {
    const result =
      await optimizeCandidatesWithNvidia({
        baseUrl: backendUrl,
        candidates: scanCandidates,
        statements: scanStatements,
        accounts: state.settings.accounts,
        onProgress(progress) {
          setNotice(
            $("scanMessage"),
            "info",
            `NVIDIA AI memproses batch ${progress.batchNumber}/${progress.totalBatches}...`
          );
        }
      });

    if(startedBatch!==scanBatchVersion)throw new Error('Dokumen berubah saat AI memeriksa. Jalankan ulang pada dokumen terbaru.');
    syncScanCandidates();
    let applied = 0;

    (result.updates || []).forEach((update) => {
      const index = Number(update.index);
      const candidate = scanCandidates[index];

      if (!candidate || transactionSignature(candidate)!==transactionSignature(originals[index]||{})) return;

      candidate.aiSuggestions=stageAiSuggestions(candidate,update,state.settings.accounts).map(s=>({...s,snapshot:transactionSignature(candidate)}));
      applied+=candidate.aiSuggestions.length;
    });

    renderScanCandidates();
    updateNvidiaBackendBadge("done");

    setNotice(
      $("scanMessage"),
      "success",
      `${applied} saran AI tersedia. Pilih Terapkan atau Abaikan; data asli belum diubah.`
    );
  } catch (error) {
    updateNvidiaBackendBadge("error");
    setNotice(
      $("scanMessage"),
      "error",
      `Optimasi NVIDIA AI gagal: ${error.message}`
    );
  } finally {
    nvidiaOptimizationRunning = false;

    const currentButton =
      $("optimizeWithNvidiaButton");

    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent =
        "Minta saran NVIDIA AI";
    }
  }
}

async function scanFiles() {
  const files = [...($("scanInput").files || [])];
  const pdfPassword = $("pdfPasswordInput").value;

  if (!files.length) {
    setNotice($("scanMessage"), "error", "Pilih file terlebih dahulu.");
    return;
  }
  const useVision=$("scanMode").value==='ai';
  if(useVision&&(!$("visionConsent").checked||!$("nvidiaBackendUrlInput").value.trim())){
    setNotice($("scanMessage"),"error","Untuk scan AI, isi URL backend dan setujui pengiriman gambar. Kamu juga bisa memilih OCR lokal.");return;
  }

  const assetAccounts = state.settings.accounts.filter(
    (account) =>
      account.type === "asset" &&
      account.active !== false
  );

  const normalizeAccountName = (value) =>
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const genericAsset = assetAccounts[0]?.id;

  const findBankAccount = (aliases) => {
    const normalizedAliases =
      aliases.map(normalizeAccountName);

    const exact = assetAccounts.find((account) => {
      const name = normalizeAccountName(account.name);
      return normalizedAliases.includes(name);
    });

    if (exact) {
      return exact.id;
    }

    const partial = assetAccounts.find((account) => {
      const name = normalizeAccountName(account.name);

      return normalizedAliases.some((alias) =>
        name.includes(alias) ||
        alias.includes(name)
      );
    });

    return partial?.id || genericAsset;
  };

  const bankAccountMap = {
    blu: findBankAccount(['blu','BCA Digital','blu BCA Digital']),
    mandiri: findBankAccount([
      "Mandiri",
      "Bank Mandiri",
      "Mandiri Tabungan"
    ]),
    bca: findBankAccount([
      "BCA",
      "Bank BCA",
      "Bank Central Asia"
    ]),
    krom: findBankAccount([
      "Krom",
      "Krom Bank",
      "Bank Krom"
    ]),
    clearing:
      state.settings.accounts.find(
        (account) =>
          account.id ===
          "asset-transfer-clearing"
      )?.id ||
      "asset-transfer-clearing",
    generic: genericAsset
  };

  if (!genericAsset) {
    setNotice(
      $("scanMessage"),
      "error",
      "Belum ada akun aset/rekening untuk menampung hasil scan."
    );
    return;
  }

  scanBatchVersion++;
  scanCandidates = [];
  scanStatements = [];
  scanCancelled = false;

  $("scanButton").disabled = true;
  $("cancelScanButton").disabled = false;
  $("cancelScanButton").textContent = "Batalkan";
  $("cancelScanButton").classList.remove("hidden");
  $("scanProgressWrap").classList.remove("hidden");
  $("scanProgress").value = 0;
  $("scanProgressPercent").textContent = "0%";
  $("statementSummaryContainer").innerHTML = "";
  $("scanExcludedContainer").innerHTML = "";
  $("scanReviewContainer").innerHTML = "";

  try {
    const result = await scanStatementFiles({
      files,
      visionReader:useVision?options=>readPageWithNvidia({...options,baseUrl:$("nvidiaBackendUrlInput").value.trim()}):null,
      password: pdfPassword,
      bankAccountMap,
      merchantRules:
        state.settings.merchantCategoryRules || {},
      shouldCancel: () => scanCancelled,
      onProgress(progress) {
        const pageCount = Math.max(
          1,
          Number(progress.pageCount || 1)
        );

        const stagePart =
          progress.stage === "native"
            ? 0.45
            : 0.45 + 0.55 * Number(progress.stageProgress || 0);

        const pageFraction =
          (
            Number(progress.pageNumber || 1) -
            1 +
            stagePart
          ) / pageCount;

        const percent = Math.max(
          0,
          Math.min(100, Math.round(pageFraction * 100))
        );

        $("scanProgress").value = percent;
        $("scanProgressPercent").textContent = `${percent}%`;

        $("scanProgressText").textContent =
          progress.stage === "native"
            ? `Membaca ${progress.bank && progress.bank !== "generic" ? progress.bank.toUpperCase() : "PDF"} · ${progress.fileName} · halaman ${progress.pageNumber}/${pageCount}`
            : `${progress.stage==='ai'?'AI membaca':'OCR lokal'} ${progress.fileName} · halaman ${progress.pageNumber}/${pageCount}`;
      }
    });

    scanStatements = result.statements;
    $('scanExcludedContainer').innerHTML=(result.excluded||[]).length?`<details class="scan-excluded"><summary>${result.excluded.length} informasi pengecualian: tidak masuk transaksi</summary><ul>${result.excluded.map(item=>`<li><strong>${escapeHtml(item.fileName)}</strong>: ${escapeHtml(item.reason)}</li>`).join('')}</ul></details>`:'';

    const statementBankByFile = new Map(
      scanStatements.map((statement) => [
        statement.fileName,
        statement.bank
      ])
    );

    scanCandidates = result.candidates.map((candidate) => {
      const detectedBank =
        candidate.bank ||
        statementBankByFile.get(candidate.sourceFile) ||
        "generic";

      const detectedBankAccount =
        bankAccountMap[detectedBank] ||
        bankAccountMap.generic;

      const nextCandidate = {
        ...candidate
      };

      // Pengeluaran/pemasukan biasa selalu memakai rekening
      // bank yang terdeteksi dari e-Statement.
      if (nextCandidate.type !== "transfer") {
        nextCandidate.sourceAccountId =
          detectedBankAccount;
        nextCandidate.destinationAccountId = "";
      }

      // Transfer mempertahankan hasil parser jika kedua sisinya jelas.
      // Sisi yang pasti berasal dari statement diisi otomatis.
      if (nextCandidate.type === "transfer") {
        if (nextCandidate.signedAmount < 0) {
          nextCandidate.sourceAccountId =
            nextCandidate.sourceAccountId ||
            detectedBankAccount;
        }

        if (nextCandidate.signedAmount > 0) {
          nextCandidate.destinationAccountId =
            nextCandidate.destinationAccountId ||
            detectedBankAccount;
        }

        if (nextCandidate.internalMovement && !nextCandidate.transferNeedsMapping) {
          nextCandidate.sourceAccountId =
            nextCandidate.sourceAccountId ||
            detectedBankAccount;
          nextCandidate.destinationAccountId =
            nextCandidate.destinationAccountId ||
            detectedBankAccount;
        }
      }

      if (nextCandidate.type === "transfer") {
        const ruleKey =
          transferRuleKey(nextCandidate);
        const savedRule =
          state.settings.transferAccountRules?.[
            ruleKey
          ];

        nextCandidate.transferRuleKey =
          ruleKey;

        if (savedRule) {
          nextCandidate.sourceAccountId =
            savedRule.sourceAccountId ||
            nextCandidate.sourceAccountId;

          nextCandidate.destinationAccountId =
            savedRule.destinationAccountId ||
            nextCandidate.destinationAccountId;

          nextCandidate.transferNeedsMapping =
            false;

          nextCandidate.sourceInference =
            "Akun sumber dipelajari dari koreksi scan sebelumnya.";

          nextCandidate.destinationInference =
            "Akun tujuan dipelajari dari koreksi scan sebelumnya.";
        }
      }

      return nextCandidate;
    });

    renderStatementSummaries();
    renderScanCandidates();

    const nativeCount = scanStatements.reduce(
      (sum, item) => sum + Number(item.nativePages || 0),
      0
    );

    const ocrCount = scanStatements.reduce(
      (sum, item) => sum + Number(item.ocrPages || 0),
      0
    );

    $("scanProgress").value = 100;
    $("scanProgressPercent").textContent = "100%";
    $("scanProgressText").textContent =
      "Seluruh halaman selesai diproses.";

    setNotice(
      $("scanMessage"),
      "success",
      `${scanCandidates.length} transaksi ditemukan. ${nativeCount} halaman PDF langsung, ${ocrCount} OCR lokal, ${scanStatements.reduce((sum,s)=>sum+Number(s.aiPages||0),0)} halaman AI. Periksa hasil sebelum menyimpan.`
    );

    $("pdfPasswordInput").value = "";
    $("pdfPasswordInput").type = "password";
    $("togglePdfPasswordButton").textContent = "Tampilkan";
  } catch (error) {
    setNotice(
      $("scanMessage"),
      scanCancelled ? "info" : "error",
      error.message
    );
  } finally {
    $("scanButton").disabled = false;
    $("cancelScanButton").classList.add("hidden");
    $("cancelScanButton").disabled = false;
    $("cancelScanButton").textContent = "Batalkan";
  }
}

function renderStatementSummaries() {
  $("statementSummaryContainer").innerHTML =
    scanStatements.length
      ? scanStatements.map((statement) => {
          const metadata = statement.metadata || {};
          const reconciliation =
            statement.reconciliation || {};

          const statusText =
            reconciliation.balanced === true
              ? "Rekonsiliasi sesuai"
              : reconciliation.balanced === false
                ? "Ada selisih"
                : "Ringkasan belum lengkap";

          const statusClass =
            reconciliation.balanced === true
              ? "validation-ok"
              : reconciliation.balanced === false
                ? "validation-error"
                : "validation-warning";

          return `
            <article class="statement-summary-card">
              <div class="statement-summary-header">
                <div>
                  <div class="bank-detection-badge ${statement.bank}">
                    ${escapeHtml(statement.bankLabel || statement.bank)}
                    · ${Math.round(Number(statement.bankConfidence || 0) * 100)}%
                  </div>

                  <h3>${escapeHtml(statement.fileName)}</h3>

                  <p>
                    ${statement.pageCount} halaman ·
                    ${statement.nativePages} halaman transaksi native ·
                    ${statement.ocrPages} OCR fallback ·
                    ${statement.aiPages || 0} AI ·
                    ${statement.informationalPages || 0} halaman informasi
                  </p>
                </div>

                <span class="${statusClass}">
                  ${statusText}
                </span>
              </div>

              <div class="statement-summary-grid compact-summary-grid">
                <div class="statement-summary-item summary-wide">
                  <p>Periode</p>
                  <strong>
                    ${escapeHtml(metadata.periodStart || "-")}
                    s.d.
                    ${escapeHtml(metadata.periodEnd || "-")}
                  </strong>
                </div>

                <div class="statement-summary-item">
                  <p>Saldo Awal</p>
                  <strong>${money(metadata.openingBalance || 0)}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Dana Masuk</p>
                  <strong>${money(reconciliation.totalIncoming || 0)}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Dana Keluar</p>
                  <strong>${money(reconciliation.totalOutgoing || 0)}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Saldo Akhir</p>
                  <strong>${money(metadata.closingBalance || 0)}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Transaksi Mentah</p>
                  <strong>${statement.rawTransactionCount || 0}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Kandidat Review</p>
                  <strong>${statement.reviewCandidateCount || 0}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Transfer Internal</p>
                  <strong>${statement.internalPairCount || 0}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Saldo Antarbaris Dihitung</p>
                  <strong>${statement.reconciliation?.calculatedBalanceCount || 0}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Halaman Informasi</p>
                  <strong>${statement.informationalPages || 0}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Halaman Benar-benar Gagal</p>
                  <strong class="${
                    statement.failedPages
                      ? "validation-error"
                      : "validation-ok"
                  }">
                    ${statement.failedPages || 0}
                  </strong>
                </div>
              </div>
            </article>
          `;
        }).join("")
      : "";
}
function confidenceClass(confidence) {
  const value = Number(confidence || 0);

  if (value >= 0.90) return "confidence-high";
  if (value >= 0.75) return "confidence-medium";
  return "confidence-low";
}

function validationLabel(item) {
  if (item.validationStatus === "valid") {
    return `<span class="validation-ok">Saldo tercetak cocok</span>`;
  }

  if (item.validationStatus === "calculated") {
    return `<span class="validation-calculated">Saldo dihitung dari mutasi</span>`;
  }

  if (item.validationStatus === "mismatch") {
    return `
      <span class="validation-error">
        Selisih ${formatRupiah(item.validationDifference || 0)}
      </span>
    `;
  }

  return `<span class="validation-warning">Belum divalidasi</span>`;
}

function renderScanCandidates() {
  const matched=reconcileImports(scanCandidates,state.transactions);
  scanCandidates=matched.map((next,index)=>{
    const old=scanCandidates[index];
    const selected=next.importMatch.status==='duplicate'?false:next.importMatch.status==='review'?old.importDecision==='new'&&old.selected:old.selected;
    return {...next,selected};
  });
  $("scanReviewContainer").innerHTML =
    scanCandidates.length
      ? `
        <div class="scan-save-toolbar compact-toolbar">
          <div>
            <strong>${scanCandidates.length} kandidat transaksi</strong>
            <p>
              Baru: ${scanCandidates.filter(i=>i.importMatch.status==='new').length} · Duplikat: ${scanCandidates.filter(i=>i.importMatch.status==='duplicate').length} · Perlu keputusan: ${scanCandidates.filter(i=>i.importMatch.status==='review').length}.
              Duplikat pasti dilewati. Periksa akun serta transaksi yang mirip sebelum menyimpan.
            </p>
          </div>

          <div class="compact-toolbar-actions">
            <button id="selectAllScanCandidates" class="btn btn-light" type="button">
              Pilih Semua
            </button>

            <button id="clearAllScanCandidates" class="btn btn-light" type="button">
              Kosongkan
            </button>

            <button id="optimizeWithNvidiaButton" class="btn btn-ai" type="button">
              Minta saran NVIDIA AI
            </button>

            <button id="saveScanCandidates" class="btn btn-primary" type="button">
              Simpan Terpilih
            </button>
          </div>
        </div>

        <div class="table-container compact-review-table">
          <table>
            <thead>
              <tr>
                <th class="sticky-col sticky-col-1">Pilih</th>
                <th class="sticky-col sticky-col-2">Bank & Sumber</th>
                <th>Tanggal & Waktu</th>
                <th>Tipe</th>
                <th>Akun</th>
                <th>Kategori</th>
                <th>Nominal</th>
                <th>Merchant & Keterangan</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              ${scanCandidates.map((item, index) => `
                <tr
                  data-scan-index="${index}"
                  data-scan-expanded="${Boolean(item.mobileExpanded)}"
                  class="${item.internalMovement ? "internal-movement-row" : ""}"
                >
                  <td class="sticky-col sticky-col-1">
                    <input
                      data-scan-field="selected"
                      aria-label="Pilih transaksi ${index+1}"
                      type="checkbox"
                      ${item.importMatch.status==='duplicate'||(item.importMatch.status==='review'&&item.importDecision!=='new')?'disabled':''}
                      ${item.selected ? "checked" : ""}
                    >
                  </td>

                  <td class="sticky-col sticky-col-2">
                    <span class="bank-detection-badge ${item.bank}">
                      ${escapeHtml(item.bankLabel || item.bank)}
                    </span>

                    <div class="compact-source-meta">
                      <strong>
                        ${escapeHtml(item.statementAccountName || "Rekening Utama")}
                      </strong>
                      <span>
                        Hal. ${item.sourcePage || "-"} · No. ${item.sourceRow || "-"}
                      </span>
                    </div>
                    <div class="scan-mobile-summary">
                      <strong class="scan-mobile-amount">${money(item.amount)}</strong>
                      <strong class="scan-mobile-merchant">${escapeHtml(item.merchant || item.description || item.category || 'Transaksi')}</strong>
                      <span>${escapeHtml(transactionTypeLabel(item.type))} · ${formatDateId(parseLocalDate(item.date))}</span>
                      <span>${escapeHtml(state.settings.accounts.find(account => account.id === item.sourceAccountId)?.name || 'Pilih rekening')}</span>
                      <span class="scan-mobile-status">${({new:'Transaksi baru',duplicate:'Duplikat · dilewati',review:'Mirip · perlu diperiksa'})[item.importMatch.status]}</span>
                      ${item.transferNeedsMapping ? '<span class="validation-warning">Periksa rekening sumber & tujuan</span>' : item.internalMovement ? '<span class="validation-warning">Transfer internal · periksa detail</span>' : ''}
                      <button type="button" class="small-btn scan-detail-toggle" data-toggle-scan="${index}" aria-expanded="${Boolean(item.mobileExpanded)}">${item.mobileExpanded ? 'Tutup detail' : 'Detail & edit'}</button>
                    </div>
                  </td>

                  <td data-label="Tanggal & waktu">
                    <div class="compact-date-time">
                      <input
                        data-scan-field="date"
                        aria-label="Tanggal transaksi"
                        type="date"
                        value="${item.date || ""}"
                      >

                      <input
                        data-scan-field="time"
                        aria-label="Waktu transaksi"
                        type="time"
                        step="1"
                        value="${item.time || ""}"
                      >
                    </div>
                  </td>

                  <td data-label="Tipe transaksi">
                    <select data-scan-field="type" class="compact-select" aria-label="Tipe transaksi">
                      <option value="income" ${item.type === "income" ? "selected" : ""}>
                        Pemasukan
                      </option>
                      <option value="expense" ${item.type === "expense" ? "selected" : ""}>
                        Pengeluaran
                      </option>
                      <option value="transfer" ${item.type === "transfer" ? "selected" : ""}>
                        Transfer
                      </option>
                    </select>

                    ${
                      item.transferNeedsMapping
                        ? `<div class="possible-transfer-warning">Sumber/tujuan belum terbaca</div>`
                        : item.possibleOwnTransfer
                          ? `<div class="possible-transfer-warning">Transfer antar rekening sendiri</div>`
                          : ""
                    }
                  </td>

                  <td data-label="Rekening">
                    <div class="account-pair">
                      <label>
                        <span>Sumber</span>
                        <select data-scan-field="sourceAccountId">
                          ${accountOptionsHtml(
                            item.sourceAccountId,
                            { includeLiabilities: false }
                          )}
                        </select>
                      </label>

                      <label class="${item.type === "transfer" ? "" : "destination-disabled"}">
                        <span>Tujuan</span>
                        <select
                          data-scan-field="destinationAccountId"
                          ${item.type === "transfer" ? "" : "disabled"}
                        >
                          ${accountOptionsHtml(
                            item.destinationAccountId,
                            { includeLiabilities: false }
                          )}
                        </select>
                      </label>
                    </div>

                    ${
                      item.sourceInference
                        ? `<div class="account-inference-note">${escapeHtml(item.sourceInference)}</div>`
                        : ""
                    }

                    ${
                      item.destinationInference
                        ? `<div class="account-inference-note">${escapeHtml(item.destinationInference)}</div>`
                        : ""
                    }
                  </td>

                  <td data-label="Kategori">
                    <input
                      data-scan-field="category"
                      aria-label="Kategori transaksi"
                      class="compact-input"
                      type="text"
                      value="${escapeHtml(item.category || "Lainnya")}"
                    >
                  </td>

                  <td data-label="Nominal">
                    <input
                      data-scan-field="amount"
                      aria-label="Nominal transaksi"
                      class="compact-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value="${item.amount || 0}"
                    >

                    ${
                      item.balanceAfter === null ||
                      item.balanceAfter === undefined
                        ? ""
                        : `<div class="balance-after">
                            ${item.balanceSource === "calculated" ? "Saldo hitung" : "Saldo cetak"}
                            ${money(item.balanceAfter)}
                          </div>`
                    }
                  </td>

                  <td data-label="Merchant & keterangan">
                    <div class="merchant-description">
                      <input
                        data-scan-field="merchant"
                        aria-label="Merchant transaksi"
                        class="compact-input"
                        type="text"
                        value="${escapeHtml(item.merchant || "")}"
                        placeholder="Merchant"
                      >

                      <textarea
                        data-scan-field="description"
                        aria-label="Keterangan transaksi"
                        rows="2"
                        placeholder="Keterangan"
                      >${escapeHtml(item.description || "")}</textarea>
                    </div>
                  </td>

                  <td data-label="Pemeriksaan transaksi">
                    <div class="status-stack">
                      <div class="import-match ${item.importMatch.status}"><strong>${({new:'Transaksi baru',duplicate:'Duplikat · dilewati',review:'Mirip · perlu diperiksa'})[item.importMatch.status]}</strong><p>${escapeHtml(item.importMatch.reason)}</p>${item.importMatch.matched?`<p>Catatan pembanding: ${escapeHtml(item.importMatch.matched.merchant||item.importMatch.matched.description||item.importMatch.matched.category||'Transaksi')} · ${escapeHtml(item.importMatch.matched.date)}</p>`:''}</div>
                      ${item.importMatch.status==='review'?`<label>Keputusan pencocokan<select data-scan-field="importDecision"><option value="">Pilih setelah diperiksa</option><option value="skip" ${item.importDecision==='skip'?'selected':''}>Transaksi sama · lewati</option><option value="new" ${item.importDecision==='new'?'selected':''}>Transaksi berbeda · simpan baru</option></select></label>`:''}
                      ${suggestionsHtml(suggestionsFor(item),index)}
                      ${validationLabel(item)}

                      <span class="badge ${confidenceClass(item.confidence)}">
                        ${Math.round(Number(item.confidence || 0) * 100)}%
                      </span>

                      ${
                        item.transactionCode
                          ? `<span class="transaction-code-label">${escapeHtml(item.transactionCode)}</span>`
                          : ""
                      }

                      <span class="method-label">
                        ${escapeHtml(item.extractionMethod || "-")}
                      </span>

                      ${
                        item.aiOptimized
                          ? `<span class="ai-reviewed-badge">AI reviewed</span>`
                          : ""
                      }

                      ${
                        item.aiReason
                          ? `<span class="ai-reason">${escapeHtml(item.aiReason)}</span>`
                          : ""
                      }
                    </div>
                  </td>

                  <td>
                    <button
                      class="small-btn danger"
                      data-remove-scan="${index}"
                      type="button"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `
      : `<div class="empty-state">Tidak ada transaksi yang berhasil dibaca.</div>`;
}
function syncScanCandidates() {
  document.querySelectorAll("[data-scan-index]").forEach((row) => {
    const item =
      scanCandidates[Number(row.dataset.scanIndex)];
    const core=tx=>JSON.stringify([tx.date,Number(tx.amount),tx.type,tx.sourceAccountId,tx.destinationAccountId||'']);
    const previousCore=core(item);

    row.querySelectorAll("[data-scan-field]").forEach((input) => {
      const field = input.dataset.scanField;

      if (field === "selected") {
        item.selected = input.checked;
      } else if (field === "amount") {
        item.amount = Number(input.value || 0);
      } else {
        item[field] = input.value;
      }
    });

    item.signedAmount =
      item.type === "income"
        ? Number(item.amount || 0)
        : item.type === "expense"
          ? -Number(item.amount || 0)
          : 0;
    if(core(item)!==previousCore){item.importDecision='';item.selected=false;}
  });
}
async function handleScanReviewClick(event) {
  if(scanSaving)return;
  syncScanCandidates();
  const toggleButton=event.target.closest('[data-toggle-scan]');
  if(toggleButton){
    const index=Number(toggleButton.dataset.toggleScan);
    scanCandidates[index].mobileExpanded=!scanCandidates[index].mobileExpanded;
    renderScanCandidates();
    $("scanReviewContainer").querySelector(`[data-toggle-scan="${index}"]`)?.focus({preventScroll:true});
    return;
  }
  const suggestionButton=event.target.closest('[data-suggestion-scan]');
  if(suggestionButton){
    const item=scanCandidates[Number(suggestionButton.dataset.suggestionScan)],suggestion=item&&suggestionsFor(item)[Number(suggestionButton.dataset.suggestionIndex)];
    if(!suggestion)return;
    if(suggestionButton.dataset.suggestionAction==='apply'&&!suggestion.warning){const before={...item};item[suggestion.field]=suggestion.after;item.aiSuggestions=remainingAiSuggestions(item.aiSuggestions,before,item,suggestion);item.importDecision='';item.selected=false;item.aiOptimized=suggestion.source==='NVIDIA AI';}
    else item.dismissedSuggestions=[...(item.dismissedSuggestions||[]),suggestionKey(suggestion)];
    renderScanCandidates();return;
  }
  if (event.target.id === "optimizeWithNvidiaButton") {
    await optimizeCurrentScanWithNvidia();
    return;
  }

  if (event.target.id === "selectAllScanCandidates") {
    scanCandidates.forEach((item) => {
      if (!item.internalMovement && item.importMatch?.status==='new') {
        item.selected = true;
      }
    });
    renderScanCandidates();
    return;
  }

  if (event.target.id === "clearAllScanCandidates") {
    scanCandidates.forEach((item) => {
      item.selected = false;
    });
    renderScanCandidates();
    return;
  }

  const removeButton =
    event.target.closest("[data-remove-scan]");

  if (removeButton) {
    scanCandidates.splice(
      Number(removeButton.dataset.removeScan),
      1
    );
    renderScanCandidates();
    return;
  }

  if (event.target.id !== "saveScanCandidates") {
    return;
  }

  syncScanCandidates();

  const selected=scanCandidates.filter(candidate=>candidate.selected);
  const excluded=selected.find(scanExclusionReason);
  if(excluded){excluded.selected=false;renderScanCandidates();setNotice($('scanMessage'),'error',`Tidak disimpan: ${scanExclusionReason(excluded)}. Periksa isi dokumen.`);return;}
  if(!selected.length){setNotice($("scanMessage"),"error","Pilih transaksi baru yang sudah diperiksa terlebih dahulu.");return;}
  for(const item of reconcileImports(selected,state.transactions)){if(item.importMatch.status==='review'&&item.importDecision!=='new'){renderScanCandidates();setNotice($("scanMessage"),"error","Ada transaksi mirip. Tentukan apakah transaksi sama atau berbeda sebelum menyimpan.");return;}}
  scanSaving=true;
  $("saveScanCandidates").disabled=true;
  try {

  let created = 0;
  let duplicate = 0;
  let rulesChanged = false;
  let transferRulesChanged = false;

  const merchantRules = {
    ...(state.settings.merchantCategoryRules || {})
  };

  const transferAccountRules = {
    ...(state.settings.transferAccountRules || {})
  };

  const savedThisBatch=[];
  for (const item of selected) {
    const match=matchImport(item,[...state.transactions,...savedThisBatch]);
    if(match.status==='duplicate'){duplicate+=1;item.selected=false;continue;}
    const result = await saveTransaction(
      state.user.uid,
      {
        ...item,
        importIdentity:importIdentity(item),
        description:
          item.time
            ? `${item.description} · ${item.time}`
            : item.description,
        sourceMeta: {
          fileName: item.sourceFile || '',
          fileHash: item.sourceHash || '',
          reference:item.reference || item.movementReference || '',
          time:item.time || '',
          page: item.sourcePage || 1,
          row: item.sourceRow || 1,
          extractionMethod: item.extractionMethod || '',
          bank: item.bank || 'generic',
          statementAccountName: item.statementAccountName || '',
          statementAccountNumber: item.statementAccountNumber || '',
          movementReference: item.movementReference || '',
          internalMovement: item.internalMovement === true
        },
        externalBalance: item.balanceAfter,
        validationStatus: item.validationStatus,
        confidence: item.confidence
      },
      state.settings
    );
    savedThisBatch.push(item);item.selected=false;

    if (result.created) {
      created += 1;
    } else {
      duplicate += 1;
    }

    if (
      item.type === "transfer" &&
      item.sourceAccountId &&
      item.destinationAccountId
    ) {
      const key =
        item.transferRuleKey ||
        transferRuleKey(item);

      const nextRule = {
        sourceAccountId:
          item.sourceAccountId,
        destinationAccountId:
          item.destinationAccountId
      };

      const existingRule =
        transferAccountRules[key];

      if (
        !existingRule ||
        existingRule.sourceAccountId !==
          nextRule.sourceAccountId ||
        existingRule.destinationAccountId !==
          nextRule.destinationAccountId
      ) {
        transferAccountRules[key] =
          nextRule;
        transferRulesChanged = true;
      }
    }

    if (
      $("learnMerchantRules").checked &&
      cleanText(item.merchant) &&
      cleanText(item.category) &&
      item.type !== "transfer"
    ) {
      const key = slugText(item.merchant);

      if (merchantRules[key] !== item.category) {
        merchantRules[key] = item.category;
        rulesChanged = true;
      }
    }
  }

  if (
    rulesChanged ||
    transferRulesChanged
  ) {
    state.settings = {
      ...state.settings,
      merchantCategoryRules:
        merchantRules,
      transferAccountRules:
        transferAccountRules
    };

    await saveProfileSettings(
      state.user.uid,
      state.settings
    );
  }

  setNotice(
    $("scanMessage"),
    "success",
    `${created} transaksi disimpan. ${duplicate} duplikat dilewati.${
      rulesChanged
        ? " Koreksi kategori merchant sudah dipelajari."
        : ""
    }${
      transferRulesChanged
        ? " Pemetaan akun transfer juga sudah dipelajari."
        : ""
    }`
  );
  } finally {scanSaving=false;renderScanCandidates();}
}

let authGeneration=0;
async function initializeUser(user) {
  const generation=++authGeneration;
  resetState();
  resetExperience();
  state.user = user;
  userEmail.textContent = user.email || "-";
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  syncStatus.textContent = "Memuat data...";

  const loaded = await loadUserSettings(user.uid);
  if(generation!==authGeneration||state.user?.uid!==user.uid)return;
  state.settings = loaded.profile;
  state.creditSettings = loaded.credit;
  state.hideBalances = state.settings.hideBalanceDefault !== false;

  $("toggleBalanceButton").textContent =
    state.hideBalances ? "Tampilkan saldo" : "Sembunyikan saldo";

  $("transactionDate").value = formatDateLocal();
  $("recurringStart").value = formatDateLocal();
  $("budgetMonth").value = monthKey();
  $("reportMonth").value = monthKey();

  await loadBudget(monthKey());
  if(generation!==authGeneration||state.user?.uid!==user.uid)return;
  await loadExperience(user.uid);
  if(generation!==authGeneration||state.user?.uid!==user.uid)return;

  state.unsubscribe.push(
    listenTransactions(
      user.uid,
      (items) => {
        if(generation!==authGeneration||state.user?.uid!==user.uid)return;
        state.transactions = items;
        syncStatus.textContent = isDemo ? "Mode demo · lokal" : "Tersinkronisasi";
        renderAll();
      },
      (error) => {
        syncStatus.textContent = "Gagal sinkron";
        console.error(error);
      }
    )
  );

  state.unsubscribe.push(
    listenRecurringRules(
      user.uid,
      (items) => {
        if(generation!==authGeneration||state.user?.uid!==user.uid)return;
        state.recurringRules = items;
        renderRecurring();
        renderExperience();
      },
      console.error
    )
  );

  renderAll();
  updateTransactionFormMode();
}

function showAuth() {
  authGeneration++;budgetRequest++;
  resetState();
  resetExperience();
  authScreen.classList.remove("hidden");
  appShell.classList.add("hidden");
}

setupAuth({
  loginTab: $("loginTab"),
  registerTab: $("registerTab"),
  form: $("authForm"),
  emailInput: $("authEmail"),
  passwordInput: $("authPassword"),
  submitButton: $("authSubmitButton"),
  messageElement: $("authMessage"),
  onMessage(type, message) {
    if (type === "hide") {
      hideNotice($("authMessage"));
    } else {
      setNotice($("authMessage"), type, message);
    }
  }
});

setupExperience({ setPage, updateTransactionFormMode });
setupNavigation();
setupEvents();
setupManualSuggestions(updateTransactionFormMode);

observeAuth((user) => {
  if (user) {
    initializeUser(user).catch((error) => {
      if(state.user?.uid!==user.uid)return;
      console.error(error);
      setNotice($("authMessage"), "error", error.message);
      showAuth();
    });
  } else {
    showAuth();
  }
});
