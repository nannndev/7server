# Universal AI Gateway

7Server includes an internal **AI Gateway** compatible with standard OpenAI (`/v1/chat/completions`) and Anthropic (`/v1/messages`) protocols.

<img class="only-light" src="/screenshots/ai-gateway-light.png" alt="Universal AI Gateway Providers">
<img class="only-dark" src="/screenshots/ai-gateway-dark.png" alt="Universal AI Gateway Providers">

---

## Log In with Existing Subscriptions (8 OAuth Providers)

Instead of paying for expensive per-token API credits, you can log in directly to your existing provider subscriptions:

- **Anthropic Claude Pro / Team / Max** (`claude` — OAuth PKCE)
- **ChatGPT Plus / Pro / Team / Codex** (`codex` — OAuth)
- **GitHub Copilot** (`copilot` — Device Code Flow)
- **Google Gemini CLI** (`gemini-cli` — Google OAuth)
- **Kimi Code** (`kimi` — Device Code Flow)
- **Kilo Code** (`kilocode` — Device Code Flow + Free Models)
- **Muse (Koda CLI)** (`muse` — GitHub OAuth)
- **Nous Portal** (`nous` — OAuth / API Key)

Alongside **19 API-Key & OpenAI-Compatible Providers** (`openai`, `anthropic`, `gemini`, `openrouter`, `glm`, `minimax`, `deepseek`, `groq`, `mistral`, `xai`, `together`, `fireworks`, `cerebras`, `cohere`, `nvidia`, `nebius`, `siliconflow`, `hyperbolic`, and `deepinfra`).

All access tokens, refresh tokens, and API keys are securely stored in 7Server's database and refreshed automatically.

---

## Multi-Account Rotation per Provider

Just like enterprise AI routers (e.g. 9Router), 7Server supports **multiple accounts per provider** for both OAuth subscriptions and API-key providers:

1. **Add Unlimited Accounts per Provider**: Connect multiple Claude Pro/Max accounts, ChatGPT Plus accounts, GitHub Copilot seats, or multiple API keys under the same provider using **`+ Add Account`** / **`+ Add Another Key`**.
2. **Ordered Priority Rotation (`#1 → #2 → #3`)**: Reorder accounts anytime using the **`↑` / `↓`** priority controls. Requests always start at `#1` and follow your exact sequence.
3. **Automatic Rate-Limit (`429`) Cooldown & Instant Rotation**: When account `#1` hits a `429 Too Many Requests` or quota window limit, 7Server places that specific account on temporary cooldown and **immediately rotates to account `#2`** within the same request—before even falling back to secondary providers.
4. **Per-Account Live Quota Bars**: View 5-hour session windows, weekly reset timers, and credit balances individually for every connected account.

---

## Failover & Fallback Chains (Combos)

Create resilient model aliases with automatic cross-provider fallback when all accounts of a primary provider are exhausted:

```text
auto/fast-code -> cc/claude-sonnet-4-5 -> cx/gpt-5-codex -> kr/deepseek-chat
```

If every account in the primary provider returns `429 Too Many Requests` or an upstream outage occurs, 7Server immediately fails over to the next candidate in the combo chain in sub-second time.

