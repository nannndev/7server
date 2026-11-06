---
name: ai-gateway-builder
description: Spec for building a self-hosted AI gateway (one OpenAI- and Anthropic-compatible endpoint in front of many LLM providers, with virtual API keys, fallback chains, usage logging and quota cooldown). Language/framework agnostic. Use when asked to build an "AI gateway", "LLM proxy", "model router", or "9Router/LiteLLM-style" service.
---

# AI Gateway — Build Spec

A single HTTP service that **looks like OpenAI and Anthropic to clients**, and routes each request to
one of many upstream providers. Clients (SDKs, Claude Code, Cursor, scripts) only change `base_url`
and `api_key`.

This spec is derived from the 7Server implementation (`server/src/modules/ai-gateway/`) but is written
so it can be built in any language (Node, Go, Python, Rust, PHP…). Follow the **MUST** rules exactly;
everything else is a recommendation.

---

## 1. Architecture

```text
 client (OpenAI SDK / Anthropic SDK / Claude Code / curl)
        │  Authorization: Bearer gw-sk-…   or   x-api-key: gw-sk-…
        ▼
 ┌──────────────────────────── GATEWAY ────────────────────────────┐
 │ 1. Network guard   (optional: allowlist IPs)                    │
 │ 2. Auth            virtual key → key record (hash lookup)       │
 │ 3. Route resolve   model string → [target, target, …]           │
 │ 4. Policy          key.allowedProviders, cooldown ordering      │
 │ 5. Dispatch loop   for each target: adapter.call()              │
 │        ├─ translate request  (client format → upstream format)  │
 │        ├─ get credential     (refresh if needed, single-flight) │
 │        ├─ send, retry once on 401 after forced refresh          │
 │        └─ translate response (upstream → client format, SSE)   │
 │ 6. Account         usage log + per-key counters                 │
 └─────────────────────────────────────────────────────────────────┘
        ▼
 upstream providers (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Ollama, …)
```

Two separate route groups:

| Group | Auth | Purpose |
|---|---|---|
| **Proxy** (`/v1/...`) | Virtual API key | What clients call |
| **Management** (`/admin/...` or `/api/ai-gateway/...`) | Your app's admin session | Keys, providers, combos, logs |

They MUST NOT share auth. A virtual key never grants management access.

---

## 2. Proxy endpoints (public contract)

Implement these exact paths. Also accept the variants without `/v1` and the doubled `/v1/v1` (clients
misconfigure `base_url` often).

| Method | Path | Wire format |
|---|---|---|
| `POST` | `/v1/chat/completions` | OpenAI Chat Completions (JSON or SSE) |
| `POST` | `/v1/messages` | Anthropic Messages (JSON or SSE) |
| `POST` | `/v1/messages/count_tokens` | Anthropic token count (passthrough) |
| `GET`  | `/v1/models` | OpenAI model list `{ object:"list", data:[{id, object:"model", owned_by}] }` |
| `GET`  | `/health` | `{ status:"ok" }`, no auth |

### 2.1 Authentication

- Read the key from `Authorization: Bearer <key>`; else from `x-api-key: <key>` (Anthropic SDKs use this).
- Missing/invalid/disabled → **401** in the *caller's* format:
  - OpenAI: `{ "error": { "message", "type": "invalid_request_error", "code": "invalid_api_key" } }`
  - Anthropic: `{ "type": "error", "error": { "type": "authentication_error", "message" } }`

### 2.2 Error shape rule

Every error MUST come back in the format of the endpoint that was called, so SDKs can parse it.
When the upstream already speaks the caller's format (Anthropic → `/v1/messages`), pass the upstream
status and body through unchanged.

---

## 3. Data model

Storage can be SQLite, Postgres, a JSON file, or KV. Shapes:

