# Spendly Budget Tracker

Versi ini menambahkan fitur Budget Tracker:

- Pemasukan
- Pengeluaran
- Transfer antar bank/dompet
- Saldo per bank
- Normalisasi nama bank
- Total sisa uang
- Export CSV
- Export Excel dengan sheet ringkasan dan per tanggal
- Login user Firebase
- Data tersimpan online di Firestore

## Struktur Firestore

```text
users/{userId}/incomes/{incomeId}
users/{userId}/expenses/{expenseId}
users/{userId}/transfers/{transferId}
```

## Normalisasi Nama Bank

Contoh berikut dianggap satu bank yang sama:

```text
Mandiri
Bank Mandiri
ManDiri
```

## Cara Update dari Versi Lama

1. Extract ZIP.
2. Buka file lama `assets/app.js` di GitHub.
3. Copy bagian `firebaseConfig` kamu.
4. Buka file baru `assets/app.js`.
5. Paste `firebaseConfig` kamu ke file baru.
6. Upload ulang semua file/folder ke GitHub:
   - `index.html`
   - `README.md`
   - `FIRESTORE_RULES.txt`
   - `assets/app.js`
   - `assets/styles.css`
7. Commit changes.
8. Update Firestore Rules menggunakan isi `FIRESTORE_RULES.txt`.
9. Tunggu GitHub Pages update sekitar 1-5 menit.
10. Refresh website dengan Ctrl + F5.

## Firestore Rules

Gunakan isi file `FIRESTORE_RULES.txt`.

## Catatan

- Transfer tidak mengubah total uang keseluruhan.
- Transfer hanya memindahkan saldo dari satu bank ke bank lain.
- Sisa uang = total pemasukan - total pengeluaran.
- Saldo total semua bank harus sama dengan sisa uang.
- Pengeluaran lama tanpa nama bank akan masuk ke bank "Belum Dicatat".
