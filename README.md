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
