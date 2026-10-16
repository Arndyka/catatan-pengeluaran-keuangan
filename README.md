## Coba Spendly

- Aplikasi: https://arndyka.github.io/catatan-pengeluaran-keuangan/
- Demo terpisah: https://arndyka.github.io/catatan-pengeluaran-keuangan/?demo=1

GitHub Pages memublikasikan frontend statis dari branch `main`. Backend AI Python harus dihosting terpisah melalui HTTPS dan URL-nya diisi pada pengaturan AI; API key hanya disimpan di backend.

## Pembacaan e-statement — 16 Oktober 2026

**BCA → saran AI:** pilih e-statement myBCA dan **Baca mutasi** pada mode **Pembaca PDF & OCR lokal**. Setelah muncul hasil, buka pengaturan AI, isi URL backend aktif, lalu setujui pengiriman data dan tekan **Minta saran NVIDIA AI**. Saran baru diterapkan setelah pengguna memilih **Terapkan**. Endpoint kesehatan kini memeriksa bahwa backend memiliki konfigurasi API key; status terkonfigurasi belum membuktikan key valid atau kuota model tersedia. Alur BCA → saran AI diuji dengan PDF sintetis dan respons AI simulasi; panggilan model sungguhan memerlukan backend beserta API key pengguna.

Pembaca PDF lokal mendukung bluAccount, rekening koran konsolidasi Mandiri (termasuk PDF berpassword), dan rekening utama myBCA Tahapan Xpresi dengan lampiran Poket Rupiah kosong. Halaman informasi, ringkasan kartu kredit, dan disclaimer tidak menjadi transaksi. Deskripsi Mandiri yang bersambung ke halaman berikutnya tetap digabungkan. Nominal pecahan rupiah dipertahankan, dan rekonsiliasi memeriksa total serta saldo per baris sampai sen.

Verifikasi lokal: **16 PDF, 80 halaman, 638 baris transaksi**; semua cocok dengan total tercetak dan saldo, tanpa OCR/AI. Angka baris mencakup tiga salinan statement Mei myBCA, bukan jumlah transaksi unik. Berkas identik dikenali sebagai duplikat; versi dokumen berbeda dengan transaksi serupa memerlukan keputusan pengguna. Transfer milik sendiri yang belum diketahui rekening pasangannya tetap tidak dipilih untuk disimpan.

Sampel asli dan password tidak disertakan dalam Git. Pengujian tidak menambahkan transaksi ke akun pengguna. Dukungan ini diverifikasi terhadap format sampel tersebut; Poket Rupiah berisi transaksi, dokumen multi-rekening aktif, PDF rusak, dan variasi format lain perlu diperiksa tersendiri. Selalu tinjau hasil sebelum memilih **Simpan Terpilih**.

## Audit akhir keuangan dan UI — 15 Oktober 2026

Jurnal dan presisi uang, saldo awal, arus kas, siklus/minimum kartu, deduplikasi scan, gaji rutin, budget, dan penanganan gagal simpan diperiksa ulang. Logo bank lokal, animasi reduced-motion, serta aksesibilitas desktop/HP telah dirapikan. Lihat [hasil audit dan batas pengujian](docs/FINAL_FINANCIAL_AUDIT.md).

Validasi terbaru: **88 unit Node + 6 backend + 21 skenario browser lulus**, OCR lokal asli pada bukti sintetis lulus. Audit axe pada **11 halaman × 2 ukuran layar** tidak menemukan pelanggaran pada aturan yang diuji atau overflow halaman. Firebase produksi dan model NVIDIA live belum diuji.

Paket frontend: `artifacts/spendly-web-redesign.zip`. Buat ulang dengan `python tools/package-frontend.py`; paket tidak menyertakan API key, backend, atau data pribadi. Backend AI tetap dipasang terpisah sesuai panduannya.

## Scan lebih selektif, Suggestion Edit, dan gaji bulanan

Filter informasi di luar transaksi, saran perbaikan yang harus diterapkan pengguna, serta jadwal gaji terhubung dengan saldo, laporan, dan budget. Lihat [panduan kualitas scan dan gaji](docs/QUALITY_PAYROLL.md).

## Tambahan scan dan tabungan (15 Oktober 2026)

Scan screenshot/PDF + review duplikat, AI Vision opsional, tabungan bersama Krom, pengingat biaya bank, default dark mode, dan perbaikan jarak kartu kredit. Lihat [panduan lengkap](docs/SCAN_SAVINGS.md). AI membutuhkan backend dan API key pada `.env`; OCR lokal dapat digunakan tanpa key.

# Spendly — Budget, Dompet & Goals

Redesign 15 Oktober 2026: tampilan coral/plum yang responsif, navigasi HP, tema terang/gelap, dashboard belanja harian, goals tabungan, dompet, dan investasi tercatat. Mesin akuntansi dan parser bank tetap digunakan.

## Menjalankan versi baru

Di folder SPENDLY, jalankan `npm.cmd start` pada Windows (atau `npm start` di shell lain). Server tersedia di `http://127.0.0.1:4173`.

