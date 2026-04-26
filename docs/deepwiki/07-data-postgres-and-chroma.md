# 07 — Data: Postgres & Chroma

[← Frontend apps](06-frontend-apps.md) · [DeepWiki home](README.md) · [Configuration →](08-configuration.md)

## PostgreSQL

**Purpose:** Retail truth (customers, appointments, associates, fitting-room events, notifications) and MCP repository implementations.

**Connection:** `digital_stylist/infra/postgres/connection.py` — DSN or discrete `STYLIST_PG_*` vars; **`STYLIST_PG_DATASTORE`** can force `memory` for local experiments without Docker.

**Bootstrap & seeds** (console scripts from `pyproject.toml`):

- `digital-stylist-pg-bootstrap`
- `digital-stylist-seed-retail`, `seed-workforce`, `seed-customers`, `seed-sample-stylists`

**Docker:** `docker-compose.yml` publishes Postgres on host **`127.0.0.1:5433`** to avoid clashing with a local Postgres on 5432.

**RLS / tenant:** Handlers set session variables (e.g. tenant id) before queries; MCP tools pass **`customer_user_id`** (or similar) where rows are scoped.

## ChromaDB (vector catalog)

**Purpose:** RAG over product documents for the **catalog** agent.

**Persistence:** `CHROMA_PERSIST_DIR` (see `.env.example`); default collection name from settings (`STYLIST_CHROMA_COLLECTION` / `chroma_collection`).

**Indexing:** `digital-stylist-catalog-feed` CLI and optional **`catalog-feed`** Docker profile feed JSON into Chroma.

## JSON catalog fallback

**`GET /catalog/products`** reads **`stylist.catalog_products`**; bootstrap seed may load **`catalog_feed/.../products.json`** (or `STYLIST_PRODUCTS_JSON`) via ``seed_stylist_data()`` in ``seed_stylist_data.py``. Media requires **`STYLIST_CATALOG_MEDIA_DIR`** when configured.

Next: [08 — Configuration](08-configuration.md).