```ts
VirtualKey {
  id: uuid
  name: string
  keyHash: hex          // sha256(secret). The secret itself is NEVER stored.
  keyPrefix: string     // "gw-sk-...a1b2" for display
  enabled: bool
  allowedProviders?: ProviderId[]   // null = all
  rateLimitPerMin?: int
  createdAt, lastUsedAt?: timestamp
  totalRequests, totalInputTokens, totalOutputTokens: int
}

ProviderConfig {                    // one per API-key provider
  enabled: bool
  apiKey?: string                   // encrypted at rest, masked in every API response
  baseUrl?: string
  defaultModel?: string
  connected?: bool, verifiedAt?, latencyMs?, error?
}

Account {                           // optional: OAuth-logged-in accounts (section 9)
  provider: ProviderId
  secret: encrypted JSON { accessToken, refreshToken?, expiresAt?, email?, ... }
  refreshedAt?, lastError?
}

GatewayConfig {
  providers: map<ProviderId, ProviderConfig>
  defaultProvider, defaultModel
  combos: map<name, string[]>       // "fast" -> ["cc/claude-sonnet-5", "cx/gpt-6-sol"]
}

UsageLog {
  id, timestamp, keyId, keyName, provider, model,
  inputTokens, outputTokens, durationMs,
  status: "success"|"error", statusCode, error?, streaming: bool, ip?
}
```

### 3.1 Virtual key rules (MUST)

1. Generate as `prefix + hex(random 24 bytes)`, e.g. `gw-sk-<48 hex>`. Use a CSPRNG.
2. Store only `sha256(secret)`. A 192-bit random secret does not need salt or bcrypt, and a plain hash
   gives O(1) lookup per request.
3. Return the full secret **once**, in the create response. Never again (list endpoints strip both
   `key` and `keyHash`).
4. Compare hashes with a constant-time compare.
5. Disabled keys fail auth exactly like unknown keys.

---

## 4. Model routing

The `model` field in the request body is the routing key. Resolve it in this order:

| Model string | Meaning | Example |
|---|---|---|
| `auto/<combo>` | Fallback chain from `config.combos[combo]` | `auto/fast-code` |
| `<alias>/<model>` | Specific provider + upstream model | `oa/gpt-4o`, `an/claude-sonnet-5`, `ds/deepseek-chat` |
| plain name | Heuristic / default provider | `gpt-4o` → openai, `deepseek-*` → deepseek, `llama*`/`qwen*`/`mistral*` → ollama if enabled, else `defaultProvider` |

Pick short aliases (2 letters) and keep them stable. Clients hard-code them.

```text
resolve(model):
  if model starts with "auto/":
      chain = config.combos[name]  or  404 "Unknown combo"
      return chain.map(resolveAlias)
  if model contains "/" and prefix is a known alias:
      return [ {provider: ALIAS[prefix], model: rest} ]
  return [ heuristic(model) ]
```

`GET /v1/models` returns every model of every **connected** provider in `alias/model` form, so clients
can show a picker. Fetch live catalogs where the provider has one; fall back to a seed list on error.

---

## 5. Dispatch loop with fallback (core algorithm)

```text
handle(req):
  key = authenticate(req)                         or 401
  targets = resolve(req.body.model)               or 404/400
  validate body (messages non-empty, etc.)        or 400
  targets = targets.filter(t => key.allows(t.provider))
  if empty: 403 "key not allowed for provider X"

  # cooling-down providers go last, not removed
  ordered = targets.notCooling() + targets.cooling()

  tried = []
  for t in ordered:
    try:
      out = adapter[t.provider].call(req, res, t.model)   # writes the response itself
      record(key, t, out, tried)                           # success log
      return
    except UpstreamError as e:
      tried.append(f"{t} ({e.status})")
      if res.headersSent: break        # MUST: a started stream can't be replayed elsewhere
      if not isCombo: break            # single target: no fallback
      if not retryable(e): break
  logError(key, tried, lastErr)
  if not res.headersSent: respond(lastErr.status or 502, "All targets failed: …")
  else: end the stream
```

**Retryable** = `429`, `401`, `403`, `503`, any `5xx`, network error. **Not retryable** = `400`, `404`,
`413`, `422` (the request itself is bad; another provider would reject it too).

### 5.1 Cooldown

- On upstream **429**, mark the provider/account cooling until the reset time:
  `Retry-After` header (seconds) → body `resets_at` (epoch s) → body `resets_in_seconds` → default **5 min**.
