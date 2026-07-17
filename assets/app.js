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
  console.warn("Auth persistence fallback:", error);
});

let currentUser = null;
let txMode = "income";
let incomes = [];
let expenses = [];
let transfers = [];
let unsubscribeList = [];
let bankBalanceChart = null;
let cashflowChart = null;
let selectedScreenshotFile = null;
let latestScanResult = null;
let scannedTransactions = [];

const $ = (id) => document.getElementById(id);

const authScreen = $("authScreen");
const appShell = $("appShell");
const loginTab = $("loginTab");
const registerTab = $("registerTab");
const authForm = $("authForm");
const authEmail = $("authEmail");
const authPassword = $("authPassword");
const authButton = $("authButton");
const authMessage = $("authMessage");
const userEmail = $("userEmail");
const logoutButton = $("logoutButton");

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
const bankBalanceChartCanvas = $("bankBalanceChart");
const cashflowChartCanvas = $("cashflowChart");

const typeFilter = $("typeFilter");
const searchInput = $("searchInput");
const tableContainer = $("tableContainer");
const downloadCSVButton = $("downloadCSVButton");
const downloadExcelButton = $("downloadExcelButton");

const screenshotInput = $("screenshotInput");
const screenshotPreviewBox = $("screenshotPreviewBox");
const scanScreenshotButton = $("scanScreenshotButton");
const scanMessage = $("scanMessage");
const scanResultCard = $("scanResultCard");
const scanReviewForm = $("scanReviewForm");
const scanConfidenceBadge = $("scanConfidenceBadge");
const scanType = $("scanType");
const scanTanggal = $("scanTanggal");
const scanBank = $("scanBank");
const scanToBankWrap = $("scanToBankWrap");
const scanToBank = $("scanToBank");
const scanMerchant = $("scanMerchant");
const scanKategori = $("scanKategori");
const scanNominal = $("scanNominal");
const scanKeterangan = $("scanKeterangan");
const scanNoteInput = $("scanNoteInput");
const saveScannedTransactionButton = $("saveScannedTransactionButton");

const multiScanResultCard = $("multiScanResultCard");
const multiScanCountBadge = $("multiScanCountBadge");
const multiScanTableContainer = $("multiScanTableContainer");
const selectAllScannedButton = $("selectAllScannedButton");
const saveSelectedScannedButton = $("saveSelectedScannedButton");

const generateAdviceButton = $("generateAdviceButton");
const advisorOutput = $("advisorOutput");

const editModal = $("editModal");
const closeEditModal = $("closeEditModal");
const cancelEditButton = $("cancelEditButton");
const editForm = $("editForm");
const editTitle = $("editTitle");
const editId = $("editId");
const editType = $("editType");
const editTanggal = $("editTanggal");
const editIncomeFields = $("editIncomeFields");
const editExpenseFields = $("editExpenseFields");
const editTransferFields = $("editTransferFields");
const editIncomeBank = $("editIncomeBank");
const editIncomeSource = $("editIncomeSource");
const editExpenseBank = $("editExpenseBank");
const editExpenseKategori = $("editExpenseKategori");
const editTransferFromBank = $("editTransferFromBank");
const editTransferToBank = $("editTransferToBank");
const editNominal = $("editNominal");
const editKeterangan = $("editKeterangan");
const editMessage = $("editMessage");

let authMode = "login";

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
  tunai: ["cash", "tunai", "uang cash"]
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
  tunai: "Tunai"
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
      return {
        key,
        display: BANK_DISPLAY[key]
      };
    }
  }

  if (!slug) {
    return {
      key: "",
      display: ""
    };
  }

  return {
    key: slug.replace(/\s+/g, "_"),
    display: raw
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ")
  };
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
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function setNotice(element, type, message) {
  if (!element) return;
  element.className = `notice ${type}`;
  element.textContent = message;
}

function hideNotice(element) {
  if (!element) return;
  element.className = "notice hidden";
  element.textContent = "";
}

function getFirebaseAuthMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/email-already-in-use": "Email ini sudah terdaftar. Gunakan Login.",
    "auth/weak-password": "Password terlalu lemah. Gunakan minimal 6 karakter.",
    "auth/user-not-found": "Akun tidak ditemukan. Pilih Register dulu.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah. Jika belum punya akun, pilih Register dulu.",
    "auth/network-request-failed": "Koneksi internet bermasalah. Cek internet HP lalu coba lagi.",
    "auth/operation-not-allowed": "Login Email/Password belum aktif di Firebase Authentication.",
    "auth/unauthorized-domain": "Domain website belum diizinkan. Tambahkan arndyka.github.io di Firebase Authorized Domains.",
    "auth/too-many-requests": "Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.",
    "permission-denied": "Akses database ditolak. Periksa Firestore Rules."
  };
  return messages[code] || error?.message || "Terjadi error.";
}

function showAuth() {
  authScreen.classList.remove("hidden");
  appShell.classList.add("hidden");
}

function showApp() {
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function setAuthMode(mode) {
  authMode = mode;
  loginTab.classList.toggle("active", mode === "login");
  registerTab.classList.toggle("active", mode === "register");
  authButton.textContent = mode === "login" ? "Login" : "Register";
  authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
  hideNotice(authMessage);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  hideNotice(authMessage);

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
    setNotice(authMessage, "error", getFirebaseAuthMessage(error));
  } finally {
    authButton.disabled = false;
    authButton.textContent = authMode === "login" ? "Login" : "Register";
  }
}

async function handleLogout() {
  await signOut(auth);
}

function collectionRef(name) {
  return collection(db, "users", currentUser.uid, name);
}

function docRef(name, id) {
  return doc(db, "users", currentUser.uid, name, id);
}

function clearSubscriptions() {
  unsubscribeList.forEach((unsubscribe) => unsubscribe());
  unsubscribeList = [];
}

function subscribeData() {
  clearSubscriptions();

  const incomeQuery = query(collectionRef("incomes"), orderBy("tanggal", "desc"));
  const expenseQuery = query(collectionRef("expenses"), orderBy("tanggal", "desc"));
  const transferQuery = query(collectionRef("transfers"), orderBy("tanggal", "desc"));

  unsubscribeList.push(onSnapshot(incomeQuery, (snapshot) => {
    incomes = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderAll();
  }));

  unsubscribeList.push(onSnapshot(expenseQuery, (snapshot) => {
    expenses = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderAll();
  }));

  unsubscribeList.push(onSnapshot(transferQuery, (snapshot) => {
    transfers = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderAll();
  }));
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

async function saveTransaction(event) {
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

      if (!bank.key) {
        setNotice(formMessage, "error", "Bank/Dompet wajib diisi.");
        return;
      }

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
    }

    if (txMode === "expense") {
      const bank = normalizeBank(bankInput.value);
      const kategori = categoryInput.value || "Lainnya";

      if (!bank.key) {
        setNotice(formMessage, "error", "Bank/Dompet wajib diisi.");
        return;
      }

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
    }

    if (txMode === "transfer") {
      const fromBank = normalizeBank(fromBankInput.value);
      const toBank = normalizeBank(toBankInput.value);

      if (!fromBank.key || !toBank.key) {
        setNotice(formMessage, "error", "Bank asal dan tujuan wajib diisi.");
        return;
      }

      if (fromBank.key === toBank.key) {
        setNotice(formMessage, "error", "Bank asal dan tujuan tidak boleh sama.");
        return;
      }

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
    }

    transactionForm.reset();
    tanggalInput.value = formatDateLocal();
    setNotice(formMessage, "success", "Transaksi berhasil disimpan.");
  } catch (error) {
    setNotice(formMessage, "error", getFirebaseAuthMessage(error));
  }
}

