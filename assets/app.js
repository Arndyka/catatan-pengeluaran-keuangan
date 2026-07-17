import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTI3nR4CA5HdVGeP3zg7YibS2kfEvcCNc",
  authDomain: "catatan-pengeluaran-keua-19af4.firebaseapp.com",
  databaseURL: "https://catatan-pengeluaran-keua-19af4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "catatan-pengeluaran-keua-19af4",
  storageBucket: "catatan-pengeluaran-keua-19af4.firebasestorage.app",
  messagingSenderId: "582629555317",
  appId: "1:582629555317:web:4e8a943c221f53f96bcc3c",
  measurementId: "G-GDWT3NWNMH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase Auth persistence fallback:", error);
});

const $ = (id) => document.getElementById(id);

let authMode = "login";
let currentUser = null;
let txMode = "income";
let incomes = [];
let expenses = [];
let transfers = [];
let unsubscribeList = [];
let bankChart = null;
let cashflowChart = null;
let scannedItems = [];
let singleScanItem = null;
let customBanks = [];
let budgetPlans = [];
let balanceHidden = false;

const authScreen = $("authScreen");
const appShell = $("appShell");
const loginTab = $("loginTab");
const registerTab = $("registerTab");
const authForm = $("authForm");
const authEmail = $("authEmail");
const authPassword = $("authPassword");
const authButton = $("authButton");
const authMessage = $("authMessage");
const logoutButton = $("logoutButton");
const userEmail = $("userEmail");

const incomeTab = $("incomeTab");
const expenseTab = $("expenseTab");
const transferTab = $("transferTab");
const transactionForm = $("transactionForm");
const tanggalInput = $("tanggalInput");
const bankInput = $("bankInput");
const singleBankWrap = $("singleBankWrap");
const transferBankWrap = $("transferBankWrap");
const fromBankInput = $("fromBankInput");
const toBankInput = $("toBankInput");
const incomeSourceWrap = $("incomeSourceWrap");
const incomeSourceInput = $("incomeSourceInput");
const expenseCategoryWrap = $("expenseCategoryWrap");
const categoryInput = $("categoryInput");
const nominalInput = $("nominalInput");
const keteranganInput = $("keteranganInput");
const formMessage = $("formMessage");

const remainingBalanceEl = $("remainingBalance");
const totalIncomeEl = $("totalIncome");
const totalExpenseEl = $("totalExpense");
const bankCountEl = $("bankCount");
const bankBalanceGrid = $("bankBalanceGrid");
const bankBalanceChart = $("bankBalanceChart");
const cashflowChartEl = $("cashflowChart");

const scanFileInput = $("scanFileInput");
const scanPreviewBox = $("scanPreviewBox");
const scanButton = $("scanButton");
const scanMessage = $("scanMessage");
const singleReviewCard = $("singleReviewCard");
const singleConfidenceBadge = $("singleConfidenceBadge");
const singleScanForm = $("singleScanForm");
const singleType = $("singleType");
const singleTanggal = $("singleTanggal");
const singleBank = $("singleBank");
const singleToBankWrap = $("singleToBankWrap");
const singleToBank = $("singleToBank");
const singleMerchant = $("singleMerchant");
const singleKategori = $("singleKategori");
const singleNominal = $("singleNominal");
const singleKeterangan = $("singleKeterangan");
const singleScanNote = $("singleScanNote");
const batchReviewCard = $("batchReviewCard");
const batchCountBadge = $("batchCountBadge");
const batchTableContainer = $("batchTableContainer");
const selectAllBatchButton = $("selectAllBatchButton");
const saveBatchButton = $("saveBatchButton");

const newBankInput = $("newBankInput");
const addBankButton = $("addBankButton");
const creditOutstanding = $("creditOutstanding");
const creditStatus = $("creditStatus");
const budgetPlanForm = $("budgetPlanForm");
const budgetPlanName = $("budgetPlanName");
const budgetPlanPercent = $("budgetPlanPercent");
const budgetPlanMessage = $("budgetPlanMessage");
const budgetPlanList = $("budgetPlanList");
const dedupeButton = $("dedupeButton");

const advisorButton = $("advisorButton");
const advisorOutput = $("advisorOutput");

const typeFilter = $("typeFilter");
const searchInput = $("searchInput");
const historyContainer = $("historyContainer");
const toggleBalanceButton = $("toggleBalanceButton");
const downloadCSVButton = $("downloadCSVButton");
const downloadExcelButton = $("downloadExcelButton");

const editModal = $("editModal");
const editForm = $("editForm");
const editId = $("editId");
const editType = $("editType");
const editTanggal = $("editTanggal");
const editBank = $("editBank");
const editToBankWrap = $("editToBankWrap");
const editToBank = $("editToBank");
const editKategori = $("editKategori");
const editNominal = $("editNominal");
const editKeterangan = $("editKeterangan");
const editMessage = $("editMessage");
const closeEditModal = $("closeEditModal");
const cancelEditButton = $("cancelEditButton");

const BANK_ALIASES = {
  mandiri: ["mandiri", "bank mandiri", "livin", "livin mandiri"],
  bca: ["bca", "bank bca", "bank central asia", "mybca"],
  bri: ["bri", "bank bri", "brimo"],
  bni: ["bni", "bank bni"],
  bsi: ["bsi", "bank syariah indonesia"],
  cimb: ["cimb", "cimb niaga", "octo"],
  permata: ["permata", "bank permata"],
  danamon: ["danamon", "bank danamon"],
  jago: ["jago", "bank jago"],
  jenius: ["jenius"],
  seabank: ["seabank", "sea bank"],
  krom: ["krom"],
  dana: ["dana"],
  gopay: ["gopay", "go pay", "go-pay"],
  ovo: ["ovo"],
  shopeepay: ["shopeepay", "shopee pay"],
  linkaja: ["linkaja", "link aja"],
  tunai: ["cash", "tunai"],
  mandiri_credit_card: ["mandiri credit card", "kartu kredit mandiri", "kk mandiri", "mandiri kartu kredit"]
};