- Cooldown is in-memory (`map<provider, untilMs>`); losing it on restart is fine.
- Cooling targets are tried **last**, not skipped. If everything is cooling, still try.

### 5.2 Client disconnect

Create an abort signal per request. When the client connection closes **before** the response
finished, abort the upstream fetch, so you don't burn quota on an abandoned stream.

> Pitfall (Node/Express): `req.on('close')` fires as soon as the body is read. Listen on the
> **response** `close` and check `!res.writableFinished`.

---

## 6. Provider adapters

One adapter per provider family. Interface:

```ts
interface Adapter {
  call(req, res, upstreamModel, signal): Promise<{ inTok, outTok, status }>
  // throws UpstreamError(status, message) BEFORE writing anything if upstream fails
  verify(apiKey, baseUrl): Promise<{ valid, latencyMs?, models?, error? }>
  models?(): Promise<string[]>
}
```

| Upstream family | Request translation | Response translation |
|---|---|---|
| OpenAI-compatible (OpenAI, DeepSeek, OpenRouter, Ollama `/v1`, Groq, Copilot) | none: forward body, swap auth and `model` | none: pipe through, rewrite `model` to the public name |
| Anthropic Messages | OpenAI → Messages (6.1) | Messages → OpenAI (6.2) |
| Gemini | OpenAI → `contents`/`systemInstruction`/`functionDeclarations` | Gemini → OpenAI |
| OpenAI Responses API | OpenAI → `input[]` items | Responses SSE → OpenAI chunks |

**Fast path:** if the client's format equals the upstream's format (Anthropic SDK → Anthropic, OpenAI
SDK → OpenAI-compatible), forward the body **untouched** and pipe the bytes back. Only change auth
headers. That keeps every feature (tools, images, thinking, prompt caching, betas) working for free.
Parse a copy of the stream only to read token usage.

### 6.1 OpenAI → Anthropic request

- `system`/`developer` messages → join into top-level `system`.
- `role:"tool"` message → user turn with `{type:"tool_result", tool_use_id, content}`.
- assistant `tool_calls[]` → `{type:"tool_use", id, name, input: JSON.parse(arguments)}` (on parse
  error use `{}`).
- **Merge same-role neighbours**, and if the first turn is `assistant`, prepend a user turn. Anthropic
  and Gemini require strictly alternating turns that start with `user`.
- `max_tokens` is **required** by Anthropic: `max_tokens ?? max_completion_tokens ?? 8192`.
- `tools[].function` → `{name, description, input_schema: parameters ?? {type:"object",properties:{}}}`.
- `tool_choice`: `"required"` → `{type:"any"}`; `{function:{name}}` → `{type:"tool", name}`;
  `"none"` → drop `tools`.
- `stop` → `stop_sequences` (always an array). Copy `temperature`, `top_p` if present.

### 6.2 Anthropic → OpenAI response

Non-stream: text blocks concatenated → `message.content`; `tool_use` blocks → `tool_calls`
(`arguments = JSON.stringify(input)`). `stop_reason`: `tool_use`→`tool_calls`, `max_tokens`→`length`,
else `stop`. Usage: `input_tokens`→`prompt_tokens`, `output_tokens`→`completion_tokens`.

Stream (SSE event → OpenAI chunk delta):

| Anthropic event | OpenAI chunk |
|---|---|
| `message_start` | record `usage.input_tokens` |
| `content_block_delta` / `text_delta` | `{delta:{content:text}}` |
| `content_block_start` / `tool_use` | `{delta:{tool_calls:[{index:i, id, type:"function", function:{name, arguments:""}}]}}` |
| `content_block_delta` / `input_json_delta` | `{delta:{tool_calls:[{index:i, function:{arguments:partial_json}}]}}` |
| `message_delta` | record `output_tokens`, `finish_reason` |
| `error` | throw `UpstreamError(502)` |

Tool-call `index` MUST be renumbered 0, 1, 2… **per tool call**. Anthropic's block index also counts
text blocks.

