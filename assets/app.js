/*
  GANTI firebaseConfig DI BAWAH DENGAN CONFIG FIREBASE KAMU.

  Firebase Console:
  Project Settings → General → Your apps → SDK setup and configuration → Config
*/

const firebaseConfig = {
  apiKey: "AIzaSyBTI3nR4CA5HdVGeP3zg7YibS2kfEvcCNc",
  authDomain: "catatan-pengeluaran-keua-19af4.firebaseapp.com",
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
let unsubscribeExpenses = null;
let allExpenses = [];

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

const expenseForm = document.getElementById("expenseForm");
const tanggalInput = document.getElementById("tanggal");
const kategoriInput = document.getElementById("kategori");
const nominalInput = document.getElementById("nominal");
const keteranganInput = document.getElementById("keterangan");
const saveExpenseButton = document.getElementById("saveExpenseButton");
const expenseMessage = document.getElementById("expenseMessage");

const filterTanggal = document.getElementById("filterTanggal");
const filterKategori = document.getElementById("filterKategori");
const resetFilterButton = document.getElementById("resetFilterButton");
const downloadCsvButton = document.getElementById("downloadCsvButton");
const downloadExcelButton = document.getElementById("downloadExcelButton");

const totalPengeluaran = document.getElementById("totalPengeluaran");
const jumlahTransaksi = document.getElementById("jumlahTransaksi");
const kategoriTerbesar = document.getElementById("kategoriTerbesar");
const rataTransaksi = document.getElementById("rataTransaksi");
const categoryBreakdown = document.getElementById("categoryBreakdown");
const tabelContainer = document.getElementById("tabelContainer");

function setNotice(element, type, text) {
  element.className = `notice ${type}`;
  element.textContent = text;
}

function formatTanggalLokal(date) {
  const tahun = date.getFullYear();
  const bulan = String(date.getMonth() + 1).padStart(2, "0");
  const hari = String(date.getDate()).padStart(2, "0");

  return `${tahun}-${bulan}-${hari}`;
}

function setTanggalHariIni() {
  tanggalInput.value = formatTanggalLokal(new Date());
}

function formatRupiah(angka) {
  return "Rp " + Number(angka).toLocaleString("id-ID");
}

function formatTanggalIndonesia(tanggal) {
  return new Date(tanggal + "T00:00:00").toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCSV(value) {
  const stringValue = String(value).replace(/"/g, '""');
  return `"${stringValue}"`;
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
    authSubtitle.textContent = "Gunakan email dan password untuk mengakses data pengeluaran.";
    authButton.textContent = "Login";
    setNotice(authMessage, "info", "Masukkan email dan password untuk login. Jika belum punya akun, pilih Register.");
  } else {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    authTitle.textContent = "Buat akun baru";
    authSubtitle.textContent = "Daftar akun agar data pengeluaran tersimpan online.";
    authButton.textContent = "Register";
    setNotice(authMessage, "info", "Gunakan email aktif dan password minimal 6 karakter.");
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (email === "") {
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

function getExpenseCollectionRef() {
  return collection(db, "users", currentUser.uid, "expenses");
}

function listenExpenses() {
  if (!currentUser) return;

  if (unsubscribeExpenses) {
    unsubscribeExpenses();
  }

  const expensesQuery = query(getExpenseCollectionRef(), orderBy("tanggal", "desc"));

  unsubscribeExpenses = onSnapshot(
    expensesQuery,
    (snapshot) => {
      allExpenses = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      renderData();
    },
    (error) => {
      setNotice(expenseMessage, "error", firebaseErrorMessage(error.code));
    }
  );
}

async function saveExpense(event) {
  event.preventDefault();

  if (!currentUser) {
    setNotice(expenseMessage, "error", "Kamu harus login terlebih dahulu.");
    return;
  }

  const tanggal = tanggalInput.value;
  const kategori = kategoriInput.value;
  const nominal = nominalInput.value;
  const keterangan = keteranganInput.value.trim();

  if (tanggal === "") {
    setNotice(expenseMessage, "error", "Tanggal wajib diisi.");
    return;
  }

  if (nominal === "" || Number(nominal) <= 0) {
    setNotice(expenseMessage, "error", "Nominal harus lebih dari 0.");
    return;
  }

  if (keterangan === "") {
    setNotice(expenseMessage, "error", "Keterangan wajib diisi.");
    return;
  }

  saveExpenseButton.disabled = true;
  saveExpenseButton.textContent = "Menyimpan...";

  try {
    await addDoc(getExpenseCollectionRef(), {
      tanggal,
      kategori,
      nominal: Number(nominal),
      keterangan,
      createdAt: serverTimestamp()
    });

    nominalInput.value = "";
    keteranganInput.value = "";
    setNotice(expenseMessage, "success", "Data berhasil disimpan.");
  } catch (error) {
    setNotice(expenseMessage, "error", firebaseErrorMessage(error.code));
  } finally {
    saveExpenseButton.disabled = false;
    saveExpenseButton.textContent = "Simpan Pengeluaran";
  }
}

function filteredExpenses() {
  const tanggal = filterTanggal.value;
  const kategori = filterKategori.value;

  return allExpenses
    .filter((item) => {
      const matchTanggal = tanggal === "" || item.tanggal === tanggal;
      const matchKategori = kategori === "Semua" || item.kategori === kategori;

      return matchTanggal && matchKategori;
    })
    .sort((a, b) => {
      if (a.tanggal === b.tanggal) {
        const createdA = a.createdAt?.seconds || 0;
        const createdB = b.createdAt?.seconds || 0;
        return createdB - createdA;
      }

      return b.tanggal.localeCompare(a.tanggal);
    });
}

function categoryBadge(kategori) {
  const icons = {
    Makan: "🍽",
    Transportasi: "↗",
    Belanja: "◼",
    Tagihan: "◆",
    Hiburan: "★"
  };

  return `<span class="badge badge-${kategori.toLowerCase()}">${icons[kategori] || "•"} ${kategori}</span>`;
}

function getCategoryTotals(data) {
  return data.reduce((acc, item) => {
    acc[item.kategori] = (acc[item.kategori] || 0) + Number(item.nominal);
    return acc;
  }, {});
}

function getTopCategory(data) {
  const totals = getCategoryTotals(data);
  let topName = "-";
  let topValue = 0;

  Object.keys(totals).forEach((name) => {
    if (totals[name] > topValue) {
      topName = name;
      topValue = totals[name];
    }
  });

  return topName;
}

function renderCategoryBreakdown(data) {
  const totals = getCategoryTotals(data);
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 0;

  if (entries.length === 0) {
    categoryBreakdown.innerHTML = "";
    return;
  }

  categoryBreakdown.innerHTML = entries.map(([name, value]) => {
    const width = max > 0 ? Math.round((value / max) * 100) : 0;

    return `
      <div class="category-row">
        <div class="category-name">${escapeHTML(name)}</div>
        <div class="category-bar">
          <div class="category-fill" style="width: ${width}%"></div>
        </div>
        <div class="category-amount">${formatRupiah(value)}</div>
      </div>
    `;
  }).join("");
}

function renderData() {
  const data = filteredExpenses();

  if (data.length === 0) {
    totalPengeluaran.textContent = "Rp 0";
    jumlahTransaksi.textContent = "0";
    kategoriTerbesar.textContent = "-";
    rataTransaksi.textContent = "Rp 0";
    categoryBreakdown.innerHTML = "";

    tabelContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">▦</div>
        <h3>Belum ada data</h3>
        <p>Tambahkan pengeluaran baru melalui form input. Data akan tersimpan ke akun kamu.</p>
      </div>
    `;

    return;
  }

  const total = data.reduce((sum, item) => sum + Number(item.nominal), 0);
  const average = total / data.length;

  totalPengeluaran.textContent = formatRupiah(total);
  jumlahTransaksi.textContent = data.length;
  kategoriTerbesar.textContent = getTopCategory(data);
  rataTransaksi.textContent = formatRupiah(average);

  renderCategoryBreakdown(data);

  const rows = data.map((item) => `
    <tr>
      <td class="date-cell">${formatTanggalIndonesia(item.tanggal)}</td>
      <td>${categoryBadge(item.kategori)}</td>
      <td class="amount">${formatRupiah(item.nominal)}</td>
      <td class="note-cell">${escapeHTML(item.keterangan)}</td>
      <td>
        <button class="delete-small" data-id="${item.id}" type="button">Hapus</button>
      </td>
    </tr>
  `).join("");

  tabelContainer.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Kategori</th>
            <th>Nominal</th>
            <th>Keterangan</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll(".delete-small").forEach((button) => {
    button.addEventListener("click", () => deleteExpense(button.dataset.id));
  });
}

async function deleteExpense(expenseId) {
  const confirmed = confirm("Yakin ingin menghapus data ini?");

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "expenses", expenseId));
    setNotice(expenseMessage, "success", "Data berhasil dihapus.");
  } catch (error) {
    setNotice(expenseMessage, "error", firebaseErrorMessage(error.code));
  }
}

function resetFilter() {
  filterTanggal.value = "";
  filterKategori.value = "Semua";
  renderData();
}

function downloadCSV() {
  const data = filteredExpenses();

  if (data.length === 0) {
    alert("Belum ada data yang bisa di-download.");
    return;
  }

  let csv = "Tanggal,Kategori,Nominal,Keterangan\n";

  data.forEach((item) => {
    csv += [
      escapeCSV(item.tanggal),
      escapeCSV(item.kategori),
      item.nominal,
      escapeCSV(item.keterangan)
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "data_pengeluaran.csv";
  link.click();

  URL.revokeObjectURL(url);
}

function downloadExcel() {
  const data = filteredExpenses();

  if (data.length === 0) {
    alert("Belum ada data yang bisa di-download.");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("Library Excel belum terbaca. Pastikan koneksi internet aktif.");
    return;
  }

  const workbook = XLSX.utils.book_new();
  const grouped = {};

  data.forEach((item) => {
    if (!grouped[item.tanggal]) grouped[item.tanggal] = [];

    grouped[item.tanggal].push({
      Tanggal: item.tanggal,
      Kategori: item.kategori,
      Nominal: item.nominal,
      Keterangan: item.keterangan
    });
  });

  Object.keys(grouped).sort().forEach((tanggal) => {
    const worksheet = XLSX.utils.json_to_sheet(grouped[tanggal]);
    const sheetName = tanggal.replaceAll("-", "_");
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.writeFile(workbook, "data_pengeluaran_per_tanggal.xlsx");
}

function showAuth() {
  authScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
  allExpenses = [];
}

function showApp(user) {
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  userEmail.textContent = user.email;
  userInitial.textContent = user.email ? user.email[0].toUpperCase() : "U";

  listenExpenses();
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    showApp(user);
  } else {
    currentUser = null;

    if (unsubscribeExpenses) {
      unsubscribeExpenses();
      unsubscribeExpenses = null;
    }

    showAuth();
  }
});

loginTab.addEventListener("click", () => switchAuthMode("login"));
registerTab.addEventListener("click", () => switchAuthMode("register"));
authForm.addEventListener("submit", handleAuthSubmit);
expenseForm.addEventListener("submit", saveExpense);

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

filterTanggal.addEventListener("change", renderData);
filterKategori.addEventListener("change", renderData);
resetFilterButton.addEventListener("click", resetFilter);
downloadCsvButton.addEventListener("click", downloadCSV);
downloadExcelButton.addEventListener("click", downloadExcel);

setTanggalHariIni();
