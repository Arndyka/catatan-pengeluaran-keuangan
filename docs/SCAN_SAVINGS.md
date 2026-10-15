# Scan dan tabungan — 15 Oktober 2026

## Data

`?demo=1` memakai contoh data di localStorage browser. Mode normal tetap memakai proyek Firebase dan jalur `users/{uid}` sebelumnya. Login dengan akun yang sama untuk mengakses catatan lama. Tidak ada penghapusan atau penggantian transaksi lama. Pengaturan tabungan dan aturan bank berada di `users/{uid}/settings/planning`. Akun blu ditambahkan jika belum ada, tanpa mengubah saldo.

## Impor gambar dan PDF

Pilih file di Scan mutasi. Mode OCR lokal menggunakan PDF.js dan Tesseract di browser. Screenshot bukti transaksi memiliki parser tambahan untuk nominal tanpa tanda +/- dan tanggal lengkap. Hasil gambar harus diperiksa sebelum dicentang.

Mode AI Vision membaca screenshot dan halaman PDF yang gagal dibaca parser lokal. Pilih mode AI, buka Pengaturan AI, masukkan URL backend, dan centang persetujuan pengiriman gambar. File PDF asli serta password tetap di browser; gambar halaman yang diproses akan dikirim ke backend dan penyedia NVIDIA. Hasil AI yang tidak memiliki tanggal/nominal/arah valid tidak masuk kandidat. AI tidak langsung memposting jurnal.

Untuk menjalankan AI lokal: ikuti `backend_nvidia/README.md`, isi `NVIDIA_API_KEY` di file `.env` backend, lalu jalankan `backend_nvidia/START_AI.bat`. Isi URL `http://127.0.0.1:8000` pada aplikasi. Jangan memasukkan API key ke frontend. Akses dari HP memerlukan backend yang dapat dijangkau HP; localhost menunjuk ke perangkat yang sedang dipakai. Hosting publik memerlukan proteksi akses backend yang saat ini belum diimplementasikan.

Pencocokan lintas dokumen menggunakan tanggal, nominal, jenis, akun, referensi bank, dan hash file/baris. Duplikat kuat dilewati tanpa menghapus catatan lama. Kesamaan tanggal/nominal/akun tanpa bukti kuat wajib dipilih: transaksi sama (lewati) atau transaksi berbeda (simpan baru). Koreksi kategori dan deskripsi tidak membedakan transaksi dengan referensi bank sama. Transaksi dengan referensi berbeda tetap dapat disimpan walau tanggal/nominal sama. Keputusan ambigu harus dikonfirmasi lagi bila data berubah.

## Tabungan bersama

Buka Investasi → Tabungan bersama. Default menampilkan total saldo dompet Krom dari jurnal; bukan saldo yang ditarik langsung dari bank. Pilih rekening kantong yang sesuai melalui Atur tabungan jika tabungan bersama memakai akun terpisah. Tidak ada pembagian kontribusi atau akses bersama lintas akun pengguna.

Bunga Basic default 6% p.a. sebelum pajak. Estimasi harian = saldo × rate / 365; bulanan menggunakan jumlah hari kalender bulan saat ini; tahunan memakai 365 hari. Asumsi saldo tetap, tanpa bunga berbunga. Bunga aktual Krom dihitung dari saldo akhir harian dan dicairkan tanggal 28. Estimasi tidak diposting menjadi pemasukan. Tarif dapat diubah untuk produk lain/perubahan bunga.

## Pengingat rekening

Ada di Dompet. Tarif awal mengikuti pilihan pengguna:

| Produk | Admin rekening + kartu per bulan | Aturan saldo |
|---|---:|---|
| BCA Tahapan Xpresi | Rp10.000 | Saldo ditahan Rp10.000; tidak ada minimum rata-rata bulanan |
| Mandiri Tabungan Rupiah Gold Visa | Rp13.000 + Rp6.000 | Saldo minimum Rp100.000; potensi penalti Rp5.000 |
| bluAccount | Rp0 | Biaya di bawah saldo minimum Rp0 |
| Krom Basic | Rp0 | Tidak ada saldo mengendap |

Aturan bisa diperbarui per rekening. Opsi BCA Tahapan biasa memakai saldo rata-rata bulanan dan berbeda dari Xpresi. Perhitungan berasal dari jurnal (termasuk saldo awal bila tercatat); proyeksi bulan berjalan mengasumsikan saldo terakhir tidak berubah. Biaya transaksi, dormant, dan perubahan tarif tidak dimodelkan. Tidak ada pemotongan saldo otomatis.

Sumber resmi diperiksa 15 Oktober 2026:
- https://krom.id/faq/
- https://www.bca.co.id/id/Individu/produk/simpanan/Tahapan-Xpresi
- https://www.bca.co.id/id/Individu/produk/simpanan/Tahapan
- https://www.bankmandiri.co.id/web/guest/tarif-layanan
- https://www.bankmandiri.co.id/biaya-administrasi-tabungan-2026
- https://blubybcadigital.id/info/fees-rates/

## Validasi

Hasil akhir: 25 unit tests Node, 12 skenario Playwright, 5 backend tests Python lulus. Tiga skenario impor/PWA diulang setelah koreksi terakhir dan lulus. Tesseract sungguhan berhasil membaca struk sintetis (nominal, tanggal, pemetaan BCA, dan seleksi review). Enam audit WCAG A/AA otomatis pada kartu kredit, tabungan, dan dompet di desktop/HP tanpa pelanggaran; ini bukan sertifikasi aksesibilitas. 27 file JavaScript lolos pemeriksaan sintaks, 171 ID HTML unik, semua import lokal ditemukan. ZIP frontend berisi 35 file dan diverifikasi terhadap sumber.

Reviewer terpisah menemukan risiko jam OCR terbaca dari nominal serta perbedaan presisi jam yang melewatkan pencocokan. Keduanya diperbaiki dengan regression tests. API key backend diperiksa sebagai boolean konfigurasi saja dan belum tersedia; tidak ada panggilan model NVIDIA langsung atau pengiriman dokumen pengguna.

Unit tests mencakup bunga, aturan saldo, referensi lintas format, transaksi berbeda, timestamp OCR, validasi vision, dan identitas jurnal. Browser tests mencakup PDF asli yang dibuat sebagai fixture dan gambar dengan respons AI simulasi, keputusan ambigu, persistensi pengaturan, privasi, dan spacing kartu kredit desktop/HP. Respons model NVIDIA langsung, mutasi bank asli pengguna, dan login Firebase belum diuji. Screenshots dan audit otomatis tersedia di `artifacts/previews/followup-*` serta `artifacts/followup-accessibility.json`.
