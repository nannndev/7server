# Panduan Teknis Implementasi AI Gateway

Dokumen ini adalah blueprint teknis lengkap dari implementasi **AI Gateway** di 7Server (`server/src/modules/ai-gateway/` dan `client/src/features/ai-gateway/`). Disusun agar Anda bisa membangun fitur **LLM Router / Universal AI Gateway** serupa di project lain (Node.js, Go, Python, Rust, dll) dengan cepat, aman, dan modular.

---

## 1. Gambaran Arsitektur

AI Gateway berperan sebagai satu pintu masuk (*single unified endpoint*) yang meniru API **OpenAI** dan **Anthropic**, lalu merutekan setiap request ke puluhan provider upstream (baik **API Key** maupun **Akun Langganan OAuth**) lengkap dengan rotasi multi-akun, *fallback chain*, cooldown saat kena rate-limit, translasi format stream SSE, dan pencatatan pemakaian.

```text
  Client (OpenAI SDK / Anthropic SDK / Claude Code / Cursor / Copilot Drawer)
         │  Authorization: Bearer 7s-sk-…   atau   x-api-key: 7s-sk-…
         ▼
 ┌───────────────────────── PROXY LAYER (/api/ai) ─────────────────────────┐
 │ 1. Network Guard     (internalOnly: loopback, RFC1918, trusted proxy)   │
 │ 2. Virtual Key Auth  (sha256 hash lookup + timingSafeEqual)             │
 │ 3. Route Resolver    (auto/<combo> | <alias>/auto | <alias>/<model>)    │
 │ 4. Policy & Order    (allowedProviders filter + notCooling() first)     │
 │ 5. Dispatch Loop     (untuk tiap target: adapter.call())                │
 │       ├─ Translate Request   (OpenAI ↔ Anthropic / Gemini / Responses)  │
 │       ├─ Credential Pickup   (multi-key rotation / OAuth single-flight) │
 │       ├─ Retry Policy        (1x refresh jika 401; next target jika 429)│
 │       └─ Stream Pipe + Sniff (SSE chunk forwarding + hitung token real) │
 │ 6. Accounting        (update counter key + append AiUsageLog ke SQLite) │
 └─────────────────────────────────────────────────────────────────────────┘
         ▼
  Upstream Providers (OpenAI, Anthropic, Gemini, Copilot, Codex, GLM, ...)
```

### Pemisahan 2 Grup Route (WAJIB)

| Grup Route | Prefix | Autentikasi | Fungsi |
|---|---|---|---|
| **Proxy Publik/Internal** | `/api/ai` (`/v1/chat/completions`, `/v1/messages`, `/v1/models`) | Virtual API Key (`7s-sk-...`) | Dipanggil oleh SDK, IDE, CLI, dan internal Copilot |
| **Management Admin** | `/api/ai-gateway/...` | Session Admin + RBAC (`gateway.manage`) | CRUD Virtual Key, konek/verify provider, combos, usage & analytics |

> [!IMPORTANT]
> Proxy route dan Management route **tidak boleh** berbagi mekanisme auth yang sama. Virtual API key tidak boleh punya akses membaca konfigurasi, melihat kunci provider, atau mengubah combo.

---

## 2. Peta Modul (Reference Architecture)

Berikut pembagian file yang rapi di 7Server agar setiap tanggung jawab terisolasi:

