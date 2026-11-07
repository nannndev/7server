# Environment Variables & Configuration

7Server is configured using standard environment variables or a local `.env` file located in `server/.env`.

---

## Core Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5001` | The HTTP port the backend server listens on. |
| `DASHBOARD_PASSWORD` | *(Auto-generated)* | Initial admin password created on first start. |
| `TRUST_PROXY` | `127.0.0.1,::1` | Comma-separated list of trusted reverse proxy IPs. |
| `DATA_DIR` | `./data` | Directory where SQLite database (`7server.db`) and secrets reside. |

---

## AI Gateway Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `ANTHROPIC_API_KEY` | *(None)* | Optional Anthropic API key fallback. |
| `OPENAI_API_KEY` | *(None)* | Optional OpenAI API key fallback. |
| `GEMINI_API_KEY` | *(None)* | Optional Google Gemini API key fallback. |

