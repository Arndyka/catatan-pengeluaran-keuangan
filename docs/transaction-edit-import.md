# Koreksi transaksi dan saldo awal impor

Riwayat transaksi menyediakan **Edit**. Koreksi mengganti catatan dengan ID yang sama, membangun ulang jurnal, dan menyimpan salinan awal serta referensi sumber. Formulir yang sudah tertinggal dari perubahan lain ditolak. Saldo awal tetap menjadi ekuitas awal, bukan pemasukan.

Tanggal dan rekening saldo awal tidak dipindahkan lewat editor. Catatan yang terhubung langsung dengan tagihan PayLater dan saldo arsip sistem hanya mengizinkan koreksi keterangan/kategori; angka terkait tagihan tetap dilindungi. Transaksi rutin harus tetap cocok dengan rekening, jenis, dan periode jadwalnya.

Di penyimpanan cloud, reservasi fingerprint koreksi berada pada `users/{uid}/settings/transaction-key-{fingerprint}`. Reservasi dan perubahan jurnal disimpan atomik. Fingerprint asli tetap berlaku agar bukti lama tidak terimpor ulang; penghapusan transaksi juga melepas reservasi koreksinya. Implementasi memakai hak akses privat user yang sama dengan settings/transaksi lainnya.

## Saldo awal e-statement

Sebelumnya ringkasan scanner membaca saldo awal tetapi hanya mutasi yang disimpan. **Sertakan saldo awal** kini ditampilkan dan dipilih untuk sumber yang memenuhi syarat:

- Rekening dan periode dikenali, ringkasan lengkap, dan rekonsiliasi sesuai sampai sen.
- Tidak ada saldo awal yang sudah tercatat atau riwayat yang mendahului periode sumber.
- Tidak ada penyesuaian saldo yang dapat menggandakan baseline.
- Dari beberapa statement untuk rekening yang sama, hanya yang paling awal digunakan.

Periksa rekening dan nominal pada ringkasan, lalu **Simpan Terpilih**. Saldo awal tidak menambah pemasukan bulan ini. Jika mutasi sudah pernah diimpor tetapi saldo awal belum ada, pindai ulang statement: mutasi duplikat dilewati, saldo awal dapat disimpan sendiri. Saldo awal nol tidak memerlukan jurnal baru. Pemilihan sebagian mutasi belum menjamin saldo akhir sama dengan seluruh statement.

Checkbox scanner dapat dipilih tanpa membuka detail, tetapi transaksi mirip tetap memerlukan keputusan sebelum disimpan. Duplikat pasti dan transfer dalam rekening yang sama tidak dipilih. Semua baris dipastikan valid sebelum penulisan dimulai; jika koneksi terputus di tengah penulisan, impor ulang melewati catatan yang sudah berhasil.

## Verifikasi

Jalankan server `npm start`, lalu:

```text
npm test
npx playwright test
npx playwright test --config playwright.mobile.config.mjs
```

Konfigurasi mobile menguji Chromium dan WebKit dengan emulasi sentuh, layar sempit/landscape, tema terang/gelap, editor, dan pemilihan scanner. Ini bukan pengujian pada perangkat Android/iPhone fisik. Data pengujian sintetis; tidak memerlukan login atau mutasi akun nyata.