const BANK_DISPLAY = {
  mandiri: "Mandiri",
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  bsi: "BSI",
  cimb: "CIMB Niaga",
  permata: "Permata",
  danamon: "Danamon",
  jago: "Jago",
  jenius: "Jenius",
  seabank: "SeaBank",
  krom: "Krom",
  dana: "DANA",
  gopay: "GoPay",
  ovo: "OVO",
  shopeepay: "ShopeePay",
  linkaja: "LinkAja",
  tunai: "Tunai",
  mandiri_credit_card: "Mandiri Credit Card"
};

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function slugText(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeBank(value) {
  const raw = cleanText(value);
  const slug = slugText(raw);

  for (const [key, aliases] of Object.entries(BANK_ALIASES)) {
    if (aliases.includes(slug)) {
      return { key, display: BANK_DISPLAY[key] };
    }
  }

  if (!slug) return { key: "", display: "" };

  return {
    key: slug.replace(/\s+/g, "_"),
    display: raw.split(" ").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ")
  };
}


function getDefaultBankOptions() {
  return [
    "Mandiri",
    "Mandiri Credit Card",
    "BCA",
    "BRI",
    "BNI",
    "BSI",
    "CIMB Niaga",
    "Permata",
    "Danamon",
    "Jago",
    "Jenius",
    "SeaBank",
    "Krom",
    "DANA",
    "GoPay",
    "OVO",
    "ShopeePay",
    "LinkAja",
    "Tunai"
  ];
}

function getBankStorageKey() {
  return `spendly_custom_banks_${currentUser?.uid || "guest"}`;
}

function loadCustomBanks() {
  try {
    customBanks = JSON.parse(localStorage.getItem(getBankStorageKey()) || "[]");
  } catch (_) {
    customBanks = [];
  }
}

function saveCustomBanks() {
  localStorage.setItem(getBankStorageKey(), JSON.stringify(customBanks));
}

function getBankOptions() {
  const all = [...getDefaultBankOptions(), ...customBanks];
  const map = new Map();

  all.forEach((name) => {
    const normalized = normalizeBank(name);
    if (normalized.key) map.set(normalized.key, normalized.display);
  });

  return [...map.entries()].map(([key, display]) => ({ key, display }));
}

function bankOptionsHtml(selectedValue = "") {
  const selected = normalizeBank(selectedValue);
  return [
    `<option value="">Pilih Bank/Dompet</option>`,
    ...getBankOptions().map((bank) => {
      const isSelected = bank.key === selected.key || bank.display === selectedValue;
      return `<option value="${bank.display}" ${isSelected ? "selected" : ""}>${bank.display}</option>`;
    })
  ].join("");
}

function populateBankSelects() {
  const ids = [
    "bankInput",
    "fromBankInput",
    "toBankInput",
    "singleBank",
    "singleToBank",
    "editBank",
    "editToBank"
  ];

  ids.forEach((id) => {
    const element = $(id);
    if (!element) return;
    const previous = element.value;
    element.innerHTML = bankOptionsHtml(previous);
  });
}

function addCustomBank() {
  const value = cleanText(newBankInput.value);
  if (!value) return;

  const normalized = normalizeBank(value);
  const exists = getBankOptions().some((bank) => bank.key === normalized.key);

  if (!exists) {
    customBanks.push(normalized.display);
    saveCustomBanks();
  }

  newBankInput.value = "";
  populateBankSelects();
}


function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDateLocal(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function setNotice(el, type, message) {
  if (!el) return;
  el.className = `notice ${type}`;
  el.textContent = message;
}

function hideNotice(el) {
  if (!el) return;
  el.className = "notice hidden";
  el.textContent = "";
}

function authErrorMessage(error) {
  const messages = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/email-already-in-use": "Email ini sudah terdaftar. Gunakan Login.",
    "auth/weak-password": "Password terlalu lemah. Minimal 6 karakter.",
    "auth/user-not-found": "Akun tidak ditemukan. Pilih Register dulu.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah. Jika belum punya akun, pilih Register dulu.",
    "auth/network-request-failed": "Koneksi internet bermasalah.",
    "auth/operation-not-allowed": "Email/Password belum aktif di Firebase Authentication.",
    "auth/unauthorized-domain": "Domain belum diizinkan. Tambahkan arndyka.github.io di Firebase Authorized Domains.",
    "permission-denied": "Akses database ditolak. Periksa Firestore Rules."
  };
  return messages[error?.code] || error?.message || "Terjadi error.";
}

function setAuthMode(mode) {
  authMode = mode;
  loginTab.classList.toggle("active", mode === "login");
  registerTab.classList.toggle("active", mode === "register");
  authButton.textContent = mode === "login" ? "Login" : "Register";
  authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
  hideNotice(authMessage);
}

async function handleAuth(event) {
  event.preventDefault();

  const email = cleanText(authEmail.value);
  const password = authPassword.value;

  if (!email || !password) {
    setNotice(authMessage, "error", "Email dan password wajib diisi.");
    return;
  }

  if (password.length < 6) {
    setNotice(authMessage, "error", "Password minimal 6 karakter.");
    return;
  }

  authButton.disabled = true;
  authButton.textContent = authMode === "login" ? "Login..." : "Register...";

  try {
    await authPersistenceReady;

    if (authMode === "login") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    setNotice(authMessage, "error", authErrorMessage(error));
  } finally {
    authButton.disabled = false;
    authButton.textContent = authMode === "login" ? "Login" : "Register";
  }
}

function showAuth() {
  authScreen.classList.remove("hidden");
  appShell.classList.add("hidden");
}

function showApp(user) {
  userEmail.textContent = user.email || "-";
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function collectionRef(name) {
  return collection(db, "users", currentUser.uid, name);
}

function docRef(name, id) {
  return doc(db, "users", currentUser.uid, name, id);
}

function clearSubscriptions() {
  unsubscribeList.forEach((fn) => fn());
  unsubscribeList = [];
}

function subscribeData() {
  clearSubscriptions();

  unsubscribeList.push(onSnapshot(query(collectionRef("incomes"), orderBy("tanggal", "desc")), (snapshot) => {
    incomes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }, (error) => setNotice(formMessage, "error", authErrorMessage(error))));

  unsubscribeList.push(onSnapshot(query(collectionRef("expenses"), orderBy("tanggal", "desc")), (snapshot) => {
    expenses = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }, (error) => setNotice(formMessage, "error", authErrorMessage(error))));

  unsubscribeList.push(onSnapshot(query(collectionRef("transfers"), orderBy("tanggal", "desc")), (snapshot) => {
    transfers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }, (error) => setNotice(formMessage, "error", authErrorMessage(error))));
}

function setTxMode(mode) {
  txMode = mode;

  incomeTab.classList.toggle("active", mode === "income");
  expenseTab.classList.toggle("active", mode === "expense");
  transferTab.classList.toggle("active", mode === "transfer");

  singleBankWrap.classList.toggle("hidden", mode === "transfer");
  transferBankWrap.classList.toggle("hidden", mode !== "transfer");
  incomeSourceWrap.classList.toggle("hidden", mode !== "income");
  expenseCategoryWrap.classList.toggle("hidden", mode !== "expense");

  hideNotice(formMessage);
}

async function saveManualTransaction(event) {
  event.preventDefault();
  hideNotice(formMessage);

  const tanggal = tanggalInput.value;
  const nominal = Number(nominalInput.value);
  const keterangan = cleanText(keteranganInput.value);

  if (!tanggal || !nominal || nominal <= 0) {
    setNotice(formMessage, "error", "Tanggal dan nominal wajib diisi.");
    return;
  }

  try {
    if (txMode === "income") {
      const bank = normalizeBank(bankInput.value);
      const sumber = cleanText(incomeSourceInput.value) || "Pemasukan";

      if (!bank.key) throw new Error("Bank/Dompet wajib diisi.");

      const payload = {
        tanggal,
        bankKey: bank.key,
        bankName: bank.display,
        sumber,
        nominal,
        keterangan,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (isDuplicateTransaction("income", payload)) {
        setNotice(formMessage, "info", "Data yang sama sudah ada, jadi tidak disimpan ulang.");
        return;
      }

      await addDoc(collectionRef("incomes"), payload);
    }

    if (txMode === "expense") {
      const bank = normalizeBank(bankInput.value);
      const kategori = categoryInput.value || "Lainnya";

      if (!bank.key) throw new Error("Bank/Dompet wajib diisi.");

      const payload = {
        tanggal,
        bankKey: bank.key,
        bankName: bank.display,
        kategori,
        nominal,
        keterangan,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (isDuplicateTransaction("expense", payload)) {
        setNotice(formMessage, "info", "Data yang sama sudah ada, jadi tidak disimpan ulang.");
        return;
      }

      await addDoc(collectionRef("expenses"), payload);
    }

    if (txMode === "transfer") {
      const fromBank = normalizeBank(fromBankInput.value);
      const toBank = normalizeBank(toBankInput.value);

      if (!fromBank.key || !toBank.key) throw new Error("Bank asal dan tujuan wajib diisi.");
      if (fromBank.key === toBank.key) throw new Error("Bank asal dan tujuan tidak boleh sama.");

      const payload = {
        tanggal,
        fromBankKey: fromBank.key,
        fromBankName: fromBank.display,
        toBankKey: toBank.key,
        toBankName: toBank.display,
        nominal,
        keterangan,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (isDuplicateTransaction("transfer", payload)) {
        setNotice(formMessage, "info", "Data yang sama sudah ada, jadi tidak disimpan ulang.");
        return;
      }

      await addDoc(collectionRef("transfers"), payload);
    }

    transactionForm.reset();
    tanggalInput.value = formatDateLocal();
    setNotice(formMessage, "success", "Transaksi berhasil disimpan.");
  } catch (error) {
    setNotice(formMessage, "error", error?.message || authErrorMessage(error));
  }
}

function getBankBalances() {
  const map = new Map();

  const ensure = (key, name) => {
    const safeKey = key || "unknown";
    if (!map.has(safeKey)) {
      map.set(safeKey, {
        key: safeKey,
        name: name || "Belum Dicatat",
        income: 0,
        expense: 0,
        transferIn: 0,
        transferOut: 0,
        balance: 0
      });
    }
    return map.get(safeKey);
  };

  incomes.forEach((item) => {
    const bank = ensure(item.bankKey, item.bankName);
    bank.income += Number(item.nominal || 0);
  });

  expenses.forEach((item) => {
    const bank = ensure(item.bankKey, item.bankName);
    bank.expense += Number(item.nominal || 0);
  });

  transfers.forEach((item) => {
    const from = ensure(item.fromBankKey, item.fromBankName);
    const to = ensure(item.toBankKey, item.toBankName);
    from.transferOut += Number(item.nominal || 0);
    to.transferIn += Number(item.nominal || 0);
  });

  return [...map.values()].map((bank) => ({
    ...bank,
    balance: bank.income - bank.expense + bank.transferIn - bank.transferOut
  })).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

function renderAll() {
  renderStats();
  renderBanks();
  renderCharts();
  renderCreditCardSummary();
  renderBudgetPlans();
  renderHistory();
}

function renderStats() {
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const remaining = totalIncome - totalExpense;

  totalIncomeEl.textContent = maskMoney(totalIncome);
  totalExpenseEl.textContent = maskMoney(totalExpense);
  remainingBalanceEl.textContent = maskMoney(remaining);
  bankCountEl.textContent = getBankBalances().length;
}

function renderBanks() {
  const banks = getBankBalances();

  if (!banks.length) {
    bankBalanceGrid.innerHTML = `<div class="empty-state">Belum ada saldo bank/dompet.</div>`;
    return;
  }

  bankBalanceGrid.innerHTML = banks.map((bank) => `
    <article class="bank-card">
      <h3>${bank.name}</h3>
      <div class="balance">${maskMoney(bank.balance)}</div>
      <div class="details">
        Masuk: ${maskMoney(bank.income)}<br>
        Keluar: ${maskMoney(bank.expense)}<br>
        Transfer in: ${maskMoney(bank.transferIn)}<br>
        Transfer out: ${maskMoney(bank.transferOut)}
      </div>
    </article>
  `).join("");
}

function renderCharts() {
  if (typeof Chart === "undefined") return;

  const banks = getBankBalances();
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const remaining = totalIncome - totalExpense;

  if (bankChart) bankChart.destroy();
  bankChart = new Chart(bankBalanceChart, {
    type: "bar",
    data: {
      labels: banks.length ? banks.map((bank) => bank.name) : ["Belum ada data"],
      datasets: [{
        label: "Saldo",
        data: banks.length ? banks.map((bank) => bank.balance) : [0],
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 28,
        maxBarThickness: 34
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatRupiah(ctx.raw || 0) } }
      },
      scales: {
        x: { ticks: { callback: (value) => formatRupiah(value) } },
        y: { grid: { display: false } }
      }
    }
  });

  if (cashflowChart) cashflowChart.destroy();
  cashflowChart = new Chart(cashflowChartEl, {
    type: "bar",
    data: {
      labels: ["Pemasukan", "Pengeluaran", "Sisa Uang"],
      datasets: [{
        label: "Nominal",
        data: [totalIncome, totalExpense, remaining],
        borderRadius: 12,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatRupiah(ctx.raw || 0) } }
      },
      scales: {
        y: { ticks: { callback: (value) => formatRupiah(value) } },
        x: { grid: { display: false } }
      }
    }
  });
}

function typeLabel(type) {
  if (type === "income") return "Pemasukan";
  if (type === "expense") return "Pengeluaran";
  return "Transfer";
}

function collectionName(type) {
  if (type === "income") return "incomes";
  if (type === "expense") return "expenses";
  return "transfers";
}

function allTransactions() {
  const incomeRows = incomes.map((item) => ({
    ...item,
    type: "income",
    bankText: item.bankName || "-",
    categoryText: "Pemasukan",
    title: item.sumber || "Pemasukan"
  }));

  const expenseRows = expenses.map((item) => ({
    ...item,
    type: "expense",
    bankText: item.bankName || "-",
    categoryText: item.kategori || "Lainnya",
    title: item.merchant || item.keterangan || item.kategori || "Pengeluaran"
  }));

  const transferRows = transfers.map((item) => ({
    ...item,
    type: "transfer",
    bankText: `${item.fromBankName || "-"} → ${item.toBankName || "-"}`,
    categoryText: "Transfer",
    title: item.keterangan || "Transfer"
  }));

  return [...incomeRows, ...expenseRows, ...transferRows]
    .sort((a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || "")));
}

function filteredTransactions() {
  const type = typeFilter.value;
  const search = slugText(searchInput.value);

  return allTransactions().filter((item) => {
    const matchType = type === "all" || item.type === type;
    const haystack = slugText([item.tanggal, item.bankText, item.categoryText, item.title, item.keterangan, item.scanNote].join(" "));
    const matchSearch = !search || haystack.includes(search);
    return matchType && matchSearch;
  });
}

function renderHistory() {
  const rows = filteredTransactions();

  if (!rows.length) {
    historyContainer.innerHTML = `<div class="empty-state">Belum ada transaksi.</div>`;
    return;
  }

  historyContainer.innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th>Tanggal</th>
          <th>Tipe</th>
          <th>Bank</th>
          <th>Kategori</th>
          <th>Nominal</th>
          <th>Keterangan</th>
          <th>Catatan Scan</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((item) => `
          <tr>
            <td>${item.tanggal || "-"}</td>
            <td><span class="badge ${item.type}">${typeLabel(item.type)}</span></td>
            <td>${item.bankText}</td>
            <td>${item.categoryText}</td>
            <td>${formatRupiah(item.nominal)}</td>
            <td>${item.keterangan || item.title || "-"}</td>
            <td>${item.scanNote || "-"}</td>
            <td>
              <button class="small-btn" data-edit-id="${item.id}" data-edit-type="${item.type}" type="button">Edit</button>
              <button class="small-btn danger" data-delete-id="${item.id}" data-delete-type="${item.type}" type="button">Hapus</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function findTransaction(type, id) {
  if (type === "income") return incomes.find((item) => item.id === id);
  if (type === "expense") return expenses.find((item) => item.id === id);
  return transfers.find((item) => item.id === id);
}

function openEdit(type, id) {
  const item = findTransaction(type, id);
  if (!item) return;

  editId.value = id;
  editType.value = type;
  editTanggal.value = item.tanggal || formatDateLocal();
  editNominal.value = item.nominal || "";
  editKeterangan.value = item.keterangan || "";
  editToBankWrap.classList.toggle("hidden", type !== "transfer");

  if (type === "income") {
    editBank.value = item.bankName || "";
    editKategori.value = item.sumber || "Pemasukan";
  }

  if (type === "expense") {
    editBank.value = item.bankName || "";
    editKategori.value = item.kategori || "Lainnya";
  }

  if (type === "transfer") {
    editBank.value = item.fromBankName || "";
    editToBank.value = item.toBankName || "";
    editKategori.value = "Transfer";
  }

  hideNotice(editMessage);
  editModal.classList.remove("hidden");
}

function closeEdit() {
  editModal.classList.add("hidden");
}

async function saveEdit(event) {
  event.preventDefault();

  const type = editType.value;
  const id = editId.value;
  const tanggal = editTanggal.value;
  const nominal = Number(editNominal.value);
  const bank = normalizeBank(editBank.value);
  const toBank = normalizeBank(editToBank.value);
  const kategori = cleanText(editKategori.value);
  const keterangan = cleanText(editKeterangan.value);

  if (!tanggal || !nominal || nominal <= 0 || !bank.key) {
    setNotice(editMessage, "error", "Tanggal, bank, dan nominal wajib diisi.");
    return;
  }

  try {
    let payload = { tanggal, nominal, keterangan, updatedAt: serverTimestamp() };

    if (type === "income") {
      payload = { ...payload, bankKey: bank.key, bankName: bank.display, sumber: kategori || "Pemasukan" };
    }

    if (type === "expense") {
      payload = { ...payload, bankKey: bank.key, bankName: bank.display, kategori: kategori || "Lainnya" };
    }

    if (type === "transfer") {
      if (!toBank.key || toBank.key === bank.key) throw new Error("Bank tujuan wajib diisi dan harus berbeda.");
      payload = {
        ...payload,
        fromBankKey: bank.key,
        fromBankName: bank.display,
        toBankKey: toBank.key,
        toBankName: toBank.display
      };
    }

    await updateDoc(docRef(collectionName(type), id), payload);
    closeEdit();
  } catch (error) {
    setNotice(editMessage, "error", error?.message || authErrorMessage(error));
  }
}

async function deleteTransaction(type, id) {
  if (!confirm("Hapus transaksi ini?")) return;
  await deleteDoc(docRef(collectionName(type), id));
}

function buildScanNote(bank, tanggal, kategori, nominal) {
  return `${cleanText(bank || "Bank tidak terbaca")} | ${tanggal || formatDateLocal()} | ${cleanText(kategori || "Lainnya")} | ${formatRupiah(nominal || 0)}`;
}

function cleanOcrLine(line) {
  return String(line || "").replace(/[|_~]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeOcrText(text) {
  return String(text || "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function parseNumberCandidate(raw) {
  let value = String(raw || "").toLowerCase().replace(/rp|idr/g, "").replace(/[^\d,.]/g, "").trim();
  if (!value) return 0;
  if (value.includes(",") && value.includes(".")) value = value.replace(/\./g, "").replace(",", ".");
  else if (value.includes(".")) value = value.replace(/\./g, "");
  else if (value.includes(",")) value = value.replace(",", ".");
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : 0;
}

function extractAmountWithSign(line) {
  const text = String(line || "");
  const signed = text.match(/([+-])\s*(?:rp|idr)?\s*([0-9][0-9.,]{2,})/i);
  if (signed) {
    const amount = parseNumberCandidate(signed[2]);
    return amount >= 1000 ? { sign: signed[1], amount } : null;
  }

  const unsigned = text.match(/(?:rp|idr)\s*([0-9][0-9.,]{2,})/i) || text.match(/([0-9]{1,3}(?:[.,][0-9]{3})+(?:,[0-9]{2})?)/);
  if (unsigned) {
    const amount = parseNumberCandidate(unsigned[1]);
    return amount >= 1000 ? { sign: "", amount } : null;
  }

  return null;
}

function parseDateLine(line) {
  const text = cleanOcrLine(line);
  const currentYear = new Date().getFullYear();

  let match = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;

  match = text.match(/(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;

  const months = {
    jan: "01", januari: "01", january: "01",
    feb: "02", februari: "02", february: "02",
    mar: "03", maret: "03", march: "03",
    apr: "04", april: "04",
    mei: "05", may: "05",
    jun: "06", juni: "06", june: "06",
    jul: "07", juli: "07", july: "07",
    agu: "08", agustus: "08", aug: "08", august: "08",
    sep: "09", september: "09",
    okt: "10", oktober: "10", oct: "10", october: "10",
    nov: "11", november: "11",
    des: "12", desember: "12", dec: "12", december: "12"
  };

  match = text.toLowerCase().match(/(\d{1,2})\s+([a-zA-Z]+)\s*(20\d{2})?/);
  if (match && months[match[2]]) return `${match[3] || currentYear}-${months[match[2]]}-${match[1].padStart(2, "0")}`;

  return "";
}

function extractBank(text) {
  const upper = text.toUpperCase();
  const rules = [
    ["Mandiri", ["MANDIRI", "LIVIN"]],
    ["BCA", ["BCA", "MYBCA", "KLIKBCA"]],
    ["BRI", ["BRI", "BRIMO"]],
    ["BNI", ["BNI"]],
    ["BSI", ["BSI", "BANK SYARIAH INDONESIA"]],
    ["Krom", ["KROM"]],
    ["DANA", ["DANA"]],
    ["GoPay", ["GOPAY", "GO-PAY", "GOJEK"]],
    ["OVO", ["OVO"]],
    ["ShopeePay", ["SHOPEEPAY", "SHOPEE PAY"]]
  ];
  const found = rules.find(([, keys]) => keys.some((key) => upper.includes(key)));
  return found ? found[0] : "";
}

function cleanMerchantName(value) {
  let text = cleanText(value)
    .replace(/^ke\s+/i, "")
    .replace(/^dari\s+/i, "")
    .replace(/[-–—]\s*(cp|id|no|ref).*$/i, "")
    .replace(/\bMANDIRI\s+DIGITA.*$/i, "")
    .replace(/\bDIGITA.*$/i, "")
    .replace(/\s+\d{5,}.*$/g, "")
    .trim();

  const compact = text.toLowerCase().replace(/[^a-z]/g, "");
  if (compact.includes("familymart") || compact.includes("familiymart") || compact.includes("famiymart")) return "FamilyMart";
  return text;
}

function inferMerchant(groupLines) {
  const priority = groupLines.find((line) => /\b(ke|dari)\b\s+[a-zA-Z]/i.test(line));
  if (priority) return cleanMerchantName(priority);

  const ignore = ["qr bayar", "bayar/top-up", "bayar", "top-up", "transfer rupiah", "transfer", "pembayaran qr", "transaksi", "e-statement", "april", "mei", "juni", "juli", "mandiri", "bca", "bri", "bni", "rp", "idr"];
  const candidate = groupLines.find((line) => {
    const lower = line.toLowerCase();
    if (ignore.some((word) => lower.includes(word))) return false;
    if (/^\d+$/.test(line)) return false;
    if (line.length < 3 || line.length > 50) return false;
    return /[a-zA-Z]/.test(line);
  });

  return candidate ? cleanMerchantName(candidate) : "";
}

function inferType(groupLines, sign) {
  const ctx = groupLines.join(" ").toLowerCase();
  if (sign === "+") return "income";
  if (sign === "-") return "expense";
  if (/(qr bayar|bayar\/top.?up|bayar|pembayaran|top.?up|purchase|payment)/.test(ctx)) return "expense";
  if (/(transfer rupiah|transfer|kirim uang)/.test(ctx)) return "transfer";
  if (/(dana masuk|uang masuk|incoming|received|refund|cashback|gaji|salary)/.test(ctx)) return "income";
  return "expense";
}

function inferCategory(merchant, groupLines, type) {
  if (type === "transfer") return "Transfer";
  if (type === "income") return "Pemasukan";

  const ctx = `${merchant} ${groupLines.join(" ")}`.toLowerCase();
  if (/(ayam|sambel|sambal|kopi|coffee|kedai|makan|food|restaurant|resto|nasi|mie|bakso|sate|kfc|mcd|starbucks|familymart|indomaret|alfamart)/.test(ctx)) return "Makan";
  if (/(grab|gojek|gocar|goride|taxi|taksi|tol|parkir|parking|pertamina|bensin|shell)/.test(ctx)) return "Transportasi";
  if (/(tokopedia|shopee|lazada|blibli|belanja|mall|store|miniso)/.test(ctx)) return "Belanja";
  if (/(pln|listrik|pdam|internet|wifi|telkom|indihome|bpjs|tagihan|pulsa|data|token)/.test(ctx)) return "Tagihan";
  if (/(netflix|spotify|bioskop|cinema|game|steam)/.test(ctx)) return "Hiburan";
  if (/(apotek|pharmacy|klinik|rumah sakit|hospital|obat|dokter)/.test(ctx)) return "Kesehatan";
  return "Lainnya";
}

function confidenceScore(item) {
  let score = 0.25;
  if (item.nominal > 0) score += 0.3;
  if (item.bank) score += 0.15;
  if (item.merchant) score += 0.1;
  if (item.tanggal) score += 0.1;
  if (item.kategori && item.kategori !== "Lainnya") score += 0.1;
  return Math.min(0.95, score);
}

function parseMultiTransactions(rawText, sourceLabel = "") {
  const text = normalizeOcrText(rawText);
  const lines = text.split("\n").map(cleanOcrLine).filter(Boolean);
  const bank = extractBank(text);
  let currentDate = "";
  const results = [];

  lines.forEach((line, index) => {
    const date = parseDateLine(line);
    if (date) currentDate = date;

    const amountInfo = extractAmountWithSign(line);
    if (!amountInfo) return;

    const groupLines = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 4));
    const type = inferType(groupLines, amountInfo.sign);
    const merchant = inferMerchant(groupLines);
    const kategori = inferCategory(merchant, groupLines, type);
    const tanggal = currentDate || formatDateLocal();
    const nominal = amountInfo.amount;

    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${index}-${Math.random()}`,
      selected: true,
      type,
      tanggal,
      bank,
      toBank: "",
      merchant,
      kategori,
      nominal,
      keterangan: merchant ? `OCR: ${merchant}` : `OCR dari ${sourceLabel}`,
      sourceLabel,
      confidence: 0
    };

    item.confidence = confidenceScore(item);
    item.scanNote = buildScanNote(item.bank, item.tanggal, item.kategori, item.nominal);

    const duplicate = results.some((old) => old.tanggal === item.tanggal && old.type === item.type && old.nominal === item.nominal && old.merchant === item.merchant);
    if (!duplicate && nominal >= 1000) results.push(item);
  });

  return results;
}

async function renderPdfToTargets(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js belum termuat. Refresh halaman.");
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const targets = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    targets.push({ source: canvas, label: `${file.name} halaman ${pageNumber}` });
  }

  return targets;
}

