# 05 — HTTP API catalog

[← MCP & tools](04-mcp-and-tools.md) · [DeepWiki home](README.md) · [Frontend apps →](06-frontend-apps.md)

All paths below are served by the **Python worker** under prefix **`/api/v1`** unless noted. The orchestration service proxies **`/api/*`** as-is to the worker.

## Worker-only (no `/api/v1` prefix)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/invoke` | LangGraph chat invoke (orchestration exposes `POST /v1/chat` → this) |
| `GET` | `/health` | Liveness |
| `GET` | `/ready` | Readiness (graph loaded) |

## Catalog

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/catalog/products` | Product list (JSON fixtures + normalization) |
| `GET` | `/api/v1/catalog/media/{filename}` | Static media for catalog assets |

## Retail — customers & store metadata

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/retail/customers` | Customer rows (Postgres when configured) |
| `GET` | `/api/v1/retail/associates` | Associates listing |
| `GET` | `/api/v1/retail/stylists` | Stylists listing |
| `GET` | `/api/v1/retail/stores` | Stores |
| `GET` | `/api/v1/retail/associate/capabilities` | Associate capability metadata |

## Retail — associate LLM-assisted endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/retail/associate/quick-notes` | Quick notes for a customer |
| `POST` | `/api/v1/retail/associate/initial-suggestions` | Opening prompt chips |
| `POST` | `/api/v1/retail/associate/thread-suggestions` | Thread-aware prompt chips |

## Voice

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/voice/transcript-to-intent` | Refine raw STT text to a clear user message (`voice_intent_api.py`) |

## Fitting room, notifications, tasks

**Module:** `digital_stylist/fitting_room_api.py` (attached from `stylist_api` router).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/notifications` | Notification events |
| `GET` | `/api/v1/notifications/stream` | SSE / long-poll style stream (see implementation) |
| `POST` | `/api/v1/fitting-room/reservations` | Reserve fitting room |
| `POST` | `/api/v1/tasks/claim` | Claim associate task |
| `POST` | `/api/v1/tasks/complete` | Complete associate task |

## Implementation notes

- Router factory: **`build_stylist_router()`** in `digital_stylist/stylist_api.py`.
- Postgres routes use session GUCs / tenant helpers (`_session_set_tenant`, `_session_set_internal_api`).
- Catalog list is read from **Postgres** (`stylist.catalog_products`) per request.

Next: [06 — Frontend apps](06-frontend-apps.md).
