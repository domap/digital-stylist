# 08 — Configuration

[← Data](07-data-postgres-and-chroma.md) · [DeepWiki home](README.md) · [Observability →](09-observability.md)

## Single source of truth

**`digital_stylist/config.py`** — class **`StylistSettings`** (Pydantic Settings).

- Loads **`.env`** from the process cwd (and environment overrides).
- Documents every important variable in the **class docstring** — when in doubt, read that file first.

## Groups of variables (mental model)

| Concern | Examples |
|---------|-----------|
| **LLM provider** | `STYLIST_LLM_PROVIDER`, `STYLIST_LLM_API_KEY`, `STYLIST_CHAT_MODEL`, `STYLIST_EMBEDDING_MODEL` |
| **Per-agent models** | `STYLIST_AGENT_MODEL_CUSTOMER`, `…_INTENT`, `…_STYLIST`, etc. |
| **MCP** | `STYLIST_MCP_ENABLED`, `STYLIST_MCP_REMOTE_URL`, `STYLIST_MCP_REMOTE_PATH`, `STYLIST_MCP_PYTHON` |
| **Postgres** | `STYLIST_PG_DATASTORE`, `STYLIST_PG_DSN` or host/db/user/password, `STYLIST_PG_TENANT_ID`, SSL vars |
| **Worker HTTP** | `STYLIST_ENV`, `STYLIST_DEBUG`, `STYLIST_MAX_MESSAGE_CHARS`, `STYLIST_INVOKE_TIMEOUT_SEC`, `STYLIST_BEHIND_PROXY` |
| **Chroma** | `STYLIST_VECTOR_BACKEND`, `CHROMA_PERSIST_DIR`, `STYLIST_CHROMA_COLLECTION` |
| **Logging** | `STYLIST_LOG_FORMAT`, `STYLIST_LOG_LEVEL` |
| **Embeddings throttle (Google)** | `STYLIST_GOOGLE_EMBED_THROTTLE`, batch/pause tunables |

## Orchestration (Node)

Not part of `StylistSettings` — read **`orchestration/src/server.mjs`** header comment:

- `PORT`, `STYLIST_WORKER_URL`, `STYLIST_WORKER_TIMEOUT_MS`, `STYLIST_CORS_ORIGINS`, `NODE_ENV`, `TRUST_PROXY`, `STYLIST_LOG_FORMAT` (for JSON gateway logs).

## Production vs development

- **`STYLIST_ENV=production`**: safer API errors; OpenAPI off unless `STYLIST_DEBUG` / override.
- **Development:** auto Postgres defaults may apply when vars omitted (see `.env.example`); never rely on that in real prod.

Next: [09 — Observability](09-observability.md).
