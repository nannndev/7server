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

