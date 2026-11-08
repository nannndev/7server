# Universal AI Gateway

7Server includes an internal **AI Gateway** compatible with standard OpenAI (`/v1/chat/completions`) and Anthropic (`/v1/messages`) protocols.

<img class="only-light" src="/screenshots/ai-gateway-light.png" alt="Universal AI Gateway Providers">
<img class="only-dark" src="/screenshots/ai-gateway-dark.png" alt="Universal AI Gateway Providers">

---

## Supported Providers (27 Built-In)

| Category | Supported Providers |
| :--- | :--- |
| **8 OAuth Subscriptions** *(Zero extra API bill)* | **Claude Pro/Team/Max** (`cc`), **ChatGPT Plus/Pro/Codex** (`cx`), **GitHub Copilot** (`gh`), **Gemini CLI** (`gc`), **Kimi Code** (`km`), **Kilo Code** (`kc`), **Muse / Koda CLI** (`ms`), **Nous Portal** (`ns`) |
| **19 API-Key Providers** *(OpenAI & Anthropic compatible)* | **OpenAI** (`oa`), **Anthropic** (`an`), **Google Gemini** (`gm`), **OpenRouter** (`or`), **GLM / Z.AI** (`glm`), **MiniMax** (`mm`), **DeepSeek** (`ds`), **Groq** (`gq`), **Mistral** (`mi`), **xAI Grok** (`xa`), **Together AI** (`tg`), **Fireworks** (`fw`), **Cerebras** (`cb`), **Cohere** (`co`), **NVIDIA NIM** (`nv`), **Nebius** (`nb`), **SiliconFlow** (`sf`), **Hyperbolic** (`hb`), **DeepInfra** (`di`) |

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

