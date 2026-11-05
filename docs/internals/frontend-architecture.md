# Arsitektur Frontend (client/)

Status: **selesai dimigrasi** (langkah 1–7 di bawah). Dokumen ini sekarang jadi acuan struktur. Tambahan di luar proposal awal:

- `shared/i18n/` untuk UI dua bahasa (EN/ID). Katalog di `en.ts` (sumber kunci) dan `id.ts` (diketik terhadap `en`, jadi kunci yang hilang = error compile). Pakai `useT()` / `useI18n()`; jangan tulis teks UI langsung di komponen baru.
- `pages/server/` berisi satu komponen per tab server; state lintas-tab lewat `pages/server/context.tsx`.
- Tiap fitur yang dipakai fitur lain punya `index.ts`; import antar-fitur hanya lewat situ.

## 1. Masalah sekarang

| File | Baris | Masalah |
|---|---|---|
| `src/components/ServerManagementView.tsx` | 1638 | Semua tab server (overview, webapps, pm2, services, nginx, ports, …) ada di satu file |
| `src/components/FileViewer.tsx` | 933 | Viewer markdown, editor, image, dll. jadi satu |
| `src/App.tsx` | 901 | Auth gate, ±20 `useState`, theme, command palette, polling, alert, settings, dan layout dicampur jadi satu |
| `src/api.ts` | 431 | Semua endpoint (servers, files, docker, db, monitoring) ditaruh di satu file |
| `src/components/` | 18 file flat | Komponen fitur, modal, visualizer, dan halaman tercampur di satu level |

Hampir semua komponen meng-import `api.ts` dan `types/index.ts`. Akibatnya, mengubah satu fitur berarti menyentuh file yang dipakai bersama semua fitur lain.

## 2. Prinsip

1. **Kelompokkan per fitur, bukan per jenis file.** Kode Docker (API, tipe, komponen, hook) tinggal di satu folder.
2. **Dependensi satu arah:** `app → pages → features → shared`. `shared` tidak boleh import dari `features`, dan satu fitur tidak boleh import isi internal fitur lain (hanya lewat `index.ts`-nya).
3. **Satu file, satu tanggung jawab.** Batas lunak ~300 baris; kalau lebih, pecah.
4. **Tanpa dependency baru di tahap ini.** Router hash di `lib/router.ts` dan cache di `lib/cache.ts` sudah cukup. (React Router / TanStack Query baru dipertimbangkan kalau memang butuh nested layout atau cache server-state yang kompleks.)

## 3. Struktur target

```
client/src/
├── main.tsx
├── index.css
├── app/                      # wiring level aplikasi
│   ├── App.tsx               # auth gate + layout shell (tipis)
│   ├── AppShell.tsx          # Sidebar + header + outlet halaman
│   ├── router.ts             # (dari lib/router.ts) + router.test.ts
│   └── CommandPalette.tsx
│
├── pages/                    # satu file per route, hanya komposisi
│   ├── FleetPage.tsx         # grid / rack / topology / matrix
│   ├── ServerPage.tsx        # memilih tab → komponen fitur
│   ├── MonitoringPage.tsx
│   └── LoginPage.tsx
│
├── features/
│   ├── auth/        api.ts  components/LoginForm.tsx
│   ├── servers/     api.ts  types.ts  hooks/useServers.ts  hooks/useMetricsPolling.ts
│   │                components/ServerCard.tsx  AddServerModal.tsx  Sparkline.tsx
│   │                components/views/RackView.tsx  TopologyVisualizer.tsx  CyberMatrixVisualizer.tsx
│   │                components/overview/OverviewTab.tsx
│   ├── processes/   api.ts  components/ProcessServiceModal.tsx  Pm2Tab.tsx  ServicesTab.tsx
│   ├── webapps/     api.ts  components/WebAppsTab.tsx  NginxTab.tsx  PortsTab.tsx
│   ├── docker/      api.ts  types.ts  components/DockerPanel.tsx (+ pecahan)
│   ├── databases/   api.ts  types.ts  components/DatabasePanel.tsx  db/*  (folder db/ sekarang)
│   ├── files/       api.ts  components/FileManagerModal.tsx
│   │                components/viewer/FileViewer.tsx  MarkdownViewer.tsx  TextEditor.tsx  ImageViewer.tsx
│   ├── terminal/    components/TerminalModal.tsx  BatchCommandModal.tsx  api.ts (batch)
│   ├── logs/        api.ts  components/LogsModal.tsx
│   └── monitoring/  api.ts  types.ts  components/AlertsTab.tsx  UptimeTab.tsx  AuditTab.tsx  SettingsModal.tsx
│
└── shared/                   # tidak tahu apa-apa soal fitur
    ├── api/client.ts         # API_BASE, getToken/setToken, apiFetch, unwrap, downloadBlob
    ├── ui/                   # (dari components/ui) button, card, badge, input, progress, skeleton
    ├── lib/                  # cn, cache, format helpers
    └── hooks/                # useTheme, useLocalStorage, useInterval (kalau dipakai >1 tempat)
```

