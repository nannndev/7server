# Arsitektur Backend (server/)

Status: **selesai dimigrasi** (langkah 0–7). Pasangan dokumen ini: [frontend-architecture.md](frontend-architecture.md).

Catatan implementasi:
- Entry sekarang `src/index.ts` (`npm run dev` / `start`). `src/app.ts` mengekspor `createApp()` tanpa `listen`.
- `DATA_DIR` hanya dihitung di `src/config.ts` (bisa di-override dengan `VPSHUB_DATA_DIR`, dipakai test).
- Router `servers` dipecah tiga file (`routes.ts`, `diagnosticsRoutes.ts`, `transferRoutes.ts`) supaya urutan mount sama persis dengan `server.ts` lama.
- `src/contract.test.ts` = smoke test §7: semua `/api/*` wajib 401 tanpa token, plus snapshot status & bentuk response 66 kasus. `npx tsx src/contract.test.ts` untuk merekam, `--compare` untuk membandingkan.
- `src/databases/` belum dipindah ke `modules/databases/` (hanya route-nya); isinya tidak berubah, sesuai rencana.

## 1. Kondisi sekarang

Kondisinya lebih baik daripada client. `src/databases/` sudah mengikuti pola yang dituju: adapter per engine, `registry`, `store`, `runner`, dan test. Masalahnya hanya ada di dua file:

| File | Baris | Masalah |
|---|---|---|
| `src/server.ts` | 879 | Bootstrap, config, auth + rate limit, audit middleware, **±60 route** dari semua domain, helper (`withServer`, `withDb`, `sftpTarget`, `runDocker`), WebSocket terminal, dan `listen` jadi satu |
| `src/metricsService.ts` | 617 | Metrics, process, service, webapps, pm2/supervisor, nginx, dan ports dalam satu file |
| `src/types.ts` | 177 | Tipe semua domain digabung jadi satu |

Masalah kecil lain di `server.ts`:
- Pola error handling diulang di hampir setiap route: `try { ... } catch (err: any) { res.status(500).json(...) }`, padahal helper `withServer` / `withDb` sudah ada untuk itu.
- Status 400 vs 500 ditentukan dengan mencocokkan teks pesan error (`/tidak (didukung|valid)/`). Begitu pesan error diubah, status code-nya ikut berubah tanpa disadari.
- Config (`PORT`, `DATA_DIR`, password) dibaca langsung di tengah file.

## 2. Prinsip

1. **Pola `databases/` dijadikan standar** untuk domain lain, karena sudah terbukti jalan di repo ini.
2. **Lapisan:** `routes` (HTTP: parse request → panggil service → kirim response) → `services` (logika + perintah SSH) → `infra` (ssh, storage, crypto). Route tidak boleh berisi string perintah shell, dan service tidak boleh menyentuh `req`/`res`.
3. **Tanpa dependency baru.** Express 5 sudah meneruskan error dari handler `async` ke error middleware, jadi tidak perlu `express-async-handler`. Validasi tetap manual seperti sekarang (zod baru dipertimbangkan kalau jumlah body yang perlu divalidasi makin banyak).
4. **Path URL tidak berubah.** Ini refactor internal; client tidak boleh ikut rusak.

## 3. Struktur target

```
server/src/
├── index.ts                 # entry: buat http server, pasang WS, startMonitor(), listen
├── app.ts                   # buat express app: middleware + mount router (tanpa listen → bisa dites)
├── config.ts                # PORT, DATA_DIR, CORS_ORIGIN, password dashboard
│
├── http/                    # perekat Express, tidak tahu soal domain
│   ├── auth.ts              # login handler, rate limit, requireAuth, safeEqual, AUTH_TOKEN
│   ├── audit.ts             # middleware audit (logika tulis tetap di infra/audit.ts)
│   ├── errors.ts            # class HttpError(status, msg) + error middleware {success:false,error}
│   └── handlers.ts          # withServer, withDb, sftpTarget (dari server.ts)
│
├── modules/                 # satu folder per domain, pola sama dengan databases/
│   ├── servers/     routes.ts  store.ts (dari db.ts)  types.ts
│   ├── metrics/     routes.ts  service.ts (fetchServerMetrics, history)
│   ├── processes/   routes.ts  service.ts (processes, services, pm2, supervisor)
│   ├── webapps/     routes.ts  service.ts (webapps, nginx, ports)
│   ├── files/       routes.ts  (pakai withSftp)
│   ├── logs/        routes.ts
│   ├── docker/      routes.ts  service.ts (dari dockerService.ts)  service.test.ts
│   ├── exec/        routes.ts  (exec + batch-exec)
│   ├── terminal/    ws.ts      (WebSocketServer + upgrade handler)
│   ├── monitoring/  routes.ts  monitor.ts  monitor.test.ts  (monitor, uptime, discord, audit list)
│   └── databases/   routes.ts  + isi folder databases/ yang sekarang (tidak diubah)
│
└── infra/
    ├── ssh.ts               # dari sshService.ts
    ├── crypto.ts            # dari cryptoUtil.ts
    └── audit.ts             # writeAudit/readAudit (dari audit.ts)
```

