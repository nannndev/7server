# AI SRE Copilot

7Server **AI SRE Copilot** adalah asisten pemecahan masalah operasional server berbasis agen cerdas (*agentic AI*) yang dirancang khusus untuk operasional Linux VPS dan siklus penerapan (*deployment*) aplikasi.

Bukan sekadar memberikan jawaban teks umum, Copilot **memeriksa kondisi nyata server Anda secara langsung melalui koneksi SSH sebelum merespons**, memberikan analisa akar masalah yang akurat serta langkah perbaikan yang dapat dieksekusi.

---

## Alur Kerja Diagnosa Mandiri (Agent Mode)

Ketika Anda menanyakan masalah seperti *"Mengapa aplikasi menghasilkan error 502?"* atau ketika terjadi kegagalan proses deploy, Copilot menjalankan siklus diagnosa mandiri:

1. **Perencanaan Diagnosa**: Copilot merumuskan serangkaian perintah inspeksi yang dibutuhkan.
2. **Inspeksi Read-Only Otomatis**: Menjalankan perintah non-destruktif over SSH tanpa meminta konfirmasi klik:
   - `docker ps --filter "status=restarting"`
   - `docker logs --tail 50 <nama-kontainer>`
   - `ss -tulpn`
   - `journalctl -u nginx --no-pager -n 30`
3. **Analisa Akar Masalah**: Mengkaji keluaran terminal dan log server untuk mengidentifikasi penyebab utama (misalnya port bentrok, file mount tidak ditemukan, atau variabel env yang belum terisi).
4. **Pemberian Solusi & Konfirmasi**: Jika tindakan perbaikan memerlukan perubahan kondisi sistem (seperti restart kontainer, pembuatan compose override, atau perubahan port), Copilot **wajib meminta persetujuan klik (*Approve & Run*)** sebelum menjalankannya.

---

## Integrasi Langsung dengan Deployment

7Server menghubungkan AI SRE Copilot secara langsung ke dalam alur deployment aplikasi Git dan Monorepo:

### 1. Pre-Flight Architecture Review (`✨ AI Pre-Flight Review`)

Tersedia langsung di modal konfigurasi Git Deployment:
- Sebelum menekan tombol deploy, Anda dapat menekan **✨ AI Pre-Flight Review**.
- Blueprint deployment (framework terdeteksi, perintah build/start, alokasi port, dan struktur monorepo) dikirimkan ke Copilot untuk dianalisa.
- Copilot memberikan saran optimasi, memeriksa dependensi port, serta mengingatkan jika terdapat variabel lingkungan krusial yang belum dikonfigurasi.

### 2. Diagnosa Kegagalan Deploy Otomatis (`✨ Fix with AI Copilot`)

Jika terjadi kegagalan pada tahapan deployment (misalnya proses build gagal, kontainer crash loop, atau port tidak merespons health check):

- 7Server menampilkan banner kegagalan interaktif dan memicu tombol **✨ Fix with AI Copilot**.
- Seluruh konteks kegagalan (nama aplikasi, server tujuan, tahapan yang gagal, port internal, dan 35 baris log terminal terakhir) otomatis dioper ke Copilot Drawer via event `7server-copilot-ask`.
- Copilot langsung melakukan inspeksi status kontainer dan socket port secara mandiri di server, lalu menyajikan rekomendasi perintah perbaikan satu-klik untuk Anda setujui.

---

## Built-in DevOps Engineer Skill & Custom Skills (`SKILL.md`)

AI SRE Copilot di 7Server dibekali *skill* standar produksi serta mendukung penambahan *custom skill* Anda sendiri:

### 1. Skill Bawaan `devops-engineer` & Playbook Kontekstual
- **Baseline `devops-engineer`**: Aktif secara default menggunakan metodologi **Build / Deploy / Ops Hats** dan alur kerja 7 langkah (*Observe → Correlate → Root Cause → Minimal Fix → Verify → Harden*) untuk diagnosa systemd, Docker, Nginx, TLS, dan Linux kernel.
- **Playbook Spesialis Otomatis**: Menyuntikkan panduan spesifik sesuai tab dashboard yang sedang dibuka atau topik pertanyaan Anda—mencakup **Web Apps & PM2**, **Docker & Compose**, **Nginx & Reverse Proxy**, **SSL & Certbot**, **Firewall & SSH Hardening**, **Database (Postgres/MySQL/Redis/Mongo)**, **Performance Triage**, hingga **Disk Cleanup**.