| File / Modul | Tanggung Jawab |
|---|---|
| `server/src/modules/ai-gateway/types.ts` | Tipe domain (`AiProviderId`, `VirtualApiKey`, `ProviderConfig`, `AiGatewayConfig`, `AiUsageLog`, `UsageAnalytics`) |
| `server/src/modules/ai-gateway/store.ts` | Persistence SQLite (`ai_keys`, `ai_gateway_config`, append-only `usage`), hashing SHA-256, enkripsi secret, agregasi analytics |
| `server/src/modules/ai-gateway/compatProviders.ts` | Registry provider OpenAI-compatible (baseUrl, alias prefix, model seed, header khusus) |
| `server/src/modules/ai-gateway/verifier.ts` | Validasi API key live sebelum disimpan (ukur latency + fetch daftar model) |
| `server/src/modules/ai-gateway/pricing.ts` | Katalog estimasi biaya per 1M input/output token (`estimateCostUsd`) untuk OpenAI, Anthropic, Gemini, DeepSeek, dll |
| `server/src/modules/ai-gateway/service.ts` | Handler `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`, `/v1/messages`, `/v1/models`, policy enforcement (RPM, budget, token, expiry), `round_robin`, abort `res.on('close')`, dan Playground |
| `server/src/modules/ai-gateway/subscription.ts` | Katalog OAuth provider, alias mapping, `resolveModel()`, `buildProviderAutoChain()`, upstream call + retry 401/429 |
| `server/src/modules/ai-gateway/formats.ts` | Translasi dua arah OpenAI ↔ Anthropic / Gemini / OpenAI Responses API (non-stream & SSE streaming) |
| `server/src/modules/ai-gateway/accounts.ts` | Penyimpanan multi-account OAuth terenkripsi, urutan prioritas (`#1, #2, ...`), single-flight token refresh |
| `server/src/modules/ai-gateway/oauth.ts` | Flow OAuth Authorization Code + PKCE dan GitHub/CLI Device Code flow |
| `server/src/modules/ai-gateway/usage.ts` | Manajemen cooldown (`429` / `Retry-After`), `rotateRoundRobin`, + polling kuota/billing window akun langganan (cache 60s) |
| `server/src/modules/ai-gateway/internalOnly.ts` | IP guard (loopback, private network, registered hosts) & handling aman `X-Forwarded-For` |
| `server/src/modules/ai-gateway/routes.ts` | Router Express untuk `aiGatewayPublicRoutes` & `aiGatewayManagementRoutes` (termasuk `PATCH /keys/:id` & `POST /playground`) |
| `client/src/features/ai-gateway/` | UI Management: `SubscriptionAccounts.tsx`, `Combos.tsx`, `Playground.tsx`, `UsageAnalyticsPanel.tsx`, `api.ts`, `types.ts` |

---

## 3. Kontrak Endpoint Proxy

Client dan SDK sering salah menaruh suffix `/v1` pada `base_url`. Karena itu, daftarkan variasi path agar tetap kompatibel:

| Method | Paths yang Didukung | Format Wire |
|---|---|---|
| `GET` | `/health` | `{ status: "ok", service, timestamp }` (tanpa auth) |
| `POST` | `/v1/chat/completions`, `/chat/completions`, `/v1/v1/chat/completions` | OpenAI Chat Completions (JSON / SSE + auto `stream_options.include_usage`) |
| `POST` | `/v1/responses`, `/responses`, `/v1/v1/responses` | OpenAI Responses API (passthrough atau fallback ke Chat adapter) |
| `POST` | `/v1/embeddings`, `/embeddings`, `/v1/v1/embeddings` | OpenAI Embeddings API |
| `POST` | `/v1/messages`, `/messages`, `/v1/v1/messages` | Anthropic Messages (JSON / SSE) |
| `POST` | `/v1/messages/count_tokens`, `/messages/count_tokens` | Anthropic Token Count |
| `GET` | `/v1/models`, `/models`, `/v1/v1/models` | Daftar model sesuai `allowedProviders` virtual key + `<alias>/auto` |

### Aturan Header Auth & Error Shape

1. Baca API key dari `Authorization: Bearer <key>`, fallback ke header `x-api-key: <key>` (dipakai Anthropic SDK).
2. Format error **harus** mengikuti format endpoint yang dipanggil klien:
   - Endpoint OpenAI (`/v1/chat/completions`):
     ```json
     { "error": { "message": "...", "type": "invalid_request_error", "code": "invalid_api_key" } }
     ```
   - Endpoint Anthropic (`/v1/messages`):
     ```json
     { "type": "error", "error": { "type": "authentication_error", "message": "..." } }
     ```

---

## 4. Model Data & Keamanan Kredensial

### 4.1 Virtual API Key (`VirtualApiKey`)

```ts
interface VirtualApiKey {
  id: string;
  name: string;
  keyHash?: string;         // sha256(secret) dalam hex. Raw secret TIDAK pernah disimpan.
  keyPrefix: string;        // contoh: "7s-sk-...a1b2" untuk tampilan tabel
  createdAt: string;
  lastUsedAt?: string;
  enabled: boolean;
  rateLimitPerMin?: number;
  allowedProviders?: AiProviderId[]; // kosong = boleh semua provider
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}
```

**Aturan Wajib Virtual Key:**
1. Generate secret dengan CSPRNG (`crypto.randomBytes(24).toString('hex')` → prefix `7s-sk-`).
2. Karena entropi 192-bit tidak bisa di-brute-force, cukup simpan **hash SHA-256** (`hashKey()`) agar lookup per request tetap *O(1)* tanpa bcrypt yang berat.
3. Kembalikan raw secret **hanya satu kali** pada response `POST /ai-gateway/keys`. Endpoint list selalu memakai `publicKey()` yang menghapus `key` & `keyHash`.
4. Bandingkan hash memakai `crypto.timingSafeEqual()` untuk mencegah timing attack.