### 6.3 SSE output rules (OpenAI side)

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no          # stops nginx from buffering the stream
```

- First chunk: `{delta:{role:"assistant", content:""}}`.
- Each chunk: `data: {"id","object":"chat.completion.chunk","created","model":<public name>,"choices":[{"index":0,"delta":…,"finish_reason":null}]}\n\n`
- Last chunk carries `finish_reason`; then `data: [DONE]\n\n`.
- If any tool call was emitted, `finish_reason` = `tool_calls`.
- SSE parser: split on newlines, keep the partial trailing line in a buffer, handle `data:` lines only,
  ignore keep-alives / unparsable lines.

---

## 7. Credentials

### 7.1 API-key providers

- Encrypt `apiKey` at rest (AES-256-GCM with a key from env/secret file). Never return it, return
  `"••••" + last4`.
- `POST /providers/:id/connect` MUST run `verify()` first (cheap call: `GET /models` or a 1-token
  completion) and refuse to save on failure. Store `latencyMs`, `verifiedAt`.

### 7.2 Token refresh (OAuth accounts)

```text
getCredential(provider):
  cred = decrypt(store[provider])
  if not expiresSoon(cred): return cred           # e.g. < 5 min left
  if inflight[provider]: return await inflight[provider]
  inflight[provider] = refresh(cred)
      .then(save encrypted, clear lastError)
      .catch(save lastError, rethrow)
      .finally(delete inflight[provider])
  return await inflight[provider]