async function buildOcrTargets(files) {
  const targets = [];

  for (const file of files) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      targets.push(...await renderPdfToTargets(file));
    } else {
      targets.push({ source: file, label: file.name });
    }
  }

  return targets;
}

function previewFiles() {
  const files = [...(scanFileInput.files || [])];
  singleReviewCard.classList.add("hidden");
  batchReviewCard.classList.add("hidden");
  scannedItems = [];
  singleScanItem = null;

  if (!files.length) {
    scanPreviewBox.textContent = "Preview file akan muncul di sini.";
    return;
  }

  const first = files[0];
  const isPdf = first.type === "application/pdf" || first.name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    scanPreviewBox.innerHTML = `<div><strong>${files.length} file dipilih</strong><br>PDF akan dibaca per halaman.</div>`;
  } else {
    scanPreviewBox.innerHTML = `<img src="${URL.createObjectURL(first)}" alt="Preview">`;
  }

  setNotice(scanMessage, "info", `${files.length} file siap discan.`);
}

function fillSingleForm(item) {
  singleScanItem = item;
  singleType.value = item.type || "expense";
  singleTanggal.value = item.tanggal || formatDateLocal();
  singleBank.value = item.bank || "";
  singleToBank.value = item.toBank || "";
  singleMerchant.value = item.merchant || "";
  singleKategori.value = item.kategori || "Lainnya";
  singleNominal.value = item.nominal || "";
  singleKeterangan.value = item.keterangan || "";
  singleConfidenceBadge.textContent = `${Math.round((item.confidence || 0) * 100)}%`;
  singleToBankWrap.classList.toggle("hidden", singleType.value !== "transfer");
  refreshSingleScanNote();
  singleReviewCard.classList.remove("hidden");
}