Isi setiap folder fitur (ambil yang perlu saja, jangan bikin file kosong):

```
features/<nama>/
├── api.ts          # fungsi fetch untuk domain ini, pakai shared/api/client
├── types.ts        # tipe khusus domain ini
├── hooks/          # state + efek (polling, loading, error)
├── components/     # UI
└── index.ts        # public API fitur: hanya yang dipakai dari luar
```

## 4. Pemetaan file lama → baru

### `api.ts` (431 baris) dipecah per domain

| Baris sekarang | Isi | Tujuan |
|---|---|---|
| 1–48 | token, `apiFetch`, `unwrap`, `downloadBlob` | `shared/api/client.ts` |
| 49 | `login` | `features/auth/api.ts` |
| 56–64, 110–165 | servers CRUD, metrics, history, ping, import/export | `features/servers/api.ts` |
| 60 | `fetchLogs` | `features/logs/api.ts` |
| 66–101 | files | `features/files/api.ts` |
| 167–200, 221–231 | processes, services, pm2, supervisor | `features/processes/api.ts` |
| 214, 233–240 | webapps, nginx, ports | `features/webapps/api.ts` |
| 203, 305–352 | docker | `features/docker/api.ts` + `types.ts` |
| 241 | batch command | `features/terminal/api.ts` |
| 255–302 | monitor, uptime, audit, discord | `features/monitoring/api.ts` + `types.ts` |
| 356–431 | databases | `features/databases/api.ts` + `types.ts` |

`types/index.ts` diperlakukan sama: tipe dipindah ke `features/*/types.ts` milik domainnya. Hanya tipe yang benar-benar dipakai lintas fitur (mis. `ServerItem`) yang tetap di `features/servers/types.ts` dan diekspor lewat `features/servers/index.ts`.

### `App.tsx` (901 baris)

| Bagian | Tujuan |
|---|---|
| `App` (auth gate) | `app/App.tsx` |
| state `servers`, `loading`, refresh, `history` | `features/servers/hooks/useServers.ts`, `useMetricsPolling.ts` |
| state `theme` | `shared/hooks/useTheme.ts` |
| `showPalette`, `paletteQuery` | `app/CommandPalette.tsx` (state disimpan di komponennya sendiri) |
| state modal (`editingServer`, `terminalServer`, `filesServer`, …) | tetap di `AppShell`, atau dipindah ke komponen yang membukanya |
| thresholds / alerts / settings | `features/monitoring/hooks/useMonitorSettings.ts` |
| render per view | `pages/FleetPage.tsx` |

Target: `App.tsx` < 60 baris, `AppShell.tsx` < 250 baris.

### `ServerManagementView.tsx` (1638 baris)

Setiap tab di `SERVER_TABS` dibuat jadi satu komponen di fitur pemiliknya. `pages/ServerPage.tsx` cukup berisi header server + map `tab → komponen`:

```tsx
const TABS: Record<ServerTab, React.FC<{ server: ServerItem }>> = {
  overview: OverviewTab, topology: ServerTopologyTab, webapps: WebAppsTab, pm2: Pm2Tab,
  docker: DockerPanel, databases: DatabasePanel, services: ServicesTab,
  nginx: NginxTab, ports: PortsTab, terminal: TerminalTab,
};
```