### 4.2 Enkripsi Secret Provider & OAuth Account

Semua `apiKey` provider maupun JSON token OAuth (`accessToken`, `refreshToken`) wajib dienkripsi *at rest* (AES-256-GCM melalui `infra/crypto.ts`) sebelum ditulis ke database, dan selalu di-mask (`••••abcd`) setiap kali config dikirim ke client via `GET /ai-gateway/config`.

Saat update parsial melalui `POST /ai-gateway/config`, jangan pernah menimpa key tersimpan dengan nilai kosong atau nilai bertanda mask `••••`.

---

## 5. Algoritma Routing & Fallback Chain

Nilai field `model` di request body menjadi *routing key*. Urutan resolusi di `service.ts`:

| Pola `model` | Arti | Contoh | Target yang Dihasilkan |
|---|---|---|---|
| `auto/<combo>` | Combo lintas provider dari `config.combos[name]` | `auto/fast-code` | `[cc/claude-sonnet-4-5, cx/gpt-5-codex, gq/llama-3.3-70b]` |
| `<alias>/auto` | Auto-pick & fallback model dalam **satu provider** (`buildProviderAutoChain`) | `gh/auto`, `cx/auto` | `[gh/gpt-4.1, gh/claude-sonnet-4, gh/gpt-4o, ...]` |
| `<alias>/<model>` | Langsung ke provider + model upstream spesifik | `cc/claude-sonnet-4-5` | `[{ provider: 'claude', model: 'claude-sonnet-4-5' }]` |
| `<plain-model>` | Heuristik nama / compatibility prefix atau fallback `defaultProvider` | `gpt-4o`, `deepseek-chat` | `openai/gpt-4o`, `deepseek/deepseek-chat` |

### 5.1 Dispatch Loop + Cooldown Ordering (`service.ts`)

```text
1. Autentikasi Virtual Key → 401 jika invalid/disabled.
2. Resolve model string → daftar target `orderedTargets`.
3. Filter target dengan `key.allowedProviders` → 403 jika tidak ada yang diizinkan.
4. Urutkan target agar akun/provider yang sedang cooldown ditaruh di BELAKANG (bukan dihapus):
   ordered = [...allowed.filter(notCoolingDown), ...allowed.filter(isCoolingDown)]
5. Loop tiap target:
   - Panggil adapter / upstream.
   - Jika sukses:
     • Catat token & log (`auto/fast-code → cc/claude-sonnet-4-5`).
     • Jika sempat gagal di target sebelumnya, simpan jejak `"fell back after: ..."` di kolom error log untuk observabilitas admin.
   - Jika error (`UpstreamError`):
     • Jika `res.headersSent === true`: STOP! Stream yang sudah berjalan tidak boleh di-replay ke provider lain.
     • Jika bukan chain (`!isChain`): STOP.
     • Jika error bukan retryable (`400`, `404`, `413`, `422`): STOP (payload klien salah, coba ke provider lain akan tetap gagal).
     • Jika retryable (`401`, `403`, `429`, `503`, `5xx`, network error): lanjut ke target berikutnya.
```

### 5.2 Multi-Key Rotation (Provider API Key) & Cooldown (`429`)

Untuk provider berbasis API key, `ProviderConfig.apiKeys` menyimpan array terurut (`id`, `label`, `apiKey`). Di `service.ts`:
- Request mencoba key dari index `0 → N-1`.
- Jika mendapat status retryable (`401, 402, 403, 429, 500, 502, 503, 504`), langsung rotasi ke API key berikutnya di dalam loop yang sama sebelum gagal.
- Saat upstream mengembalikan `429`, tandai provider/akun sedang cooldown memakai durasi dari:
  1. Header `Retry-After` (detik)
  2. Field body `resets_at` / `resets_in_seconds`
  3. Default cooldown (mis. `5 menit`)

---

## 6. Adapter Translasi Format & SSE Streaming

### 6.1 Fast Path vs Translation Path

