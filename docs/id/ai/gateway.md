# Universal AI Gateway

Gateway internal yang kompatibel dengan protokol OpenAI (`/v1/chat/completions`) dan Anthropic (`/v1/messages`).

---

## Daftar Provider yang Didukung (Total 27 Provider)

| Kategori | Provider yang Didukung |
| :--- | :--- |
| **8 Akun Langganan OAuth** *(Tanpa tagihan API terpisah)* | **Claude Pro/Team/Max** (`cc`), **ChatGPT Plus/Pro/Codex** (`cx`), **GitHub Copilot** (`gh`), **Gemini CLI** (`gc`), **Kimi Code** (`km`), **Kilo Code** (`kc`), **Muse / Koda CLI** (`ms`), **Nous Portal** (`ns`) |
| **19 Provider API-Key** *(Kompatibel OpenAI & Anthropic)* | **OpenAI** (`oa`), **Anthropic** (`an`), **Google Gemini** (`gm`), **OpenRouter** (`or`), **GLM / Z.AI** (`glm`), **MiniMax** (`mm`), **DeepSeek** (`ds`), **Groq** (`gq`), **Mistral** (`mi`), **xAI Grok** (`xa`), **Together AI** (`tg`), **Fireworks** (`fw`), **Cerebras** (`cb`), **Cohere** (`co`), **NVIDIA NIM** (`nv`), **Nebius** (`nb`), **SiliconFlow** (`sf`), **Hyperbolic** (`hb`), **DeepInfra** (`di`) |

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