```

**Single-flight is mandatory.** Some providers rotate refresh tokens on every use. Two parallel
refreshes revoke the session.

On upstream **401**: force-expire the stored token, call `getCredential` again (refreshes), retry the
request **once**. A second 401 is a real error.

---

## 8. Accounting

After every request (success or failure):

- Increment the key's `totalRequests`, `totalInputTokens`, `totalOutputTokens`, set `lastUsedAt`.
- Append a `UsageLog`. For combos write `model = "auto/<combo> → <provider>/<model>"` and put
  `"fell back after: …"` in `error` even on success, so admins can see fallbacks happening.
- Cap the log table (e.g. keep the newest 10k, return max 500 per page).
- Token counts come from upstream usage fields. Never estimate in place of a real number. If upstream
  sends none, log 0.

---

## 9. Optional: subscription accounts (OAuth login)

Instead of API keys, an admin can log in with an existing account on providers that offer OAuth:

| Flow | When | Steps |
|---|---|---|
| **Authorization Code + PKCE** | Provider has a browser redirect | `start` → return `authUrl` (with `code_challenge` S256, `state=sessionId`) → user logs in → `complete` with the callback URL/code → exchange for tokens |
| **Device Code** | CLI-style providers (e.g. GitHub) | `start` → return `userCode`+`verificationUri` → client polls `poll` every `interval` s → tokens |

- Pending login sessions: in-memory map with a 15 min TTL is enough for a single node.
- If the redirect URI is `http://localhost:<port>/callback`, a tiny one-shot listener on that port can
  catch the callback automatically. Always also allow pasting the callback URL by hand (remote servers
  can't receive localhost redirects).
- Optional quota view: poll the provider's usage endpoint, cache 60 s, show `usedPercent` per window,
  and flag `exhausted` at 100%.

> **Compliance warning.** Use only OAuth clients you are allowed to use, under each provider's terms.
> Many consumer subscriptions (chat apps, IDE assistants) forbid access from third-party tools, and
> reusing another product's client ID or pretending to be its client can get the account suspended.
> Paid API keys are the safe default. Build this part only where the provider permits it.

---

## 10. Management API

All behind the host app's admin auth + a permission such as `gateway.manage`.

```text
GET    /ai-gateway/keys                       → { keys: PublicKey[] }
POST   /ai-gateway/keys        {name, allowedProviders?} → { key: PublicKey & {key: secret} }  # once
PATCH  /ai-gateway/keys/:id/toggle {enabled?}
DELETE /ai-gateway/keys/:id

GET    /ai-gateway/config                     → masked config
POST   /ai-gateway/config                     → partial update (merge, never blank secrets)
POST   /ai-gateway/providers/:id/verify  {apiKey, baseUrl}
POST   /ai-gateway/providers/:id/connect {apiKey, baseUrl}   # verify, then save
POST   /ai-gateway/providers/:id/disconnect

GET    /ai-gateway/combos
PUT    /ai-gateway/combos/:name  {targets: string[]}
DELETE /ai-gateway/combos/:name

GET    /ai-gateway/usage?limit=100            # clamp 1..500
DELETE /ai-gateway/usage
GET    /ai-gateway/stats                      → totals, active keys, connected providers

# optional (section 9)
GET    /ai-gateway/accounts
POST   /ai-gateway/accounts/:provider/start | complete | poll | test
DELETE /ai-gateway/accounts/:provider
GET    /ai-gateway/accounts/usage?fresh=1
```

Validation for combos: name `^[a-z0-9][a-z0-9._-]{0,39}$`; 1–8 targets; every target MUST resolve to
a known `alias/model`. Reject with the list of bad targets.

---

## 11. Security checklist (MUST)

- [ ] Virtual keys hashed, shown once, constant-time compare.
- [ ] Provider secrets and OAuth tokens encrypted at rest; masked in all responses and logs.
- [ ] Proxy routes and management routes use different auth.
- [ ] If the gateway is internal-only, enforce an IP allowlist (loopback, RFC1918, `fc00::/7`, plus
      registered hosts, resolved and cached ~60 s). Read client IP from the socket; trust
      `X-Forwarded-For` **only** when the proxy in front is explicitly configured as trusted.
      Inside Docker, the bridge gateway (172.17.0.1) can carry internet traffic, so do not treat
      172.16/12 as internal there unless the operator opts in.
- [ ] Body size limit on proxy routes (e.g. 20 MB for images).
- [ ] Per-key rate limit if `rateLimitPerMin` is set (fixed window counter in memory is fine).
- [ ] Never log request/response bodies by default (they contain user prompts and code).
- [ ] Upstream error text truncated (~400 chars) before logging or returning.

---

## 12. Tests to write (minimum)

1. Key: create → auth works with Bearer and `x-api-key`; disabled key → 401; list never leaks secret/hash.
2. Routing: `alias/model`, `auto/combo`, unknown combo → 404, disallowed provider → 403.
3. Fallback: target 1 returns 429 → target 2 answers, log shows "fell back after"; target 1 returns
   400 → no fallback; failure **after** stream started → no fallback.
4. Cooldown: after 429, that provider is ordered last until reset.
5. Translation: OpenAI messages with system + tool calls + tool results → valid alternating Anthropic
   body; streamed tool-call deltas renumbered from 0; `finish_reason = tool_calls`.
6. Refresh: 10 concurrent requests with an expired token → exactly 1 refresh call.
7. 401 from upstream → one forced refresh + one retry.
8. IP guard: public IP → 403; loopback/private → allowed; spoofed `X-Forwarded-For` ignored without
   trusted proxy.

---

## 13. Build order

1. `/health`, `/v1/models`, `/v1/chat/completions` passthrough to one OpenAI-compatible provider.
2. Virtual keys + management CRUD + usage logging.
3. Streaming passthrough (SSE pipe + usage sniffing + abort on disconnect).
4. More OpenAI-compatible providers via `baseUrl` (DeepSeek, OpenRouter, Ollama…) and alias routing.
5. Anthropic adapter + `/v1/messages` passthrough + both translation directions.
6. Combos, fallback loop, cooldown.
7. Encryption at rest, IP guard, rate limit.
8. (Optional) OAuth accounts, quota view.
9. Dashboard UI: keys, providers, combos, usage table, stats.

## 14. Client usage (put this in the README of whatever you build)

```bash
# OpenAI SDK / any OpenAI-compatible tool
OPENAI_BASE_URL=http://gateway:3000/api/ai/v1
OPENAI_API_KEY=gw-sk-…

# Anthropic SDK / Claude Code
ANTHROPIC_BASE_URL=http://gateway:3000/api/ai
ANTHROPIC_API_KEY=gw-sk-…

curl $OPENAI_BASE_URL/chat/completions -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{"model":"auto/fast-code","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```
