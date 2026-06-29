/*
  PENTING:
  Ganti firebaseConfig di bawah dengan config Firebase kamu.
  Kalau kamu update dari versi sebelumnya, copy firebaseConfig lama kamu ke sini.
*/

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

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let authMode = "login";
let currentUser = null;
let unsubscribers = [];
let incomes = [];
let expenses = [];
let transfers = [];

const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authButton = document.getElementById("authButton");
const authMessage = document.getElementById("authMessage");

const userEmail = document.getElementById("userEmail");
const userInitial = document.getElementById("userInitial");
const logoutButton = document.getElementById("logoutButton");

const incomeTab = document.getElementById("incomeTab");
const expenseTab = document.getElementById("expenseTab");
const transferTab = document.getElementById("transferTab");

const incomeForm = document.getElementById("incomeForm");
const expenseForm = document.getElementById("expenseForm");
const transferForm = document.getElementById("transferForm");

const incomeTanggal = document.getElementById("incomeTanggal");
const incomeBank = document.getElementById("incomeBank");
const incomeSource = document.getElementById("incomeSource");
const incomeNominal = document.getElementById("incomeNominal");
const incomeKeterangan = document.getElementById("incomeKeterangan");
const saveIncomeButton = document.getElementById("saveIncomeButton");

const expenseTanggal = document.getElementById("expenseTanggal");
const expenseBank = document.getElementById("expenseBank");
const expenseKategori = document.getElementById("expenseKategori");
const expenseNominal = document.getElementById("expenseNominal");
const expenseKeterangan = document.getElementById("expenseKeterangan");
const saveExpenseButton = document.getElementById("saveExpenseButton");

const transferTanggal = document.getElementById("transferTanggal");
const transferFromBank = document.getElementById("transferFromBank");
const transferToBank = document.getElementById("transferToBank");
const transferNominal = document.getElementById("transferNominal");
const transferKeterangan = document.getElementById("transferKeterangan");
const saveTransferButton = document.getElementById("saveTransferButton");

const transactionMessage = document.getElementById("transactionMessage");

const sisaUang = document.getElementById("sisaUang");
const totalPemasukan = document.getElementById("totalPemasukan");
const totalPengeluaran = document.getElementById("totalPengeluaran");
const jumlahBank = document.getElementById("jumlahBank");

const bankBalanceGrid = document.getElementById("bankBalanceGrid");
const bankBalanceChartCanvas = document.getElementById("bankBalanceChart");
const cashflowChartCanvas = document.getElementById("cashflowChart");
const tabelContainer = document.getElementById("tabelContainer");

let bankBalanceChartInstance = null;
let cashflowChartInstance = null;

const filterTanggal = document.getElementById("filterTanggal");
const filterTipe = document.getElementById("filterTipe");
const filterBank = document.getElementById("filterBank");
const resetFilterButton = document.getElementById("resetFilterButton");
const downloadCsvButton = document.getElementById("downloadCsvButton");
const downloadExcelButton = document.getElementById("downloadExcelButton");

const editModal = document.getElementById("editModal");
const closeEditModal = document.getElementById("closeEditModal");
const cancelEditButton = document.getElementById("cancelEditButton");
const editForm = document.getElementById("editForm");
const editTitle = document.getElementById("editTitle");
const editId = document.getElementById("editId");
const editType = document.getElementById("editType");
const editTanggal = document.getElementById("editTanggal");
const editIncomeFields = document.getElementById("editIncomeFields");
const editExpenseFields = document.getElementById("editExpenseFields");
const editTransferFields = document.getElementById("editTransferFields");
const editIncomeBank = document.getElementById("editIncomeBank");
const editIncomeSource = document.getElementById("editIncomeSource");
const editExpenseBank = document.getElementById("editExpenseBank");
const editExpenseKategori = document.getElementById("editExpenseKategori");
const editTransferFromBank = document.getElementById("editTransferFromBank");
const editTransferToBank = document.getElementById("editTransferToBank");
const editNominal = document.getElementById("editNominal");
const editKeterangan = document.getElementById("editKeterangan");
const editMessage = document.getElementById("editMessage");
const saveEditButton = document.getElementById("saveEditButton");

