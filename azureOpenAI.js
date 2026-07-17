# Deploy Step-by-Step

## 1. Rotate Azure OpenAI Key

Karena key lama pernah terekspos, buat key baru di Azure Portal.

## 2. Deploy Azure Function

Gunakan VS Code Azure extension atau Azure Functions Core Tools.

## 3. Set App Settings di Azure Function

Isi:

```text
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
AZURE_OPENAI_DEPLOYMENT
AZURE_OPENAI_API_VERSION
ALLOWED_ORIGIN
```

Contoh deployment:

```text
AZURE_OPENAI_DEPLOYMENT = gpt-5.4-mini-TaskForce
```

## 4. Update Frontend

Di `assets/app.js`, ganti:

```js
const AI_API_BASE_URL = "ISI_URL_AZURE_FUNCTION_KAMU";
```

menjadi:

```js
const AI_API_BASE_URL = "https://NAMA_FUNCTION_APP.azurewebsites.net/api";
```

## 5. Firebase Storage

Aktifkan Firebase Storage, lalu pakai rules dari `STORAGE_RULES.txt`.

## 6. Test

- Upload screenshot QRIS
- Klik Scan Screenshot
- Review hasil AI
- Klik Simpan Hasil Scan
- Cek Firestore dan Firebase Storage
