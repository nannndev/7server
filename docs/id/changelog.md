# Catatan Rilis (Changelog)

Seluruh pembaruan penting pada **7Server** (`sevenserver` di npm dan `ghcr.io/nannndev/7server`) terdokumentasi di halaman ini.

---

## v0.3.0 — Universal AI Gateway 2.0, Rotasi Multi-Account, Custom `SKILL.md` & `/compact`

### Universal AI Gateway (27 Provider Bawaan)
- **8 Provider Langganan OAuth**: Menambahkan **Kimi Code** (`km/`), **Kilo Code** (`kc/`), **Muse / Koda CLI** (`ms/`), dan **Nous Portal** (`ns/`) melengkapi **Claude Pro/Max** (`cc/`), **ChatGPT / Codex** (`cx/`), **GitHub Copilot** (`gh/`), dan **Gemini CLI** (`gc/`).
- **19 Provider API-Key & OpenAI-Compatible**: Dukungan penuh untuk **Groq**, **Mistral**, **xAI Grok**, **Together AI**, **Fireworks**, **Cerebras**, **Perplexity**, **Moonshot Kimi**, **Alibaba Qwen (DashScope)**, **Z.ai GLM**, **MiniMax**, **NVIDIA NIM**, **Cohere**, **Nebius**, **SiliconFlow**, **Hyperbolic**, dan **DeepInfra** bersama **OpenAI**, **Anthropic**, **Google Gemini**, **OpenRouter**, dan **Ollama**.
- **Multi-Account & Rotasi Berurutan (`#1 → #2 → #3`)**:
  - Hubungkan banyak akun langganan OAuth atau beberapa API key sekaligus pada setiap provider (`+ Add Account` / `+ Add Another Key`).
  - Atur urutan prioritas akun kapan saja menggunakan tombol `↑` / `↓`.
  - Cooldown otomatis saat akun terkena rate-limit `429` dan rotasi instan ke akun berikutnya sebelum *failover* ke provider cadangan.
  - Indikator bar kuota real-time untuk masing-masing akun.

### AI SRE Copilot — Vibe-Coding di Server, Custom `SKILL.md` & `/compact`
- **Built-in `devops-engineer` Skill**: Dilengkapi metodologi *Build / Deploy / Ops Hats* dan alur kerja 7 langkah secara default.
- **Custom Skills (`SKILL.md`)**: Tempel langsung file `SKILL.md` (lengkap dengan YAML frontmatter `name` & `triggers`) atau buat playbook SRE kustom di **Copilot Drawer → Pengaturan Agen**.
- **Kompresi Konteks (`/compact` & Auto-Compaction)**:
  - Perintah `/compact` dan tombol cepat **Compact** untuk merangkum riwayat pesan lama menjadi kartu **Context Compacted**.
  - Kompresi otomatis di sisi backend (`compactCopilotHistory`) yang memangkas blok output terminal lama agar hemat token.
- **Dukungan Password Sudo, Survei Pre-Publish & Mode Auto-Run**:
  - Perintah `sudo` yang disetujui otomatis menggunakan password sudo server yang tersimpan.
  - Memeriksa port aktif, vhost Nginx, dan Cloudflare Tunnel sebelum mempublikasikan aplikasi di `/var/www`.
- **Maskot Cyber-SRE Animasi & Pin Server per Percakapan**:
  - Tombol melayang AI Copilot kini tampil hidup dengan karakter robot SRE (ekspresi mata berkedip/melirik saat `idle`, gelombang saat `thinking`, ticker perintah `>_` saat `executing`, peringatan `! !` saat butuh `approval`, dan `^ ^` saat `done`).
  - Percakapan Copilot otomatis terkunci (*pinned*) ke server awalnya meskipun Anda berpindah halaman server di dashboard, dilengkapi banner pindah cepat 1-klik dan badge nama server di History.

### UI, Branding & Infrastruktur
- Menambahkan SVG brand icon (`BrandIcon`) untuk seluruh 27 provider AI di Dashboard, Landing Page, dan Dokumentasi.
- Perbaikan deteksi multi-stage Dockerfile pada saat Git deployment.
- Peningkatan kontras favicon SVG di dark mode dan transparansi ikon brand.

---

## v0.2.0 — Cloudflare Tunnel, Studio Deploy Git, Visual 3D & Mode Privasi

- **Cloudflare Tunnel Zero-Trust**: Konektor token 1-klik dan peta visual rute ingress untuk membuka akses webapp lokal di balik NAT tanpa membuka port firewall publik.
- **Studio Deploy Git Layar Penuh**: Integrasi token GitHub, deteksi otomatis framework & subfolder monorepo, instalasi otomatis runtime yang belum tersedia, serta streaming log build secara live.
- **Otomatisasi SSL Let's Encrypt & Validasi DNS Pre-Flight**: Memeriksa kecocokan A-record DNS sebelum menjalankan Certbot.
- **Visualisasi Armada 3D**: Rak Server 3D interaktif, Matriks Resource Isometrik 3D, dan Grafik Topologi Layanan 4 Lapisan.
- **Database Workbench**: Jelajahi tabel, jalankan query, dan lihat diagram relasi (ER Diagram) untuk PostgreSQL, MySQL/MariaDB, MongoDB, Redis, dan SQLite.
- **Mode Privasi Screencast**: Sensor 1-klik di TopBar untuk menyamarkan IP server, domain, path aplikasi, port lokal, dan token saat presentasi atau live streaming.

---

## v0.1.1 — Rilis Perdana Open-Source

- **Arsitektur SSH Tanpa Agen (Agentless)**: Terhubung ke VPS Linux mana pun melalui OpenSSH standar (port 22) tanpa menginstal daemon di server target.
- ** Penyimpanan Lokal Terenkripsi**: Database SQLite (`7server.db`) dengan enkripsi AES-256-GCM (`secret.key`) untuk private key SSH, password, dan token.
- **Terminal Browser Multi-Tab & Manajer File SFTP**: Shell WebSocket `xterm.js` lengkap dengan pintasan perintah cepat dan editor file visual.
- **Manajemen Workload & Operasional**: Kontrol Docker container/image/Compose, layanan systemd & PM2, penjadwal Crontab visual, firewall UFW, dan backup terjadwal.
- **RBAC & Log Audit Keamanan**: Peran Admin, Operator, dan Viewer dengan pembatasan akses per VPS, pencabutan sesi aktif, notifikasi webhook Discord, dan ekspor Audit Log ke CSV.

