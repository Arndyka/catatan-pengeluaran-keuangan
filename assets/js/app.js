import { $, cleanText, downloadText, escapeHtml, formatDateId, formatDateLocal, formatRupiah, hideNotice, monthKey, parseLocalDate, setNotice, slugText } from "./utils.js";
import { setupAuth, observeAuth, logout } from "./auth.js";
import { state, resetState } from "./state.js";
import { DEFAULT_CREDIT_SETTINGS, DEFAULT_SETTINGS, balanceSheet, buildTransaction, deriveLedger, incomeStatement } from "./accounting.js";
import { loadUserSettings, saveCreditSettings, saveProfileSettings, addAccount, toggleAccountActive, accountOptions } from "./settings.js";
import { listenTransactions, deleteTransaction, deleteAllTransactions, listenRecurringRules, saveRecurringRule, deleteRecurringRule, getBudgetPlan, saveBudgetPlan, migrateLegacyCollections } from "./repository.js";
import { saveTransaction, transactionTypeLabel } from "./transactions.js";
import { dueOccurrences, postDueRules } from "./recurring.js";
import { budgetAnalysis } from "./budget.js";
import { creditCardSnapshot } from "./credit-card.js";
import { buildMonthlyReport } from "./reports.js";
import { scanStatementFiles } from "./scanner.js";

const authScreen = $("authScreen");
const appShell = $("appShell");
const userEmail = $("userEmail");
const syncStatus = $("syncStatus");
const pageEyebrow = $("pageEyebrow");
const pageTitle = $("pageTitle");

const PAGE_META = {
  dashboard: ["Overview", "Dashboard"],
  transactions: ["Journal", "Transaksi"],
  recurring: ["Automation", "Transaksi Berulang"],
  "credit-card": ["Liability", "Kartu Kredit"],
  budget: ["Planning", "Budget"],
  reports: ["Accounting Reports", "Laporan Bulanan"],
  scanner: ["OCR / PDF", "Review Transaksi"],
  settings: ["Configuration", "Pengaturan"]
};

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

function setPage(page) {
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
  history.replaceState(null, "", `#${activePage}`);
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
    if (!element) return;
    const previous = element.value;
    element.innerHTML = accountOptionsHtml(previous);
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
      $("sourceAccount").value
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
              <td>${tx.journalCheck?.valid ? "Seimbang" : "Periksa"}</td>
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

function renderRecurring() {
  const due = state.recurringRules.flatMap((rule) =>
    dueOccurrences(rule).map((occurrence) => ({
      rule,
      occurrence
    }))
  );

  $("dueRecurringList").innerHTML = due.length
    ? due.map(({ rule, occurrence }) => `
        <article class="list-card">
          <div>
            <strong>${escapeHtml(rule.name)}</strong>
            <p>${escapeHtml(occurrence.date)} · ${formatRupiah(rule.amount)}</p>
          </div>
          <span class="pill">Jatuh jadwal</span>
        </article>
      `).join("")
    : `<div class="empty-state">Tidak ada transaksi yang jatuh jadwal.</div>`;

  $("recurringRuleList").innerHTML = state.recurringRules.length
    ? state.recurringRules.map((rule) => `
        <article class="list-card">
          <div>
            <strong>${escapeHtml(rule.name)}</strong>
            <p>Tanggal ${rule.dayOfMonth} · ${formatRupiah(rule.amount)} · ${escapeHtml(transactionTypeLabel(rule.type))}</p>
          </div>
          <button class="small-btn danger" data-delete-recurring="${rule.id}" type="button">Hapus</button>
        </article>
      `).join("")
    : `<div class="empty-state">Belum ada aturan berulang.</div>`;
}

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
    ["Pembayaran setelah cetak", money(snapshot.paymentsAfterStatement)]
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

  $("officialStatementAmount").value =
    Number(state.creditSettings.officialStatementAmount || 0);
  $("officialStatementDate").value =
    state.creditSettings.officialStatementDate || "";
  $("officialDueDate").value =
    state.creditSettings.officialDueDate || "";
  $("reconciliationNote").value =
    state.creditSettings.reconciliationNote || "";
}