- Akun Firebase: `http://127.0.0.1:4173/`
- Demo terpisah: `http://127.0.0.1:4173/?demo=1`
- Demo menggunakan data contoh dan menyimpan perubahan hanya di localStorage browser (`spendly:demo:v1`). Tidak masuk ke akun Firebase.
- Frontend tetap berupa file statis; tidak membutuhkan build atau node_modules saat di-host.

## Fitur redesign

- Ringkasan: ruang belanja harian, pemasukan/pengeluaran, kekayaan bersih, grafik aktual, budget dan goals.
- Batas belanja bulanan terpisah dari alokasi kategori. Sisa budget dibagi hari tersisa termasuk hari ini. Belanja kartu kredit masuk konsumsi; transfer/investasi tidak.
- Goals: buat, perbarui, hapus; target tanggal, jumlah terkumpul dan estimasi tabungan bulanan. Pencatatan manual goals tidak mengubah saldo rekening.
- Dompet: semua rekening, termasuk saldo nol, dengan saldo dari jurnal.
- Investasi: saldo tercatat dan riwayat alokasi. Belum ada harga pasar langsung atau perhitungan keuntungan pasar.
- Tema tersimpan per browser, privasi saldo, navigasi bawah, animasi yang mengikuti pengaturan reduced motion.
- Scanner: unggah file lebih mudah; detail parser dan AI opsional bisa dibuka saat diperlukan.

## Dipasang di HP

Manifest, ikon 192/512, mode standalone, dan service worker sudah disiapkan. Setelah frontend dipublikasikan lewat HTTPS, gunakan **Pasang di HP** pada Pengaturan. Android Chrome mendukung instalasi; iPhone memakai Bagikan → Tambahkan ke Layar Utama. Dukungan mengikuti browser/perangkat. Lihat [persyaratan PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Ini fondasi PWA, belum APK atau aplikasi App Store. Saat offline, halaman pemberitahuan ditampilkan; login, sinkronisasi, dan AI membutuhkan internet. Service worker menyimpan aset statis saja. Dokumen bank dan permintaan cloud/AI tidak masuk cache service worker.

Untuk GitHub Pages, salin `index.html`, `offline.html`, `manifest.webmanifest`, `sw.js`, dan seluruh `assets/`. Semua path relatif mendukung `/catatan-pengeluaran-keuangan/`. Backend Python di-host terpisah. Folder ini belum di-push atau dipublikasikan oleh proses redesign.

## Pengujian

```text
npm.cmd install
npm.cmd test
npx.cmd playwright install chromium
npx.cmd playwright test
node tools/visual-qa.mjs
```

Jalankan server `npm.cmd start` di terminal lain sebelum tes browser. Backend menggunakan `backend_nvidia/.venv`; pengujiannya: `backend_nvidia/.venv/Scripts/python.exe -m unittest discover -s tests -p test_backend.py` (memerlukan requirements backend dan httpx).

Catatan verifikasi dan batas pengujian: [docs/REDESIGN_REVIEW.md](docs/REDESIGN_REVIEW.md). Screenshot: [artifacts/previews](artifacts/previews).

## Dokumentasi mesin pencatatan sebelumnya

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


## BCA Native Reader V3

Perbaikan khusus BCA:

- membaca 17 transaksi dari mutasi Tahapan Xpresi;
- mendeteksi kode transaksi BCA (TRSF E-BANKING, BI-FAST, DB INTERCHANGE, TRANSAKSI DEBIT, BIAYA ADM);
- menormalisasi merchant YouTube Premium, Spotify, Alfamart, DANA, ShopeePay, GoPay, dan QPON;
- mendeteksi transfer antar rekening memakai nama pemilik rekening dari header PDF, bukan nama hardcoded;
- merekonstruksi saldo yang tidak dicetak pada setiap baris;
- hanya membandingkan saldo tercetak pada baris yang memang memiliki saldo;
- menghilangkan false warning seperti selisih Rp50.000 akibat saldo antara yang tidak dicetak BCA.


## Multi-Bank AI Reader V4

Versi ini bukan aplikasi khusus BCA. Sistem berisi tiga parser native
dalam satu aplikasi:

### Mandiri Native Reader

- PDF e-Statement dengan atau tanpa password;
- tanggal dan waktu;
- nominal masuk/keluar;
- saldo berjalan;
- merchant dan kategori;
- rekonsiliasi saldo awal sampai saldo akhir.

### BCA Native Reader V3

- kode transaksi `CR` dan `DB`;
- BI-FAST;
- transfer e-banking;
- transaksi debit;
- biaya administrasi;
- normalisasi merchant;
- rekonstruksi saldo antarbaris yang tidak dicetak.

### Krom Native Reader

- Tabungan Utama;
- seluruh kantong;
- QRIS;
- transfer masuk/keluar;
- cashback;
- bunga dan pajak;
- pemindahan saldo internal berdasarkan reference ID.

### NVIDIA AI Optimizer

NVIDIA AI digunakan sebagai tahap validasi setelah parser lokal.
AI tidak menggantikan ketiga parser bank dan tidak diizinkan mengubah
tanggal atau nominal asli.
