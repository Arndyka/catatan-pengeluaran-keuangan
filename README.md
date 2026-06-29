# Spendly - Catatan Pengeluaran Firebase

Ini adalah versi UI profesional untuk website catatan pengeluaran.

## Struktur File

```text
catatan_pengeluaran_premium/
├── index.html
├── README.md
├── FIRESTORE_RULES.txt
└── assets/
    ├── styles.css
    └── app.js
```

## Fitur

- Login user
- Register user
- Logout user
- Data tersimpan online di Firebase Firestore
- Setiap user memiliki data masing-masing
- Data sama di laptop dan HP jika login dengan akun yang sama
- Dashboard total pengeluaran
- Jumlah transaksi
- Kategori terbesar
- Rata-rata transaksi
- Input pengeluaran
- Filter tanggal
- Filter kategori
- Download CSV
- Download Excel dengan sheet per tanggal

## Setup Firebase

1. Buka Firebase Console:
   https://console.firebase.google.com

2. Buat project baru.

3. Tambahkan Web App.

4. Copy firebaseConfig.

5. Buka file:

```text
assets/app.js
```

6. Ganti bagian ini:

```js
const firebaseConfig = {
  apiKey: "ISI_API_KEY_KAMU",
  authDomain: "ISI_PROJECT_ID.firebaseapp.com",
  projectId: "ISI_PROJECT_ID",
  storageBucket: "ISI_PROJECT_ID.appspot.com",
  messagingSenderId: "ISI_MESSAGING_SENDER_ID",
  appId: "ISI_APP_ID"
};
```

dengan config asli dari Firebase.

## Aktifkan Authentication

1. Firebase Console
2. Build
3. Authentication
4. Get Started
5. Sign-in method
6. Email/Password
7. Enable
8. Save

## Aktifkan Firestore

1. Firebase Console
2. Build
3. Firestore Database
4. Create database
5. Start in production mode
6. Enable

## Firestore Rules

Buka file `FIRESTORE_RULES.txt`, lalu copy isinya ke:

```text
Firestore Database > Rules
```

Klik Publish.

## Upload ke GitHub Pages

Upload semua file/folder ini ke repository GitHub:

```text
index.html
README.md
FIRESTORE_RULES.txt
assets/
```

Pastikan folder `assets` ikut ter-upload.

Lalu aktifkan GitHub Pages:

```text
Settings > Pages > Deploy from a branch > main > /root
```
