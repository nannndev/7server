# Panduan Mulai Cepat

Jalankan 7Server di komputer lokal atau server manajemen Anda dalam hitungan menit.

::: tip Prasyarat
- **Node.js 20+** atau **22+**
- **npm** atau **pnpm**
- Akses SSH (`user`, `host`, dan password atau private key) ke minimal satu VPS Linux.
:::

---

## 1. Kloning & Instalasi

Kloning repositori dan pasang dependensi backend dan frontend:

```bash
git clone https://github.com/nannndev/7server.git
cd 7server

# Pasang dependensi backend
cd server && npm install

# Pasang dependensi frontend
cd ../client && npm install
```

---

## 2. Menjalankan Aplikasi

Dari direktori utama repositori, jalankan:

```bash
npm run dev
# Atau jalankan seluruh modul (dashboard, landing, docs):
node start.js --all
```

Layanan yang aktif:
- **Backend API & SSH Engine**: `http://localhost:5001`
- **Dashboard Web**: `http://localhost:3000`
- **Dokumentasi**: `http://localhost:3002`

---

## 3. Login Awal & Password

Saat pertama kali dijalankan, 7Server membuat database SQLite (`server/data/7server.db`) dan menghasilkan password acak untuk akun admin:

```bash
# Lihat password awal admin Anda:
cat server/data/dashboard.password
```

Buka peramban ke [http://localhost:3000](http://localhost:3000):
- **Username**: `admin`
- **Password**: *(Karakter yang ada di `server/data/dashboard.password`)*

