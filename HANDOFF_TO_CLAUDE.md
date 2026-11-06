# 7Server Project Handoff Documentation

> **Target Agent**: Claude / Pair Programmer  
> **Repository**: `7server`  
> **Current Branch**: `feature/deployment`  
> **Date**: 6 November 2026  
> **Status**: Verified, TypeScript 0 Errors, 24/24 Test Suites Passed, Production Build Green.

---

## 1. Executive Summary & Context

`7server` adalah platform manajemen VPS mandiri (self-hosted multi-VPS fleet management platform) yang modern, cepat, dan ringan. Platform ini mengontrol server Linux remote melalui SSH non-interaktif dan API streaming.

Dalam sesi terkini pada branch `feature/deployment`, telah diselesaikan serangkaian fitur inti, bugfix arsitektur, dan peningkatan UX:
1. **Deployment Integration & Git System**: Integrasi GitHub PAT global, inspeksi repository otomatis, auto-framework detection, serta wizard 3-langkah deployment web application.
2. **Background Task Manager (Persistence across navigation)**: Eksekusi streaming jangka panjang yang tetap berjalan saat user berpindah tab/halaman, dilengkapi floating widget dan slide-out drawer.
3. **Sudo Password Interception & Non-Root SSH**: Penanganan otomatis privilege escalation saat SSH user bukan root, dengan modal password dan opsi enkripsi simpanan (AES-256-GCM).
4. **3D Server Rack & Telemetry Console**: Fitur Zoom in/out, pan, reset view, Blade Units Quick Switcher, dan chassis hardware console.
5. **Multi-Task & Batch Software Installer**: Instalasi multi-komponen secara pipeline berurutan di background dengan proteksi APT/DPKG file lock guard.
6. **1-Click Software Uninstaller**: Fitur pencopotan bersih untuk seluruh 39 paket software dan runtime (menghentikan daemon, purge APT/binaries, dan autoremove).
7. **Universal Light Mode & Theme Fix**: Standardisasi penggunaan CSS variables (`bg-[var(--card)]`, `text-[var(--foreground)]`, dll.) mengatasi bug teks hitam di atas background hitam.

---

## 2. Architecture & Key Modules

```
7server/
├── client/                      # React 19 + TypeScript + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── app/                 # App Shell, Router, Sidebar, Navigation
│   │   ├── features/
│   │   │   ├── git/             # Git integration types & API client
│   │   │   ├── webapps/         # NewAppModal.tsx (3-Step Deployment Wizard)
│   │   │   ├── docker/          # DockerPanel, Compose Studio, Container Logs, Pull Image
│   │   │   ├── servers/         # SoftwareCard, ServerRack (3D), Telemetry, templates.ts
│   │   │   └── terminal/        # Web SSH Terminal (Xterm.js)
│   │   ├── shared/
│   │   │   ├── tasks/           # TaskContext.tsx, BackgroundTasksWidget.tsx
│   │   │   ├── i18n/            # English & Indonesian locale strings
│   │   │   └── ui/              # Button, Card, Badge, Modal, BrandIcon
│   │   └── index.css            # CSS Variables & Theme inverted-zinc definition
└── server/                      # Node.js + TypeScript Fastify/Express Core
    ├── src/
    │   ├── modules/
    │   │   ├── git/             # GitHub API service, token store, webhook router
    │   │   ├── software/        # Software inventory scan & script executor
    │   │   ├── docker/          # Docker socket CLI bridge & streaming logs
    │   │   └── system/          # SSH execution, sudo management, system telemetry
    │   └── http/handlers.ts     # Global request handlers
```

---

## 3. Features Implemented in Detail

### A. Deployment & Git Integration
- **Halaman Integrasi**: `client/src/pages/IntegrationsPage.tsx` (`#/settings/integrations`).
  - Menghubungkan akun GitHub menggunakan **Personal Access Token (PAT)** dengan scope `repo, read:user, admin:repo_hook`.
  - Token disimpan terenkripsi dan berlaku global untuk seluruh armada VPS.
  - UI menampilkan avatar profil, scopes, tanggal koneksi, dan tombol diskoneksi.
