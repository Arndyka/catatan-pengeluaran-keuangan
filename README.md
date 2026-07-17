# Spendly Accounting Pro

Major upgrade dari Spendly Budget Tracker.

## Arsitektur Modular

```text
assets/js/
├── app.js
├── accounting.js
├── auth.js
├── budget.js
├── credit-card.js
├── firebase.js
├── recurring.js
├── reports.js
├── repository.js
├── scanner.js
├── settings.js
├── state.js
├── transactions.js
└── utils.js
```

Login/Register, Firestore, akuntansi, OCR, budget, recurring transaction, kartu kredit, dan laporan tidak lagi ditumpuk dalam satu file.

## Prinsip Akuntansi

Setiap transaksi membentuk jurnal berpasangan:

### Pemasukan

```text
Debit  Aset/Rekening
Kredit Pendapatan
```

### Pengeluaran Tunai/Bank

```text
Debit  Beban
Kredit Aset/Rekening
```

### Transfer Antar Rekening

```text
Debit  Rekening Tujuan
Kredit Rekening Sumber
```

### Belanja Kartu Kredit

```text
Debit  Beban
Kredit Liabilitas Kartu Kredit
```

### Bayar Kartu Kredit

```text
Debit  Liabilitas Kartu Kredit
Kredit Aset/Rekening
```

### Pembelian Investasi

```text
Debit  Aset Investasi
Kredit Aset/Rekening
```

Pembayaran kartu kredit tidak dicatat sebagai beban kedua kali. Beban sudah diakui ketika pembelian dilakukan.

## Anti-Duplikat Permanen

Setiap transaksi dibuatkan fingerprint SHA-256 berdasarkan:

- tipe
- tanggal
- nominal
- akun sumber
- akun tujuan
- kategori
- merchant
- keterangan
- recurring rule

Fingerprint menjadi ID dokumen Firestore. Transaksi identik tidak bisa masuk dua kali, termasuk dari dua perangkat.

## Semua Pengaturan Tersinkronisasi

Disimpan pada:

```text
users/{uid}/settings/profile
users/{uid}/settings/credit_card
users/{uid}/budget_plans/{YYYY-MM}
users/{uid}/recurring_rules/{ruleId}
users/{uid}/transactions/{fingerprint}
```

## Transaksi Berulang

Mendukung transaksi bulanan seperti:

- gaji
- internet
- Netflix
- sewa
- cicilan
- investasi rutin
- pembayaran kartu kredit

Posting berulang bersifat idempotent karena recurring rule dan periode ikut masuk fingerprint.

## Kartu Kredit

Fitur:

- total limit
- limit terpakai
- sisa limit
- tagihan tercetak
- tagihan berjalan
- cicilan aktif
- pembayaran minimum
- tanggal cetak
- jatuh tempo
- rekonsiliasi dengan Livin'/e-billing

Belanja kartu kredit mengakui beban dan liabilitas. Pembayaran kartu hanya mengurangi liabilitas.

## Budget

Mendukung:

- persentase pemasukan
- nominal tetap
- budget kebutuhan pokok
- investasi
- kategori spesifik
- target vs aktual
- sisa budget
- peringatan overbudget

## Laporan Bulanan

- Laporan Surplus/Defisit
- Laporan Arus Kas
- Neraca Pribadi
- Neraca Saldo
- Persamaan Akuntansi
- Export CSV

## Migrasi Data Lama

Klik `Migrasi Data Lama` di Dashboard untuk memindahkan koleksi:

```text
incomes
expenses
transfers
```

ke koleksi `transactions`.

Duplikat otomatis dilewati.

## Upload ke GitHub

Upload seluruh file/folder:

```text
index.html
README.md
FIRESTORE_RULES.txt
STORAGE_RULES.txt
assets/
```

Jangan mencampur `assets/js/app.js` baru dengan `assets/app.js` versi lama.

## Firebase

Authentication:

```text
Email/Password = Enabled
```

Authorized domain:

```text
arndyka.github.io
```

## Catatan

Aplikasi ini menerapkan prinsip dasar double-entry accounting untuk personal finance. Aplikasi bukan pengganti laporan resmi bank, konsultan pajak, atau software akuntansi tersertifikasi.


## PDF e-Statement dengan Password

Fitur tambahan:
- Saat file PDF dipilih, muncul kolom `Password PDF (opsional)`.
- Isi password e-Statement sebelum menekan `Scan File`.
- Tombol `Tampilkan/Sembunyikan` tersedia untuk memeriksa password.
- Password hanya digunakan oleh PDF.js di browser.
- Password tidak disimpan ke Firestore, localStorage, GitHub, atau data transaksi.
- Password otomatis dikosongkan setelah PDF berhasil dibuka.
- Jika beberapa PDF dipilih sekaligus, satu password yang sama diterapkan ke semua PDF.
- Jika PDF memiliki password berbeda, scan satu per satu.
