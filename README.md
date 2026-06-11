# Aplikasi Tabungan (Local + Backend)

Instruksi singkat menjalankan dan menguji aplikasi lokal ini.

1) Install dependencies backend

```bash
cd "c:\Users\rendy\Documents\aplikasi tabungan 1"
npm install
```

2) Jalankan backend

```bash
npm start
```

Server berjalan pada `http://localhost:3000` dan akan membuat file `tabungan.db` di folder project.

3) Buka `index.html` di browser (klik dua kali atau `Open File` di browser).

4) Alur pengujian
- Buat akun via form `Daftar`.
  - Jika backend aktif, pendaftaran akan dibuat di server; jika tidak, akan disimpan lokal.
- Masuk via `Masuk`.
  - Jika backend aktif, login akan diverifikasi di server dan transaksi server akan diambil ke local.
- Tambah beberapa transaksi, cek riwayat.
- Gunakan tombol `Export` untuk mengunduh file JSON, `Import` untuk memuat JSON, dan `Sinkronisasi` untuk mengirim transaksi ke server.
- Gunakan `Lihat Server` untuk melihat transaksi yang ada di server (popup baru).
- Aktifkan `AutoSync` untuk sinkronisasi berkala setiap 2 menit.

5) Endpoints backend (contoh)
- `POST /api/users` - Buat user `{ name, username, password }`
- `POST /api/login` - Login `{ username, password }`
- `POST /api/sync` - Sinkronisasi `{ username, transactions: [] }`
- `GET /api/export?username=...` - Export transaksi user

Jika mau saya bantu deploy atau menambahkan autentikasi yang lebih kuat (JWT) atau fitur lain, beri tahu saya.