Setiap `modules/<x>/routes.ts` mengekspor satu `Router`:

```ts
// modules/docker/routes.ts
import { Router } from 'express';
import { withServer } from '../../http/handlers.js';
import { fetchDockerOverview, inspectContainer /* ... */ } from './service.js';

export const dockerRoutes = Router();
dockerRoutes.get('/servers/:id/docker', withServer((t, req) => fetchDockerOverview(t, req.query.stats !== '0')));
dockerRoutes.get('/servers/:id/docker/inspect/:cid', withServer((t, req) => inspectContainer(t, req.params.cid)));
// ...
```

`app.ts` hanya menyusun:

```ts
const app = express();
if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '5mb' }));
app.post('/api/login', loginHandler);
app.use('/api', requireAuth, auditMiddleware);
app.use('/api', serversRoutes, metricsRoutes, processesRoutes, webappsRoutes, filesRoutes,
  logsRoutes, dockerRoutes, execRoutes, monitoringRoutes, databasesRoutes);
app.use(errorHandler);
export default app;
```

> **Urutan route penting.** `POST /servers/test` dan `POST /servers/batch-exec` harus didaftarkan sebelum route `/servers/:id/...` yang bisa bentrok. Saat memindah, pertahankan urutan relatif seperti di `server.ts`.

## 4. Error handling

Ganti pencocokan teks pesan error dengan error yang membawa status code:

```ts
// http/errors.ts
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : err instanceof QueryError ? 400 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ success: false, error: err.message });
};
```

- Validasi (`checkName`, action yang tidak didukung, dll.) melempar `new HttpError(400, ...)`.
- Dengan begitu `withServer` tidak perlu lagi memakai regex untuk menebak status code.
- Route `async` biasa cukup `throw`; Express 5 akan meneruskannya ke `errorHandler`. Semua `try/catch` yang hanya berisi `res.status(500)` bisa dihapus.
- **Bentuk response `{ success, data | error }` tidak berubah**, karena `unwrap()` di client bergantung pada bentuk itu.

## 5. Pemetaan file lama → baru

| Lama | Baru |
|---|---|
| `server.ts` 68–98 (dotenv, port, password, token) | `config.ts` + `http/auth.ts` |
| `server.ts` 100–124 (login, guard) | `http/auth.ts` |
| `server.ts` 127–140 (audit middleware) | `http/audit.ts` |
| `server.ts` 142–198 (audit, history, monitor, uptime, export/import) | `modules/monitoring/routes.ts`, `modules/servers/routes.ts` |
| `server.ts` 200–330 (servers CRUD, test, ping, metrics) | `modules/servers/routes.ts`, `modules/metrics/routes.ts` |
| `server.ts` 332–483 (processes, services, webapps, pm2, supervisor, nginx, ports) | `modules/processes/routes.ts`, `modules/webapps/routes.ts` |
| `server.ts` 485–511 (logs) | `modules/logs/routes.ts` |
| `server.ts` 513–606 (files / sftp) | `modules/files/routes.ts` |
| `server.ts` 403, 608–630 (docker) | `modules/docker/routes.ts`; `withServer` → `http/handlers.ts` |
| `server.ts` 634–755 (db) | `modules/databases/routes.ts`; `withDb` → `http/handlers.ts` |
| `server.ts` 757–828 (exec, batch-exec) | `modules/exec/routes.ts` |
| `server.ts` 830–872 (WebSocket) | `modules/terminal/ws.ts` (`attachTerminalWs(httpServer)`) |
| `server.ts` 874–879 (start) | `index.ts` |
| `metricsService.ts` 15–198 | `modules/metrics/service.ts` |
| `metricsService.ts` 199–305, 393–508 | `modules/processes/service.ts` (manageDockerContainer → `modules/docker/service.ts`) |
| `metricsService.ts` 307–392, 509–617 | `modules/webapps/service.ts` |
| `db.ts` | `modules/servers/store.ts` |
| `dockerService.ts` (+ test) | `modules/docker/service.ts` |
| `monitor.ts` (+ test) | `modules/monitoring/monitor.ts` |
| `sshService.ts`, `cryptoUtil.ts`, `audit.ts` | `infra/` |
| `types.ts` | dipecah ke `modules/*/types.ts`; tipe lintas modul (`ServerCredentials`, `CommandResult`) → `modules/servers/types.ts` |

