# 7Server Anonymous Telemetry & Stats Worker

Cloudflare Worker gratis (100.000 requests/hari) untuk memantau jumlah instance 7Server aktif dan update version check tanpa melanggar privasi pengguna.

---

## ⚡ Cara Deploy (Pilih salah satu)

### Opsi A: Lewat Dashboard Cloudflare (Paling Cepat / Tanpa CLI)
1. Buka [dash.cloudflare.com](https://dash.cloudflare.com) &rarr; **Workers & Pages** &rarr; **Create application** &rarr; **Create Worker**.
2. Beri nama: `sevenserver-telemetry` &rarr; Klik **Deploy**.
3. Klik **Edit code**, lalu copy-paste seluruh isi file [worker.js](file:///Users/yubidev/Documents/7server/telemetry-worker/worker.js) ke dalam editor Cloudflare &rarr; Klik **Deploy**.
4. (Opsional untuk simpan data permanen):
   - Di menu sebelah kiri: **KV** &rarr; **Create namespace** beri nama `STATS_KV`.
   - Kembali ke Worker `sevenserver-telemetry` &rarr; **Settings** &rarr; **Variables** &rarr; **KV Namespace Bindings** &rarr; **Add binding**:
     - Variable name: `STATS_KV`
     - KV namespace: pilih `STATS_KV`.

---

### Opsi B: Lewat Terminal (Wrangler CLI)
```bash
cd telemetry-worker

# 1. Login ke Cloudflare (cukup 1x)
npx wrangler login

# 2. Buat KV namespace
npx wrangler kv:namespace create STATS_KV

# 3. Paste ID namespace yang muncul ke wrangler.toml, lalu deploy:
npx wrangler deploy
```

---

## 📡 Endpoints yang Disediakan

| Method | Endpoint | Fungsi |
| :--- | :--- | :--- |
| `POST` | `/api/v1/ping` | Menerima heartbeat anonim dari 7Server instance (UUID, OS, versi) |
| `GET` | `/api/v1/stats` | Statistik publik agregat (bisa dipajang di landing page / status) |
| `GET` | `/api/v1/version` | Cek rilis versi terbaru 7Server |

