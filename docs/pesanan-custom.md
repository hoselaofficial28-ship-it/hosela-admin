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
Foto pesanan selesai tersedia selama 7 × 24 jam dari waktu konfirmasi selesai.
Setelah batas itu, foto tidak dilayani lagi oleh API dan dihapus dari tabel
pesanan serta seluruh salinan gambar pada riwayat aktivitas. Catatan, nama
pelaksana, waktu, dan status tetap tersimpan. Foto pesanan aktif tidak dihapus.
Membuka ulang pesanan yang fotonya sudah kedaluwarsa memerlukan unggahan baru
jika masih membutuhkan gambar referensi.
Tab selesai menampilkan jumlah seluruh pesanan selesai. Riwayat dimuat 20
pesanan per halaman, diurutkan berdasarkan waktu penyelesaian terbaru; tombol
Muat lebih banyak membuka halaman berikutnya. Pencarian nomor pesanan, pembeli,
toko, atau catatan mencakup seluruh riwayat, termasuk yang lebih lama dari 100
pesanan terakhir.

Setelah owner membuat atau mengubah permintaan, popup untuk versi tersebut
ditunda selama owner masih berada di tab Pesanan Custom pada kunjungan itu.
Pindah tab, keluar dan masuk menu, memuat ulang halaman, atau berganti hari
mengaktifkan kewajiban membaca kembali. Penundaan tidak mencatat pengakuan
membaca dan tidak berlaku untuk admin lain. Tombol Tindak lanjuti juga membuka
pengingat membaca jika owner ingin langsung menyelesaikan pesanan tersebut.
Setelah mengakui membaca, pengguna langsung kembali ke dialog tindak lanjut
yang dipilih. Respons polling lama tidak boleh menimpa hasil tindakan terbaru;
polling berhenti sementara selama penyimpanan dan saat tab browser tidak aktif.

Foto dimuat terpisah melalui endpoint login `/api/custom-orders/photo`.
Daftar dan riwayat tidak mengirim foto base64 berulang. Riwayat pembacaan dan
konfirmasi baru hanya menyimpan referensi gambar ke versi permintaannya.
Formulir Ubah permintaan mengambil foto asli hanya ketika dibuka oleh owner.

## Pembersihan foto otomatis

Pembersihan berjalan otomatis ketika API pesanan custom digunakan, paling
sering sekali per menit per proses. Meski belum dibersihkan secara fisik,
endpoint foto langsung menolak foto yang melewati 7 hari. Tidak perlu migrasi
skema tambahan.

`vercel.json` juga menjadwalkan `/api/cron/custom-order-photos` setiap hari pada
00:00 UTC. Untuk berjalan tanpa pengguna membuka aplikasi, atur `CRON_SECRET`
di Vercel; endpoint menolak permintaan tanpa secret yang cocok. Aktivasi cron
produksi belum dapat diverifikasi karena akses Vercel belum tersedia. Ketika
cron aktif, penghapusan fisik dilakukan saat akses berikutnya atau jadwal harian
berikutnya; penutupan akses foto berlaku tepat di batas 7 hari.
Konfigurasi mengikuti [panduan resmi Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

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
| `scripts/test-custom-orders.mjs` | 22 pengujian logika dan API menggunakan SQLite di memori, termasuk retensi foto, otorisasi, dan ukuran payload. |
| `scripts/test-custom-orders-ui.mjs` | Simulasi handler komponen: simpan owner, tindak lanjut setelah membaca, respons jaringan lama, klik ganda, dan selesai. Tidak membuka browser atau database operasional. |
| `scripts/test-db-initialization.mjs` | Dua pengujian pembukaan database lama dan pemulihan setelah gagal inisialisasi. |

Pemeriksaan implementasi: 22 pengujian custom, empat skenario handler UI, dan dua pengujian database lolos, lint semua berkas fitur lolos,
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
