# Audit akhir SPENDLY — 15 Oktober 2026

## Perbaikan lanjutan: hasil scan di HP

Pada layar sampai 720 px, hasil scan sekarang menjadi kartu ringkas dengan nominal, merchant, tanggal, rekening, dan status pencocokan. Detail & edit membuka formulir yang sama dengan tabel desktop; tidak ada salinan input tersembunyi yang dapat menimpa edit. Keputusan transaksi mirip, pemilihan ulang setelah perubahan nominal, serta pemeriksaan sebelum simpan tetap berlaku. Ringkasan statement dan toolbar juga dipadatkan untuk HP.

Regresi mereproduksi tampilan lama sebelum perbaikan. Pengujian memeriksa lebar 320/390/600 px, tanpa overflow horizontal, perpindahan HP ke desktop, serta nominal hasil edit yang benar-benar tersimpan. Pemeriksaan kontras dark/light mencakup kartu tertutup dan detail terbuka; input diberi label aksesibel.

Verifikasi: 88 unit dan seluruh 23 skenario browser lulus. Setelah memperluas cakupan keputusan transaksi mirip ke HP, tiga skenario terfokus kembali lulus (kartu/edit, pencocokan desktop, pencocokan HP). Screenshot hasil terisi diperiksa pada kedua tema.

## Perbaikan lanjutan: dark mode hasil scan

Laporan pengguna setelah deployment menemukan latar putih tetap pada ringkasan statement dan kolom sticky, termasuk baris transfer. Pemeriksaan halaman kosong sebelumnya belum mencakup keadaan hasil scan terisi. Warna komponen tersebut kini mengikuti token tema; status informasional, badge bank, dan tombol AI juga menyesuaikan. URL CSS diberi versi baru untuk mengambil pembaruan setelah deployment.

Regresi mereproduksi kegagalan kontras sebelum perbaikan, lalu lulus setelahnya pada PDF sintetis dengan hasil normal dan transfer: dark/light × 1440/390 px × dua posisi horizontal tabel. Tiga skenario terkait layout/impor dan 88 unit tetap lulus. Data dan logika transaksi tidak diubah oleh perbaikan visual ini.

Audit ini berfokus pada konsistensi jurnal, saldo, impor, kartu kredit, gaji, budget, dan pengalaman desktop/HP. Perubahan berada di folder lokal SPENDLY; data produksi tidak dimigrasikan atau ditimpa.

## Koreksi logika

| Area | Hasil perbaikan |
| --- | --- |
| Presisi uang | Nominal mutasi mempertahankan dua angka desimal; penjumlahan jurnal menggunakan satuan sen agar tidak timbul selisih pembulatan palsu. |
| Saldo awal | Tombol pada dompet mencatat aset/utang lawan ekuitas, bukan pemasukan. Satu saldo awal per akun; tanggal tidak boleh melewati transaksi pertama. Gunakan saldo sebelum riwayat yang diimpor. |
| Saldo aktual | Transaksi bertanggal masa depan belum memengaruhi saldo, laporan, budget, maupun kartu. Jadwal dan estimasi bunga tidak menciptakan uang. |
| Jurnal | Validasi tipe rekening, akun aktif, tenor, tanggal, nominal, dan keseimbangan. Jurnal rusak ditandai; neraca tidak lagi menyatakan seimbang hanya karena ekuitas dihitung sebagai selisih. Elemen jurnal rusak ditangani tanpa menimpa bukti asli. |
| Arus kas | Transfer antar rekening kas tidak menjadi pemasukan/pengeluaran. Pencairan investasi masuk arus investasi; belanja kartu bukan arus kas saat pembelian; pembayaran kartu tidak menjadi beban kedua. Saldo awal ditampilkan terpisah. |
| Kartu kredit | Tagihan lama belum lunas terbawa; pembayaran sebelum/sesudah cetak diperhitungkan; cicilan selesai berhenti ditagihkan; sisa pembagian cicilan mempertahankan sen. Tagihan resmi hanya berlaku untuk siklus dengan tanggal cetak yang cocok, termasuk tagihan nol. |
| Minimum kartu | Dihitung dari minimum saat cetak dikurangi pembayaran yang memenuhi kriteria, tidak dihitung ulang sebagai minimum baru setiap membayar sebagian. Refund mengurangi utang tetapi tidak otomatis dianggap pembayaran minimum. Angka tetap estimasi; e-Billing bank menjadi rujukan. |
| Impor | Tanggal dan jam tidak menjadi nominal. Baris gagal dikeluarkan per baris, tanpa membuang mutasi sah di dokumen yang sama. Kode kanal, nomor rekening pengirim, dan nama merchant tidak dianggap referensi transaksi unik. |
| Duplikat | Referensi/provenance kuat dipakai secara konservatif. Referensi sama tetapi tanggal/nominal berbeda meminta review. Transfer berpasangan dari bank berbeda meminta review; rekening/bank berbeda tidak otomatis digabung. Identitas referensi juga mencakup bank agar tidak bertabrakan saat penyimpanan. |
| Gaji/rutin | Konfirmasi per periode tetap idempoten. Menghapus transaksi terkait membuka hanya periode yang sesuai, termasuk aturan lama. Tujuan investasi/pembayaran kartu divalidasi sebelum aturan disimpan. |
| Budget | Pengeluaran tanpa alokasi tetap ditandai melampaui budget. Pos kategori tumpang tindih dan persentase total di atas 100% ditolak untuk pos baru. Rencana lama yang tumpang tindih diberi peringatan. Respons muat bulan lama tidak menggantikan bulan yang baru dipilih. Kegagalan penyimpanan tidak mengubah rencana di UI seolah berhasil. |
| Biaya bank | Top-up untuk saldo rata-rata memperhitungkan hari ini. Minimum Mandiri ditampilkan sebagai acuan saldo saat ini karena sumber tarif tidak menetapkan metode penilaian akhir bulan. Estimasi biaya tidak diposting otomatis. |

