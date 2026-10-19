# Scan, saran perbaikan, dan gaji bulanan

Pembaruan 15 Oktober 2026. Data akun tetap memakai repository Firebase yang sama. Mode `?demo=1` menyimpan data contoh secara terpisah di browser.

## Scan gambar dan PDF

- Ringkasan saldo, total laporan, promo, contoh, tagihan belum dibayar, serta status gagal atau pending disaring dari kandidat transaksi.
- AI Vision diminta mengekstrak hanya transaksi selesai/dibukukan. Frontend dan backend memvalidasi jenis record, status, tanggal, arah uang, dan nominal positif yang terbaca.
- OCR screenshot bukti transaksi memerlukan bukti status sukses. QRIS atau nominal saja belum dianggap transaksi selesai. Screenshot daftar mutasi tetap dapat memakai parser daftar.
- Biaya admin, bunga, pajak, dan refund yang dibukukan tetap boleh dicatat.
- Bagian pengecualian pada hasil scan menunjukkan informasi yang disaring. Halaman yang tidak terbaca dilaporkan sebagai gagal dibaca. Hasil AI tetap belum dipilih untuk disimpan: periksa dahulu.
- Pemeriksaan duplikat yang sudah ada tetap berlaku. Gaji/rutin dengan rekening, bulan, jenis, dan nominal sama ikut ditandai untuk review meskipun tanggal bergeser.

## Suggestion Edit

Pada form transaksi gunakan **Periksa input**. Pada review scan, saran muncul di baris kandidat.

Saran lokal mendeteksi beberapa typo merchant, spasi, kategori gaji, tanggal masa depan, rekening bermasalah, serta nominal yang berbeda jauh dari riwayat merchant. Ini pemeriksaan berbasis aturan, bukan model AI. Peringatan nominal tidak menebak angka pengganti.

**Minta saran AI** mengirim rincian input hanya setelah persetujuan di UI. Gunakan URL backend yang sama dengan halaman Scan mutasi. Usulan menunjukkan nilai awal, nilai baru, dan alasan; terapkan atau abaikan setiap usulan secara terpisah. Tanggal dan nominal tidak dapat ditimpa AI. Respons dari pemeriksaan lama diabaikan jika input berubah.

AI Vision dan saran AI membutuhkan backend NVIDIA berjalan serta `NVIDIA_API_KEY` pada `backend_nvidia/.env`. Key tidak disimpan di frontend. Tanpa key, pemeriksaan lokal dan OCR tetap tersedia. Akurasi ekstraksi model live belum diuji dengan dokumen pengguna; pengujian integrasi AI memakai respons simulasi.

## Gaji dan transaksi rutin

1. Buka **Transaksi rutin**, pilih **Atur gaji**, lalu isi nominal rencana, tanggal bulanan, rekening penerima, dan rentang tanggal.
2. Simpan jadwal. Saldo belum bertambah.
3. Saat gaji diterima, pilih **Konfirmasi**. Isi tanggal/nominal aktual atau tautkan transaksi yang sudah ada, termasuk hasil scan.
4. Pemasukan aktual memperbarui jurnal, saldo rekening, laporan, dan budget persentase. Budget nominal tetap sesuai nilai yang kamu atur.

Jadwal gaji baru memakai tanggal **25**, dengan aturan **Majukan ke hari kerja sebelumnya**. Jika tanggal tersebut Sabtu, jadwal maju satu hari ke Jumat; jika Minggu, maju dua hari ke Jumat. Contoh: 25 Oktober 2026 menjadi **Jumat, 23 Oktober 2026**. Pilih **Tetap pada tanggal tersebut** jika penggajianmu tidak mengikuti aturan ini. Hari libur nasional belum diperhitungkan. Aturan gaji lama tanpa pilihan akhir pekan juga memakai penyesuaian ini; tanggal bulanan yang tersimpan tetap dipertahankan. Transaksi rutin biasa tetap mengikuti tanggal kalender.

Tanggal 29–31 terlebih dahulu menyesuaikan akhir bulan pendek, kemudian aturan akhir pekan diterapkan. Batas mulai/berakhir berlaku pada tanggal pembayaran setelah penyesuaian. Pratinjau form dan daftar jadwal menampilkan tanggal pembayaran beserta alasan pergeserannya.

Konfirmasi tetap terkait bulan jadwal. Jika tanggal 1 dimajukan ke akhir bulan sebelumnya, tanggal tersebut boleh digunakan untuk konfirmasi dan pencocokan transaksi. Contoh: gaji Januari 2023 dapat diterima 30 Desember 2022; periode gaji tetap Januari, sedangkan saldo, laporan, dan budget mengikuti tanggal penerimaan aktual di Desember. Satu transaksi tidak dapat ditautkan ke dua periode. Jadwal bisa diubah dan dijeda. Mengubah jadwal tidak mengubah transaksi lama dan tidak membuka kembali bulan yang sudah dikonfirmasi.

Transaksi rutin biasa dapat dicatat lewat **Catat rutin tanpa kecocokan**. Gaji dan transaksi yang memiliki catatan mirip memerlukan konfirmasi satu per satu. Tidak ada pencatatan gaji diam-diam atau scheduler server di latar belakang.

Penyelesaian jadwal dan penulisan/penautan transaksi dilakukan atomik. Identitas aturan + bulan menjaga konfirmasi berulang tetap idempoten. Menghapus transaksi terkait membuka kembali periode tersebut. Aturan lama dengan `lastPostedPeriod` tetap dianggap selesai sampai periode penanda lama.

Jika input manual mirip dengan gaji/rutin yang telah dikonfirmasi, dialog meminta pemeriksaan sebelum menambah catatan. Pilih **Batal** jika merupakan transaksi sama; **OK** hanya untuk transaksi berbeda. Pencocokan kemiripan tidak otomatis menghapus transaksi yang mungkin berbeda.

## Validasi

- Node: `npm.cmd test` — logika transaksi, filter, rekonsiliasi, saran, tanggal jadwal, dan idempotensi repository demo.
- Browser: `npx.cmd playwright test` — alur UI, persistensi, gaji ke budget, penautan scan, dan saran AI dengan respons simulasi.
- Backend: `backend_nvidia/.venv/Scripts/python.exe -m unittest discover -s tests -p test_backend.py`.
- UI: `node tools/payroll-qa.mjs` — screenshot desktop/HP, overflow, audit axe.
- OCR asli: `node tools/ocr-smoke.mjs` — Tesseract dengan bukti transaksi sintetis.

Hasil awal 15 Oktober: 38 unit Node, 6 backend, dan 17 skenario browser lulus. Enam audit desktop/HP bebas overflow dan temuan axe; screenshot disimpan di `artifacts/previews/payroll-*.png`.

Pembaruan jadwal akhir pekan 19 Oktober: 147 unit Node dan 43 skenario browser lulus, disertai pemeriksaan ulang lima skenario gaji/cache setelah perbaikan penguncian periode lama. Form gaji pada lebar 1440/390 piksel lolos pemeriksaan overflow dan axe. Audit salinan lokal pembukuan memastikan saldo terkonfirmasi serta arus kas September–Oktober tetap sama. Pengujian ini tidak menulis ke Firebase produksi atau memanggil model NVIDIA.
