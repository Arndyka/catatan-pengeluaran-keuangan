# Spendly NVIDIA AI Backend

Backend ini menyimpan NVIDIA API key secara aman dan menyediakan:

- `GET /health`
- `POST /api/nvidia/normalize-statement`
- `POST /api/nvidia/read-page` — optional vision fallback

## Model

Model teks dapat dipilih melalui `NVIDIA_TEXT_MODEL` pada `.env`. Untuk Nemotron 3.5 Lightning, gunakan `nvidia/nemotron-3.5-lightning-30b-a3b`. Backend memakai `enable_thinking=false` untuk keluarga Nemotron, agar respons normalisasi berupa JSON tanpa keluaran reasoning. Konfigurasi DeepSeek lama tetap memakai parameter `thinking=false`.

Permintaan ke penyedia dibatasi timeout 90 detik tanpa retry otomatis, lebih pendek dari batas tunggu frontend 120 detik. `/health` hanya memeriksa konfigurasi; panggilan normalisasi dengan data sintetis diperlukan untuk memastikan model benar-benar merespons. Jangan memasukkan API key ke kode frontend atau Git.

### Nemotron 3.5 Lightning

Dipakai untuk:

- memperbaiki tipe transaksi;
- mendeteksi transfer antar rekening;
- menormalkan merchant/kategori;
- menyarankan akun sumber dan tujuan;
- memberikan alasan singkat.

Model ini menerima **teks**, bukan gambar.

### Nemotron 3 Nano Omni

Route optional `/api/nvidia/read-page` memakai model vision untuk gambar
halaman yang tidak dapat dibaca parser lokal.

Default vision saat ini `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, menggantikan `nvidia/nemotron-nano-12b-v2-vl` yang tidak lagi muncul di katalog API saat pemeriksaan 16 Oktober 2026. Batas reasoning 1.024 token menyisakan ruang dalam batas keluaran 8.192 token untuk JSON transaksi. Lihat [referensi API NVIDIA](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-omni-30b-a3b-reasoning-infer). Ketersediaan di katalog bukan bukti bahwa inferensi sedang berhasil; uji dengan gambar sintetis sebelum penggunaan.

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

Backend memuat `.env` dari folder `backend_nvidia`, termasuk jika perintah dijalankan dari folder lain. Environment sistem tetap lebih diprioritaskan. Origin preview frontend port 4173 sudah diizinkan pada konfigurasi default.

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

## Render Free

Repository root menyediakan `render.yaml` untuk satu web service Python paket **Free**, region Singapore, tanpa database atau disk berbayar. Konfigurasi mengikuti [Render Blueprint](https://render.com/docs/blueprint-spec) dan [panduan FastAPI](https://render.com/docs/deploy-fastapi).

1. Login Render, pilih **New > Blueprint**, lalu repository `Arndyka/catatan-pengeluaran-keuangan`, branch `main`.
2. Pastikan paket tetap **Free**. Isi `NVIDIA_API_KEY` lewat isian secret Render, bukan di repository.
3. Render membuat `AI_ACCESS_TOKEN` acak secara otomatis. Setelah deploy, salin nilainya dari Environment ke kolom **Kode akses AI pribadi** di scanner SPENDLY. Ini berbeda dari API key NVIDIA.
4. Salin URL HTTPS layanan yang benar dari Render ke **URL Backend NVIDIA AI** dan tekan **Hubungkan AI**.
5. Uji dengan kuitansi sintetis dahulu. `/health` hanya memeriksa konfigurasi; hasil scan/saran yang berhasil diperlukan untuk memastikan NVIDIA merespons.

Jika membuat Web Service manual: root directory `backend_nvidia`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1`. Isi variabel sesuai `render.yaml`, termasuk `AI_ACCESS_TOKEN` acak minimal 32 karakter dan `REQUIRE_AI_ACCESS_TOKEN=true`.

Render Free dapat tidur setelah 15 menit tidak aktif. Frontend menunggu health hingga 90 detik sebelum mengirim data untuk pemrosesan AI (batas 120 detik terpisah); tidak mengulang otomatis permintaan AI yang gagal. Kode akses hanya berada di kolom halaman yang sedang terbuka, tidak masuk localStorage, database, atau backup. Mengubah URL backend mengosongkan kode akses.

Pada Render, semua endpoint `/api/nvidia/` menolak akses tanpa kode yang benar dan menolak pemrosesan jika kode belum dikonfigurasi. CORS bukan pengganti autentikasi. Backend tidak menyimpan ledger atau dokumen; penyimpanan data SPENDLY yang sudah ada tetap dipakai. Layanan ini ditujukan untuk pemakaian pribadi; kode akses bersama bukan sistem akun multi-pengguna.

## Railway

1. Upload repository backend ke Railway.
2. Root directory: `backend_nvidia`
3. Tambahkan Variables:
   - `NVIDIA_API_KEY`
   - `ALLOWED_ORIGINS=https://arndyka.github.io`
   - `REQUIRE_AI_ACCESS_TOKEN=true`
   - `AI_ACCESS_TOKEN` acak minimal 32 karakter
4. Deploy.
5. Salin URL Railway ke kolom backend di Spendly.

## Keamanan

- Jangan menaruh `NVIDIA_API_KEY` di `index.html` atau JavaScript.
- Jangan commit `.env`.
- Frontend hanya menyimpan URL backend; kode akses diisi ulang setelah halaman dimuat ulang.
- Endpoint normalisasi tidak menerima PDF atau password PDF.