const COMMON_BANK_ALIASES = {
  mandiri: ["mandiri", "bank mandiri", "pt bank mandiri", "mandiri bank"],
  bca: ["bca", "bank bca", "bank central asia"],
  bri: ["bri", "bank bri", "bank rakyat indonesia"],
  bni: ["bni", "bank bni", "bank negara indonesia"],
  btn: ["btn", "bank btn", "bank tabungan negara"],
  cimb: ["cimb", "cimb niaga", "bank cimb", "bank cimb niaga"],
  permata: ["permata", "bank permata"],
  danamon: ["danamon", "bank danamon"],
  bsi: ["bsi", "bank bsi", "bank syariah indonesia"],
  jago: ["jago", "bank jago"],
  jenius: ["jenius", "bank btpn", "btpn"],
  seabank: ["seabank", "sea bank", "bank seabank"],
  dana: ["dana"],
  gopay: ["gopay", "go pay"],
  ovo: ["ovo"],
  shopeepay: ["shopeepay", "shopee pay"],
  cash: ["cash", "tunai", "uang tunai"]
};

const BANK_DISPLAY = {
  mandiri: "Mandiri",
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  btn: "BTN",
  cimb: "CIMB Niaga",
  permata: "Permata",
  danamon: "Danamon",
  bsi: "BSI",
  jago: "Bank Jago",
  jenius: "Jenius",
  seabank: "SeaBank",
  dana: "DANA",
  gopay: "GoPay",
  ovo: "OVO",
  shopeepay: "ShopeePay",
  cash: "Tunai"
};

function setNotice(element, type, text) {
  element.className = `notice ${type}`;
  element.textContent = text;
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function basicNormalize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBank(rawName) {
  const original = cleanText(rawName);
  let normalized = basicNormalize(original);

  if (!normalized) {
    return { key: "", display: "" };
  }

  for (const [key, aliases] of Object.entries(COMMON_BANK_ALIASES)) {
    if (aliases.includes(normalized)) {
      return { key, display: BANK_DISPLAY[key] || toTitleCase(key) };
    }
  }

  normalized = normalized
    .replace(/\bbank\b/g, "")
    .replace(/\bpt\b/g, "")
    .replace(/\bindonesia\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  for (const [key, aliases] of Object.entries(COMMON_BANK_ALIASES)) {
    const normalizedAliases = aliases.map((alias) =>
      basicNormalize(alias).replace(/\bbank\b/g, "").trim()
    );

    if (normalizedAliases.includes(normalized)) {
      return { key, display: BANK_DISPLAY[key] || toTitleCase(key) };
    }
  }

  return {
    key: normalized.replace(/\s+/g, "-"),
    display: toTitleCase(normalized)
  };
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function setToday() {
  const today = formatDateLocal(new Date());
  incomeTanggal.value = today;
  expenseTanggal.value = today;
  transferTanggal.value = today;
}

function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

function formatDateID(value) {
  return new Date(value + "T00:00:00").toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCSV(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function firebaseErrorMessage(code) {
  const messages = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/email-already-in-use": "Email ini sudah terdaftar. Gunakan Login.",
    "auth/weak-password": "Password terlalu lemah. Gunakan minimal 6 karakter.",
    "auth/user-not-found": "Akun tidak ditemukan.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/network-request-failed": "Koneksi internet bermasalah.",
    "permission-denied": "Akses database ditolak. Periksa Firestore Rules."
  };

  return messages[code] || `Terjadi error: ${code}`;
}

function switchAuthMode(mode) {
  authMode = mode;

  if (mode === "login") {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    authTitle.textContent = "Masuk ke akun";
    authSubtitle.textContent = "Gunakan email dan password untuk mengakses budget tracker.";
    authButton.textContent = "Login";
    setNotice(authMessage, "info", "Masukkan email dan password untuk login. Jika belum punya akun, pilih Register.");
  } else {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    authTitle.textContent = "Buat akun baru";
    authSubtitle.textContent = "Daftar akun agar data budget tersimpan online.";
    authButton.textContent = "Register";
    setNotice(authMessage, "info", "Gunakan email aktif dan password minimal 6 karakter.");
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email) {
    setNotice(authMessage, "error", "Email wajib diisi.");
    return;
  }

  if (password.length < 6) {
    setNotice(authMessage, "error", "Password minimal 6 karakter.");
    return;
  }

  authButton.disabled = true;
  authButton.textContent = authMode === "login" ? "Memproses..." : "Mendaftarkan...";

  try {
    if (authMode === "login") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }

    authEmail.value = "";
    authPassword.value = "";
    setNotice(authMessage, "success", "Berhasil masuk.");
  } catch (error) {
    setNotice(authMessage, "error", firebaseErrorMessage(error.code));
  } finally {
    authButton.disabled = false;
    authButton.textContent = authMode === "login" ? "Login" : "Register";
  }
}

function collectionRef(name) {
  return collection(db, "users", currentUser.uid, name);
}

function listenCollection(name, callback) {
  const q = query(collectionRef(name), orderBy("tanggal", "desc"));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      renderAll();
    },
    (error) => {
      setNotice(transactionMessage, "error", firebaseErrorMessage(error.code));
    }
  );

  unsubscribers.push(unsubscribe);
}

function listenData() {
  unsubscribeAll();

  listenCollection("incomes", (items) => {
    incomes = items;
  });

  listenCollection("expenses", (items) => {
    expenses = items;
  });

  listenCollection("transfers", (items) => {
    transfers = items;
  });
}

function unsubscribeAll() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
}

