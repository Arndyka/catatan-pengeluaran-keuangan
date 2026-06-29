# Spendly Budget Tracker - With Edit Transaction

Versi ini menambahkan fitur Edit Transaksi.

## Fitur Baru

- Edit pemasukan
- Edit pengeluaran
- Edit transfer
- Memperbaiki transaksi lama yang bank-nya "Belum Dicatat"
- Edit nominal, tanggal, bank, kategori/sumber, dan keterangan
- Saldo bank otomatis dihitung ulang setelah edit

## Struktur File

```text
budget_tracker_with_edit/
├── index.html
├── README.md
├── FIRESTORE_RULES.txt
└── assets/
    ├── styles.css
    └── app.js
```

## Cara Update

1. Extract ZIP.
2. Copy firebaseConfig lama kamu dari file `assets/app.js` versi GitHub.
3. Paste firebaseConfig itu ke file baru `assets/app.js`.
4. Upload ulang ke GitHub:
   - index.html
   - README.md
   - FIRESTORE_RULES.txt
   - assets/app.js
   - assets/styles.css
5. Commit changes.
6. Pastikan Firestore Rules memakai rules berikut:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId}/{document=**} {
      allow read, create, update, delete: if request.auth != null
        && request.auth.uid == userId;
    }

  }
}
```

7. Tunggu GitHub Pages update.
8. Refresh website dengan Ctrl + F5.

## Catatan

Fitur edit membutuhkan `updateDoc`, sehingga Firestore Rules harus mengizinkan `update`.
