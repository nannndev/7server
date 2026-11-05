# ⚡ VPS Hub - Multi-VPS Management & Terminal Dashboard

Dashboard modern berbasis web untuk mengelola, memantau resource, mengeksekusi perintah serentak, serta mengontrol services & interactive web terminal untuk multiple VPS Linux.

---

## 🌟 Fitur Utama

1. **Multi-VPS Inventory Management**
   - Tambah, edit, dan hapus VPS dengan mudah.
   - Mendukung autentikasi **Password** dan **SSH Private Key** (dengan passphrase).
   - Fitur **Test Connection** langsung sebelum menyimpan server.
   - Tagging / grouping server (misal `#prod`, `#db`, `#docker`, `#sgp`).
   - Kredensial SSH disimpan aman terenkripsi dengan algoritma **AES-256-GCM**.

2. **Resource & Space Monitoring (Agentless)**
   - Monitor penggunaan **CPU**, **RAM (Memory)**, **Disk (Storage root)**, dan **Uptime**.
   - Menampilkan jumlah core CPU, Kernel version, serta distro OS.
   - **Agentless**: Tidak perlu install daemon atau agent berat di VPS target, semua metrics dibaca efisien melalui SSH.

3. **Interactive Web SSH Terminal (xterm.js)**
   - Terminal interaktif langsung di browser dengan full ANSI colors, cursor, shortcut, dan resize synchronization via WebSocket.
   - Mendukung command interaktif seperti `htop`, `top`, `vim`, `nano`.
   - Tombol shortcut cepat untuk diagnosa kilat (`df -h`, `free -m`, `docker ps`, `clear`, dll).

4. **Service, Process & Container Inspector**
   - **Running Processes (`ps aux`)**: Lihat proses yang menggunakan CPU/RAM tertinggi dengan fitur filter, pencarian, dan **Kill Process** langsung dari UI.
   - **Systemd Services (`systemctl`)**: Lihat status service aktif/failed dengan tombol kendali **Restart**, **Stop**, dan **Start**.
   - **Docker Containers (`docker ps`)**: Deteksi otomatis jika VPS memakai Docker, pantau status container dan lakukan restart/stop/start container.

5. **Batch Command Runner**
   - Jalankan perintah bash serentak ke beberapa atau seluruh VPS sekaligus.
   - Real-time live output log (stdout, stderr, exit code, durasi eksekusi dalam milidetik).

---

## 🚀 Cara Menjalankan

### Jalankan Keduanya (Backend & Frontend):
```bash
npm run dev
```

