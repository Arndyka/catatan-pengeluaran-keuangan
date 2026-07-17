# Spendly AI Budget Tracker — No Storage Version

Versi ini menambahkan fitur AI tanpa Firebase Storage.

## Fitur

- AI Screenshot Scanner
- Preview screenshot
- Scan screenshot via Azure Function
- Hasil AI tampil dulu untuk review/edit
- File screenshot tidak disimpan
- Hasil teks scan disimpan ke Firestore
- Format catatan scan: `Bank | Tanggal | Kategori | Jumlah`
- AI Financial Advisor
- Azure Function backend agar Azure OpenAI API key tidak bocor

## Yang Perlu Diupload ke GitHub Pages

```text
index.html
README.md
FIRESTORE_RULES.txt
assets/app.js
assets/styles.css
```

File ini opsional, hanya catatan:

```text
STORAGE_RULES.txt
```

Folder backend:

```text
azure-function-api/
```

Folder `azure-function-api` bukan bagian dari tampilan GitHub Pages. Folder ini dipakai untuk deploy backend ke Azure Function.

## Tidak Perlu Firebase Storage

Pada versi ini kamu tidak perlu upgrade Firebase ke Blaze hanya untuk menyimpan bukti transaksi.

Alurnya:

```text
Upload screenshot
↓
AI membaca screenshot
↓
Hasil muncul untuk review
↓
User klik Simpan
↓
Data transaksi + catatan scan masuk Firestore
↓
File screenshot tidak disimpan
```

## Field Firestore Tambahan

Data hasil scan menyimpan field:

```text
source: "ai_screenshot"
confidence: angka 0-1
scanNote: "Mandiri | 2026-06-29 | Makan | Rp 25.000"
merchant: "Nama toko/sumber jika terbaca"
```

## Backend URL

Setelah Azure Function deploy, buka:

```text
assets/app.js
```

Cari:

```js
const AI_API_BASE_URL = "ISI_URL_AZURE_FUNCTION_KAMU";
```

Ganti dengan URL backend:

```js
const AI_API_BASE_URL = "https://NAMA_FUNCTION_APP.azurewebsites.net/api";
```

## Security

Jangan taruh Azure OpenAI API key di frontend/GitHub Pages.
Simpan key di Azure Function App Settings.