- **Wizard Deployment Web App**: `client/src/features/webapps/components/NewAppModal.tsx` (`/servers/:id/apps -> + New App`).
  - **Step 1 (Repo Picker)**: Menampilkan repositori GitHub (filter personal / organisasi) atau custom git URL, serta pemilihan branch.
  - **Auto-Detection Engine**: Menganalisis file di branch untuk mendeteksi framework:
    - `package.json` $\rightarrow$ Next.js SSR, Vite SPA, Node API
    - `composer.json` $\rightarrow$ Laravel (PHP-FPM + Nginx)
    - `Dockerfile` / `docker-compose.yml` $\rightarrow$ Docker Container
    - `requirements.txt` $\rightarrow$ Python / FastAPI / Gunicorn
    - `go.mod` $\rightarrow$ Go Binary
  - **Step 2 (Configuration)**: Port, root directory, build command, install command, dan Environment Variables editor (`.env`).
  - **Step 3 (Deployment Execution)**: Eksekusi clone via SSH, build, Nginx reverse proxy + SSL auto-config, dan daemonize via PM2 / systemd / Docker.
- **Backend Service**: `server/src/modules/git/githubService.ts` dan `server/src/modules/git/routes.ts`.

---

### B. Persistent Background Tasks & Sudo Auth
- **Context & Widget**: `client/src/shared/tasks/TaskContext.tsx` & `BackgroundTasksWidget.tsx`.
  - Semua operasi berat (Software install/uninstall, Docker pull, deployment) dibungkus dalam `runStreamTask()`.
  - Berpindah tab atau menutup modal **TIDAK** membatalkan proses; log streaming terus diterima di background.
  - Floating pill di pojok kanan bawah (`bottom-20 right-6`) menampilkan jumlah task aktif dan durasi.
  - Klik pill membuka slide-out drawer untuk inspeksi output terminal langsung.
  - Saat task selesai, software/docker inventory otomatis di-reload (`load(true)`).
- **Sudo Privilege Interception**: `client/src/features/servers/components/SudoPasswordModal.tsx`.
  - Regex mendeteksi kegagalan `sudo: a terminal is required`, `a password is required`, atau exit code 126.
  - Membuka modal sekali input untuk otentikasi tanpa memaksa user login ulang via root.
  - Password dapat disimpan terenkripsi dengan AES-256-GCM pada data server jika diinginkan user.

---

### C. 3D Server Rack & Telemetry Console
- **File**: `client/src/features/servers/components/views/rack/ServerRack.tsx` & `client/src/pages/FleetPage.tsx`.
- **Zoom & Panning**:
  - Zoom range 50% hingga 250% menggunakan mouse wheel atau floating toolbar (`ZoomIn`, `ZoomOut`, `Fit`).
  - Click-and-drag panning untuk navigasi rack server yang besar.
  - Double click background mereset zoom dan posisi rack ke center.
- **Enterprise Chassis Telemetry Sidebar**:
  - Panel samping (lebar 360px–400px) menampilkan unit chassis blade (1U-12U).
  - Telemetry real-time: CPU load averages [1m, 5m, 15m], RAM (used/total), Root Disk (used/total), Swap %, Docker count.
  - **Chassis Blade Units Navigator**: Daftar interaktif blade server dalam rack; klik salah satu blade otomatis memfokuskan dan menarik keluar (pull out) unit tersebut pada 3D canvas.

---

### D. Multi-Task Batch Install & Clean Uninstaller
- **File**: `client/src/features/servers/lib/templates.ts` & `client/src/features/servers/components/SoftwareCard.tsx`.
- **Multi-Task Batch Pipeline**:
  - Tombol **`Multi-Task Install`** di samping filter *All* mengubah card menjadi mode centang (checkbox).
  - User dapat memilih kombinasi beberapa software (e.g. PHP + Composer + Go + Rust).
  - Floating bar di bawah menjalankan satu pipeline bash sekuensial terpadu (`generateBatchToolsScript`).
  - Preflight script menyertakan lock wait loop (`while fuser /var/lib/dpkg/lock-frontend`) dan `DPkg::Lock::Timeout=300` agar tidak terjadi tabrakan APT lock.
- **1-Click Software Uninstaller**:
  - Tombol **`Trash2`** pada setiap card software yang berstatus ter-install.
  - Modal uninstaller memiliki tab switcher: `Reinstall / Configure` vs `Uninstall / Remove`.
  - Menyiapkan script uninstalasi lengkap (`generateUninstallScript`): menghentikan daemon systemd, membersihkan repositori & binary symlinks, dan melakukan autoremove.
  - Script bash tetap **editable** sebelum dijalankan secara live via SSH.
  - **Safety guard**: Untuk Python, hanya mencopot pip/venv/dev-headers dan TIDAK menghapus `python3` sistem Ubuntu.

