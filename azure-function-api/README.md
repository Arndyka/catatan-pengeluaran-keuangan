# Spendly Azure Function API

Backend ini dipakai agar Azure OpenAI API key tidak bocor di frontend GitHub Pages.

## Endpoint

```text
POST /api/scan-transaction
POST /api/financial-advice
```

## Setup Local

1. Install Node.js LTS.
2. Install Azure Functions Core Tools.
3. Masuk folder ini:

```bash
cd azure-function-api
npm install
```

4. Copy file:

```text
local.settings.json.example
```

menjadi:

```text
local.settings.json
```

5. Isi environment variable dengan key Azure OpenAI baru hasil rotate.

6. Jalankan:

```bash
npm start
```

## Deploy

Deploy ke Azure Functions. Setelah deploy, ambil URL seperti:

```text
https://NAMA_FUNCTION_APP.azurewebsites.net/api
```

Lalu isi di frontend `assets/app.js`:

```js
const AI_API_BASE_URL = "https://NAMA_FUNCTION_APP.azurewebsites.net/api";
```

## Security

Jangan commit `local.settings.json`.
Jangan taruh Azure OpenAI API key di GitHub Pages atau file frontend.