function refreshSingleScanNote() {
  singleScanNote.value = buildScanNote(singleBank.value, singleTanggal.value, singleKategori.value, singleNominal.value);
}

function renderBatchTable() {
  if (!scannedItems.length) {
    batchReviewCard.classList.add("hidden");
    return;
  }

  batchReviewCard.classList.remove("hidden");
  batchCountBadge.textContent = `${scannedItems.length} item`;

  batchTableContainer.innerHTML = `
    <table class="batch-table">
      <thead>
        <tr>
          <th class="check-cell">Pilih</th>
          <th>Tanggal</th>
          <th>Tipe</th>
          <th>Bank</th>
          <th>Bank Tujuan</th>
          <th>Merchant/Sumber</th>
          <th>Kategori</th>
          <th>Nominal</th>
          <th>Keterangan</th>
          <th>Conf.</th>
          <th>Hapus</th>
        </tr>
      </thead>
      <tbody>
        ${scannedItems.map((item, index) => `
          <tr data-index="${index}">
            <td class="check-cell"><input data-field="selected" type="checkbox" ${item.selected ? "checked" : ""}></td>
            <td><input data-field="tanggal" type="date" value="${item.tanggal || ""}"></td>
            <td>
              <select data-field="type">
                <option value="expense" ${item.type === "expense" ? "selected" : ""}>Pengeluaran</option>
                <option value="income" ${item.type === "income" ? "selected" : ""}>Pemasukan</option>
                <option value="transfer" ${item.type === "transfer" ? "selected" : ""}>Transfer</option>
              </select>
            </td>
            <td><select data-field="bank">${bankOptionsHtml(item.bank)}</select></td>
            <td><select data-field="toBank">${bankOptionsHtml(item.toBank)}</select></td>
            <td><input data-field="merchant" type="text" value="${item.merchant || ""}"></td>
            <td>
              <select data-field="kategori">
                ${["Makan", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Transfer", "Pemasukan", "Lainnya"].map((cat) =>
                  `<option value="${cat}" ${item.kategori === cat ? "selected" : ""}>${cat}</option>`
                ).join("")}
              </select>
            </td>
            <td><input data-field="nominal" type="number" min="1" value="${item.nominal || ""}"></td>
            <td><input data-field="keterangan" type="text" value="${item.keterangan || ""}"></td>
            <td>${Math.round((item.confidence || 0) * 100)}%</td>
            <td><button class="small-btn danger" data-remove-index="${index}" type="button">Hapus</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function syncBatchFromTable() {
  batchTableContainer.querySelectorAll("tr[data-index]").forEach((row) => {
    const index = Number(row.dataset.index);
    const item = scannedItems[index];
    if (!item) return;

    row.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      if (field === "selected") item.selected = input.checked;
      else if (field === "nominal") item.nominal = Number(input.value || 0);
      else item[field] = input.value;
    });

    item.scanNote = buildScanNote(item.bank, item.tanggal, item.kategori, item.nominal);
  });
}