### 2. Custom Skills (`SKILL.md`) di Pengaturan Agen
Buka **Copilot Drawer → Pengaturan Agen (⚙️) → Custom Skills (`SKILL.md`)** untuk menambahkan playbook kustom atau mengimpor file `SKILL.md` dari repositori komunitas (seperti `skills.sh` atau `claude-skills`):
- **Tempel Langsung `SKILL.md`**: Tempel isi file markdown lengkap dengan YAML frontmatter (`name`, `triggers`)—7Server otomatis mengekstrak nama, kata kunci pemicu, dan isi instruksinya.
- **Trigger Kata Kunci atau Selalu Aktif**: Isi kata kunci pemicu (misalnya `k8s, kubectl, helm, pod`) agar skill hanya dimuat saat relevan, atau kosongkan agar selalu aktif di setiap percakapan.

---

## Kompresi Konteks (`/compact`) & Slash Commands

Sesi *troubleshooting* panjang dengan banyak output terminal SSH dapat menghabiskan kuota token konteks model AI dengan cepat. 7Server menyediakan fitur **Context Compaction** dua lapis:

- **Perintah `/compact` & Tombol Compact Cepat**: Ketik `/compact` di kolom chat (atau klik tombol **Compact** yang muncul saat percakapan mencapai 6+ pesan) untuk merangkum riwayat pesan lama dan output SSH menjadi kartu ringkasan **Context Compacted** tanpa menghilangkan pesan-pesan terbaru.
- **Auto-Compact di Sisi Server**: Sebelum mengirim riwayat percakapan ke provider AI, backend 7Server secara otomatis memangkas blok output terminal lama (`UNTRUSTED_OUTPUT`) dan merangkum percakapan terdahulu apabila ukuran konteks melewati batas aman.
- **Slash Commands Bawaan**: Ketik `/` di kolom chat Copilot untuk memilih perintah cepat:
  - `/compact` — Ringkas pesan & output SSH lama untuk menghemat token konteks
  - `/diagnose` — Cek kesehatan server menyeluruh (CPU, RAM, disk, load, service gagal)
  - `/docker` — Periksa status kontainer, crash loop, dan penggunaan resource
  - `/logs` — Analisa log error systemd & aplikasi terbaru
  - `/nginx` — Audit konfigurasi Nginx, error 502/504, dan vhost aktif
  - `/ssl` — Cek masa berlaku sertifikat TLS dan timer Certbot
  - `/ports` — Tampilkan daftar port TCP/UDP yang sedang terbuka beserta prosesnya
  - `/disk` — Cari folder terbesar, volume Docker, dan tumpukan file log
  - `/security` — Audit percobaan login SSH, aturan firewall, dan port terbuka

---

## Batasan Keamanan & Pertahanan Injeksi

1. **Daftar Perintah Read-Only yang Aman**: Perintah diagnosa seperti `docker ps`, `docker logs`, `ss`, `df`, `free`, dan `journalctl` berjalan tanpa jeda konfirmasi.
2. **Karantina Data Tidak Terpercaya**: Output log dari server dikarantina dengan pembatas khusus (*sentinel tags*) agar terhindar dari serangan manipulasi prompt (*prompt injection*).
3. **Persetujuan Wajib untuk Perubahan Sistem**: Setiap aksi modifikasi disk, penghapusan kontainer, restart database, atau pengubahan konfigurasi firewall **wajib disetujui pengguna secara eksplisit**.
4. **Batas Langkah Diagnosa**: Copilot dibatasi maksimal 8 langkah diagnosa mandiri per permintaan untuk mencegah perulangan tak terbatas.
