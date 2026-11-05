# CLI & IDE Integration

Connect your favorite developer tools, coding agents, and terminal CLIs to your self-hosted 7Server AI Gateway in seconds.

---

## Claude Code CLI

Point Claude Code to 7Server by exporting the base URL and virtual key:

```bash
# Add to ~/.zshrc or ~/.bashrc:
export ANTHROPIC_BASE_URL="http://localhost:5001"
export ANTHROPIC_API_KEY="7s-sk-live-your-virtual-key"

# Launch Claude Code
claude
```

7Server transparently translates requests to your logged-in Claude subscription account with full support for prompt caching, tool calls, and streaming.

---

## Cursor, Windsurf & Cline

In your editor AI settings:
1. Select **OpenAI Compatible**.
2. **Base URL**: `http://localhost:5001/v1`
3. **API Key**: `7s-sk-live-your-virtual-key`
4. **Model Name**: e.g. `cc/claude-3-7-sonnet` or `cx/gpt-4o`.

