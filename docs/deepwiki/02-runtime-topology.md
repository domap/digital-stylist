# 02 — Runtime topology

[← System overview](01-system-overview.md) · [DeepWiki home](README.md) · [LangGraph & agents →](03-langgraph-and-agents.md)

## Default ports

| Process | Port | Entry |
|---------|------|--------|
| Orchestration (Express) | **3000** | `orchestration/src/server.mjs` (`npm run start`) |
| Python worker (FastAPI) | **8787** | `digital-stylist-worker` → `digital_stylist/worker_app.py` |
| Clienteling (Vite) | **5173** | `npm run dev:clienteling` |
| Connect (Vite) | **5174** | `npm run dev:connect` |
| Postgres (Docker host) | **5433** | `docker-compose.yml` → `postgres` service |
| Combined MCP HTTP (optional) | **8800** | `digital-stylist-mcp-service` when using `STYLIST_MCP_REMOTE_URL` |

## Request paths (happy path)

### Chat / LangGraph

1. Browser → `POST /v1/chat` (relative URL; Vite proxies to **3000**).
2. Orchestration → `POST {STYLIST_WORKER_URL}/v1/invoke` with same JSON body.
3. Worker → `graph.invoke(...)` with `thread_id` in LangGraph `configurable`.

Body shape: `message`, optional `thread_id`, optional `context_metadata`, optional `merge_session_defaults` (see `InvokeBody` in `worker_app.py`).

### Retail / catalog / voice / fitting

1. Browser → `GET|POST /api/v1/...` (proxied to **3000**, then same path to **8787**).
2. Worker serves routes from `build_stylist_router()` in `stylist_api.py` (prefix `/api/v1`).

## Docker Compose

`docker-compose.yml` defines **worker**, **orchestration**, **postgres**, and an optional **catalog-feed** profile. Production-style: worker should not be horizontally scaled without a **shared LangGraph checkpointer** (default is in-process `MemorySaver`).

## Environment bridges

- **`STYLIST_WORKER_URL`** — Orchestration uses this to reach the worker (default `http://127.0.0.1:8787` in dev).
- **`STYLIST_CORS_ORIGINS`** — Browser origins allowed to call orchestration directly (not required when using Vite proxy same-origin).
- **`STYLIST_STOREFRONT_CORS_ORIGINS`** — Worker CORS when frontends call worker directly (unusual in dev).

Next: [03 — LangGraph & agents](03-langgraph-and-agents.md).
