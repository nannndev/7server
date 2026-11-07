# RBAC, firewall terpusat, dan audit per user

Status: **rencana, belum dikerjakan** (diputuskan 5 Nov 2026: disimpan dulu, fitur lain jalan duluan).
Pasangan dokumen: [backend-architecture.md](backend-architecture.md), [frontend-architecture.md](frontend-architecture.md).

## 1. Kondisi sekarang (dicek dari kode)

| Fitur | Sekarang | Lokasi |
|---|---|---|
| Login | **Satu password bersama** (`DASHBOARD_PASSWORD` atau `server/data/dashboard.password`), rate limit 5x/menit per IP | `server/src/http/auth.ts` |
| Token | Satu token statis `HMAC(password, 'vps-hub-token')`: sama untuk semua orang, tidak kedaluwarsa, hanya bisa dicabut dengan ganti password | `server/src/http/auth.ts` |
| Peran | Tidak ada. Semua yang login = admin penuh | – |
| Audit log | Ada: setiap request non-GET dicatat (`t`, `ip`, `method`, `path`, `detail`, `status`). **Tidak ada siapa**-nya | `server/src/http/audit.ts`, `server/src/infra/audit.ts` |
| Firewall | Hanya **baca** `ufw status` di tab Ports. Tidak bisa ubah aturan | `server/src/modules/deployments/service.ts` |
| Endpoint | 59 route yang mengubah sesuatu, plus terminal WebSocket dan AI Copilot (bisa menjalankan perintah) | `server/src/modules/*/routes.ts` |

Masalah utamanya: tidak bisa memberi akses terbatas ke orang lain (mis. developer yang cuma boleh lihat log), tidak bisa mencabut akses satu orang, dan audit tidak menjawab "siapa".

## 2. RBAC (fondasi, dikerjakan pertama)

### 2.1 User dan sesi
- `server/data/users.json` (mode 0600): `{ id, username, passwordHash, role, servers?: string[] | '*', disabled?, createdAt, lastLoginAt? }`.
- Hash password: `crypto.scrypt` (bawaan Node, tanpa dependency baru) dengan salt per user, dibandingkan pakai `timingSafeEqual`.
- Sesi: token acak 32 byte; yang disimpan hanya **hash**-nya di `server/data/sessions.json` bersama `userId`, `expiresAt` (default 7 hari, diperpanjang saat dipakai), `ip`, `userAgent`. Logout dan "cabut sesi" = hapus barisnya.
- **Migrasi tanpa terkunci:** saat start, kalau `users.json` belum ada, buat user `admin` dengan password lama (`DASHBOARD_PASSWORD` / `dashboard.password`). Token statis lama berhenti berlaku; semua orang login ulang sekali.
- Rate limit login tetap per IP, ditambah per username.

### 2.2 Peran bawaan

| Izin | Admin | Operator (DevOps) | Viewer (Developer) |
|---|:-:|:-:|:-:|
| Lihat fleet, metrics, log, status, audit | ✓ | ✓ | ✓ |
| Restart/stop service, Docker, PM2, cron, deploy, backup | ✓ | ✓ | – |
| Terminal SSH, batch exec, file manager (tulis) | ✓ | ✓ | – |
| Database: query baca | ✓ | ✓ | ✓ (read-only) |
| Database: tulis / dump | ✓ | ✓ | – |
| AI Copilot agent (menjalankan perintah) | ✓ | ✓ | hanya chat, tanpa eksekusi |
| Tambah/ubah/hapus server, lihat kredensial | ✓ | – | – |
| AI Gateway (akun, key, combo), alert/webhook | ✓ | – | – |
| Kelola user dan sesi | ✓ | – | – |
| Firewall (bagian 3) | ✓ | opsional | – |

- Izin dinamai (mis. `server.read`, `service.control`, `terminal.open`, `db.write`, `gateway.manage`, `users.manage`), peran = kumpulan izin. Peran kustom bisa ditambah nanti tanpa mengubah route.
- **Batas per server:** `servers: ['vps-2']` membatasi user ke server tertentu; `'*'` untuk semua. Dicek di `withServer` sehingga berlaku ke semua route `/servers/:id/*`.

### 2.3 Penegakan (server, bukan hanya UI)
- `requireAuth` mengisi `req.user`. Middleware baru `need('service.control')` dipasang per route.
- Terminal WebSocket: cek sesi + `terminal.open` + batas server saat upgrade.
- AI Copilot: eksekusi perintah butuh `terminal.open`; Viewer hanya dapat jawaban teks.
- `contract.test.ts` ditambah matriks: tiap route × tiap peran → status yang diharapkan (200/403), supaya tidak ada route yang lupa dijaga.
- UI menyembunyikan tombol yang tidak diizinkan (`useCan('db.write')`), tapi itu hanya kenyamanan; server tetap sumber kebenaran.

### 2.4 Halaman Users (admin)
Tambah user, ubah peran dan batas server, nonaktifkan, reset password, lihat dan cabut sesi aktif. User bisa ganti password sendiri.

## 3. Firewall terpusat (setelah RBAC)
- Baca aturan UFW (`ufw status numbered`) dan iptables per server; tampilkan per server dan gabungan fleet.
- Aksi: buka/tutup port (tcp/udp, sumber IP opsional), aktif/nonaktif UFW, terapkan aturan yang sama ke banyak server.
- **Pengaman wajib** (sesuai aturan "jangan ganggu yang berjalan"):
  - Tidak bisa menutup atau me-deny port SSH yang sedang dipakai 7Server ke server itu, dan tidak bisa mengaktifkan UFW kalau aturan allow SSH belum ada.
  - Preview perubahan (diff aturan) dan konfirmasi sebelum diterapkan; dua kali konfirmasi untuk aksi ke banyak server.
  - Mode "auto-revert": aturan baru dibatalkan otomatis setelah N detik kalau 7Server kehilangan koneksi SSH ke server itu.
- Izin `firewall.manage` (Admin; Operator opsional).

## 4. Audit log per user
- Tambah `user` (username) dan `role` di setiap entri; sesi yang dipakai disimpan sebagai id pendek.
- Catat juga login berhasil/gagal, logout, pencabutan sesi, perubahan user/peran, dan pembukaan terminal (yang sekarang tidak tercatat karena WebSocket bukan request non-GET).
- Halaman Audit log: filter per user, per server, per aksi; ekspor CSV.

## 5. Urutan kerja
1. User + sesi + migrasi admin (tanpa peran dulu: semua user = admin) → login per user jalan, audit mencatat user.
2. Izin + peran + `need()` di semua route + matriks test.
3. Batas per server di `withServer` dan terminal.
4. Halaman Users dan penyesuaian UI (`useCan`).
5. Firewall terpusat dengan pengaman.

## 6. Risiko dan catatan
- Upgrade memaksa semua orang login ulang sekali (token statis lama mati). Itu disengaja.
- AI Gateway publik (`/api/ai/*`) tetap memakai virtual key, bukan sesi user; RBAC tidak mengubahnya.
- Jangan simpan token sesi mentah di disk; hanya hash.
- Saat dijadikan desktop (lihat rencana distribusi), mode lokal bisa auto-login sebagai admin; mode remote ke VPS tetap wajib login.
