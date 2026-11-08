# Universal AI Gateway

Gateway internal yang kompatibel dengan protokol OpenAI (`/v1/chat/completions`) dan Anthropic (`/v1/messages`).

---

## Hubungkan Akun Langganan (8 Provider OAuth)

Masuk menggunakan akun langganan resmi Anda tanpa harus membeli saldo API per-token yang mahal:
- **Anthropic Claude Pro / Team / Max** (`claude` — OAuth PKCE)
- **ChatGPT Plus / Pro / Team / Codex** (`codex` — OAuth)
- **GitHub Copilot** (`copilot` — Device Code Flow)
- **Google Gemini CLI** (`gemini-cli` — Google OAuth)
- **Kimi Code** (`kimi` — Device Code Flow)
- **Kilo Code** (`kilocode` — Device Code Flow + Model Gratis)
- **Muse (Koda CLI)** (`muse` — GitHub OAuth)
- **Nous Portal** (`nous` — OAuth / API Key)

Ditambah dukungan penuh untuk **19 Provider API-Key & OpenAI-Compatible** (`openai`, `anthropic`, `gemini`, `openrouter`, `glm`, `minimax`, `deepseek`, `groq`, `mistral`, `xai`, `together`, `fireworks`, `cerebras`, `cohere`, `nvidia`, `nebius`, `siliconflow`, `hyperbolic`, dan `deepinfra`).

Seluruh token akses dan API key disimpan secara aman di database lokal 7Server dan diperbarui (*auto-refresh*) secara otomatis.

---

## Multi-Account & Rotasi Berurutan per Provider

Seperti router AI kelas enterprise (mis. 9Router), 7Server mendukung **banyak akun di setiap provider** baik untuk akun langganan OAuth maupun API key:

1. **Multi-Account Tanpa Batas per Provider**: Hubungkan beberapa akun Claude Pro/Max, ChatGPT Plus, GitHub Copilot, atau beberapa API key sekaligus pada provider yang sama melalui tombol **`+ Add Account`** / **`+ Add Another Key`**.
2. **Rotasi Sesuai Urutan Prioritas (`#1 → #2 → #3`)**: Atur urutan prioritas akun kapan saja menggunakan tombol **`↑` / `↓`**. Request AI akan selalu dimulai dari akun `#1` lalu berputar sesuai urutan yang Anda tentukan.
3. **Cooldown Otomatis & Failover Instan Saat Rate-Limit (`429`)**: Ketika akun `#1` terkena limit `429 Too Many Requests` atau kuota habis, 7Server otomatis menandai akun tersebut *cooldown* sementara dan **langsung memutar request ke akun `#2`** di detik yang sama tanpa memutus respons chat.
4. **Indikator Kuota Per Akun**: Pantau persentase kuota sesi 5-jam, kuota mingguan, serta waktu reset masing-masing akun secara real-time.

---

## Failover & Fallback Chains (Combos)

Buat alias model dengan rantai *fallback* lintas provider otomatis apabila seluruh akun pada provider utama sedang mencapai batas kuota:

```text
auto/fast-code -> cc/claude-sonnet-4-5 -> cx/gpt-5-codex -> kr/deepseek-chat
```

