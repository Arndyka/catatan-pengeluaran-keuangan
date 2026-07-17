# Spendly Stable Multi OCR

Versi stabil rebuild dari nol.

## Fitur

- Login Email/Password
- Register Email/Password
- Firebase Auth persistence untuk HP
- Firestore per user
- Input pemasukan
- Input pengeluaran
- Transfer antar bank/dompet
- Edit transaksi
- Hapus transaksi
- Saldo per bank
- Chart saldo per bank
- Chart pemasukan vs pengeluaran
- OCR banyak transaksi dalam satu screenshot
- Upload PDF/e-statement
- PDF dibaca per halaman
- Review batch dalam tabel
- Edit/centang/hapus hasil OCR sebelum simpan
- Simpan banyak transaksi sekaligus
- Financial Advisor lokal
- Export CSV
- Export Excel

## Upload ke GitHub

Upload/replace semua file:

```text
index.html
README.md
FIRESTORE_RULES.txt
STORAGE_RULES.txt
assets/app.js
assets/styles.css
```

Hapus file/folder lama yang tidak perlu:

```text
azure-function-api/
package.json
local.settings.json.example
scanTransaction.js
financialAdvice.js
azureOpenAI.js
DEPLOY_STEP_BY_STEP.md
```

## Firebase Checklist

Authentication:
- Email/Password harus Enabled.

Authorized domains:
- Pastikan ada `arndyka.github.io`.

Firestore Rules:
- Pakai isi `FIRESTORE_RULES.txt`.

## Catatan

Tidak memakai:
- Azure OpenAI
- Azure Function
- Firebase Storage


## Feature Upgrade

Tambahan fitur:
- Multi page: Dashboard, Input Transaksi, Review & Summary.
- Data duplikat dicegah saat input manual dan saat simpan hasil OCR.
- Tombol `Bersihkan Duplikat` untuk menghapus data lama yang sama.
- Bank/Dompet memakai dropdown, bukan ketik manual.
- Fitur tambah bank/dompet baru.
- Default bank termasuk `Mandiri Credit Card`.
- Fitur Hide/Show Saldo untuk menyamarkan nominal di dashboard.
- Sistem Kartu Kredit Mandiri:
  - Belanja pakai kartu kredit: pilih bank `Mandiri Credit Card`.
  - Bayar tagihan: input Transfer dari bank sumber ke `Mandiri Credit Card`.
  - Outstanding dihitung dari saldo negatif kartu kredit.
- Budget plan:
  - Bisa tambah target persentase dari pemasukan.
  - Default: Kebutuhan Pokok 70%, Investasi/Tabungan 30%.


## Adaptive Layout Desktop

Perbaikan:
- Dashboard memakai lebar halaman penuh.
- Panel saldo tidak lagi menyisakan kolom kosong.
- Form input menjadi dua kolom pada desktop.
- Form tetap satu kolom pada tablet dan HP.
- Scanner memenuhi lebar halaman sebelum hasil review muncul.
- Single OCR review menjadi dua kolom pada desktop.
- Batch OCR review tetap full width.
- Saldo per bank menjadi dua kolom pada layar besar.
- Chart diperbesar agar proporsional di laptop.
- Judul halaman berubah sesuai menu aktif.


## Hapus Semua Transaksi

Tambahan:
- Tombol `Hapus Semua` tersedia pada halaman Review & Summary.
- Menghapus seluruh pemasukan, pengeluaran, dan transfer milik user yang sedang login.
- Memakai dua tahap konfirmasi:
  1. Konfirmasi browser.
  2. Ketik `HAPUS SEMUA`.
- Penghapusan hanya berlaku untuk akun user yang sedang login.


## Default Hide Saldo

Perubahan:
- Saldo otomatis tersembunyi saat website dibuka atau user login.
- Tombol awal menjadi `Show Saldo`.
- Nominal pada kartu ringkasan dan saldo per bank disamarkan.
- Grafik saldo dan cashflow ikut disembunyikan agar nilai tidak terlihat dari panjang bar atau skala sumbu.
- Klik `Show Saldo` untuk menampilkan semua nominal dan grafik.


## Credit Card Manager

Modul Kartu Kredit Mandiri sekarang memiliki:
- Total limit.
- Limit terpakai.
- Sisa limit.
- Tagihan tercetak.
- Tagihan berjalan.
- Cicilan bulan ini.
- Pembayaran minimum.
- Estimasi denda terlambat dan biaya overlimit.
- Tanggal cetak tagihan.
- Periode billing.
- Tanggal jatuh tempo.
- Tanggal pengingat pembayaran.
- Daftar cicilan aktif dan estimasi sisa jadwal.

Default aplikasi:
- Limit contoh: Rp10.000.000, wajib disesuaikan dengan kartu user.
- Tanggal cetak: tanggal 7 setiap bulan.
- Jatuh tempo: 20 hari setelah tanggal cetak.
- Pengingat: H-5.
- Pembayaran minimum: 5% atau Rp50.000, mana yang lebih besar.
- Bunga retail: 1,75% per bulan.
- Biaya terlambat: 1% dari tagihan, maksimal Rp100.000.
- Biaya overlimit: Rp150.000.

Catatan:
- Tagihan tercetak aktual dapat diinput manual dari Livin'/e-billing.
- Jika nilai aktual diisi 0, aplikasi memakai estimasi otomatis.
- Tanggal resmi dan nominal resmi tetap harus dicocokkan dengan Livin'/e-billing.
- Bunga/admin cicilan promo tidak dihitung otomatis.