- **Fast Path (Zero-Overhead)**: Jika format klien sama dengan upstream (Anthropic SDK → Claude/Anthropic, atau OpenAI SDK → OpenAI-compatible), teruskan JSON body apa adanya dan pipe bytes upstream langsung ke `res`. Cukup ganti header auth. Semua fitur lanjutan (vision, prompt caching, reasoning/thinking tokens, beta headers) otomatis jalan tanpa modifikasi.
- **Translation Path (`formats.ts`)**: Dipakai ketika protokol klien dan upstream berbeda (mis. OpenAI SDK memanggil `cc/claude-...`, `gm/gemini-...`, atau `cx/gpt-5` OpenAI Responses API).

### 6.2 Aturan Kunci Translasi OpenAI → Anthropic

1. Kumpulkan semua message `role: "system"` / `"developer"` ke field top-level `system`.
2. Konversi assistant `tool_calls[]` menjadi content block `{ type: "tool_use", id, name, input }`.
3. Konversi `role: "tool"` menjadi turn `user` berisi `{ type: "tool_result", tool_use_id, content }`.
4. **Gabungkan turn bertetangga yang ber-role sama**, dan pastikan turn pertama selalu `user` (syarat ketat API Anthropic dan Gemini).
5. Pastikan `max_tokens` selalu terisi (default mis. `8192`).
6. Saat streaming Anthropic → OpenAI, renumber `tool_calls[].index` secara berurutan `0, 1, 2...` **khusus per tool call** (karena `index` milik Anthropic juga menghitung block teks).

### 6.3 Aturan Wajib SSE Output & Client Abort

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

- Header `X-Accel-Buffering: no` wajib agar Nginx di depan gateway tidak menahan chunk SSE sampai selesai.
- **Sniffing Usage**: Pada jalur *fast path* streaming, parse baris `data:` secara pasif di memori untuk mengambil `prompt_tokens` / `completion_tokens` tanpa mengganggu aliran byte ke klien.
- **Abort on Disconnect**: Pasang `AbortController` per request dan dengarkan `res.on('close', ...)` dengan cek `!res.writableFinished` (jangan hanya `req.on('close')`, karena di Node/Express `req` langsung emit `close` begitu body selesai dibaca). Saat klien menutup tab/CLI, upstream fetch langsung di-abort supaya kuota tidak terbuang.

---

## 7. Akun Langganan OAuth & Single-Flight Refresh

Untuk provider berbasis login akun (`claude`, `codex`, `copilot`, `gemini-cli`, `kimi`, `kilocode`, `muse`, `nous`):

1. **Alur Login (`oauth.ts`, `callbackServer.ts`)**:
   - **Authorization Code + PKCE**: Generate `code_verifier` & `code_challenge` (S256), simpan session ber-TTL 15 menit, buka one-shot localhost callback server (`listenForCallback`), dan tetap sediakan input paste URL callback manual untuk VPS headless.
   - **Device Code**: Tampilkan `userCode` + `verificationUri`, lalu frontend polling `POST /accounts/:provider/poll`.
2. **Single-Flight Token Refresh (`accounts.ts`)**:
   - Banyak provider OAuth memutar (*rotate*) `refresh_token` pada setiap pemanggilan refresh.
   - Jika 10 request bersamaan mendapati token hampir expired (mis. sisa `< 5 menit`), gunakan satu map `inflightRefresh` keyed by account agar **hanya 1 HTTP refresh** yang berjalan dan 9 request lainnya menunggu Promise yang sama.
   - Pada respons upstream `401`, paksa refresh credential sekali lalu ulangi request upstream satu kali.
3. **Polling Kuota (`usage.ts`)**:
   - Ambil status kuota per window (mis. 5-jam / mingguan / chat & completions untuk Copilot), cache selama ~60 detik (bisa di-bypass dengan `?fresh=1`), dan gabungkan metrik pemakaian lokal gateway (`todayRequests`, `todayTokens`, `totalRequests`, `totalTokens`) melalui endpoint `GET /api/ai-gateway/accounts/usage`.

---

## 8. Usage Analytics & Time-Series Aggregation

7Server mencatat setiap request selesai ke tabel append-only `usage` (`AiUsageLog`) dan menyajikannya lewat:

- `GET /api/ai-gateway/stats` — Ringkasan global (`totalRequests`, `totalInputTokens`, `totalOutputTokens`, `activeKeysCount`, `connectedProvidersCount`).
- `GET /api/ai-gateway/usage?limit=100` — Daftar log request terbaru (dibatasi `1..500`).
- `GET /api/ai-gateway/analytics?range=30d&tzOffset=-420&provider=...&model=...` — Data teragregasi untuk dashboard chart & tabel ranking.

### Cara Kerja Agregasi `buildUsageAnalytics()` (`store.ts`)