function getBankBalances() {
  const map = new Map();

  const ensure = (key, name) => {
    if (!map.has(key)) {
      map.set(key, {
        key,
        name,
        income: 0,
        expense: 0,
        transferIn: 0,
        transferOut: 0,
        balance: 0
      });
    }
    return map.get(key);
  };

  incomes.forEach((item) => {
    const bank = ensure(item.bankKey || normalizeBank(item.bankName).key, item.bankName || "Belum Dicatat");
    bank.income += Number(item.nominal || 0);
  });

  expenses.forEach((item) => {
    const bank = ensure(item.bankKey || normalizeBank(item.bankName).key, item.bankName || "Belum Dicatat");
    bank.expense += Number(item.nominal || 0);
  });

  transfers.forEach((item) => {
    const fromBank = ensure(item.fromBankKey || normalizeBank(item.fromBankName).key, item.fromBankName || "Belum Dicatat");
    const toBank = ensure(item.toBankKey || normalizeBank(item.toBankName).key, item.toBankName || "Belum Dicatat");
    fromBank.transferOut += Number(item.nominal || 0);
    toBank.transferIn += Number(item.nominal || 0);
  });

  return [...map.values()]
    .map((bank) => ({
      ...bank,
      balance: bank.income - bank.expense + bank.transferIn - bank.transferOut
    }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
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
  const banks = getBankBalances().filter((bank) => bank.income || bank.expense || bank.transferIn || bank.transferOut);

  totalIncomeEl.textContent = formatRupiah(totalIncome);
  totalExpenseEl.textContent = formatRupiah(totalExpense);
  remainingBalanceEl.textContent = formatRupiah(remaining);
  bankCountEl.textContent = banks.length;
}

function renderBankBalances() {
  const banks = getBankBalances();

  if (!banks.length) {
    bankBalanceGrid.innerHTML = `<div class="empty-state">Belum ada saldo bank/dompet.</div>`;
    return;
  }

  bankBalanceGrid.innerHTML = banks.map((bank) => `
    <article class="bank-card">
      <p class="bank-name">${bank.name}</p>
      <div class="bank-balance">${formatRupiah(bank.balance)}</div>
      <div class="bank-detail">
        Pemasukan: ${formatRupiah(bank.income)}<br>
        Pengeluaran: ${formatRupiah(bank.expense)}<br>
        Transfer masuk: ${formatRupiah(bank.transferIn)}<br>
        Transfer keluar: ${formatRupiah(bank.transferOut)}
      </div>
    </article>
  `).join("");
}

function renderCharts() {
  renderBankChart();
  renderCashflowChart();
}

function renderBankChart() {
  if (!bankBalanceChartCanvas || typeof Chart === "undefined") return;

  const banks = getBankBalances().filter((bank) => bank.balance !== 0 || bank.income || bank.expense || bank.transferIn || bank.transferOut);

  if (bankBalanceChart) {
    bankBalanceChart.destroy();
    bankBalanceChart = null;
  }

  bankBalanceChart = new Chart(bankBalanceChartCanvas, {
    type: "bar",
    data: {
      labels: banks.length ? banks.map((bank) => bank.name) : ["Belum ada data"],
      datasets: [{
        label: "Saldo",
        data: banks.length ? banks.map((bank) => bank.balance) : [0],
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 26,
        maxBarThickness: 32
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => formatRupiah(context.raw || 0)
          }
        }
      },
      scales: {
        x: {
          ticks: {
            callback: (value) => formatRupiah(value)
          }
        },
        y: {
          grid: { display: false }
        }
      }
    }
  });
}

function renderCashflowChart() {
  if (!cashflowChartCanvas || typeof Chart === "undefined") return;

  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const remaining = totalIncome - totalExpense;

  if (cashflowChart) {
    cashflowChart.destroy();
    cashflowChart = null;
  }

  cashflowChart = new Chart(cashflowChartCanvas, {
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
        tooltip: {
          callbacks: {
            label: (context) => formatRupiah(context.raw || 0)
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => formatRupiah(value)
          }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function getAllTransactions() {
  const incomeRows = incomes.map((item) => ({
    ...item,
    type: "income",
    title: item.sumber || "Pemasukan",
    bankText: item.bankName || "-",
    kategoriText: "Pemasukan"
  }));

  const expenseRows = expenses.map((item) => ({
    ...item,
    type: "expense",
    title: item.merchant || item.keterangan || item.kategori || "Pengeluaran",
    bankText: item.bankName || "-",
    kategoriText: item.kategori || "Lainnya"
  }));

  const transferRows = transfers.map((item) => ({
    ...item,
    type: "transfer",
    title: "Transfer",
    bankText: `${item.fromBankName || "-"} → ${item.toBankName || "-"}`,
    kategoriText: "Transfer"
  }));

  return [...incomeRows, ...expenseRows, ...transferRows]
    .sort((a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || "")));
}

function getFilteredTransactions() {
  const type = typeFilter.value;
  const search = slugText(searchInput.value);

  return getAllTransactions().filter((item) => {
    const typeMatch = type === "all" || item.type === type;
    const haystack = slugText([
      item.tanggal,
      item.title,
      item.bankText,
      item.kategoriText,
      item.keterangan,
      item.merchant,
      item.scanNote
    ].join(" "));
    const searchMatch = !search || haystack.includes(search);
    return typeMatch && searchMatch;
  });
}

function renderTable() {
  const rows = getFilteredTransactions();

  if (!rows.length) {
    tableContainer.innerHTML = `<div class="empty-state">Belum ada transaksi.</div>`;
    return;
  }

  tableContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Tanggal</th>
          <th>Tipe</th>
          <th>Bank/Dompet</th>
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
            <td><span class="badge ${item.type}">${getTypeLabel(item.type)}</span></td>
            <td>${item.bankText || "-"}</td>
            <td>${item.kategoriText || "-"}</td>
            <td>${formatRupiah(item.nominal)}</td>
            <td>${item.keterangan || item.title || "-"}</td>
            <td>${item.scanNote || "-"}</td>
            <td>
              <div class="row-actions">
                <button class="small-btn" type="button" data-action="edit" data-type="${item.type}" data-id="${item.id}">Edit</button>
                <button class="small-btn danger" type="button" data-action="delete" data-type="${item.type}" data-id="${item.id}">Hapus</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function getTypeLabel(type) {
  if (type === "income") return "Pemasukan";
  if (type === "expense") return "Pengeluaran";
  return "Transfer";
}

function getCollectionName(type) {
  if (type === "income") return "incomes";
  if (type === "expense") return "expenses";
  return "transfers";
}

function findTransaction(type, id) {
  if (type === "income") return incomes.find((item) => item.id === id);
  if (type === "expense") return expenses.find((item) => item.id === id);
  return transfers.find((item) => item.id === id);
}

function openEditModal(type, id) {
  const item = findTransaction(type, id);
  if (!item) return;

  editId.value = id;
  editType.value = type;
  editTanggal.value = item.tanggal || formatDateLocal();
  editNominal.value = item.nominal || "";
  editKeterangan.value = item.keterangan || "";
  editTitle.textContent = `Edit ${getTypeLabel(type)}`;

  editIncomeFields.classList.toggle("hidden", type !== "income");
  editExpenseFields.classList.toggle("hidden", type !== "expense");
  editTransferFields.classList.toggle("hidden", type !== "transfer");

  if (type === "income") {
    editIncomeBank.value = item.bankName || "";
    editIncomeSource.value = item.sumber || "";
  }

  if (type === "expense") {
    editExpenseBank.value = item.bankName || "";
    editExpenseKategori.value = item.kategori || "Lainnya";
  }

  if (type === "transfer") {
    editTransferFromBank.value = item.fromBankName || "";
    editTransferToBank.value = item.toBankName || "";
  }

  hideNotice(editMessage);
  editModal.classList.remove("hidden");
}

function closeModal() {
  editModal.classList.add("hidden");
}

async function saveEditedTransaction(event) {
  event.preventDefault();
  hideNotice(editMessage);

  const id = editId.value;
  const type = editType.value;
  const tanggal = editTanggal.value;
  const nominal = Number(editNominal.value);
  const keterangan = cleanText(editKeterangan.value);

  if (!tanggal || !nominal || nominal <= 0) {
    setNotice(editMessage, "error", "Tanggal dan nominal wajib diisi.");
    return;
  }

  try {
    const collectionName = getCollectionName(type);
    let payload = {
      tanggal,
      nominal,
      keterangan,
      updatedAt: serverTimestamp()
    };

    if (type === "income") {
      const bank = normalizeBank(editIncomeBank.value);
      payload = {
        ...payload,
        bankKey: bank.key,
        bankName: bank.display,
        sumber: cleanText(editIncomeSource.value) || "Pemasukan"
      };
    }

    if (type === "expense") {
      const bank = normalizeBank(editExpenseBank.value);
      payload = {
        ...payload,
        bankKey: bank.key,
        bankName: bank.display,
        kategori: editExpenseKategori.value || "Lainnya"
      };
    }

    if (type === "transfer") {
      const fromBank = normalizeBank(editTransferFromBank.value);
      const toBank = normalizeBank(editTransferToBank.value);
      payload = {
        ...payload,
        fromBankKey: fromBank.key,
        fromBankName: fromBank.display,
        toBankKey: toBank.key,
        toBankName: toBank.display
      };
    }

    await updateDoc(docRef(collectionName, id), payload);
    closeModal();
  } catch (error) {
    setNotice(editMessage, "error", getFirebaseAuthMessage(error));
  }
}

async function deleteTransaction(type, id) {
  const ok = confirm("Hapus transaksi ini?");
  if (!ok) return;

  try {
    await deleteDoc(docRef(getCollectionName(type), id));
  } catch (error) {
    alert(getFirebaseAuthMessage(error));
  }
}

function sanitizeFilePart(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/rp/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function buildScanNote(bank, tanggal, kategori, nominal) {
  const bankPart = cleanText(bank || "Bank tidak terbaca");
  const datePart = tanggal || formatDateLocal();
  const categoryPart = cleanText(kategori || "Lainnya");
  const amountPart = formatRupiah(Number(nominal || 0));
  return `${bankPart} | ${datePart} | ${categoryPart} | ${amountPart}`;
}

function handleScreenshotPreview() {
  const files = [...(screenshotInput.files || [])];

  selectedScreenshotFile = files[0] || null;
  latestScanResult = null;
  scannedTransactions = [];
  scanResultCard.classList.add("hidden");
  multiScanResultCard.classList.add("hidden");

  if (!files.length) {
    screenshotPreviewBox.className = "screenshot-preview empty-preview";
    screenshotPreviewBox.innerHTML = "<span>Preview screenshot/PDF akan muncul di sini.</span>";
    return;
  }

  const invalid = files.find((file) => !file.type.startsWith("image/") && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"));
  if (invalid) {
    setNotice(scanMessage, "error", "File harus berupa gambar atau PDF.");
    screenshotInput.value = "";
    selectedScreenshotFile = null;
    return;
  }

  const firstFile = files[0];

  if (firstFile.type === "application/pdf" || firstFile.name.toLowerCase().endsWith(".pdf")) {
    screenshotPreviewBox.className = "screenshot-preview empty-preview";
    screenshotPreviewBox.innerHTML = `
      <div class="pdf-page-preview">
        <strong>${files.length} file dipilih</strong>
        <span>PDF akan dirender per halaman lalu dibaca OCR.</span>
      </div>
    `;
  } else {
    const previewUrl = URL.createObjectURL(firstFile);
    screenshotPreviewBox.className = "screenshot-preview";
    screenshotPreviewBox.innerHTML = `<img src="${previewUrl}" alt="Preview screenshot transaksi">`;
  }

  setNotice(scanMessage, "info", `${files.length} file siap discan. Klik Scan File.`);
}

function setScanLoading(isLoading) {
  scanScreenshotButton.disabled = isLoading;
  scanScreenshotButton.textContent = isLoading ? "Membaca OCR..." : "Scan Screenshot";
}


async function renderPdfToCanvases(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js belum termuat. Refresh halaman lalu coba lagi.");
  }

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const canvases = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    canvases.push({
      source: canvas,
      label: `${file.name} halaman ${pageNumber}`
    });
  }

  return canvases;
}

async function buildOcrTargets(files) {
  const targets = [];

  for (const file of files) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      const canvases = await renderPdfToCanvases(file);
      targets.push(...canvases);
    } else {
      targets.push({
        source: file,
        label: file.name
      });
    }
  }

  return targets;
}

function parseDateLineToIso(line) {
  const text = cleanOcrLine(line);
  const currentYear = new Date().getFullYear();

  let match = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    return `${match[3]}-${month}-${day}`;
  }

  match = text.match(/(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (match) {
    const month = match[2].padStart(2, "0");
    const day = match[3].padStart(2, "0");
    return `${match[1]}-${month}-${day}`;
  }

  const monthMap = {
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

  match = text.toLowerCase().match(/(\d{1,2})\s+([a-zA-Z]+)\s+(20\d{2})?/);
  if (match && monthMap[match[2]]) {
    const day = match[1].padStart(2, "0");
    const month = monthMap[match[2]];
    const year = match[3] || currentYear;
    return `${year}-${month}-${day}`;
  }

  return "";
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

  const upperFix = {
    familymart: "FamilyMart",
    famiymart: "FamilyMart",
    famlymart: "FamilyMart"
  };

  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  if (upperFix[key]) return upperFix[key];

  return text;
}

function inferMerchantFromGroup(groupLines) {
  const priority = groupLines.find((line) => /\b(ke|dari)\b\s+[a-zA-Z]/i.test(line));
  if (priority) {
    return cleanMerchantName(priority);
  }

  const ignore = [
    "qr bayar", "bayar/top-up", "bayar", "top-up", "transfer rupiah", "transfer",
    "pembayaran qr", "transaksi", "e-statement", "april", "mei", "juni", "juli",
    "mandiri", "bca", "bri", "bni", "rp", "idr"
  ];

  const candidate = groupLines.find((line) => {
    const lower = line.toLowerCase();
    if (ignore.some((word) => lower.includes(word))) return false;
    if (line.length < 3 || line.length > 50) return false;
    if (/^\d+$/.test(line)) return false;
    return /[a-zA-Z]/.test(line);
  });

  return candidate ? cleanMerchantName(candidate) : "";
}

function inferTypeFromGroup(groupLines, sign) {
  const context = groupLines.join(" ").toLowerCase();

  if (sign === "+") return "income";
  if (sign === "-") return "expense";

  if (/(qr bayar|bayar\/top.?up|bayar|pembayaran|top.?up|purchase|payment)/.test(context)) return "expense";
  if (/(transfer rupiah|transfer|kirim uang)/.test(context)) return "transfer";
  if (/(dana masuk|uang masuk|incoming|received|refund|cashback|gaji|salary)/.test(context)) return "income";

  return "expense";
}

function inferCategoryFromMerchantAndGroup(merchant, groupLines, type) {
  if (type === "transfer") return "Transfer";
  if (type === "income") return "Pemasukan";

  const context = `${merchant} ${groupLines.join(" ")}`.toLowerCase();

  if (/(ayam|sambel|sambal|kopi|coffee|kedai|makan|food|restaurant|resto|nasi|mie|bakso|sate|kfc|mcd|starbucks|familymart|familiymart|indomaret|alfamart)/.test(context)) {
    return "Makan";
  }

  if (/(grab|gojek|gocar|goride|taxi|taksi|tol|parkir|parking|pertamina|bensin|shell)/.test(context)) {
    return "Transportasi";
  }

  if (/(tokopedia|shopee|lazada|blibli|belanja|mall|store|miniso)/.test(context)) {
    return "Belanja";
  }

  if (/(pln|listrik|pdam|internet|wifi|telkom|indihome|bpjs|tagihan|pulsa|data|token)/.test(context)) {
    return "Tagihan";
  }

  if (/(netflix|spotify|bioskop|cinema|game|steam|hiburan)/.test(context)) {
    return "Hiburan";
  }

  if (/(apotek|pharmacy|klinik|rumah sakit|hospital|obat|dokter)/.test(context)) {
    return "Kesehatan";
  }

  return "Lainnya";
}

function parseMultiTransactionsFromOcr(rawText, sourceLabel = "") {
  const text = normalizeOcrText(rawText);
  const lines = text
    .split("\n")
    .map((line) => cleanOcrLine(line))
    .filter(Boolean);

  const bank = extractBankFromOcr(text);
  let currentDate = "";
  const results = [];

  lines.forEach((line, index) => {
    const date = parseDateLineToIso(line);
    if (date) {
      currentDate = date;
    }

    const amountInfo = extractAmountWithSign(line);
    if (!amountInfo) return;

    const groupStart = Math.max(0, index - 4);
    const groupEnd = Math.min(lines.length, index + 4);
    const groupLines = lines.slice(groupStart, groupEnd);

    const type = inferTypeFromGroup(groupLines, amountInfo.sign);
    const merchant = inferMerchantFromGroup(groupLines);
    const kategori = inferCategoryFromMerchantAndGroup(merchant, groupLines, type);
    const tanggal = currentDate || extractDateFromOcr(groupLines.join("\n"));
    const nominal = amountInfo.amount;
    const confidence = calculateOcrConfidence({ nominal, bank, merchant, tanggal, kategori });

    // Hindari duplikat amount yang sama pada grup sama.
    const duplicate = results.some((item) =>
      item.tanggal === tanggal &&
      item.nominal === nominal &&
      item.type === type &&
      item.merchant === merchant
    );

    if (!duplicate && nominal >= 1000) {
      results.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${index}-${Math.random()}`,
        selected: type !== "income" || results.length === 0,
        type,
        tanggal,
        bank,
        toBank: "",
        merchant,
        kategori,
        nominal,
        keterangan: merchant ? `OCR: ${merchant}` : `OCR dari ${sourceLabel || "file"}`,
        confidence,
        scanNote: buildScanNote(bank, tanggal, kategori, nominal),
        sourceLabel
      });
    }
  });

  if (results.length) {
    return results;
  }

  const single = parseOcrTransaction(text, { name: sourceLabel || "file" });
  if (single.nominal) {
    return [{
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      selected: true,
      ...single,
      scanNote: buildScanNote(single.bank, single.tanggal, single.kategori, single.nominal),
      sourceLabel
    }];
  }

  return [];
}

function renderMultiScanTable() {
  if (!scannedTransactions.length) {
    multiScanResultCard.classList.add("hidden");
    return;
  }

  multiScanResultCard.classList.remove("hidden");
  multiScanCountBadge.textContent = `${scannedTransactions.length} item`;

  multiScanTableContainer.innerHTML = `
    <table class="multi-scan-table">
      <thead>
        <tr>
          <th class="check-cell">Pilih</th>
          <th>Tanggal</th>
          <th>Tipe</th>
          <th>Bank</th>
          <th>Bank Tujuan</th>
          <th>Merchant/Sumber</th>
          <th>Kategori</th>
          <th class="nominal-cell">Nominal</th>
          <th>Keterangan</th>
          <th>Confidence</th>
          <th>Hapus</th>
        </tr>
      </thead>
      <tbody>
        ${scannedTransactions.map((item, index) => `
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
            <td><input data-field="bank" type="text" value="${item.bank || ""}"></td>
            <td><input data-field="toBank" type="text" value="${item.toBank || ""}" placeholder="Khusus transfer"></td>
            <td><input data-field="merchant" type="text" value="${item.merchant || ""}"></td>
            <td>
              <select data-field="kategori">
                ${["Makan", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Transfer", "Pemasukan", "Lainnya"].map((category) =>
                  `<option value="${category}" ${item.kategori === category ? "selected" : ""}>${category}</option>`
                ).join("")}
              </select>
            </td>
            <td><input data-field="nominal" type="number" min="1" value="${item.nominal || ""}"></td>
            <td><input data-field="keterangan" type="text" value="${item.keterangan || ""}"></td>
            <td>${Math.round(Number(item.confidence || 0) * 100)}%</td>
            <td><button class="small-btn danger" type="button" data-remove-scan="${index}">Hapus</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function syncMultiScanFromTable() {
  const rows = multiScanTableContainer.querySelectorAll("tr[data-index]");
  rows.forEach((row) => {
    const index = Number(row.dataset.index);
    const item = scannedTransactions[index];
    if (!item) return;

    row.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      if (field === "selected") {
        item.selected = input.checked;
      } else if (field === "nominal") {
        item.nominal = Number(input.value || 0);
      } else {
        item[field] = input.value;
      }
    });

    item.scanNote = buildScanNote(item.bank, item.tanggal, item.kategori, item.nominal);
  });
}

async function saveOneScannedTransaction(item) {
  const type = item.type;
  const tanggal = item.tanggal;
  const nominal = Number(item.nominal || 0);
  const bank = normalizeBank(item.bank);
  const toBank = normalizeBank(item.toBank);
  const merchant = cleanText(item.merchant);
  const kategori = item.kategori || "Lainnya";
  const keterangan = cleanText(item.keterangan);
  const scanNote = buildScanNote(bank.display, tanggal, kategori, nominal);

  if (!tanggal || !nominal || nominal <= 0 || !bank.key) {
    throw new Error(`Data belum lengkap: ${scanNote}`);
  }

  if (type === "transfer" && (!toBank.key || toBank.key === bank.key)) {
    throw new Error(`Transfer perlu bank tujuan yang valid: ${scanNote}`);
  }

  if (type === "income") {
    await addDoc(collectionRef("incomes"), {
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
    });
  }

  if (type === "expense") {
    await addDoc(collectionRef("expenses"), {
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
    });
  }

  if (type === "transfer") {
    await addDoc(collectionRef("transfers"), {
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
    });
  }
}

async function saveSelectedScannedTransactions() {
  syncMultiScanFromTable();
  const selected = scannedTransactions.filter((item) => item.selected);

  if (!selected.length) {
    setNotice(scanMessage, "error", "Pilih minimal satu transaksi untuk disimpan.");
    return;
  }

  saveSelectedScannedButton.disabled = true;
  saveSelectedScannedButton.textContent = "Menyimpan...";

  try {
    for (const item of selected) {
      await saveOneScannedTransaction(item);
    }

    setNotice(scanMessage, "success", `${selected.length} transaksi berhasil disimpan.`);
    scannedTransactions = [];
    renderMultiScanTable();
    multiScanResultCard.classList.add("hidden");
    scanResultCard.classList.add("hidden");
    screenshotInput.value = "";
    selectedScreenshotFile = null;
    screenshotPreviewBox.className = "screenshot-preview empty-preview";
    screenshotPreviewBox.innerHTML = "<span>Preview screenshot/PDF akan muncul di sini.</span>";
  } catch (error) {
    setNotice(scanMessage, "error", error.message || "Gagal menyimpan transaksi terpilih.");
  } finally {
    saveSelectedScannedButton.disabled = false;
    saveSelectedScannedButton.textContent = "Simpan Terpilih";
  }
}


async async function scanScreenshotWithOcr() {
  const files = [...(screenshotInput.files || [])];

  if (!files.length) {
    setNotice(scanMessage, "error", "Upload screenshot atau PDF terlebih dahulu.");
    return;
  }

  if (typeof Tesseract === "undefined") {
    setNotice(scanMessage, "error", "Tesseract OCR belum termuat. Pastikan koneksi internet aktif lalu refresh halaman.");
    return;
  }

  setScanLoading(true);
  setNotice(scanMessage, "info", "Menyiapkan file untuk OCR...");
  scannedTransactions = [];
  scanResultCard.classList.add("hidden");
  multiScanResultCard.classList.add("hidden");

  try {
    const targets = await buildOcrTargets(files);
    let combinedText = "";

    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      setNotice(scanMessage, "info", `OCR membaca ${target.label} (${index + 1}/${targets.length})...`);

      const result = await Tesseract.recognize(target.source, "ind+eng", {
        logger: (progress) => {
          if (progress.status === "recognizing text") {
            const percent = Math.round((progress.progress || 0) * 100);
            setNotice(scanMessage, "info", `OCR ${target.label}... ${percent}%`);
          }
        }
      });

      const rawText = result?.data?.text || "";
      combinedText += `\n\n--- ${target.label} ---\n${rawText}`;

      const parsed = parseMultiTransactionsFromOcr(rawText, target.label);
      scannedTransactions.push(...parsed);
    }

    // Dedup transaksi antar halaman/file
    const seen = new Set();
    scannedTransactions = scannedTransactions.filter((item) => {
      const key = `${item.tanggal}|${item.type}|${item.bank}|${item.merchant}|${item.nominal}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (scannedTransactions.length > 1) {
      renderMultiScanTable();
      setNotice(scanMessage, "success", `${scannedTransactions.length} transaksi terdeteksi. Review tabel sebelum simpan.`);
      return;
    }

    if (scannedTransactions.length === 1) {
      latestScanResult = scannedTransactions[0];
      fillScanReviewForm(scannedTransactions[0]);
      renderMultiScanTable();
      setNotice(scanMessage, "success", "1 transaksi terdeteksi. Bisa review di form atau tabel.");
      return;
    }

    // fallback single parser
    const transaction = parseOcrTransaction(combinedText, files[0]);
    latestScanResult = transaction;
    fillScanReviewForm(transaction);
    setNotice(scanMessage, "info", "OCR selesai, tapi transaksi tidak terbaca jelas. Cek ulang field manual.");
  } catch (error) {
    setNotice(scanMessage, "error", error.message || "Gagal membaca file dengan OCR.");
  } finally {
    setScanLoading(false);
  }
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseNumberCandidate(raw) {
  if (!raw) return 0;

  let value = String(raw)
    .toLowerCase()
    .replace(/rp/g, "")
    .replace(/idr/g, "")
    .replace(/[^\d,.]/g, "")
    .trim();

  if (!value) return 0;

  if (value.includes(",") && value.includes(".")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (value.includes(".")) {
    value = value.replace(/\./g, "");
  } else if (value.includes(",")) {
    value = value.replace(",", ".");
  }

  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : 0;
}


function cleanOcrLine(line) {
  return String(line || "")
    .replace(/[|_~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAmountWithSign(line) {
  const text = String(line || "");
  const match = text.match(/([+-])\s*(?:rp|idr)?\s*([0-9][0-9.,]{2,})/i)
    || text.match(/(?:rp|idr)\s*([0-9][0-9.,]{2,})/i)
    || text.match(/([0-9]{1,3}(?:[.,][0-9]{3})+(?:,[0-9]{2})?)/);

  if (!match) return null;

  const sign = match[1] === "+" || match[1] === "-" ? match[1] : "";
  const rawAmount = match[2] || match[1];
  const amount = parseNumberCandidate(rawAmount);

  if (!amount || amount < 1000) return null;

  return {
    sign,
    amount
  };
}

function detectTransactionKindFromLines(lines, index, sign) {
  const context = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 3)).join(" ").toLowerCase();

  if (sign === "+") return "income";
  if (sign === "-") return "expense";

  if (/(qr bayar|bayar\/top.?up|bayar|top.?up|pembayaran|purchase|payment)/.test(context)) {
    return "expense";
  }

  if (/(transfer rupiah|transfer|kirim uang)/.test(context)) {
    return "transfer";
  }

  if (/(uang masuk|dana masuk|incoming|received|refund|cashback|gaji|salary)/.test(context)) {
    return "income";
  }

  return "expense";
}

function extractMerchantNearAmount(lines, index) {
  const contextLines = lines.slice(Math.max(0, index - 5), Math.min(lines.length, index + 4));

  const merchantLine = contextLines.find((line) => {
    const lower = line.toLowerCase();

    if (/^(qr bayar|bayar\/top.?up|transfer rupiah|transfer|transaksi)$/i.test(line)) return false;
    if (/(rp|idr|\+|-|tanggal|date|rekening|mandiri|bca|bri|bni|bsi|e-statement|april|mei|juni|juli|search|pencarian)/i.test(line)) return false;
    if (/^\d+$/.test(line)) return false;
    if (line.length < 4 || line.length > 48) return false;

    return /[a-zA-Z]/.test(line);
  });

  if (merchantLine) {
    return merchantLine
      .replace(/^ke\s+/i, "")
      .replace(/^dari\s+/i, "")
      .trim();
  }

  return "";
}

function extractBestTransactionFromOcr(text) {
  const lines = normalizeOcrText(text)
    .split("\n")
    .map((line) => cleanOcrLine(line))
    .filter(Boolean);

  const candidates = [];

  lines.forEach((line, index) => {
    const amountInfo = extractAmountWithSign(line);
    if (!amountInfo) return;

    const type = detectTransactionKindFromLines(lines, index, amountInfo.sign);
    const merchant = extractMerchantNearAmount(lines, index);
    const context = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 3)).join(" ").toLowerCase();

    let score = 0;
    if (amountInfo.sign === "-") score += 40;
    if (amountInfo.sign === "+") score += 20;
    if (/qr bayar|bayar\/top.?up|bayar|pembayaran/.test(context)) score += 35;
    if (/transfer rupiah|transfer/.test(context)) score += 10;
    if (merchant) score += 15;
    if (index < 8) score += 8; // transaksi paling atas biasanya paling relevan
    score += Math.min(10, amountInfo.amount / 100000);

    candidates.push({
      type,
      nominal: amountInfo.amount,
      merchant,
      score,
      index
    });
  });

  if (!candidates.length) return null;

  // Prioritas: uang keluar/QR/Bayar. Ini menghindari salah ambil Transfer Rupiah dari daftar mutasi.
  const expenseCandidates = candidates.filter((item) => item.type === "expense");
  const target = (expenseCandidates.length ? expenseCandidates : candidates)
    .sort((a, b) => b.score - a.score)[0];

  return target;
}


function extractNominalFromOcr(text) {
  const transaction = extractBestTransactionFromOcr(text);
  if (transaction && transaction.nominal) {
    return transaction.nominal;
  }

  const candidates = [];
  const patterns = [
    /([+-])\s*(?:rp|idr)?\s*([0-9][0-9.,]{2,})/gi,
    /(?:rp|idr)\s*([0-9][0-9.,]{2,})/gi,
    /(?:total|jumlah|amount|nominal|bayar|pembayaran|paid|payment|subtotal)\D{0,25}([0-9][0-9.,]{2,})/gi,
    /([0-9]{1,3}(?:[.,][0-9]{3})+(?:,[0-9]{2})?)/g
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[2] || match[1];
      const value = parseNumberCandidate(raw);
      if (value >= 1000 && value <= 1000000000) {
        candidates.push(value);
      }
    }
  });

  if (!candidates.length) return 0;

  return candidates.sort((a, b) => b - a)[0];
}

function extractDateFromOcr(text) {
  const today = formatDateLocal();
  const patterns = [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/,
    /(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let year;
    let month;
    let day;

    if (match[1].length === 4) {
      year = match[1];
      month = match[2].padStart(2, "0");
      day = match[3].padStart(2, "0");
    } else {
      day = match[1].padStart(2, "0");
      month = match[2].padStart(2, "0");
      year = match[3];
    }

    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${year}-${month}-${day}`;
    }
  }

  const monthMap = {
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

  const lower = text.toLowerCase();
  const monthMatch = lower.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(20\d{2})/);
  if (monthMatch && monthMap[monthMatch[2]]) {
    return `${monthMatch[3]}-${monthMap[monthMatch[2]]}-${monthMatch[1].padStart(2, "0")}`;
  }

  return today;
}

function extractBankFromOcr(text) {
  const upper = text.toUpperCase();
  const bankRules = [
    ["Mandiri", ["MANDIRI", "LIVIN"]],
    ["BCA", ["BCA", "MYBCA", "KLIKBCA"]],
    ["BRI", ["BRI", "BRIMO"]],
    ["BNI", ["BNI"]],
    ["BSI", ["BSI", "BANK SYARIAH INDONESIA"]],
    ["CIMB", ["CIMB", "OCTO"]],
    ["Permata", ["PERMATA"]],
    ["Danamon", ["DANAMON"]],
    ["Jago", ["JAGO"]],
    ["Jenius", ["JENIUS"]],
    ["SeaBank", ["SEABANK", "SEA BANK"]],
    ["Krom", ["KROM"]],
    ["DANA", ["DANA"]],
    ["GoPay", ["GOPAY", "GO-PAY", "GOJEK"]],
    ["OVO", ["OVO"]],
    ["ShopeePay", ["SHOPEEPAY", "SHOPEE PAY"]],
    ["LinkAja", ["LINKAJA", "LINK AJA"]],
    ["Tunai", ["CASH", "TUNAI"]]
  ];

  const found = bankRules.find(([, keys]) => keys.some((key) => upper.includes(key)));
  return found ? found[0] : "";
}

function extractMerchantFromOcr(text, bank) {
  const bestTransaction = extractBestTransactionFromOcr(text);
  if (bestTransaction?.merchant) {
    return bestTransaction.merchant;
  }

  const lines = normalizeOcrText(text)
    .split("\n")
    .map((line) => cleanOcrLine(line))
    .filter(Boolean);

  const blocked = [
    "rp", "idr", "total", "jumlah", "amount", "nominal", "tanggal", "date",
    "waktu", "time", "berhasil", "sukses", "transaksi", "transfer", "qris",
    "receipt", "struk", "invoice", "bank", "rekening", "ref", "referensi",
    "april", "mei", "juni", "juli", "january", "february", "march",
    "e-statement", "statement", "pencarian", "search"
  ];

  const bankLower = String(bank || "").toLowerCase();

  const candidate = lines.find((line) => {
    const lower = line.toLowerCase();
    if (bankLower && lower.includes(bankLower)) return false;
    if (blocked.some((word) => lower.includes(word))) return false;
    if (/^\d+$/.test(lower)) return false;
    if (/^(april|mei|juni|juli|jan|feb|mar|apr|may|jun|jul)(\s|$)/i.test(line)) return false;
    if (line.length < 3 || line.length > 46) return false;
    return /[a-zA-Z]/.test(line);
  });

  return candidate || "";
}

function inferCategoryFromOcr(text, merchant) {
  const full = `${text} ${merchant}`.toLowerCase();

  const rules = [
    ["Makan", ["kopi", "coffee", "cafe", "resto", "restaurant", "makan", "food", "burger", "ayam", "nasi", "mie", "bakso", "sate", "martabak", "pizza", "kfc", "mcd", "starbucks", "janji jiwa", "kopi kenangan"]],
    ["Transportasi", ["grab", "gojek", "gocar", "goride", "taxi", "taksi", "transjakarta", "kai", "kereta", "tol", "parkir", "parking", "pertamina", "shell", "bensin"]],
    ["Belanja", ["tokopedia", "shopee", "lazada", "blibli", "zalora", "alfamart", "indomaret", "superindo", "hypermart", "guardian", "watsons"]],
    ["Tagihan", ["tagihan", "bill", "pln", "listrik", "pdam", "internet", "wifi", "telkom", "indihome", "bpjs", "pulsa", "data", "token"]],
    ["Hiburan", ["cinema", "bioskop", "netflix", "spotify", "vidio", "disney", "game", "steam"]],
    ["Kesehatan", ["apotek", "pharmacy", "klinik", "clinic", "rumah sakit", "hospital", "dokter", "obat"]]
  ];

  const found = rules.find(([, keywords]) => keywords.some((keyword) => full.includes(keyword)));
  return found ? found[0] : "Lainnya";
}

function inferTransactionTypeFromOcr(text) {
  const bestTransaction = extractBestTransactionFromOcr(text);
  if (bestTransaction?.type) {
    return bestTransaction.type;
  }

  const lower = text.toLowerCase();

  if (/(uang masuk|dana masuk|incoming|receive|received|refund|cashback|gaji|salary|\+\s*rp)/.test(lower)) {
    return "income";
  }

  if (/(qr bayar|bayar|top.?up|pembayaran|purchase|payment|-\s*rp)/.test(lower)) {
    return "expense";
  }

  if (/(transfer|kirim uang|pindah dana|rekening tujuan|beneficiary)/.test(lower)) {
    return "transfer";
  }

  return "expense";
}

function calculateOcrConfidence({ nominal, bank, merchant, tanggal, kategori }) {
  let score = 0.25;
  if (nominal > 0) score += 0.3;
  if (bank) score += 0.15;
  if (merchant) score += 0.1;
  if (tanggal) score += 0.1;
  if (kategori && kategori !== "Lainnya") score += 0.1;
  return Math.min(0.95, score);
}

function parseOcrTransaction(rawText, file) {
  const text = normalizeOcrText(rawText);
  const best = extractBestTransactionFromOcr(text);

  const tanggal = extractDateFromOcr(text);
  const nominal = best?.nominal || extractNominalFromOcr(text);
  const bank = extractBankFromOcr(text);
  const merchant = best?.merchant || extractMerchantFromOcr(text, bank);
  const rawCategory = inferCategoryFromOcr(text, merchant);
  const type = best?.type || inferTransactionTypeFromOcr(text);
  const kategori = type === "transfer" ? "Transfer" : rawCategory;
  const confidence = calculateOcrConfidence({ nominal, bank, merchant, tanggal, kategori });

  return {
    type,
    tanggal,
    nominal,
    bank,
    toBank: "",
    merchant,
    kategori,
    keterangan: merchant ? `OCR: ${merchant}` : `OCR dari ${file?.name || "screenshot"}`,
    confidence,
    rawText: text,
    suggestedFileName: buildScanNote(bank, tanggal, kategori, nominal)
  };
}

function fillScanReviewForm(transaction) {
  const type = transaction.type || "expense";
  const tanggal = transaction.tanggal || formatDateLocal();
  const nominal = Number(transaction.nominal || 0);
  const kategori = transaction.kategori || (type === "transfer" ? "Transfer" : "Lainnya");
  const confidence = Number(transaction.confidence || 0);

  scanType.value = ["income", "expense", "transfer"].includes(type) ? type : "expense";
  scanTanggal.value = tanggal;
  scanBank.value = transaction.bank || "";
  scanToBank.value = transaction.toBank || "";
  scanMerchant.value = transaction.merchant || "";
  scanKategori.value = kategori;
  scanNominal.value = nominal || "";
  scanKeterangan.value = transaction.keterangan || "";
  scanConfidenceBadge.textContent = `${Math.round(confidence * 100)}%`;

  refreshScanNote();
  toggleScanToBank();
  scanResultCard.classList.remove("hidden");
}

function toggleScanToBank() {
  scanToBankWrap.classList.toggle("hidden", scanType.value !== "transfer");
  if (scanType.value === "transfer") {
    scanKategori.value = "Transfer";
  }
  refreshScanNote();
}

function refreshScanNote() {
  scanNoteInput.value = buildScanNote(scanBank.value, scanTanggal.value, scanKategori.value, scanNominal.value);
}

async function saveScannedTransaction(event) {
  event.preventDefault();

  const type = scanType.value;
  const tanggal = scanTanggal.value;
  const nominal = Number(scanNominal.value);
  const bank = normalizeBank(scanBank.value);
  const toBank = normalizeBank(scanToBank.value);
  const merchant = cleanText(scanMerchant.value);
  const kategori = scanKategori.value;
  const keterangan = cleanText(scanKeterangan.value);
  const scanNote = buildScanNote(bank.display, tanggal, kategori, nominal);

  if (!tanggal || !nominal || nominal <= 0 || !bank.key) {
    setNotice(scanMessage, "error", "Tanggal, nominal, dan bank/dompet wajib diisi.");
    return;
  }

  if (type === "transfer" && (!toBank.key || toBank.key === bank.key)) {
    setNotice(scanMessage, "error", "Untuk transfer, bank tujuan wajib diisi dan harus berbeda dari bank asal.");
    return;
  }

  saveScannedTransactionButton.disabled = true;
  saveScannedTransactionButton.textContent = "Menyimpan...";

  try {
    if (type === "income") {
      await addDoc(collectionRef("incomes"), {
        tanggal,
        bankKey: bank.key,
        bankName: bank.display,
        sumber: merchant || "Pemasukan dari OCR",
        nominal,
        keterangan,
        merchant,
        source: "ocr_screenshot",
        confidence: latestScanResult?.confidence || null,
        scanNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    if (type === "expense") {
      await addDoc(collectionRef("expenses"), {
        tanggal,
        bankKey: bank.key,
        bankName: bank.display,
        kategori,
        nominal,
        keterangan: keterangan || merchant || "Pengeluaran dari OCR",
        merchant,
        source: "ocr_screenshot",
        confidence: latestScanResult?.confidence || null,
        scanNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    if (type === "transfer") {
      await addDoc(collectionRef("transfers"), {
        tanggal,
        fromBankKey: bank.key,
        fromBankName: bank.display,
        toBankKey: toBank.key,
        toBankName: toBank.display,
        nominal,
        keterangan: keterangan || "Transfer dari OCR",
        merchant,
        source: "ocr_screenshot",
        confidence: latestScanResult?.confidence || null,
        scanNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    setNotice(scanMessage, "success", `Transaksi berhasil disimpan. Catatan scan: ${scanNote}`);
    scanReviewForm.reset();
    scanResultCard.classList.add("hidden");
    screenshotInput.value = "";
    selectedScreenshotFile = null;
    latestScanResult = null;
    screenshotPreviewBox.className = "screenshot-preview empty-preview";
    screenshotPreviewBox.innerHTML = "<span>Preview screenshot akan muncul di sini.</span>";
  } catch (error) {
    setNotice(scanMessage, "error", getFirebaseAuthMessage(error));
  } finally {
    saveScannedTransactionButton.disabled = false;
    saveScannedTransactionButton.textContent = "Simpan Hasil Scan";
  }
}

function buildFinancialSummary() {
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const remainingBalance = totalIncome - totalExpense;

  const expenseByCategoryMap = {};
  expenses.forEach((item) => {
    const category = item.kategori || "Lainnya";
    expenseByCategoryMap[category] = (expenseByCategoryMap[category] || 0) + Number(item.nominal || 0);
  });

  const expenseByCategory = Object.entries(expenseByCategoryMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalIncome,
    totalExpense,
    remainingBalance,
    expenseByCategory,
    bankBalances: getBankBalances()
  };
}

function generateLocalFinancialAdvice(summary) {
  const totalIncome = Number(summary.totalIncome || 0);
  const totalExpense = Number(summary.totalExpense || 0);
  const remaining = Number(summary.remainingBalance || 0);
  const expenseRatio = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0;
  const topCategory = summary.expenseByCategory?.[0];
  const topBank = [...(summary.bankBalances || [])].sort((a, b) => b.balance - a.balance)[0];

  let status = "Aman";
  if (remaining < 0) status = "Kritis";
  else if (totalIncome === 0 && totalExpense > 0) status = "Perlu Diperhatikan";
  else if (expenseRatio > 80) status = "Perlu Diperhatikan";

  const lines = [];
  lines.push(`Status Keuangan: ${status}`);
  lines.push("");
  lines.push("Ringkasan:");
  lines.push(`- Total pemasukan: ${formatRupiah(totalIncome)}`);
  lines.push(`- Total pengeluaran: ${formatRupiah(totalExpense)}`);
  lines.push(`- Sisa uang: ${formatRupiah(remaining)}`);

  if (topCategory) {
    lines.push(`- Kategori pengeluaran terbesar: ${topCategory.category} (${formatRupiah(topCategory.amount)})`);
  }

  if (topBank) {
    lines.push(`- Saldo terbesar: ${topBank.name} (${formatRupiah(topBank.balance)})`);
  }

  lines.push("");
  lines.push("Rekomendasi:");

  if (remaining < 0) {
    lines.push("1. Cek ulang transaksi dan input pemasukan yang belum tercatat.");
    lines.push("2. Tunda pengeluaran non-prioritas sampai saldo kembali positif.");
    lines.push("3. Fokus pangkas kategori pengeluaran terbesar.");
  } else if (totalIncome === 0 && totalExpense > 0) {
    lines.push("1. Input pemasukan terlebih dahulu agar cashflow terbaca benar.");
    lines.push("2. Pastikan setiap transaksi memakai bank/dompet yang tepat.");
    lines.push("3. Gunakan kategori yang konsisten.");
  } else if (expenseRatio > 80) {
    lines.push("1. Pengeluaran sudah tinggi dibanding pemasukan.");
    lines.push("2. Tetapkan limit mingguan untuk kategori terbesar.");
    lines.push("3. Sisihkan dana darurat di awal saat pemasukan masuk.");
  } else {
    lines.push("1. Cashflow masih positif. Pertahankan pengeluaran di bawah 70% pemasukan.");
    lines.push("2. Sisihkan 10–20% pemasukan untuk tabungan atau dana darurat.");
    lines.push("3. Review kategori terbesar tiap minggu.");
  }

  return lines.join("\n");
}

function generateFinancialAdvice() {
  advisorOutput.textContent = generateLocalFinancialAdvice(buildFinancialSummary());
}

function downloadCSV() {
  const rows = getAllTransactions().map((item) => ({
    tanggal: item.tanggal || "",
    tipe: getTypeLabel(item.type),
    bank: item.bankText || "",
    kategori: item.kategoriText || "",
    nominal: item.nominal || 0,
    keterangan: item.keterangan || item.title || "",
    scanNote: item.scanNote || ""
  }));

  const header = Object.keys(rows[0] || {
    tanggal: "",
    tipe: "",
    bank: "",
    kategori: "",
    nominal: "",
    keterangan: "",
    scanNote: ""
  });

  const csv = [
    header.join(","),
    ...rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `spendly-transactions-${formatDateLocal()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadExcel() {
  if (typeof XLSX === "undefined") {
    alert("Library Excel belum termuat.");
    return;
  }

  const workbook = XLSX.utils.book_new();

  const transactions = getAllTransactions().map((item) => ({
    Tanggal: item.tanggal || "",
    Tipe: getTypeLabel(item.type),
    Bank: item.bankText || "",
    Kategori: item.kategoriText || "",
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

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactions), "Transaksi");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(balances), "Saldo Bank");
  XLSX.writeFile(workbook, `spendly-report-${formatDateLocal()}.xlsx`);
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

  userEmail.textContent = user.email || "-";
  showApp();
  subscribeData();
});

loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));
authForm.addEventListener("submit", handleAuthSubmit);
logoutButton.addEventListener("click", handleLogout);

incomeTab.addEventListener("click", () => setTxMode("income"));
expenseTab.addEventListener("click", () => setTxMode("expense"));
transferTab.addEventListener("click", () => setTxMode("transfer"));
transactionForm.addEventListener("submit", saveTransaction);

typeFilter.addEventListener("change", renderTable);
searchInput.addEventListener("input", renderTable);

tableContainer.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const type = button.dataset.type;
  const id = button.dataset.id;

  if (action === "edit") openEditModal(type, id);
  if (action === "delete") deleteTransaction(type, id);
});

closeEditModal.addEventListener("click", closeModal);
cancelEditButton.addEventListener("click", closeModal);
editForm.addEventListener("submit", saveEditedTransaction);

downloadCSVButton.addEventListener("click", downloadCSV);
downloadExcelButton.addEventListener("click", downloadExcel);

screenshotInput.addEventListener("change", handleScreenshotPreview);
scanScreenshotButton.addEventListener("click", scanScreenshotWithOcr);
scanReviewForm.addEventListener("submit", saveScannedTransaction);

multiScanTableContainer.addEventListener("input", syncMultiScanFromTable);
multiScanTableContainer.addEventListener("change", syncMultiScanFromTable);
multiScanTableContainer.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remove-scan]");
  if (!button) return;
  const index = Number(button.dataset.removeScan);
  scannedTransactions.splice(index, 1);
  renderMultiScanTable();
});

selectAllScannedButton.addEventListener("click", () => {
  const shouldSelect = scannedTransactions.some((item) => !item.selected);
  scannedTransactions.forEach((item) => {
    item.selected = shouldSelect;
  });
  renderMultiScanTable();
});

saveSelectedScannedButton.addEventListener("click", saveSelectedScannedTransactions);
scanType.addEventListener("change", toggleScanToBank);

[scanTanggal, scanBank, scanKategori, scanNominal].forEach((element) => {
  element.addEventListener("input", refreshScanNote);
  element.addEventListener("change", refreshScanNote);
});

generateAdviceButton.addEventListener("click", generateFinancialAdvice);

tanggalInput.value = formatDateLocal();
setAuthMode("login");
setTxMode("income");