async function loadBudget(month) {
  state.budgetPlan = await getBudgetPlan(state.user.uid, month);
  renderBudget();
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
      <strong>${analysis.percentageValid ? "Valid" : "Lebih dari 100%"}</strong>
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
              <div class="progress-fill ${item.overBudget ? "over" : ""}" style="width:${Math.min(100, item.usage)}%"></div>
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
    ["Arus Kas Investasi", -report.cashFlow.investingOutflow],
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

  $("ccLimitInput").value = Number(state.creditSettings.limit || 0);
  $("ccStatementDayInput").value = Number(state.creditSettings.statementDay || 7);
  $("ccDueDaysInput").value = Number(state.creditSettings.dueDays || 20);
  $("ccReminderDaysInput").value = Number(state.creditSettings.reminderDays || 5);
  $("ccMinimumPercentInput").value = Number(state.creditSettings.minimumPaymentPercent || 5);
  $("ccMinimumFloorInput").value = Number(state.creditSettings.minimumPaymentFloor || 50000);
  $("ccInterestInput").value = Number(state.creditSettings.monthlyInterestPercent || 1.75);
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
    ["Investasi", -report.cashFlow.investingOutflow],
    ["Pembayaran Liabilitas", -report.cashFlow.financingOutflow],
    ["Perubahan Kas Bersih", report.cashFlow.netCashFlow]
  ];

  return rows.map((row) =>
    row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")
  ).join("\n");
}

function setupNavigation() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  const requested = window.location.hash.replace("#", "");
  setPage(PAGE_META[requested] ? requested : "dashboard");
}

function setupEvents() {
  $("logoutButton").addEventListener("click", logout);

  $("toggleBalanceButton").addEventListener("click", async () => {
    state.hideBalances = !state.hideBalances;
    $("toggleBalanceButton").textContent =
      state.hideBalances ? "Show Saldo" : "Hide Saldo";

    state.settings.hideBalanceDefault = state.hideBalances;
    await saveProfileSettings(state.user.uid, state.settings);
    renderAll();
  });

  $("transactionType").addEventListener("change", updateTransactionFormMode);

  $("transactionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideNotice($("transactionMessage"));

    const type = $("transactionType").value;

    try {
      const result = await saveTransaction(
        state.user.uid,
        {
          type,
          date: $("transactionDate").value,
          amount: Number($("transactionAmount").value),
          sourceAccountId: $("sourceAccount").value,
          destinationAccountId: $("destinationAccount").value,
          category: $("transactionCategory").value,
          merchant: $("transactionMerchant").value,
          description: $("transactionDescription").value,
          installmentTenor: Number($("installmentTenor").value || 1),
          origin: "manual"
        },
        state.settings
      );

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

  $("recurringForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    await saveRecurringRule(state.user.uid, {
      name: cleanText($("recurringName").value),
      type: $("recurringType").value,
      dayOfMonth: Number($("recurringDay").value),
      amount: Number($("recurringAmount").value),
      sourceAccountId: $("recurringSource").value,
      destinationAccountId: $("recurringDestination").value,
      category: cleanText($("recurringCategory").value),
      startDate: $("recurringStart").value,
      endDate: $("recurringEnd").value,
      active: true,
      lastPostedPeriod: ""
    });

    setNotice($("recurringMessage"), "success", "Aturan transaksi berulang disimpan.");
    event.target.reset();
    $("recurringDay").value = "1";
    $("recurringStart").value = formatDateLocal();
  });

  $("postDueRecurringButton").addEventListener("click", async () => {
    const result = await postDueRules(
      state.user.uid,
      state.recurringRules,
      state.settings
    );

    alert(`${result.created} transaksi dibuat. ${result.duplicate} duplikat dilewati.`);
  });

  $("recurringRuleList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-recurring]");
    if (!button) return;
    await deleteRecurringRule(state.user.uid, button.dataset.deleteRecurring);
  });

  $("creditReconcileForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    state.creditSettings = {
      ...state.creditSettings,
      officialStatementAmount: Number($("officialStatementAmount").value || 0),
      officialStatementDate: $("officialStatementDate").value,
      officialDueDate: $("officialDueDate").value,
      reconciliationNote: cleanText($("reconciliationNote").value)
    };

    await saveCreditSettings(state.user.uid, state.creditSettings);
    setNotice($("creditReconcileMessage"), "success", "Rekonsiliasi kartu kredit disimpan.");
    renderCreditCard();
  });

  $("budgetMonth").addEventListener("change", () => {
    loadBudget($("budgetMonth").value);
  });

  $("budgetForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const item = {
      id: crypto.randomUUID(),
      name: cleanText($("budgetName").value),
      category: $("budgetCategory").value,
      method: $("budgetMethod").value,
      value: Number($("budgetValue").value)
    };

    state.budgetPlan.items = [...state.budgetPlan.items, item];
    await saveBudgetPlan(
      state.user.uid,
      state.budgetPlan.month,
      state.budgetPlan
    );

    setNotice($("budgetMessage"), "success", "Pos budget ditambahkan.");
    event.target.reset();
    renderBudget();
  });

  $("budgetList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-budget]");
    if (!button) return;

    state.budgetPlan.items = state.budgetPlan.items.filter(
      (item) => item.id !== button.dataset.deleteBudget
    );

    await saveBudgetPlan(
      state.user.uid,
      state.budgetPlan.month,
      state.budgetPlan
    );

    renderBudget();
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

    try {
      state.settings = addAccount(state.settings, {
        name: $("accountName").value,
        type: $("accountType").value,
        subtype: $("accountSubtype").value
      });

      await saveProfileSettings(state.user.uid, state.settings);
      setNotice($("accountMessage"), "success", "Akun baru disimpan dan tersinkronisasi.");
      event.target.reset();
      renderAll();
    } catch (error) {
      setNotice($("accountMessage"), "error", error.message);
    }
  });

  $("accountSettingsList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-toggle-account]");
    if (!button) return;

    state.settings = toggleAccountActive(
      state.settings,
      button.dataset.toggleAccount
    );

    await saveProfileSettings(state.user.uid, state.settings);
    renderAll();
  });

  $("creditSettingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    state.creditSettings = {
      ...state.creditSettings,
      limit: Number($("ccLimitInput").value),
      statementDay: Number($("ccStatementDayInput").value),
      dueDays: Number($("ccDueDaysInput").value),
      reminderDays: Number($("ccReminderDaysInput").value),
      minimumPaymentPercent: Number($("ccMinimumPercentInput").value),
      minimumPaymentFloor: Number($("ccMinimumFloorInput").value),
      monthlyInterestPercent: Number($("ccInterestInput").value)
    };

    await saveCreditSettings(state.user.uid, state.creditSettings);
    setNotice($("creditSettingsMessage"), "success", "Pengaturan kartu kredit disimpan ke Firestore.");
    renderAll();
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

  $("scanButton").addEventListener("click", scanFiles);

  $("cancelScanButton").addEventListener("click", () => {
    scanCancelled = true;
    $("cancelScanButton").disabled = true;
    $("cancelScanButton").textContent = "Membatalkan...";
  });

  $("scanReviewContainer").addEventListener("click", handleScanReviewClick);
}