## Penyederhanaan dan UI

- Menghapus input bunga bulanan kartu yang sebelumnya tidak digunakan dalam perhitungan, agar tidak memberi kesan bunga otomatis sudah dihitung. Bunga/biaya aktual perlu dicatat dari mutasi atau e-Billing.
- Panel pemeriksaan dompet menandai jurnal rusak, transfer belum dipetakan, saldo aset negatif, tanggal masa depan, dan saldo awal lama yang dicatat sebagai pemasukan.
- Logo BCA, Mandiri, blu, dan Krom disimpan lokal; ikon tunai, investasi, transfer, dan kartu mengikuti jenis akun.
- Animasi masuk panel, perubahan progres, dialog, dan hover dibuat ringan serta mengikuti `prefers-reduced-motion`.
- Tabel laporan dapat difokuskan dengan keyboard; jarak kartu kredit dan navigasi HP diperiksa kembali.

## Verifikasi

Hasil pengujian akhir dicatat setelah semua perbaikan:

- `npm.cmd test`: **88/88** unit/regresi lulus.
- `backend_nvidia/.venv/Scripts/python.exe -m unittest discover -s tests -p test_backend.py -v`: **6/6** lulus.
- `node tools/ocr-smoke.mjs`: OCR Tesseract asli atas bukti sintetis lulus untuk nominal, tanggal, bank, dan kewajiban review.
- `npx.cmd playwright test`: **21/21** skenario browser lulus pada putaran final. Tes muat ulang menunggu status data siap sebelum memeriksa persistensi.
- `node tools/final-audit-qa.mjs`: **22/22** kombinasi halaman/ukuran layar, tanpa error runtime, overflow halaman, atau pelanggaran axe WCAG A/AA pada aturan yang diuji. Hasil: `artifacts/final-accessibility.json`; screenshot: `artifacts/previews/final-*.png`.
- Pemeriksaan sintaks **33 modul JavaScript**, impor relatif lokal, dan **185 ID HTML** lulus tanpa impor hilang atau ID ganda.

Cakupan browser meliputi saldo awal, logo lokal, kegagalan simpan, pergantian bulan, gaji/penautan mutasi, review scan, persetujuan AI, saran edit, privasi saldo, navigasi, mode terang/gelap, dan PWA pada prefiks repositori. Respons AI pada tes alur dibuat simulasi; bukan panggilan model live.

## Batas penggunaan dan data lama

- Login/Firebase produksi, dokumen asli bank pengguna, dan NVIDIA live belum diuji dalam audit lokal ini. Backend AI masih memerlukan konfigurasi/API key. Tidak ada sinkronisasi langsung rekening bank.
- Mode `?demo=1` memakai data contoh di browser; akun normal tetap memakai namespace Firebase yang sudah ada. Audit tidak menghapus data lama.
- Data historis yang sudah dibulatkan tidak dapat dipulihkan otomatis. Bila impor ulang berbeda nominal/tanggal tetapi referensinya sama, lakukan review; jangan menyimpan dua kali untuk memperbaiki satu transaksi.
- Saldo baru cocok dengan bank jika saldo awal dan seluruh mutasi relevan sudah lengkap. Panel peringatan membantu menemukan kekurangan, bukan menggantikan rekonsiliasi dengan rekening koran.
- Investasi memakai nilai tercatat, bukan harga pasar live. Goals manual dan proyeksi bunga tidak menambah saldo. Tagihan kartu, bunga, pajak, serta penalti aktual tetap mengikuti bank.
- Belanja kartu menjadi pengeluaran saat pembelian. Cicilan mengatur jadwal pembayaran pokok; pembayaran kartu bukan pengeluaran kedua. Atur tanggal cetak sesuai kartu agar rekonsiliasi resmi masuk ke siklus yang benar.
- PWA dapat dipasang setelah hosting HTTPS; paket frontend bukan APK/native app dan mode offline saat ini menampilkan layar offline yang jelas.

## Sumber tarif dan logo

Tarif acuan diperiksa 15 Oktober 2026 dan dapat diubah pada pengaturan produk. Tidak ada penarikan tarif otomatis.

- [BCA Tahapan Xpresi](https://www.bca.co.id/id/Individu/produk/simpanan/Tahapan-Xpresi)
- [Tarif Bank Mandiri](https://www.bankmandiri.co.id/web/guest/tarif-layanan)
- [Biaya administrasi Mandiri 2026](https://www.bankmandiri.co.id/biaya-administrasi-tabungan-2026)
- [Biaya dan bunga blu](https://blubybcadigital.id/info/fees-rates)
- [FAQ Krom](https://krom.id/faq/)

Logo milik masing-masing pemilik merek, digunakan untuk identifikasi rekening tanpa menyatakan afiliasi. Aset Mandiri, blu, dan Krom berasal dari situs resmi masing-masing. SVG BCA menggunakan representasi logo dari [SVG Repo](https://www.svgrepo.com/svg/303676/bca-bank-central-asia-logo); viewport dirapikan tanpa mengubah bentuk/warna logo. Sumber file:

- Mandiri: `https://www.bankmandiri.co.id/image/layout_set_logo?img_id=31567`
- blu: `https://blubybcadigital.id/_nuxt/img/logo-color.83f8c3a.png`
- Krom: `https://krom.id/wp-content/uploads/2022/08/ic_krom_logo.png`
- BCA: `https://www.svgrepo.com/show/303676/bca-bank-central-asia-logo.svg`
