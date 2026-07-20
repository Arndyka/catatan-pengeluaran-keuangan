# Spendly NVIDIA AI Backend

Backend ini menyimpan NVIDIA API key secara aman dan menyediakan:

- `GET /health`
- `POST /api/nvidia/normalize-statement`
- `POST /api/nvidia/read-page` — optional vision fallback

## Model

### DeepSeek V4 Pro

Dipakai untuk:

- memperbaiki tipe transaksi;
- mendeteksi transfer antar rekening;
- menormalkan merchant/kategori;
- menyarankan akun sumber dan tujuan;
- memberikan alasan singkat.

Model ini menerima **teks**, bukan gambar.

### Nemotron Nano 12B V2 VL

Route optional `/api/nvidia/read-page` memakai model vision untuk gambar
halaman yang tidak dapat dibaca parser lokal.

## Menjalankan lokal

```bash
cd backend_nvidia
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Isi key baru pada `.env`, kemudian:

```powershell
uvicorn main:app --reload --port 8000
```

Tes:

```text
http://127.0.0.1:8000/health
```

Pada Spendly isi:

```text
URL Backend NVIDIA AI = http://127.0.0.1:8000
```

## Railway

1. Upload repository backend ke Railway.
2. Root directory: `backend_nvidia`
3. Tambahkan Variables:
   - `NVIDIA_API_KEY`
   - `ALLOWED_ORIGINS=https://arndyka.github.io`
4. Deploy.
5. Salin URL Railway ke kolom backend di Spendly.

## Keamanan

- Jangan menaruh `NVIDIA_API_KEY` di `index.html` atau JavaScript.
- Jangan commit `.env`.
- Frontend hanya menyimpan URL backend.
- Endpoint normalisasi tidak menerima PDF atau password PDF.
