# Spendly OCR Budget Tracker

Versi ini tidak memakai Azure OpenAI, tidak memakai backend, dan tidak memakai Firebase Storage.

## Fitur Baru

- OCR Screenshot Scanner berbasis Tesseract.js
- File screenshot hanya diproses di browser
- File screenshot tidak disimpan
- Hasil OCR tampil dulu untuk review/edit
- Simpan transaksi ke Firestore
- Catatan scan disimpan dengan format: `Bank | Tanggal | Kategori | Jumlah`
- Financial Advisor lokal berbasis rule sederhana

## Upload ke GitHub Pages

Upload/replace file ini:

```text
index.html
README.md
STORAGE_RULES.txt
assets/app.js
assets/styles.css
```

Folder `azure-function-api` tidak diperlukan lagi untuk versi ini.

## Cara Kerja OCR

```text
Upload screenshot
↓
Tesseract.js membaca teks di browser
↓
Rule parser mencari nominal, tanggal, bank, merchant, kategori
↓
Hasil tampil di form review
↓
User edit jika perlu
↓
Klik Simpan Hasil Scan
↓
Data masuk Firestore
```

## Catatan Akurasi

OCR lokal tidak secerdas AI vision. Hasil tetap perlu dicek ulang, terutama nominal, tanggal, bank/dompet, kategori, dan merchant.


## Revisi Mobile Login Fixed

Perubahan:
- Firebase Auth memakai browserLocalPersistence agar login lebih stabil di HP.
- Pesan error login diperjelas.
- Ditambahkan cache-busting pada `assets/app.js` dan `assets/styles.css` agar HP tidak mengambil file lama.
- Versi ini tetap OCR lokal, tanpa Azure OpenAI, tanpa Azure Function, dan tanpa Firebase Storage.

Kalau HP masih gagal login:
1. Pastikan Firebase Authentication Email/Password sudah Enabled.
2. Pastikan Authorized domains berisi `arndyka.github.io`.
3. Di Chrome HP, clear site data untuk `arndyka.github.io`, lalu buka ulang website.
