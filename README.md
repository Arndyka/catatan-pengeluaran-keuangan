# Spendly Full Fixed

Versi lengkap yang diperbaiki ulang dari nol.

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
- OCR screenshot scanner lokal dengan Tesseract.js
- Review hasil OCR sebelum simpan
- Catatan scan format: `Bank | Tanggal | Kategori | Jumlah`
- Financial Advisor lokal rule-based
- Export CSV
- Export Excel

## Upload ke GitHub

Upload/replace file berikut:

```text
index.html
README.md
FIRESTORE_RULES.txt
STORAGE_RULES.txt
assets/app.js
assets/styles.css
```

## Firebase Authentication

Pastikan:

```text
Authentication → Sign-in method → Email/Password → Enabled
```

Pastikan Authorized domains berisi:

```text
arndyka.github.io
```

## Firestore Rules

Pakai isi `FIRESTORE_RULES.txt`.

## Catatan

Versi ini tidak memakai:

- Azure OpenAI
- Azure Function
- Firebase Storage

Jadi tidak perlu API key AI atau billing Firebase Storage.


## Revisi OCR Parser v2

Perbaikan:
- Jika screenshot berisi daftar banyak transaksi, parser memprioritaskan transaksi uang keluar seperti QR Bayar / Bayar / nominal minus.
- Header bulan seperti "April Mei Juni Juli" tidak lagi dipakai sebagai merchant.
- Deteksi tipe transaksi diperbaiki agar kata "Transfer" di mutasi tidak otomatis membuat transaksi menjadi Transfer.
- Untuk hasil paling akurat, crop screenshot ke satu transaksi yang ingin dicatat.


## Multi OCR + PDF

Fitur tambahan:
- Upload screenshot satu transaksi.
- Upload screenshot mutasi banyak transaksi dalam satu layar.
- Upload PDF/e-statement.
- OCR membaca semua halaman PDF.
- Sistem memecah transaksi berdasarkan tanggal grup.
- Sistem membaca nominal plus/minus:
  - `+ Rp 49.900` = pemasukan
  - `- Rp 49.900` = pengeluaran
- Sistem mendeteksi tipe transaksi:
  - Transfer Rupiah = transfer/pemasukan tergantung tanda nominal
  - QR Bayar = pengeluaran
  - Bayar/Top-up = pengeluaran
- Sistem mengambil merchant dari keterangan seperti:
  - `ke Ayam Sambel Ijo - CP` -> Ayam Sambel Ijo
  - `ke Kedai Bang Jay` -> Kedai Bang Jay
  - `ke FAMILYMART MANDIRI DIGITA` -> FamilyMart
- Hasil banyak transaksi ditampilkan sebagai tabel review.
- User bisa edit/centang/hapus baris sebelum simpan.