> **⚠️ Path data — risiko terbesar refactor ini.** Saat ini ada 6 file yang menghitung `DATA_DIR` sendiri-sendiri, relatif terhadap lokasi file masing-masing: `server.ts`, `db.ts`, `cryptoUtil.ts`, `audit.ts`, `monitor.ts` (`'../data'`), dan `databases/store.ts` (`'../../data'`). Begitu file dipindah ke subfolder, path ini ikut bergeser. Akibatnya:
> - `db.ts` membuat `servers.json` kosong yang baru, sehingga daftar server terlihat hilang.
> - `cryptoUtil.ts` bisa membuat **kunci enkripsi baru**, sehingga semua password/private key SSH yang sudah tersimpan **tidak bisa didekripsi lagi**.
>
> Karena itu, **langkah pertama** migrasi adalah membuat `config.ts` dengan `DATA_DIR` sebagai satu-satunya sumber, lalu mengganti keenam file tersebut agar memakainya, *sebelum* ada file yang dipindah. Backup folder `server/data/` sebelum mulai.

## 6. Langkah migrasi

Setelah setiap langkah: `npx tsc --noEmit`, jalankan test yang ada, start server, lalu cek login, daftar server, satu tab detail server, dan terminal.

0. **Backup `server/data/`**, lalu buat `config.ts` (`DATA_DIR`, `PORT`, `CORS_ORIGIN`) dan ganti keenam perhitungan `DATA_DIR` agar memakainya. Restart dan pastikan daftar server serta koneksi SSH masih jalan.
1. **`http/`**: pindahkan auth, audit middleware, dan helper. Tambahkan `errorHandler`. `server.ts` masih memuat semua route.
2. **Pisahkan `app.ts` / `index.ts`**, termasuk memindah WebSocket ke `modules/terminal/ws.ts`. Ganti script `start`/`dev` di `package.json` ke `src/index.ts`, dan cek juga `start.js` di root.
3. **Pindahkan route per modul**, satu modul per commit. Mulai dari yang sudah memakai helper (docker, databases), lalu servers, processes, webapps, files, logs, exec, monitoring.
4. **Pecah `metricsService.ts`** ke `modules/*/service.ts`.
5. **Pindahkan `db.ts`, `dockerService.ts`, `monitor.ts`, dan infra.** Pastikan path data tidak berubah (lihat §5).
6. **Ganti regex status di `withServer` dengan `HttpError`**, lalu hapus `try/catch` yang duplikat.
7. **Pecah `types.ts`.**

Langkah 1–5 hanya memindah kode (tanpa ubah perilaku). Langkah 6 mengubah perilaku status code, jadi cek manual semua response error 400.

## 7. Satu test yang layak ditambahkan

Setelah `app.ts` terpisah dari `listen`, tambahkan satu smoke test yang memanggil `app` tanpa token dan memastikan semua `/api/*` membalas 401, sementara `/api/login` tidak. Test ini menjaga hal paling penting dari refactor ini: router baru tidak boleh lolos dari auth guard karena salah urutan `app.use`.

## 8. Yang sengaja tidak dimasukkan

- **NestJS / framework DI / controller class:** terlalu berat untuk ±60 route; `Router` per modul sudah cukup.
- **zod / validator library:** validasi yang ada (`checkName`, whitelist action) sudah eksplisit dan berjalan baik.
- **ORM / database untuk data internal:** data server disimpan di file JSON terenkripsi dan itu tetap dipertahankan.
- **Mengubah URL API atau bentuk response:** di luar cakupan; client tidak perlu diubah.