Dashboard akan otomatis aktif di:
- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **Backend API & WebSocket**: [http://localhost:5001](http://localhost:5001)

---

## 📦 npm (`npm install -g sevenserver`)

```bash
npm install -g sevenserver  # butuh Node.js 22.13+, perintahnya tetap `7server`
7server                     # http://127.0.0.1:5001, data di ~/.7server
7server --port 8080 --host 0.0.0.0 --data /srv/7server --no-open
```

Paketnya dibuat dari repo ini: `npm run build:npm` (server di-bundle esbuild jadi satu file + UI hasil build) lalu `cd packages/npm && npm publish`. Detail ada di [packages/npm/README.md](packages/npm/README.md).

## 🐳 Docker (VPS / server lokal)

Satu container berisi dashboard, API, dan AI Gateway di satu port. Data (`7server.db` + `secret.key`) ada di volume `7server-data`.

```bash
cp .env.docker.example .env      # opsional: DASHBOARD_PASSWORD
docker compose up -d
```

Buka `http://localhost:5001`. Saat pertama kali, buat akun admin langsung di browser. Kalau dibuka dari mesin lain, kamu akan diminta **kode setup 6 digit** yang tampil di `docker compose logs 7server`. Kalau `DASHBOARD_PASSWORD` diisi, admin (`admin`) langsung dibuat dengan password itu, tanpa langkah setup.

Lupa password: `docker compose exec 7server node --import tsx src/resetPassword.ts admin`.

- **Port sengaja hanya di `127.0.0.1`.** Untuk akses dari luar, pasang nginx/Caddy dengan HTTPS di depannya dan set `TRUST_PROXY` di `.env` (nginx di host yang sama: `172.16.0.0/12`).
- **AI Gateway:** di dalam container, alamat bridge Docker (`172.16/12`) tidak dianggap "dalam sistem", karena port yang di-publish bisa membuat pemanggil dari internet terlihat seperti bridge. Ubah lewat `AI_GATEWAY_TRUST_DOCKER_BRIDGE=1` hanya kalau semua yang di bridge memang tepercaya.
- **Update:** `git pull && docker compose up -d --build`. Data di volume tidak tersentuh.
- **Backup:** salin `7server.db` **dan** `secret.key` bersama-sama (tanpa `secret.key`, kredensial SSH di database tidak bisa dibuka):
  `docker run --rm -v 7server-data:/data -v "$PWD":/backup alpine tar czf /backup/7server-backup.tgz -C /data .`
- Image tidak berisi data atau rahasia apa pun (`.dockerignore`), berjalan sebagai user non-root, dengan healthcheck.
- Image siap pakai dari setiap rilis: `ghcr.io/nannndev/7server:latest` (atau `:0.1.1`, `:0.1`).

## 🔁 CI & rilis

- **CI** (`.github/workflows/ci.yml`): typecheck server + client, semua test (`npm test`), build paket npm, build landing, build image Docker — di setiap PR dan push ke `main`.
- **Rilis**: dari `main` yang bersih, `npm run release patch` (atau `minor`/`major`/`1.2.3`) → bump versi `packages/npm`, commit, tag `vX.Y.Z`. Lalu `git push origin main vX.Y.Z`. Workflow `release.yml` publish `sevenserver` ke npm (dengan provenance), push image multi-arch ke GHCR, dan membuat GitHub Release dengan catatan otomatis. Versi `-beta.N` masuk tag npm `next` dan ditandai prerelease.
- **Label**: daftar di `.github/labels.yml` (disinkronkan otomatis). PR diberi label dari file yang diubah (`area: …`) dan dari prefix judul (`feat:` → enhancement, `fix:` → bug, `feat!:` → breaking). Catatan rilis dikelompokkan per label (`.github/release.yml`).
- **Info update di CLI**: `7server` mengecek npm sekali sehari dan menampilkan versi baru + link catatan rilisnya.
- Secret yang perlu: `NPM_TOKEN` (Settings → Secrets → Actions).

## 📁 Struktur Direktori

```
VPS-YUBI/
├── start.js               # Script runner untuk menjalankan backend & frontend
├── package.json           # Root package script
├── server/                # Backend API & WebSocket Engine
│   ├── src/
│   │   ├── server.js          # REST API & WebSocket Server
│   │   ├── sshService.js      # SSH2 connection pool & terminal streaming
│   │   ├── metricsService.js  # Agentless metrics & systemd/process parser
│   │   ├── cryptoUtil.js      # AES-256 encryption untuk kredensial SSH
│   │   └── db.js              # JSON database dengan atomic write
│   └── data/                  # Tempat penyimpanan database & secret key
└── client/                # Modern React 19 + Tailwind CSS + xterm.js UI
    ├── src/
    │   ├── components/
    │   │   ├── ServerCard.jsx          # Card status & bar metrik CPU/RAM/Disk
    │   │   ├── TerminalModal.jsx       # Interactive Web SSH Terminal
    │   │   ├── ProcessServiceModal.jsx # Inspector proses, service & Docker
    │   │   ├── BatchCommandModal.jsx   # Batch command runner
    │   │   └── AddServerModal.jsx      # Form tambah/edit VPS + Test Connection
    │   ├── api.js                      # Centralized API service
    │   └── App.jsx                     # Dashboard layout & stats overview
    └── index.html
```

