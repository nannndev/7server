# Universal AI Gateway

7Server includes an internal **AI Gateway** compatible with standard OpenAI (`/v1/chat/completions`) and Anthropic (`/v1/messages`) protocols.

<img class="only-light" src="/screenshots/ai-gateway-light.png" alt="Universal AI Gateway Providers">
<img class="only-dark" src="/screenshots/ai-gateway-dark.png" alt="Universal AI Gateway Providers">

---

## Log In with Existing Subscriptions

Instead of paying for expensive per-token API credits, you can log in directly to your existing provider subscriptions:

- **Anthropic Claude Pro / Team / Max** (OAuth PKCE)
- **ChatGPT Plus / Team / Codex** (OAuth)
- **GitHub Copilot** (Device Code Flow)
- **Google Gemini** (OAuth / API Key)

All access tokens and refresh tokens are securely encrypted in 7Server's SQLite database and refreshed automatically.

---

## Failover & Fallback Chains (Combos)

Create resilient model aliases with automatic fallback when rate limits occur:

```text
auto/fast-code -> claude-3-5-sonnet -> gpt-4o -> deepseek-chat
```

If the primary model returns a `429 Too Many Requests` or upstream outage, 7Server immediately fails over to the next candidate in the chain in sub-second time.