---

### E. Light Mode & Semantic CSS Standardization
- **Penyebab Bug Sebelumnya**: Di `index.css`, kelas Tailwind `zinc-*` di-invert pada `.light` (misal `zinc-200` menjadi warna gelap). Jika dipadukan dengan background hardcoded hex `#09090b` / `#0d0d0f`, teks menjadi hitam di atas background hitam.
- **Solusi**:
  - Seluruh komponen (SoftwareCard, BackgroundTasksWidget, DockerPanel, PullImageModal, TemplatesTab, PortsTab, ContainerLogsModal, LogsModal) telah dimigrasikan ke semantic CSS tokens:
    - `bg-[var(--card)]`
    - `bg-[var(--background)]`
    - `border-[var(--border)]`
    - `text-[var(--foreground)]`
    - `text-[var(--muted-foreground)]`
  - Kontras badge dan banner warning diadaptasi (`text-red-600 dark:text-red-400`, dll.).
  - Di Light Mode, semua tampilan console/code editor bersih dengan latar terang dan teks gelap berkejelasan tinggi; di Dark Mode tetap bergaya dark terminal modern.

---

## 4. Verification & Testing Status

Seluruh perintah pengujian telah dijalankan dan terverifikasi bersih tanpa error:

```bash
# 1. Typecheck Client
cd client && npx tsc --noEmit
# Result: Exit 0 (0 errors)

# 2. Typecheck Server
cd server && npx tsc --noEmit
# Result: Exit 0 (0 errors)

# 3. Unit & Integration Test Suites
npm test
# Result: 24/24 suites passed
# - server/src/contract.test.ts
# - server/src/databases/databases.test.ts
# - server/src/modules/git/git.test.ts
# - client/src/features/servers/lib/templates.test.ts
# - dll.

# 4. Production NPM Pack & Bundle
npm run build:npm
# Result: Vite client built in ~650ms, server bundled in ~80ms.
```

---

## 5. Modified Files Reference

| File | Deskripsi Perubahan |
|---|---|
| `client/src/features/servers/components/SoftwareCard.tsx` | Mode Batch Install, Uninstaller tab & action, light/dark mode semantic tokens, sudo handling |
| `client/src/features/servers/lib/templates.ts` | APT lock guard retry loop, batch pipeline generator, 39 scripts uninstaller generator |
| `client/src/features/servers/lib/templates.test.ts` | Unit test uninstaller script generator |
| `client/src/shared/tasks/BackgroundTasksWidget.tsx` | UI drawer & pill background tasks, adaptasi tema Light/Dark Mode |
| `client/src/features/servers/components/views/rack/ServerRack.tsx` | Zoom in/out, pan, reset, rack chassis controls |
| `client/src/pages/FleetPage.tsx` | Redesain telemetry hardware console & Blade Units Navigator |
| `client/src/features/docker/components/DockerPanel.tsx` | Semantic tokens untuk modal installer dan script inspector |
| `client/src/features/docker/components/PullImageModal.tsx` | Semantic tokens untuk console streaming pull image |
| `client/src/features/docker/components/ContainerLogsModal.tsx` | Semantic tokens untuk live container logs |
| `client/src/pages/server/TemplatesTab.tsx` | Semantic tokens untuk script editor dan execution logs |
| `client/src/pages/server/PortsTab.tsx` | Semantic tokens untuk raw ports output |
| `client/src/features/logs/components/LogsModal.tsx` | Semantic tokens untuk system logs modal |

---

## 6. Recommended Next Steps for Claude

Jika Anda ingin melanjutkan pengembangan pada branch ini:
1. **Uji Coba Deployment Webhook**: Menambahkan instruksi public webhook URL (misal via Cloudflare Tunnel atau domain publik) agar saat user push git ke GitHub, endpoint `/api/git/webhooks/:token` langsung mentrigger deploy otomatis.
2. **Ekspansi Provider Git**: Menambahkan implementasi GitLab dan Bitbucket pada `server/src/modules/git/` (saat ini card-nya masih berstatus *Coming Soon* di UI).
3. **Commit & Push**: Kode saat ini berada dalam kondisi *unstaged changes* yang bersih dan siap di-commit ke branch `feature/deployment`.