function switchInputMode(mode) {
  incomeTab.classList.toggle("active", mode === "income");
  expenseTab.classList.toggle("active", mode === "expense");
  transferTab.classList.toggle("active", mode === "transfer");

  incomeForm.classList.toggle("hidden", mode !== "income");
  expenseForm.classList.toggle("hidden", mode !== "expense");
  transferForm.classList.toggle("hidden", mode !== "transfer");
}

async function saveIncome(event) {
  event.preventDefault();

  const bank = normalizeBank(incomeBank.value);
  const tanggal = incomeTanggal.value;
  const sumber = cleanText(incomeSource.value);
  const nominal = Number(incomeNominal.value);
  const keterangan = cleanText(incomeKeterangan.value);

  if (!tanggal || !bank.key || !sumber || !nominal || nominal <= 0) {
    setNotice(transactionMessage, "error", "Tanggal, bank, sumber pemasukan, dan nominal wajib diisi.");
    return;
  }

  saveIncomeButton.disabled = true;
  saveIncomeButton.textContent = "Menyimpan...";

  try {
    await addDoc(collectionRef("incomes"), {
      tanggal,
      bankKey: bank.key,
      bankName: bank.display,
      sumber,
      nominal,
      keterangan,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    incomeSource.value = "";
    incomeNominal.value = "";
    incomeKeterangan.value = "";
    setNotice(transactionMessage, "success", "Pemasukan berhasil disimpan.");
  } catch (error) {
    setNotice(transactionMessage, "error", firebaseErrorMessage(error.code));
  } finally {
    saveIncomeButton.disabled = false;
    saveIncomeButton.textContent = "Simpan Pemasukan";
  }
}

async function saveExpense(event) {
  event.preventDefault();

  const bank = normalizeBank(expenseBank.value);
  const tanggal = expenseTanggal.value;
  const kategori = expenseKategori.value;
  const nominal = Number(expenseNominal.value);
  const keterangan = cleanText(expenseKeterangan.value);

  if (!tanggal || !bank.key || !kategori || !nominal || nominal <= 0 || !keterangan) {
    setNotice(transactionMessage, "error", "Tanggal, bank, kategori, nominal, dan keterangan wajib diisi.");
    return;
  }

  saveExpenseButton.disabled = true;
  saveExpenseButton.textContent = "Menyimpan...";

  try {
    await addDoc(collectionRef("expenses"), {
      tanggal,
      bankKey: bank.key,
      bankName: bank.display,
      kategori,
      nominal,
      keterangan,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    expenseNominal.value = "";
    expenseKeterangan.value = "";
    setNotice(transactionMessage, "success", "Pengeluaran berhasil disimpan.");
  } catch (error) {
    setNotice(transactionMessage, "error", firebaseErrorMessage(error.code));
  } finally {
    saveExpenseButton.disabled = false;
    saveExpenseButton.textContent = "Simpan Pengeluaran";
  }
}

async function saveTransfer(event) {
  event.preventDefault();

  const fromBank = normalizeBank(transferFromBank.value);
  const toBank = normalizeBank(transferToBank.value);
  const tanggal = transferTanggal.value;
  const nominal = Number(transferNominal.value);
  const keterangan = cleanText(transferKeterangan.value);

  if (!tanggal || !fromBank.key || !toBank.key || !nominal || nominal <= 0) {
    setNotice(transactionMessage, "error", "Tanggal, bank asal, bank tujuan, dan nominal wajib diisi.");
    return;
  }

  if (fromBank.key === toBank.key) {
    setNotice(transactionMessage, "error", "Bank asal dan bank tujuan terbaca sama. Transfer tidak perlu dicatat.");
    return;
  }

  saveTransferButton.disabled = true;
  saveTransferButton.textContent = "Menyimpan...";

  try {
    await addDoc(collectionRef("transfers"), {
      tanggal,
      fromBankKey: fromBank.key,
      fromBankName: fromBank.display,
      toBankKey: toBank.key,
      toBankName: toBank.display,
      nominal,
      keterangan,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    transferNominal.value = "";
    transferKeterangan.value = "";
    setNotice(transactionMessage, "success", "Transfer berhasil disimpan.");
  } catch (error) {
    setNotice(transactionMessage, "error", firebaseErrorMessage(error.code));
  } finally {
    saveTransferButton.disabled = false;
    saveTransferButton.textContent = "Simpan Transfer";
  }
}

function getBankBalances() {
  const balances = {};

  function ensureBank(key, name) {
    if (!balances[key]) {
      balances[key] = {
        key,
        name,
        balance: 0,
        income: 0,
        expense: 0,
        transferIn: 0,
        transferOut: 0
      };
    }
  }

  incomes.forEach((item) => {
    const bank = item.bankKey
      ? { key: item.bankKey, display: item.bankName || toTitleCase(item.bankKey.replaceAll("-", " ")) }
      : normalizeBank(item.bankName || "Belum Dicatat");

    const key = bank.key || "belum-dicatat";
    const name = bank.display || "Belum Dicatat";
    ensureBank(key, name);
    balances[key].balance += Number(item.nominal || 0);
    balances[key].income += Number(item.nominal || 0);
  });

  expenses.forEach((item) => {
    const bank = item.bankKey
      ? { key: item.bankKey, display: item.bankName || toTitleCase(item.bankKey.replaceAll("-", " ")) }
      : normalizeBank(item.bankName || "Belum Dicatat");

    const key = bank.key || "belum-dicatat";
    const name = bank.display || "Belum Dicatat";
    ensureBank(key, name);
    balances[key].balance -= Number(item.nominal || 0);
    balances[key].expense += Number(item.nominal || 0);
  });

  transfers.forEach((item) => {
    const fromKey = item.fromBankKey || normalizeBank(item.fromBankName || "Belum Dicatat").key || "belum-dicatat";
    const fromName = item.fromBankName || toTitleCase(fromKey.replaceAll("-", " "));
    const toKey = item.toBankKey || normalizeBank(item.toBankName || "Belum Dicatat").key || "belum-dicatat";
    const toName = item.toBankName || toTitleCase(toKey.replaceAll("-", " "));

    ensureBank(fromKey, fromName);
    ensureBank(toKey, toName);

    balances[fromKey].balance -= Number(item.nominal || 0);
    balances[fromKey].transferOut += Number(item.nominal || 0);

    balances[toKey].balance += Number(item.nominal || 0);
    balances[toKey].transferIn += Number(item.nominal || 0);
  });

  return Object.values(balances).sort((a, b) => b.balance - a.balance);
}

function getUnifiedTransactions() {
  const incomeRows = incomes.map((item) => ({
    id: item.id,
    type: "income",
    tanggal: item.tanggal,
    bankKey: item.bankKey,
    bankName: item.bankName,
    title: item.sumber || "Pemasukan",
    nominal: Number(item.nominal || 0),
    keterangan: item.keterangan || "",
    createdAt: item.createdAt?.seconds || 0
  }));

  const expenseRows = expenses.map((item) => {
    const bank = item.bankKey
      ? { key: item.bankKey, display: item.bankName || toTitleCase(item.bankKey.replaceAll("-", " ")) }
      : normalizeBank(item.bankName || "Belum Dicatat");

    return {
      id: item.id,
      type: "expense",
      tanggal: item.tanggal,
      bankKey: bank.key || "belum-dicatat",
      bankName: bank.display || "Belum Dicatat",
      title: item.kategori || "Pengeluaran",
      nominal: Number(item.nominal || 0),
      keterangan: item.keterangan || "",
      createdAt: item.createdAt?.seconds || 0
    };
  });

  const transferRows = transfers.map((item) => ({
    id: item.id,
    type: "transfer",
    tanggal: item.tanggal,
    bankKey: `${item.fromBankKey}|${item.toBankKey}`,
    bankName: `${item.fromBankName} → ${item.toBankName}`,
    title: "Transfer",
    nominal: Number(item.nominal || 0),
    keterangan: item.keterangan || "",
    createdAt: item.createdAt?.seconds || 0
  }));

  return [...incomeRows, ...expenseRows, ...transferRows]
    .filter(applyFilters)
    .sort((a, b) => {
      if (a.tanggal === b.tanggal) return b.createdAt - a.createdAt;
      return b.tanggal.localeCompare(a.tanggal);
    });
}

function applyFilters(item) {
  const tanggal = filterTanggal.value;
  const tipe = filterTipe.value;
  const bankInput = cleanText(filterBank.value);
  const bank = normalizeBank(bankInput);

  const matchTanggal = tanggal === "" || item.tanggal === tanggal;
  const matchTipe = tipe === "Semua" || item.type === tipe;

  let matchBank = true;
  if (bankInput !== "") {
    matchBank = String(item.bankKey || "").includes(bank.key) || String(item.bankName || "").toLowerCase().includes(bankInput.toLowerCase());
  }

  return matchTanggal && matchTipe && matchBank;
}

function renderAll() {
  renderStats();
  renderBankBalances();
  renderCharts();
  renderTable();
}

function renderStats() {
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const remaining = totalIncome - totalExpense;
  const banks = getBankBalances().filter((bank) => bank.balance !== 0 || bank.income !== 0 || bank.expense !== 0 || bank.transferIn !== 0 || bank.transferOut !== 0);

  totalPemasukan.textContent = formatRupiah(totalIncome);
  totalPengeluaran.textContent = formatRupiah(totalExpense);
  sisaUang.textContent = formatRupiah(remaining);
  jumlahBank.textContent = banks.length;
}

function renderBankBalances() {
  const banks = getBankBalances();

  if (banks.length === 0) {
    bankBalanceGrid.innerHTML = `
      <div class="empty-state no-margin">
        <div class="empty-icon">▣</div>
        <h3>Belum ada saldo bank</h3>
        <p>Input pemasukan terlebih dahulu, lalu saldo bank akan muncul di sini.</p>
      </div>
    `;
    return;
  }

  bankBalanceGrid.innerHTML = banks.map((bank) => `
    <article class="bank-card">
      <div class="bank-card-header">
        <div>
          <div class="bank-name">${escapeHTML(bank.name)}</div>
          <div class="bank-key">Key: ${escapeHTML(bank.key)}</div>
        </div>
        <span class="bank-pill">Saldo</span>
      </div>

      <div class="bank-balance ${bank.balance < 0 ? "negative" : ""}">
        ${formatRupiah(bank.balance)}
      </div>

      <div class="bank-detail">
        <small>Masuk: ${formatRupiah(bank.income)} · Keluar: ${formatRupiah(bank.expense)}</small><br>
        <small>Transfer in: ${formatRupiah(bank.transferIn)} · Transfer out: ${formatRupiah(bank.transferOut)}</small>
      </div>
    </article>
  `).join("");
}

function typeBadge(type) {
  const label = {
    income: "Pemasukan",
    expense: "Pengeluaran",
    transfer: "Transfer"
  }[type];

  return `<span class="badge badge-${type}">${label}</span>`;
}

function amountDisplay(item) {
  if (item.type === "income") return `<span class="amount income">+ ${formatRupiah(item.nominal)}</span>`;
  if (item.type === "expense") return `<span class="amount expense">- ${formatRupiah(item.nominal)}</span>`;
  return `<span class="amount transfer">${formatRupiah(item.nominal)}</span>`;
}


function destroyChart(instance) {
  if (instance) {
    instance.destroy();
  }
}

function getChartTextColor() {
  return "#667085";
}

function getChartGridColor() {
  return "rgba(228, 231, 236, 0.9)";
}

function renderCharts() {
  renderBankBalanceChart();
  renderCashflowChart();
}

function renderBankBalanceChart() {
  if (!bankBalanceChartCanvas || typeof Chart === "undefined") {
    return;
  }

  const banks = getBankBalances()
    .filter((bank) => bank.balance !== 0 || bank.income !== 0 || bank.expense !== 0 || bank.transferIn !== 0 || bank.transferOut !== 0)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  if (bankBalanceChartInstance) {
    bankBalanceChartInstance.destroy();
    bankBalanceChartInstance = null;
  }

  const container = bankBalanceChartCanvas.parentElement;

  const oldEmpty = container.querySelector(".chart-empty");
  if (oldEmpty) {
    oldEmpty.remove();
  }

  bankBalanceChartCanvas.classList.remove("hidden");

  if (banks.length === 0) {
    bankBalanceChartCanvas.classList.add("hidden");
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.innerHTML = "Belum ada data bank.<br>Input pemasukan atau pengeluaran untuk menampilkan chart.";
    container.appendChild(empty);
    return;
  }

  bankBalanceChartInstance = new Chart(bankBalanceChartCanvas, {
    type: "bar",
    data: {
      labels: banks.map((bank) => bank.name),
      datasets: [
        {
          label: "Saldo",
          data: banks.map((bank) => bank.balance),
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 28,
          maxBarThickness: 32
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Saldo: ${formatRupiah(context.raw || 0)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: getChartTextColor(),
            callback: function(value) {
              return formatRupiah(value);
            }
          },
          grid: {
            color: getChartGridColor()
          }
        },
        y: {
          ticks: {
            color: getChartTextColor(),
            font: {
              size: 12,
              weight: "800"
            }
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}


function renderCashflowChart() {
  if (!cashflowChartCanvas || typeof Chart === "undefined") {
    return;
  }

  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const remaining = totalIncome - totalExpense;

  if (cashflowChartInstance) {
    cashflowChartInstance.destroy();
    cashflowChartInstance = null;
  }

  cashflowChartInstance = new Chart(cashflowChartCanvas, {
    type: "bar",
    data: {
      labels: ["Pemasukan", "Pengeluaran", "Sisa Uang"],
      datasets: [
        {
          label: "Nominal",
          data: [totalIncome, totalExpense, remaining],
          borderRadius: 12,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return formatRupiah(context.raw || 0);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: getChartTextColor(),
            font: {
              size: 12,
              weight: "800"
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            color: getChartTextColor(),
            callback: function(value) {
              return formatRupiah(value);
            }
          },
          grid: {
            color: getChartGridColor()
          }
        }
      }
    }
  });
}


function renderTable() {
  const rows = getUnifiedTransactions();

  if (rows.length === 0) {
    tabelContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">▦</div>
        <h3>Belum ada transaksi</h3>
        <p>Input pemasukan, pengeluaran, atau transfer untuk mulai melacak budget.</p>
      </div>
    `;
    return;
  }

  tabelContainer.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Tipe</th>
            <th>Bank/Dompet</th>
            <th>Kategori/Sumber</th>
            <th>Nominal</th>
            <th>Keterangan</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td class="date-cell">${formatDateID(item.tanggal)}</td>
              <td>${typeBadge(item.type)}</td>
              <td><span class="badge badge-bank">${escapeHTML(item.bankName || "-")}</span></td>
              <td>${escapeHTML(item.title)}</td>
              <td>${amountDisplay(item)}</td>
              <td class="note-cell">${escapeHTML(item.keterangan || "-")}</td>
              <td>
                <div class="row-actions">
                  <button class="edit-small" data-type="${item.type}" data-id="${item.id}" type="button">Edit</button>
                  <button class="delete-small" data-type="${item.type}" data-id="${item.id}" type="button">Hapus</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.querySelectorAll(".delete-small").forEach((button) => {
    button.addEventListener("click", () => deleteTransaction(button.dataset.type, button.dataset.id));
  });

  document.querySelectorAll(".edit-small").forEach((button) => {
    button.addEventListener("click", () => openEditModal(button.dataset.type, button.dataset.id));
  });
}

function findTransaction(type, id) {
  if (type === "income") return incomes.find((item) => item.id === id);
  if (type === "expense") return expenses.find((item) => item.id === id);
  if (type === "transfer") return transfers.find((item) => item.id === id);
  return null;
}

function openEditModal(type, id) {
  const item = findTransaction(type, id);

  if (!item) {
    setNotice(transactionMessage, "error", "Data transaksi tidak ditemukan.");
    return;
  }

  editId.value = id;
  editType.value = type;
  editTanggal.value = item.tanggal || "";
  editNominal.value = item.nominal || "";
  editKeterangan.value = item.keterangan || "";

  editIncomeFields.classList.toggle("hidden", type !== "income");
  editExpenseFields.classList.toggle("hidden", type !== "expense");
  editTransferFields.classList.toggle("hidden", type !== "transfer");

  if (type === "income") {
    editTitle.textContent = "Edit Pemasukan";
    editIncomeBank.value = item.bankName || "";
    editIncomeSource.value = item.sumber || "";
  }

  if (type === "expense") {
    editTitle.textContent = "Edit Pengeluaran";
    editExpenseBank.value = item.bankName || "";
    editExpenseKategori.value = item.kategori || "Lainnya";
  }

  if (type === "transfer") {
    editTitle.textContent = "Edit Transfer";
    editTransferFromBank.value = item.fromBankName || "";
    editTransferToBank.value = item.toBankName || "";
  }

  setNotice(editMessage, "info", "Ubah data transaksi, lalu klik Simpan Perubahan.");
  editModal.classList.remove("hidden");
}

function closeModal() {
  editModal.classList.add("hidden");
  editForm.reset();
}

async function saveEditedTransaction(event) {
  event.preventDefault();

  const type = editType.value;
  const id = editId.value;
  const tanggal = editTanggal.value;
  const nominal = Number(editNominal.value);
  const keterangan = cleanText(editKeterangan.value);

  if (!tanggal || !nominal || nominal <= 0) {
    setNotice(editMessage, "error", "Tanggal dan nominal wajib diisi dengan benar.");
    return;
  }

  let payload = {
    tanggal,
    nominal,
    keterangan,
    updatedAt: serverTimestamp()
  };

  if (type === "income") {
    const bank = normalizeBank(editIncomeBank.value);
    const sumber = cleanText(editIncomeSource.value);

    if (!bank.key || !sumber) {
      setNotice(editMessage, "error", "Bank dan sumber pemasukan wajib diisi.");
      return;
    }

    payload = {
      ...payload,
      bankKey: bank.key,
      bankName: bank.display,
      sumber
    };
  }

  if (type === "expense") {
    const bank = normalizeBank(editExpenseBank.value);
    const kategori = editExpenseKategori.value;

    if (!bank.key || !kategori) {
      setNotice(editMessage, "error", "Bank dan kategori wajib diisi.");
      return;
    }

    payload = {
      ...payload,
      bankKey: bank.key,
      bankName: bank.display,
      kategori
    };
  }

  if (type === "transfer") {
    const fromBank = normalizeBank(editTransferFromBank.value);
    const toBank = normalizeBank(editTransferToBank.value);

    if (!fromBank.key || !toBank.key) {
      setNotice(editMessage, "error", "Bank asal dan bank tujuan wajib diisi.");
      return;
    }

    if (fromBank.key === toBank.key) {
      setNotice(editMessage, "error", "Bank asal dan tujuan terbaca sama.");
      return;
    }

    payload = {
      ...payload,
      fromBankKey: fromBank.key,
      fromBankName: fromBank.display,
      toBankKey: toBank.key,
      toBankName: toBank.display
    };
  }

  const collectionName = {
    income: "incomes",
    expense: "expenses",
    transfer: "transfers"
  }[type];

  saveEditButton.disabled = true;
  saveEditButton.textContent = "Menyimpan...";

  try {
    await updateDoc(doc(db, "users", currentUser.uid, collectionName, id), payload);
    setNotice(transactionMessage, "success", "Transaksi berhasil diperbarui.");
    closeModal();
  } catch (error) {
    setNotice(editMessage, "error", firebaseErrorMessage(error.code));
  } finally {
    saveEditButton.disabled = false;
    saveEditButton.textContent = "Simpan Perubahan";
  }
}

async function deleteTransaction(type, id) {
  const confirmed = confirm("Yakin ingin menghapus transaksi ini?");
  if (!confirmed) return;

  const collectionName = {
    income: "incomes",
    expense: "expenses",
    transfer: "transfers"
  }[type];

  try {
    await deleteDoc(doc(db, "users", currentUser.uid, collectionName, id));
    setNotice(transactionMessage, "success", "Transaksi berhasil dihapus.");
  } catch (error) {
    setNotice(transactionMessage, "error", firebaseErrorMessage(error.code));
  }
}

function resetFilters() {
  filterTanggal.value = "";
  filterTipe.value = "Semua";
  filterBank.value = "";
  renderAll();
}

function downloadCSV() {
  const data = getUnifiedTransactions();

  if (data.length === 0) {
    alert("Belum ada data yang bisa di-download.");
    return;
  }

  let csv = "Tanggal,Tipe,Bank,Kategori/Sumber,Nominal,Keterangan\n";

  data.forEach((item) => {
    csv += [
      escapeCSV(item.tanggal),
      escapeCSV(item.type),
      escapeCSV(item.bankName),
      escapeCSV(item.title),
      item.nominal,
      escapeCSV(item.keterangan)
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "budget_tracker.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadExcel() {
  const data = getUnifiedTransactions();

  if (data.length === 0) {
    alert("Belum ada data yang bisa di-download.");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("Library Excel belum terbaca. Pastikan koneksi internet aktif.");
    return;
  }

  const workbook = XLSX.utils.book_new();

  const summaryRows = getBankBalances().map((bank) => ({
    Bank: bank.name,
    Key: bank.key,
    Saldo: bank.balance,
    Pemasukan: bank.income,
    Pengeluaran: bank.expense,
    Transfer_Masuk: bank.transferIn,
    Transfer_Keluar: bank.transferOut
  }));

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Saldo Bank");

  const transactionRows = data.map((item) => ({
    Tanggal: item.tanggal,
    Tipe: item.type,
    Bank: item.bankName,
    Kategori_Sumber: item.title,
    Nominal: item.nominal,
    Keterangan: item.keterangan
  }));

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionRows), "Semua Transaksi");

  const groupedByDate = {};
  transactionRows.forEach((item) => {
    if (!groupedByDate[item.Tanggal]) groupedByDate[item.Tanggal] = [];
    groupedByDate[item.Tanggal].push(item);
  });

  Object.keys(groupedByDate).sort().forEach((tanggal) => {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(groupedByDate[tanggal]),
      tanggal.replaceAll("-", "_")
    );
  });

  XLSX.writeFile(workbook, "budget_tracker.xlsx");
}

function showAuth() {
  authScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
  incomes = [];
  expenses = [];
  transfers = [];
}

function showApp(user) {
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  userEmail.textContent = user.email;
  userInitial.textContent = user.email ? user.email[0].toUpperCase() : "U";

  listenData();
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    showApp(user);
  } else {
    currentUser = null;
    unsubscribeAll();
    showAuth();
  }
});

loginTab.addEventListener("click", () => switchAuthMode("login"));
registerTab.addEventListener("click", () => switchAuthMode("register"));
authForm.addEventListener("submit", handleAuthSubmit);

incomeTab.addEventListener("click", () => switchInputMode("income"));
expenseTab.addEventListener("click", () => switchInputMode("expense"));
transferTab.addEventListener("click", () => switchInputMode("transfer"));

incomeForm.addEventListener("submit", saveIncome);
expenseForm.addEventListener("submit", saveExpense);
transferForm.addEventListener("submit", saveTransfer);

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

filterTanggal.addEventListener("change", renderAll);
filterTipe.addEventListener("change", renderAll);
filterBank.addEventListener("input", renderAll);
resetFilterButton.addEventListener("click", resetFilters);
downloadCsvButton.addEventListener("click", downloadCSV);
downloadExcelButton.addEventListener("click", downloadExcel);

closeEditModal.addEventListener("click", closeModal);
cancelEditButton.addEventListener("click", closeModal);
editForm.addEventListener("submit", saveEditedTransaction);

editModal.addEventListener("click", (event) => {
  if (event.target === editModal) {
    closeModal();
  }
});

setToday();