let scanCandidates = [];
let scanStatements = [];
let scanCancelled = false;

async function scanFiles() {
  const files = [...($("scanInput").files || [])];
  const pdfPassword = $("pdfPasswordInput").value;

  if (!files.length) {
    setNotice($("scanMessage"), "error", "Pilih file terlebih dahulu.");
    return;
  }

  const genericAsset =
    state.settings.accounts.find(
      (account) => account.type === "asset"
    )?.id;

  const findBankAccount = (pattern) =>
    state.settings.accounts.find(
      (account) =>
        account.type === "asset" &&
        pattern.test(account.name)
    )?.id || genericAsset;

  const bankAccountMap = {
    mandiri: findBankAccount(/mandiri/i),
    bca: findBankAccount(/bca|bank central asia/i),
    krom: findBankAccount(/krom/i),
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
  $("scanReviewContainer").innerHTML = "";

  try {
    const result = await scanStatementFiles({
      files,
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
            : `OCR machine-learning ${progress.fileName} · halaman ${progress.pageNumber}/${pageCount}`;
      }
    });

    scanCandidates = result.candidates;
    scanStatements = result.statements;

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
      `${scanCandidates.length} transaksi ditemukan. ${nativeCount} halaman dibaca langsung dari PDF dan ${ocrCount} halaman memakai OCR fallback.`
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
                    ${statement.nativePages} parser native ·
                    ${statement.ocrPages} OCR ML fallback
                  </p>
                </div>
                <span class="${statusClass}">
                  ${statusText}
                </span>
              </div>

              <div class="statement-summary-grid">
                <div class="statement-summary-item">
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
                  <p>Dana Masuk Terbaca</p>
                  <strong>${money(reconciliation.totalIncoming || 0)}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Dana Keluar Terbaca</p>
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
                  <p>Selisih Saldo Akhir</p>
                  <strong class="${statusClass}">
                    ${
                      reconciliation.closingDifference === null ||
                      reconciliation.closingDifference === undefined
                        ? "-"
                        : money(reconciliation.closingDifference)
                    }
                  </strong>
                </div>

                <div class="statement-summary-item">
                  <p>Selisih Dana Masuk</p>
                  <strong class="${
                    reconciliation.incomingDifference &&
                    Math.abs(reconciliation.incomingDifference) > 2
                      ? "validation-error"
                      : "validation-ok"
                  }">
                    ${
                      reconciliation.incomingDifference === null ||
                      reconciliation.incomingDifference === undefined
                        ? "-"
                        : money(reconciliation.incomingDifference)
                    }
                  </strong>
                </div>

                <div class="statement-summary-item">
                  <p>Selisih Dana Keluar</p>
                  <strong class="${
                    reconciliation.outgoingDifference &&
                    Math.abs(reconciliation.outgoingDifference) > 2
                      ? "validation-error"
                      : "validation-ok"
                  }">
                    ${
                      reconciliation.outgoingDifference === null ||
                      reconciliation.outgoingDifference === undefined
                        ? "-"
                        : money(reconciliation.outgoingDifference)
                    }
                  </strong>
                </div>

                <div class="statement-summary-item">
                  <p>Transfer Internal Dipasangkan</p>
                  <strong>${statement.internalPairCount || 0}</strong>
                </div>

                <div class="statement-summary-item">
                  <p>Halaman Gagal</p>
                  <strong class="${
                    statement.failedPages
                      ? "validation-warning"
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
    return `<span class="validation-ok">Saldo cocok</span>`;
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
  $("scanReviewContainer").innerHTML =
    scanCandidates.length
      ? `
        <div class="scan-save-toolbar">
          <p>
            Mandiri, BCA, dan Krom sudah dipetakan ke rekening masing-masing.
            Transfer internal Krom tidak dipilih otomatis agar tidak dihitung ganda.
          </p>
          <button id="saveScanCandidates" class="btn btn-primary" type="button">
            Simpan Kandidat Terpilih
          </button>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Pilih</th>
                <th>Bank</th>
                <th>Subrekening</th>
                <th>Hal./No.</th>
                <th>Tanggal</th>
                <th>Waktu</th>
                <th>Tipe</th>
                <th>Akun Sumber</th>
                <th>Akun Tujuan</th>
                <th>Kategori</th>
                <th>Nominal</th>
                <th>Saldo Setelah</th>
                <th>Merchant</th>
                <th>Keterangan</th>
                <th>Validasi</th>
                <th>Confidence</th>
                <th>Metode</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${scanCandidates.map((item, index) => `
                <tr
                  data-scan-index="${index}"
                  class="${item.internalMovement ? "internal-movement-row" : ""}"
                >
                  <td>
                    <input
                      data-scan-field="selected"
                      type="checkbox"
                      ${item.selected ? "checked" : ""}
                    >
                  </td>

                  <td>
                    <span class="bank-detection-badge ${item.bank}">
                      ${escapeHtml(item.bankLabel || item.bank)}
                    </span>
                  </td>

                  <td>
                    <strong>${escapeHtml(item.statementAccountName || "-")}</strong>
                    <div class="statement-subaccount">
                      ${escapeHtml(item.statementAccountNumber || "")}
                    </div>
                  </td>

                  <td>
                    ${item.sourcePage || "-"} /
                    ${item.sourceRow || "-"}
                  </td>

                  <td>
                    <input
                      data-scan-field="date"
                      type="date"
                      value="${item.date || ""}"
                    >
                  </td>

                  <td>
                    <input
                      data-scan-field="time"
                      type="time"
                      step="1"
                      value="${item.time || ""}"
                    >
                  </td>

                  <td>
                    <select data-scan-field="type">
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
                      item.possibleOwnTransfer
                        ? `<div class="possible-transfer-warning">Kemungkinan transfer antar rekening sendiri</div>`
                        : ""
                    }
                  </td>

                  <td>
                    <select data-scan-field="sourceAccountId">
                      ${accountOptionsHtml(
                        item.sourceAccountId,
                        { includeLiabilities: false }
                      )}
                    </select>
                  </td>

                  <td>
                    <select data-scan-field="destinationAccountId">
                      ${accountOptionsHtml(
                        item.destinationAccountId,
                        { includeLiabilities: false }
                      )}
                    </select>
                  </td>

                  <td>
                    <input
                      data-scan-field="category"
                      type="text"
                      value="${escapeHtml(item.category || "Lainnya")}"
                    >
                  </td>

                  <td>
                    <input
                      data-scan-field="amount"
                      type="number"
                      min="1"
                      value="${item.amount || 0}"
                    >
                  </td>

                  <td>
                    ${
                      item.balanceAfter === null ||
                      item.balanceAfter === undefined
                        ? "-"
                        : money(item.balanceAfter)
                    }
                  </td>

                  <td>
                    <input
                      data-scan-field="merchant"
                      type="text"
                      value="${escapeHtml(item.merchant || "")}"
                    >
                  </td>

                  <td>
                    <input
                      class="scan-description-input"
                      data-scan-field="description"
                      type="text"
                      value="${escapeHtml(item.description || "")}"
                    >
                  </td>

                  <td>${validationLabel(item)}</td>

                  <td>
                    <span class="badge ${confidenceClass(item.confidence)}">
                      ${Math.round(Number(item.confidence || 0) * 100)}%
                    </span>
                  </td>

                  <td>${escapeHtml(item.extractionMethod || "-")}</td>

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
  });
}
async function handleScanReviewClick(event) {
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

  let created = 0;
  let duplicate = 0;
  let rulesChanged = false;

  const merchantRules = {
    ...(state.settings.merchantCategoryRules || {})
  };

  for (
    const item of scanCandidates.filter(
      (candidate) => candidate.selected
    )
  ) {
    const result = await saveTransaction(
      state.user.uid,
      {
        ...item,
        description:
          item.time
            ? `${item.description} · ${item.time}`
            : item.description,
        sourceMeta: {
          fileName: item.sourceFile,
          page: item.sourcePage,
          row: item.sourceRow,
          extractionMethod: item.extractionMethod,
          bank: item.bank,
          statementAccountName: item.statementAccountName,
          statementAccountNumber: item.statementAccountNumber,
          movementReference: item.movementReference,
          internalMovement: item.internalMovement === true
        },
        externalBalance: item.balanceAfter,
        validationStatus: item.validationStatus,
        confidence: item.confidence
      },
      state.settings
    );

    if (result.created) {
      created += 1;
    } else {
      duplicate += 1;
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

  if (rulesChanged) {
    state.settings = {
      ...state.settings,
      merchantCategoryRules: merchantRules
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
    }`
  );
}

async function initializeUser(user) {
  resetState();
  state.user = user;
  userEmail.textContent = user.email || "-";
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  syncStatus.textContent = "Memuat data...";

  const loaded = await loadUserSettings(user.uid);
  state.settings = loaded.profile;
  state.creditSettings = loaded.credit;
  state.hideBalances = state.settings.hideBalanceDefault !== false;

  $("toggleBalanceButton").textContent =
    state.hideBalances ? "Show Saldo" : "Hide Saldo";

  $("transactionDate").value = formatDateLocal();
  $("recurringStart").value = formatDateLocal();
  $("budgetMonth").value = monthKey();
  $("reportMonth").value = monthKey();

  await loadBudget(monthKey());

  state.unsubscribe.push(
    listenTransactions(
      user.uid,
      (items) => {
        state.transactions = items;
        syncStatus.textContent = "Tersinkronisasi";
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
        state.recurringRules = items;
        renderRecurring();
      },
      console.error
    )
  );

  renderAll();
  updateTransactionFormMode();
}

function showAuth() {
  resetState();
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

setupNavigation();
setupEvents();

observeAuth((user) => {
  if (user) {
    initializeUser(user).catch((error) => {
      console.error(error);
      setNotice($("authMessage"), "error", error.message);
      showAuth();
    });
  } else {
    showAuth();
  }
});