async function scanFiles() {
  const files = [...(scanFileInput.files || [])];

  if (!files.length) {
    setNotice(scanMessage, "error", "Upload screenshot atau PDF terlebih dahulu.");
    return;
  }

  if (typeof Tesseract === "undefined") {
    setNotice(scanMessage, "error", "Tesseract OCR belum termuat. Refresh halaman.");
    return;
  }

  scanButton.disabled = true;
  scanButton.textContent = "Scanning...";
  scannedItems = [];
  singleReviewCard.classList.add("hidden");
  batchReviewCard.classList.add("hidden");

  try {
    setNotice(scanMessage, "info", "Menyiapkan file untuk OCR...");
    const targets = await buildOcrTargets(files);

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      setNotice(scanMessage, "info", `OCR membaca ${target.label} (${i + 1}/${targets.length})...`);

      const result = await Tesseract.recognize(target.source, "ind+eng", {
        logger: (progress) => {
          if (progress.status === "recognizing text") {
            const percent = Math.round((progress.progress || 0) * 100);
            setNotice(scanMessage, "info", `OCR ${target.label}: ${percent}%`);
          }
        }
      });

      const parsed = parseMultiTransactions(result?.data?.text || "", target.label);
      scannedItems.push(...parsed);
    }

    const seen = new Set();
    scannedItems = scannedItems.filter((item) => {
      const key = `${item.tanggal}|${item.type}|${item.bank}|${item.merchant}|${item.nominal}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!scannedItems.length) {
      setNotice(scanMessage, "error", "Tidak ada transaksi terbaca. Coba crop screenshot lebih dekat atau upload file lebih jelas.");
      return;
    }

    if (scannedItems.length === 1) {
      fillSingleForm(scannedItems[0]);
      renderBatchTable();
      setNotice(scanMessage, "success", "1 transaksi terdeteksi. Review sebelum simpan.");
      return;
    }

    renderBatchTable();
    setNotice(scanMessage, "success", `${scannedItems.length} transaksi terdeteksi. Review tabel sebelum simpan.`);
  } catch (error) {
    setNotice(scanMessage, "error", error?.message || "Gagal membaca file.");
  } finally {
    scanButton.disabled = false;
    scanButton.textContent = "Scan File";
  }
}

async function saveScannedItem(item) {
  const type = item.type;
  const tanggal = item.tanggal;
  const nominal = Number(item.nominal || 0);
  const bank = normalizeBank(item.bank);
  const toBank = normalizeBank(item.toBank);
  const merchant = cleanText(item.merchant);
  const kategori = item.kategori || "Lainnya";
  const keterangan = cleanText(item.keterangan);
  const scanNote = buildScanNote(bank.display, tanggal, kategori, nominal);

  if (!tanggal || !nominal || nominal <= 0 || !bank.key) throw new Error(`Data belum lengkap: ${scanNote}`);

  if (type === "transfer") {
    if (!toBank.key || toBank.key === bank.key) throw new Error(`Transfer perlu bank tujuan valid: ${scanNote}`);
    const payload = {
      tanggal,
      fromBankKey: bank.key,
      fromBankName: bank.display,
      toBankKey: toBank.key,
      toBankName: toBank.display,
      nominal,
      keterangan: keterangan || "Transfer dari OCR",
      merchant,
      source: "ocr_batch",
      confidence: item.confidence || null,
      scanNote,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (isDuplicateTransaction("transfer", payload)) return false;

    await addDoc(collectionRef("transfers"), payload);
    return true;
  }

  if (type === "income") {
    const payload = {
      tanggal,
      bankKey: bank.key,
      bankName: bank.display,
      sumber: merchant || "Pemasukan dari OCR",
      nominal,
      keterangan,
      merchant,
      source: "ocr_batch",
      confidence: item.confidence || null,
      scanNote,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (isDuplicateTransaction("income", payload)) return false;

    await addDoc(collectionRef("incomes"), payload);
    return true;
  }

  const payload = {
    tanggal,
    bankKey: bank.key,
    bankName: bank.display,
    kategori: kategori === "Pemasukan" ? "Lainnya" : kategori,
    nominal,
    keterangan: keterangan || merchant || "Pengeluaran dari OCR",
    merchant,
    source: "ocr_batch",
    confidence: item.confidence || null,
    scanNote,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (isDuplicateTransaction("expense", payload)) return false;

  await addDoc(collectionRef("expenses"), payload);
  return true;
}

async function saveSingleScan(event) {
  event.preventDefault();

  const item = {
    selected: true,
    type: singleType.value,
    tanggal: singleTanggal.value,
    bank: singleBank.value,
    toBank: singleToBank.value,
    merchant: singleMerchant.value,
    kategori: singleKategori.value,
    nominal: Number(singleNominal.value || 0),
    keterangan: singleKeterangan.value,
    confidence: singleScanItem?.confidence || null
  };

  try {
    const saved = await saveScannedItem(item);
    setNotice(scanMessage, saved ? "success" : "info", saved ? "Transaksi hasil scan berhasil disimpan." : "Data yang sama sudah ada, jadi tidak disimpan ulang.");
    singleReviewCard.classList.add("hidden");
    scanFileInput.value = "";
    scanPreviewBox.textContent = "Preview file akan muncul di sini.";
  } catch (error) {
    setNotice(scanMessage, "error", error?.message || "Gagal menyimpan hasil scan.");
  }
}

async function saveSelectedBatch() {
  syncBatchFromTable();
  const selected = scannedItems.filter((item) => item.selected);

  if (!selected.length) {
    setNotice(scanMessage, "error", "Pilih minimal satu transaksi.");
    return;
  }

  saveBatchButton.disabled = true;
  saveBatchButton.textContent = "Menyimpan...";

  try {
    let savedCount = 0;
    let skippedCount = 0;

    for (const item of selected) {
      const saved = await saveScannedItem(item);
      if (saved) savedCount += 1;
      else skippedCount += 1;
    }

    setNotice(scanMessage, "success", `${savedCount} transaksi berhasil disimpan. ${skippedCount} duplikat dilewati.`);
    scannedItems = [];
    renderBatchTable();
    batchReviewCard.classList.add("hidden");
    singleReviewCard.classList.add("hidden");
    scanFileInput.value = "";
    scanPreviewBox.textContent = "Preview file akan muncul di sini.";
  } catch (error) {
    setNotice(scanMessage, "error", error?.message || "Gagal menyimpan batch.");
  } finally {
    saveBatchButton.disabled = false;
    saveBatchButton.textContent = "Simpan Terpilih";
  }
}


function payloadSignature(type, data) {
  const normalized = {
    type,
    tanggal: data.tanggal || "",
    nominal: Number(data.nominal || 0),
    bank: data.bankKey || normalizeBank(data.bankName || data.bank || data.fromBankName).key,
    toBank: data.toBankKey || normalizeBank(data.toBankName || data.toBank).key,
    kategori: slugText(data.kategori || data.sumber || data.categoryText || ""),
    merchant: slugText(data.merchant || data.keterangan || data.title || "")
  };

  if (type === "transfer") {
    return [normalized.type, normalized.tanggal, normalized.nominal, normalized.bank, normalized.toBank].join("|");
  }

  return [normalized.type, normalized.tanggal, normalized.nominal, normalized.bank, normalized.kategori, normalized.merchant].join("|");
}

function isDuplicateTransaction(type, payload) {
  const signature = payloadSignature(type, payload);

  if (type === "income") {
    return incomes.some((item) => payloadSignature("income", item) === signature);
  }

  if (type === "expense") {
    return expenses.some((item) => payloadSignature("expense", item) === signature);
  }

  return transfers.some((item) => payloadSignature("transfer", item) === signature);
}

async function dedupeExistingTransactions() {
  const seen = new Set();
  const deletions = [];

  for (const item of incomes) {
    const sig = payloadSignature("income", item);
    if (seen.has(sig)) deletions.push(["incomes", item.id]);
    else seen.add(sig);
  }

  for (const item of expenses) {
    const sig = payloadSignature("expense", item);
    if (seen.has(sig)) deletions.push(["expenses", item.id]);
    else seen.add(sig);
  }

  for (const item of transfers) {
    const sig = payloadSignature("transfer", item);
    if (seen.has(sig)) deletions.push(["transfers", item.id]);
    else seen.add(sig);
  }

  if (!deletions.length) {
    alert("Tidak ada data duplikat yang ditemukan.");
    return;
  }

  if (!confirm(`Ditemukan ${deletions.length} data duplikat. Hapus duplikat?`)) return;

  for (const [collectionNameValue, id] of deletions) {
    await deleteDoc(docRef(collectionNameValue, id));
  }

  alert(`${deletions.length} data duplikat berhasil dihapus.`);
}

function getBudgetStorageKey() {
  return `spendly_budget_plans_${currentUser?.uid || "guest"}`;
}

function loadBudgetPlans() {
  try {
    budgetPlans = JSON.parse(localStorage.getItem(getBudgetStorageKey()) || "[]");
  } catch (_) {
    budgetPlans = [];
  }

  if (!budgetPlans.length) {
    budgetPlans = [
      { id: "needs", name: "Kebutuhan Pokok", percent: 70 },
      { id: "investment", name: "Investasi / Tabungan", percent: 30 }
    ];
    saveBudgetPlans();
  }
}

function saveBudgetPlans() {
  localStorage.setItem(getBudgetStorageKey(), JSON.stringify(budgetPlans));
}

function expenseForBudgetPlan(name) {
  const slug = slugText(name);

  if (slug.includes("pokok") || slug.includes("kebutuhan")) {
    return expenses
      .filter((item) => ["Makan", "Transportasi", "Tagihan", "Kesehatan"].includes(item.kategori))
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  }

  if (slug.includes("investasi") || slug.includes("tabungan")) {
    return expenses
      .filter((item) => ["Investasi"].includes(item.kategori))
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  }

  return expenses
    .filter((item) => slugText(item.kategori) === slug)
    .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
}

function renderBudgetPlans() {
  if (!budgetPlanList) return;

  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.nominal || 0), 0);

  budgetPlanList.innerHTML = budgetPlans.map((plan) => {
    const target = totalIncome * Number(plan.percent || 0) / 100;
    const actual = expenseForBudgetPlan(plan.name);
    const progress = target > 0 ? Math.min(150, (actual / target) * 100) : 0;
    const over = actual > target && target > 0;

    return `
      <article class="budget-plan-card">
        <div>
          <h3>${plan.name}</h3>
          <p>${plan.percent}% dari pemasukan</p>
        </div>
        <div>
          <p>Target: ${formatRupiah(target)} · Aktual: ${formatRupiah(actual)}</p>
          <div class="progress-track">
            <div class="progress-fill ${over ? "over" : ""}" style="width:${Math.min(100, progress)}%"></div>
          </div>
        </div>
        <button class="small-btn danger" data-delete-plan="${plan.id}" type="button">Hapus</button>
      </article>
    `;
  }).join("");
}

function addBudgetPlan(event) {
  event.preventDefault();

  const name = cleanText(budgetPlanName.value);
  const percent = Number(budgetPlanPercent.value);

  if (!name || !percent || percent <= 0 || percent > 100) {
    setNotice(budgetPlanMessage, "error", "Nama pos dan persentase 1-100 wajib diisi.");
    return;
  }

  budgetPlans.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    percent
  });

  saveBudgetPlans();
  budgetPlanForm.reset();
  setNotice(budgetPlanMessage, "success", "Budget plan berhasil ditambahkan.");
  renderBudgetPlans();
}

function renderCreditCardSummary() {
  if (!creditOutstanding) return;

  const cardKey = normalizeBank("Mandiri Credit Card").key;
  const bank = getBankBalances().find((item) => item.key === cardKey);
  const balance = bank?.balance || 0;
  const outstanding = Math.max(0, -balance);

  creditOutstanding.textContent = maskMoney(outstanding);

  if (outstanding > 0) {
    creditStatus.textContent = "Ada tagihan berjalan. Bayar dengan transfer ke Mandiri Credit Card.";
  } else {
    creditStatus.textContent = "Belum ada outstanding atau tagihan sudah tertutup.";
  }
}


function maskMoney(value) {
  return balanceHidden ? "Rp ••••••" : formatRupiah(value);
}

function updateBalanceVisibility() {
  toggleBalanceButton.textContent = balanceHidden ? "Show Saldo" : "Hide Saldo";
  document.body.classList.toggle("balance-hidden", balanceHidden);
  renderStats();
  renderBanks();
  renderCreditCardSummary();
}


function setupPages() {
  const navLinks = document.querySelectorAll("[data-page]");

  function setPage(page) {
    navLinks.forEach((button) => button.classList.toggle("active", button.dataset.page === page));

    const dashboardItems = [$("dashboard"), $("saldo"), document.querySelector(".cashflow-section"), $("creditCardSection")];
    const inputItems = [$("input"), $("scanner")];
    const reviewItems = [$("advisor"), $("budgetPlanner"), $("riwayat")];

    [...dashboardItems, ...inputItems, ...reviewItems].forEach((element) => {
      if (element) element.classList.add("page-hidden");
    });

    const show = page === "input" ? inputItems : page === "review" ? reviewItems : dashboardItems;
    show.forEach((element) => {
      if (element) element.classList.remove("page-hidden");
    });

    const mainGrid = document.querySelector(".main-grid");
    if (mainGrid) {
      mainGrid.classList.toggle("page-hidden", page === "review");
    }
  }

  navLinks.forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
  setPage("dashboard");
}


function buildSummary() {
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const remaining = totalIncome - totalExpense;

  const categoryMap = {};
  expenses.forEach((item) => {
    const category = item.kategori || "Lainnya";
    categoryMap[category] = (categoryMap[category] || 0) + Number(item.nominal || 0);
  });

  const topCategory = Object.entries(categoryMap).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)[0];

  return { totalIncome, totalExpense, remaining, topCategory, banks: getBankBalances() };
}

function generateAdvice() {
  const s = buildSummary();
  const expenseRatio = s.totalIncome > 0 ? (s.totalExpense / s.totalIncome) * 100 : 0;

  let status = "Aman";
  if (s.remaining < 0) status = "Kritis";
  else if (s.totalIncome === 0 && s.totalExpense > 0) status = "Perlu Diperhatikan";
  else if (expenseRatio > 80) status = "Perlu Diperhatikan";

  const lines = [];
  lines.push(`Status Keuangan: ${status}`);
  lines.push("");
  lines.push("Ringkasan:");
  lines.push(`- Total pemasukan: ${formatRupiah(s.totalIncome)}`);
  lines.push(`- Total pengeluaran: ${formatRupiah(s.totalExpense)}`);
  lines.push(`- Sisa uang: ${formatRupiah(s.remaining)}`);
  if (s.topCategory) lines.push(`- Kategori terbesar: ${s.topCategory.category} (${formatRupiah(s.topCategory.amount)})`);
  lines.push("");
  lines.push("Rekomendasi:");
  if (s.remaining < 0) {
    lines.push("1. Cek ulang transaksi dan input pemasukan yang belum tercatat.");
    lines.push("2. Tunda pengeluaran non-prioritas sampai saldo positif.");
    lines.push("3. Pangkas kategori pengeluaran terbesar terlebih dahulu.");
  } else {
    lines.push("1. Pertahankan pengeluaran di bawah 70% pemasukan.");
    lines.push("2. Sisihkan 10–20% pemasukan untuk tabungan/dana darurat.");
    lines.push("3. Review transaksi kecil yang sering berulang.");
  }

  advisorOutput.textContent = lines.join("\n");
}

function downloadCSV() {
  const rows = allTransactions().map((item) => ({
    tanggal: item.tanggal || "",
    tipe: typeLabel(item.type),
    bank: item.bankText || "",
    kategori: item.categoryText || "",
    nominal: item.nominal || 0,
    keterangan: item.keterangan || item.title || "",
    scanNote: item.scanNote || ""
  }));

  const header = Object.keys(rows[0] || { tanggal: "", tipe: "", bank: "", kategori: "", nominal: "", keterangan: "", scanNote: "" });
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => `"${String(row[key] || "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spendly-${formatDateLocal()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadExcel() {
  if (typeof XLSX === "undefined") {
    alert("Library Excel belum termuat.");
    return;
  }

  const transactions = allTransactions().map((item) => ({
    Tanggal: item.tanggal || "",
    Tipe: typeLabel(item.type),
    Bank: item.bankText || "",
    Kategori: item.categoryText || "",
    Nominal: item.nominal || 0,
    Keterangan: item.keterangan || item.title || "",
    "Catatan Scan": item.scanNote || ""
  }));

  const balances = getBankBalances().map((bank) => ({
    Bank: bank.name,
    Pemasukan: bank.income,
    Pengeluaran: bank.expense,
    "Transfer Masuk": bank.transferIn,
    "Transfer Keluar": bank.transferOut,
    Saldo: bank.balance
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactions), "Transaksi");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(balances), "Saldo Bank");
  XLSX.writeFile(workbook, `spendly-${formatDateLocal()}.xlsx`);
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (!user) {
    clearSubscriptions();
    incomes = [];
    expenses = [];
    transfers = [];
    showAuth();
    return;
  }

  showApp(user);
  loadCustomBanks();
  loadBudgetPlans();
  populateBankSelects();
  subscribeData();
});

loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));
authForm.addEventListener("submit", handleAuth);
logoutButton.addEventListener("click", () => signOut(auth));

incomeTab.addEventListener("click", () => setTxMode("income"));
expenseTab.addEventListener("click", () => setTxMode("expense"));
transferTab.addEventListener("click", () => setTxMode("transfer"));
transactionForm.addEventListener("submit", saveManualTransaction);

typeFilter.addEventListener("change", renderHistory);
searchInput.addEventListener("input", renderHistory);

historyContainer.addEventListener("click", (event) => {
  const editBtn = event.target.closest("[data-edit-id]");
  const deleteBtn = event.target.closest("[data-delete-id]");

  if (editBtn) openEdit(editBtn.dataset.editType, editBtn.dataset.editId);
  if (deleteBtn) deleteTransaction(deleteBtn.dataset.deleteType, deleteBtn.dataset.deleteId);
});

editForm.addEventListener("submit", saveEdit);
closeEditModal.addEventListener("click", closeEdit);
cancelEditButton.addEventListener("click", closeEdit);

scanFileInput.addEventListener("change", previewFiles);
scanButton.addEventListener("click", scanFiles);
singleScanForm.addEventListener("submit", saveSingleScan);
singleType.addEventListener("change", () => {
  singleToBankWrap.classList.toggle("hidden", singleType.value !== "transfer");
  if (singleType.value === "transfer") singleKategori.value = "Transfer";
  refreshSingleScanNote();
});

[singleTanggal, singleBank, singleKategori, singleNominal].forEach((el) => {
  el.addEventListener("input", refreshSingleScanNote);
  el.addEventListener("change", refreshSingleScanNote);
});

batchTableContainer.addEventListener("input", syncBatchFromTable);
batchTableContainer.addEventListener("change", syncBatchFromTable);
batchTableContainer.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-remove-index]");
  if (!btn) return;
  const index = Number(btn.dataset.removeIndex);
  scannedItems.splice(index, 1);
  renderBatchTable();
});

selectAllBatchButton.addEventListener("click", () => {
  const shouldSelect = scannedItems.some((item) => !item.selected);
  scannedItems.forEach((item) => { item.selected = shouldSelect; });
  renderBatchTable();
});

saveBatchButton.addEventListener("click", saveSelectedBatch);
advisorButton.addEventListener("click", generateAdvice);
toggleBalanceButton.addEventListener("click", () => {
  balanceHidden = !balanceHidden;
  updateBalanceVisibility();
});

downloadCSVButton.addEventListener("click", downloadCSV);
downloadExcelButton.addEventListener("click", downloadExcel);

addBankButton.addEventListener("click", addCustomBank);
newBankInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCustomBank();
  }
});

budgetPlanForm.addEventListener("submit", addBudgetPlan);
budgetPlanList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-plan]");
  if (!button) return;
  budgetPlans = budgetPlans.filter((plan) => plan.id !== button.dataset.deletePlan);
  saveBudgetPlans();
  renderBudgetPlans();
});

dedupeButton.addEventListener("click", dedupeExistingTransactions);

tanggalInput.value = formatDateLocal();
setAuthMode("login");
setTxMode("income");
loadCustomBanks();
loadBudgetPlans();
populateBankSelects();
setupPages();
