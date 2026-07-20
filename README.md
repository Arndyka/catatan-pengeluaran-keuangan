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


## Hybrid Statement Reader

Scanner e-Statement diperbarui menjadi sistem hybrid:

### Native PDF Layout Reader

Untuk PDF digital seperti e-Statement Mandiri:

- membaca teks asli PDF dengan `getTextContent()`
- memakai posisi X/Y untuk menentukan kolom:
  - nomor
  - tanggal dan waktu
  - keterangan
  - nominal
  - saldo berjalan
- tidak melakukan OCR ulang jika teks PDF tersedia
- memproses semua halaman satu per satu
- tidak memiliki batas halaman tetap di aplikasi

### OCR Machine-Learning Fallback

Tesseract hanya dipakai ketika:

- halaman PDF tidak memiliki text layer
- PDF merupakan hasil scan
- file yang diunggah berupa gambar

Worker OCR digunakan ulang untuk semua halaman agar lebih stabil dan hemat waktu.

### Validasi Finansial

Sistem memeriksa:

```text
Saldo sebelumnya + nominal transaksi = saldo setelah transaksi
```

Sistem juga merekonsiliasi:

```text
Saldo awal + total transaksi = saldo akhir
```

Baris dengan selisih ditandai untuk diperiksa.

### Adaptive Merchant Learning

Saat user mengoreksi kategori dan menyimpan transaksi:

```text
merchant → kategori
```

disimpan pada:

```text
users/{uid}/settings/profile.merchantCategoryRules
```

Scan berikutnya akan menggunakan kategori hasil koreksi tersebut.

### Catatan Performa

PDF 11 halaman tetap diproses seluruhnya. PDF teks biasanya jauh lebih cepat daripada OCR. PDF hasil scan tetap lebih lambat karena setiap halaman harus dirender dan diproses Tesseract.


## Multi-Bank Statement Reader

Versi ini diuji langsung menggunakan contoh:

- BCA Tahapan Xpresi, 2 halaman, periode Mei 2026.
- Krom e-Statement, 9 halaman, periode Juni 2026.
- Mandiri e-Statement, 11 halaman, periode Juni 2026 dan dilindungi password.

Password contoh hanya digunakan untuk pengujian lokal dan tidak ditanam di source code.

### Mandiri

Parser membaca:

```text
No
Tanggal dan waktu
Keterangan
Nominal plus/minus
Saldo berjalan
```

Validasi menggunakan saldo berjalan pada setiap transaksi.

### BCA

Parser memahami format:

```text
TANGGAL
KETERANGAN
CBG
MUTASI
SALDO
```

Deteksi debit/kredit memakai kode `DB`, `CR`, `TRANSAKSI DEBIT`, dan `BIAYA ADM`.

### Krom

Parser membaca:

```text
Tanggal & Waktu
Detail Transaksi
Tipe Transaksi
Jumlah
```

Subrekening yang dapat dikenali:

```text
Tabungan Utama
Dana Darurat
Laundry
Internet
Uang Kos
Listrik
Bensin
```

Pemindahan saldo internal Krom dipasangkan berdasarkan reference ID. Pasangan tersebut tidak dipilih otomatis agar pemasukan dan pengeluaran tidak dihitung ganda.

### OCR Machine-Learning

Tesseract LSTM tetap menjadi fallback untuk:

- screenshot;
- PDF hasil scan;
- halaman tanpa text layer.

Untuk PDF digital ketiga bank, native text parser lebih diprioritaskan karena lebih akurat daripada OCR gambar.


## Account Mapping and Compact Review Fix

### Halaman Informasi

Halaman ringkasan, grafik, deposito kosong, disclaimer, atau halaman lain yang tidak berisi tabel transaksi tidak lagi disebut gagal.

```text
Halaman Informasi
```

### Halaman Benar-benar Gagal

Hanya dihitung jika halaman diperkirakan berisi transaksi tetapi:

- native parser tidak berhasil;
- OCR fallback juga tidak berhasil.

### Mapping Rekening

Pemetaan memakai ID rekening aktual dari pengaturan user:

```text
Statement Krom    → Krom
Statement BCA     → BCA
Statement Mandiri → Mandiri
```

Transfer Krom:

```text
Incoming dari Mandiri → sumber Mandiri, tujuan Krom
Outgoing ke BCA       → sumber Krom, tujuan BCA
```

### Compact Review

Tabel review dipadatkan dari 18 menjadi 10 kolom utama. Bank, subrekening, halaman, merchant, keterangan, validasi, confidence, serta akun sumber/tujuan dikelompokkan secara logis.


## Automatic Incoming/Outgoing Transfer Mapping

### Transfer masuk pada e-Statement BCA

```text
Sumber  : bank lain yang terbaca dari keterangan
Tujuan  : BCA
```

Jika nama bank sumber tidak ada pada e-Statement:

```text
Sumber  : Transfer Belum Dipetakan
Tujuan  : BCA
```

Aplikasi tidak menebak bank hanya dari kode `501`, karena kode tersebut merupakan kode pada kolom CBG/cabang dan bukan identitas bank sumber.

### Transfer keluar dari BCA

```text
Sumber  : BCA
Tujuan  : bank yang terbaca dari keterangan
```

Jika bank tujuan tidak tercantum, tujuan memakai `Transfer Belum Dipetakan`.

### Adaptive Transfer Learning

Setelah user memilih akun sumber/tujuan yang benar dan menyimpan transaksi, pasangan tersebut disimpan di:

```text
users/{uid}/settings/profile.transferAccountRules
```

Scan berikutnya dengan pola keterangan yang sama akan mengisi akun sumber dan tujuan otomatis.


## NVIDIA AI Optimizer

Arsitektur:

```text
PDF/image
→ parser multi-bank lokal
→ Tesseract fallback
→ tabel review
→ DeepSeek V4 Pro text normalization
→ review pengguna
→ Firestore
```

DeepSeek V4 Pro tidak membaca gambar. Model tersebut dipakai setelah
parser/OCR lokal menghasilkan teks.

Untuk pembacaan gambar, backend menyediakan endpoint optional yang memakai:

```text
nvidia/nemotron-nano-12b-v2-vl
```

API key tidak boleh diletakkan pada frontend. Deploy folder
`backend_nvidia`, simpan key sebagai environment variable, lalu masukkan
URL backend pada halaman OCR/PDF Spendly.