### `FileViewer.tsx` (933 baris)

Pecah per jenis tampilan: `MarkdownViewer` (dari `SimpleMarkdownViewer`), `TextEditor`, `ImageViewer`, dll. `FileViewer.tsx` cukup memilih viewer berdasarkan ekstensi file.

### Lainnya

| Lama | Baru |
|---|---|
| `components/ui/*` | `shared/ui/*` |
| `lib/utils.ts`, `lib/cache.ts` | `shared/lib/` |
| `lib/router.ts`, `router.test.ts` | `app/` |
| `lib/serverNav.ts` | `pages/` atau `app/` (khusus navigasi) |
| `components/db/*` | `features/databases/components/` |
| `components/Sidebar.tsx` | `app/Sidebar.tsx` |

## 5. Path alias

Supaya tidak ada lagi `../../../shared/...`, tambahkan alias `@/`:

`tsconfig.json`:
```json
"baseUrl": ".",
"paths": { "@/*": ["src/*"] }
```

`vite.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
// ...
resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
```

Contoh: `import { apiFetch } from '@/shared/api/client';`

## 6. Aturan

- **Penamaan:** komponen `PascalCase.tsx`, hook `useXxx.ts`, lainnya `camelCase.ts`. File di `shared/ui` tetap lowercase (konvensi shadcn yang sudah dipakai).
- **Import antar-fitur** hanya lewat `features/<x>/index.ts`. Kalau dua fitur saling butuh, kode itu pindah ke `shared/` atau ke fitur yang lebih "bawah" (biasanya `servers`).
- **Komponen tidak memanggil `fetch` langsung**; selalu lewat `features/*/api.ts`.
- **State yang dipakai satu komponen** tinggal di komponen itu, jangan diangkat ke `App`.
- **`localStorage`** hanya diakses lewat helper (`shared/lib/cache.ts` / `useLocalStorage`), dibungkus try/catch.
- **Batas ukuran:** file > ~300 baris jadi kandidat dipecah saat berikutnya disentuh.

## 7. Langkah migrasi (bertahap, aplikasi tetap jalan di tiap langkah)

Setelah **setiap** langkah, jalankan `npx tsc --noEmit && npm run build`, lalu cek manual halaman yang tersentuh.

1. **Alias + shared** — tambah alias `@/`, pindahkan `components/ui` → `shared/ui`, `lib/utils|cache` → `shared/lib`, potong bagian client dari `api.ts` → `shared/api/client.ts`. (Hanya memindah file + update import, tanpa ubah logika.)
2. **Pecah `api.ts` + `types/`** ke `features/*/api.ts|types.ts`. Selama transisi, `api.ts` boleh me-*re-export* dari file baru (`export * from '@/features/docker/api'`) agar import lama tidak rusak; hapus setelah semua import diganti.
3. **Pindahkan komponen** yang sudah berdiri sendiri (Docker, Database, Files, Terminal, Logs, Monitoring) ke foldernya.
4. **Pecah `ServerManagementView`** per tab → `pages/ServerPage.tsx`.
5. **Pecah `App.tsx`** → `app/App.tsx`, `AppShell`, hooks, `pages/FleetPage.tsx`.
6. **Pecah `FileViewer`**.
7. Hapus `api.ts`, `types/index.ts`, dan folder `components/` lama yang sudah kosong.

Urutan ini dari risiko paling kecil (pindah file) ke paling besar (memecah state di `App.tsx`). Langkah 1–3 bersifat mekanis; langkah 4–6 perlu ditest manual per tab.

## 8. Yang sengaja tidak dimasukkan

- **React Router / TanStack Query / Zustand:** belum dibutuhkan. Router hash yang ada sudah menangani 3 jenis halaman, dan state global hanya daftar server. Pertimbangkan kalau nanti muncul nested layout atau banyak fitur yang berbagi cache data server.
- **Barrel `index.ts` di setiap folder:** hanya di root tiap fitur, supaya tree-shaking dan "go to definition" tetap jelas.
- **Test baru:** di luar cakupan dokumen ini. `router.test.ts` yang ada ikut dipindah.
