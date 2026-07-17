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
