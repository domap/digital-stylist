# 10 — Operations & troubleshooting

[← Observability](09-observability.md) · [DeepWiki home](README.md)

## Health checks

| Check | Command / URL |
|-------|----------------|
| Orchestration + worker | `GET http://127.0.0.1:3000/health` |
| Worker only | `GET http://127.0.0.1:8787/health` |
| Worker readiness | `GET http://127.0.0.1:8787/ready` |

## Common failures

### `connection refused` on port 5433

Postgres container not running or Docker daemon stopped. Start with `docker compose up -d postgres` or use **`STYLIST_PG_DATASTORE=memory`** only for experiments that must not touch DB (MCP-backed features may degrade).

### Chat / invoke 502 / 504 from orchestration

Worker down or **`STYLIST_WORKER_URL`** wrong, or graph invoke exceeded **`STYLIST_INVOKE_TIMEOUT_SEC`**. Check worker logs and Uvicorn process.

### 429 / quota / `RESOURCE_EXHAUSTED` in replies

Upstream LLM quota or billing — not a routing bug. Worker may surface `detail` in JSON; Connect/Clienteling error helpers summarize worker bodies when present.

### MCP tools missing / KeyError

`STYLIST_MCP_ENABLED=false`, wrong remote URL, or stdio subprocess failed to start (Python path / venv). Inspect **`digital_stylist.mcp`** and **`digital_stylist.mcp.client`** log lines.

### LangGraph “do not scale replicas”

Default checkpointer is **in-memory** per worker process. Multiple replicas without a shared checkpointer will diverge session state.

## Scaling checklist (production)

1. Single worker replica **or** plug a **shared checkpointer** (Redis/Postgres — not bundled in this repo’s defaults).
2. Set **`STYLIST_BEHIND_PROXY`** when behind TLS termination.
3. Restrict **`STYLIST_CORS_ORIGINS`** and **`STYLIST_STOREFRONT_CORS_ORIGINS`** explicitly.
4. Use **`STYLIST_LOG_FORMAT=json`** and ship stderr to your log platform.
5. Rotate **`STYLIST_PG_*`** credentials; never expose DSN via MCP tools.

---

[← DeepWiki home](README.md)
