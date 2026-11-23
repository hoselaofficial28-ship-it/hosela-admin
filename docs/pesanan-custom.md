# Pesanan custom di Input Resi

Owner membuat permintaan melalui tab Pesanan Custom di Input Resi. Isi toko, nomor
pesanan/username pembeli, target kirim dan catatan. Satu gambar JPG/PNG/WebP opsional
diperkecil menjadi JPEG di perangkat sebelum disimpan bersama data.

Admin wajib mengakui setiap permintaan aktif sebelum angka resi dapat diisi.
Membaca dicatat per pengguna, versi permintaan, dan hari kalender WIB. Pengingat
muncul kembali jika ada permintaan baru, versi berubah atau hari berganti. Pesanan
yang lewat target kirim tetap aktif. Halaman memeriksa pembaruan setiap 30 detik
dan saat jendela aktif kembali; API penyimpanan resi juga memeriksa permintaan
belum dibaca. Setelah membaca, pencatatan semua toko dapat dilanjutkan tanpa
menunggu pengerjaan custom selesai.

Konfirmasi sudah disiapkan membutuhkan centang dan pengakuan membaca hari ini.
Ada kendala wajib disertai alasan dan tidak menutup pengingat. Riwayat menyimpan
nama pelaksana, waktu, catatan serta salinan gambar/permintaan saat aktivitas.
Perubahan oleh owner menaikkan versi, membuka ulang pesanan, dan mempertahankan
semua riwayat. Tidak tersedia penghapusan catatan agar bukti tetap tersimpan.
Tab selesai menampilkan 100 pesanan terakhir; riwayat lain tetap tersimpan di DB.

## Aktivasi setelah persetujuan owner

Migrasi belum dijalankan oleh pengujian. Fitur custom aktif setelah migrasi pada
database tujuan disetujui dan berhasil. Migrasi hanya membuat dua tabel dan dua
indeks baru, tanpa mengubah tabel operasional. Dapat dijalankan ulang.

1. Pastikan konfigurasi database lingkungan tujuan sudah benar dan tersedia cadangan.
2. Jalankan `node scripts/migrate-custom-orders.mjs` untuk melihat petunjuk tanpa perubahan.
3. Setelah disetujui jalankan `node scripts/migrate-custom-orders.mjs --apply`.
4. Script memilih PostgreSQL jika variabel koneksinya tersedia, atau SQLite lokal.
   Untuk PostgreSQL produksi gunakan lingkungan produksi yang benar, termasuk
   `NODE_ENV=production` bila koneksi server membutuhkan SSL.
5. Rilis kode. Login sebagai owner, buat satu permintaan uji, login sebagai admin,
   verifikasi tembok membaca, lalu konfirmasi penyelesaian dan periksa riwayat.

Tanpa tabel custom, halaman menampilkan pemberitahuan belum diaktifkan dan
pencatatan resi biasa tetap tersedia. Jika tabel sudah tersedia tetapi koneksi
atau pemeriksaan pengingat gagal, input tetap ditahan agar pengingat tidak
dilewati. Kondisi belum migrasi dibedakan dari gangguan koneksi database.

## Pemeriksaan lokal

`node scripts/test-custom-orders.mjs` memakai SQLite **di memori**. Tidak membuka
hosela.db dan tidak membaca koneksi produksi. Lanjutkan dengan `npm run lint`
dan `npm run build`. Uji integrasi PostgreSQL dan browser produksi tetap perlu
dilakukan saat aktivasi.

## Berkas implementasi

| Berkas | Perubahan |
| --- | --- |
| `src/app/(dashboard)/input/page.tsx` | Tab custom, jumlah aktif, penguncian kolom angka, pesan penolakan penyimpanan. |
| `src/components/CustomOrders.tsx` | Tembok membaca, pengingat saat scroll, formulir gambar/catatan, konfirmasi dan riwayat. |
| `src/app/api/custom-orders/route.ts` | Akses login, izin membuat/mengubah untuk owner, aksi admin dan pembacaan riwayat. |
| `src/app/api/shipments/route.ts` | Tolak penyimpanan resi saat ada permintaan belum dibaca. |
| `src/lib/custom-orders.ts` | Penyimpanan SQLite/PostgreSQL, transaksi dan arsip salinan permintaan. |
| `src/lib/custom-order-types.ts` | Validasi data, tipe data dan hari operasional WIB. |
| `migrations/20261121-custom-orders.sql` | Dua tabel dan dua indeks baru, tanpa mengubah tabel lama. |
| `scripts/migrate-custom-orders.mjs` | Aktivasi eksplisit menggunakan `--apply`. |
| `scripts/test-custom-orders.mjs` | 17 pengujian logika dan API menggunakan SQLite di memori. |
| `scripts/test-db-initialization.mjs` | Dua pengujian pembukaan database lama dan pemulihan setelah gagal inisialisasi. |

Pemeriksaan implementasi: 17 pengujian custom dan dua pengujian database lolos, lint semua berkas fitur lolos,
build Next.js lolos. Lint global masih melaporkan 18 error di berkas lama:
empat script migrasi/pemulihan CommonJS, Dashboard, Lab Riset dan Rapat.
Bagian tersebut belum diubah dalam pekerjaan ini. Pengujian browser PC/HP
dan koneksi PostgreSQL nyata belum dilakukan.

## Aktivasi lokal 23 November 2026

Owner telah menyetujui penambahan tabel. Cadangan SQLite dibuat melalui backup
API sebelum menjalankan `node scripts/migrate-custom-orders.mjs --apply`.
Migrasi SQLite berhasil; pemeriksaan hanya-baca menemukan dua tabel custom
dengan nol baris serta kedua indeks baru. Tidak ada pesanan uji yang dimasukkan
ke database operasional. Folder backups diabaikan Git dan unggahan Vercel;
file environment juga dikecualikan dari unggahan Vercel.

Aktivasi produksi belum dilakukan. Konfigurasi lokal tidak berisi koneksi
PostgreSQL. Pengambilan environment produksi Vercel ditolak peninjauan
persetujuan otomatis karena akan menyalin seluruh rahasia produksi ke lokal,
sehingga perlu persetujuan khusus sebelum tindakan itu dilanjutkan. Kode dapat
dirilis sebelum aktivasi: bila tabel custom belum ada, pemberitahuan ditampilkan
dan input resi biasa tetap tersedia. Localhost belum tersambung ke database live.