1. **Range & Granularitas Bucket**:
   - `1d` → 24 bucket per **jam** (`00:00` – `23:00` hari lokal user).
   - `7d` / `30d` → bucket per **hari** (mengisi gap hari kosong agar grafik time-series kontinyu tanpa bolong).
   - `all` → otomatis memilih **hari** jika rentang data `<= 45 hari`, atau **bulan** jika lebih panjang.
2. **Timezone Offset (`tzOffsetMin`)**:
   - Frontend mengirim `-new Date().getTimezoneOffset()` (mis. `+420` untuk WIB/UTC+7) agar pengelompokan "Hari Ini (`1d`)" dan tanggal harian akurat sesuai jam lokal pengguna, bukan selalu UTC.
3. **Group Breakdown (`byModel` & `byProvider`)**:
   - Menghitung total request, jumlah error, `inputTokens`, `outputTokens`, `totalTokens`, rata-rata latensi (`avgDurationMs`), dan persentase porsi (`sharePct`).

---

## 9. Checklist Keamanan & Testing Minimum

### Checklist Keamanan
- [ ] Raw secret Virtual API Key hanya muncul 1x saat create; di DB tersimpan `sha256` + compare via `timingSafeEqual`.
- [ ] Secret provider & OAuth tokens terenkripsi AES-256-GCM dan selalu di-mask saat dikirim ke UI.
- [ ] Middleware `internalOnly` mengecek IP socket langsung; `X-Forwarded-For` hanya dipercaya jika reverse proxy explicitly configured.
- [ ] Jangan log isi prompt / response body klien di tabel `UsageLog` (hanya metadata token, status, latensi, dan potongan error maksimal ~250–400 karakter).
- [ ] Rate-limit per virtual key dan batasi ukuran JSON payload (mis. `20 MB` untuk multimodal/gambar).

### Skenario Unit & Integration Test Minimum (`server/src/modules/ai-gateway/*.test.ts`)
1. **Virtual Key Auth**: Buat key → akses via `Bearer` & `x-api-key` → disable key harus `401` → list endpoint tidak membocorkan `keyHash`.
2. **Routing & Policy**: Uji `<alias>/<model>`, `<alias>/auto` (`copilotAuto.test.ts`), `auto/<combo>` (`combo.test.ts`), combo tak dikenal (`404`), dan provider dilarang key (`403`).
3. **Fallback & Cooldown**: Target 1 return `429` → target 2 sukses + log mencatat `fell back after`; target 1 return `400` → tidak fallback; error setelah `headersSent` → tidak fallback.
4. **Translasi & Streaming**: Message system + tool call + tool result → format Anthropic valid; `tool_calls[].index` stream urut dari `0`; `finish_reason = "tool_calls"`.
5. **Single-Flight Refresh**: 10 panggilan paralel pada token expired memicu tepat **1** panggilan refresh ke OAuth server.
6. **Analytics**: Verifikasi bucket `1d` vs `30d`, `tzOffsetMin`, serta sorting `byModel` & `byProvider` (`analytics.test.ts`).

---

## 10. Urutan Implementasi yang Disarankan

Jika Anda ingin membangun ulang modul serupa dari nol di project lain, kerjakan bertahap sesuai urutan ini agar setiap tahap langsung bisa diuji:

1. **Fondasi Proxy**: `/health`, `/v1/models`, dan `/v1/chat/completions` non-stream passthrough ke 1 provider OpenAI-compatible.
2. **Auth & Security**: Tabel `VirtualApiKey` (`sha256`), endpoint CRUD key, middleware bearer/x-api-key, dan enkripsi config provider.
3. **Streaming & Accounting**: SSE pipe passthrough + pasif token sniffing + `res.on('close')` abort controller + pencatatan `UsageLog`.
4. **Multi-Provider & Routing**: Tambahkan `compatProviders` map, `<alias>/<model>` routing, dan `verifyProviderConnection()`.
5. **Multi-Key & Fallback**: Tambahkan array `apiKeys` per provider, `combos`, `<alias>/auto`, dan mekanisme cooldown `429`.
6. **Protocol Bridge**: Tambahkan endpoint `/v1/messages` dan modul translator `OpenAI ↔ Anthropic ↔ Gemini`.
7. **Analytics Dashboard**: Tambahkan endpoint agregasi `getUsageAnalytics(range, tzOffset)` + chart UI dan filter model/provider.
8. **OAuth Subscription (Opsional)**: Tambahkan PKCE / Device Code login, single-flight refresh, dan quota tracker.

