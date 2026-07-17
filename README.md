# Spendly AI Budget Tracker

Versi ini menambahkan:

- AI Screenshot Scanner
- Review hasil AI sebelum simpan transaksi
- Upload screenshot ke Firebase Storage
- Auto nama file screenshot: tanggal-kategori-nominal
- AI Financial Advisor
- Azure Function backend untuk menjaga Azure OpenAI API key tetap aman

## Struktur Project

```text
index.html
assets/
  app.js
  styles.css
FIRESTORE_RULES.txt
STORAGE_RULES.txt
azure-function-api/
  package.json
  host.json
  local.settings.json.example
  src/functions/scanTransaction.js
  src/functions/financialAdvice.js
  src/shared/azureOpenAI.js
```

## Frontend

Upload file berikut ke GitHub Pages:

```text
index.html
assets/app.js
assets/styles.css
FIRESTORE_RULES.txt
STORAGE_RULES.txt
```

## Backend

Folder `azure-function-api` adalah backend Azure Function.

Jangan taruh Azure OpenAI API key di frontend.

## Firebase

Firestore Rules: pakai `FIRESTORE_RULES.txt`.

Storage Rules: pakai `STORAGE_RULES.txt`.

Aktifkan Firebase Storage dulu dari Firebase Console.

## Frontend AI Backend URL

Setelah Azure Function deploy, buka:

```text
assets/app.js
```

Cari:

```js
const AI_API_BASE_URL = "ISI_URL_AZURE_FUNCTION_KAMU";
```

Ganti dengan URL Azure Function:

```js
const AI_API_BASE_URL = "https://NAMA_FUNCTION_APP.azurewebsites.net/api";
```
