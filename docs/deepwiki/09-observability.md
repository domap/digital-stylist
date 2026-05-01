# 09 — Observability

[← Configuration](08-configuration.md) · [DeepWiki home](README.md) · [Operations →](10-operations-and-troubleshooting.md)

## Correlation model

| Header | Scope | Set by |
|--------|--------|--------|
| **`X-Request-Id`** | One HTTP request | Client (UUID) or orchestration if absent |
| **`X-Trace-Id`** | Browser tab / session | Clienteling & Connect `sessionStorage` + `mergeObservabilityHeaders` |

The **worker** binds these with **`obs_bind_partial`** (`digital_stylist/observability/context.py`) for each request. **`obs_snapshot()`** returns the non-empty correlation dict for the active context; **`configure_logging`** merges that snapshot into every log line for the **`digital_stylist`** package tree.

## Python logging

- **`configure_logging(StylistSettings)`** (`observability/logging_config.py`) is **idempotent** and attaches **one** handler to the **`digital_stylist`** logger only (**`propagate=False`**, handlers cleared on first call — avoids duplicating lines and avoids fighting Uvicorn’s root access logger).
- **`STYLIST_LOG_FORMAT=json`**: one JSON object per line on stderr — suitable for Loki, CloudWatch, Datadog, etc. Each line includes **`ts`**, **`level`**, **`logger`**, **`message`**, optional **`exception`**, fields from **`obs_snapshot()`** (e.g. **`request_id`**, **`trace_id`**, **`thread_id`**), plus any **whitelisted `LogRecord` extras** set by callers (e.g. **`event`**, **`agent`**, **`duration_ms`**, **`path`**, **`method`**, **`status_code`**, MCP client/tool fields, **`error_type`** — see `_LOG_EXTRA_KEYS` in `logging_config.py`).
- **`STYLIST_LOG_FORMAT=text`** (default): classic text line; if **`obs_snapshot()`** is non-empty, **`[key=value …]`** is appended (sorted keys).
- **Key events:** `http_request`, `graph_invoke_*`, `agent_run_*`, `mcp_client_call_*`, `mcp_tool_*`, retail errors as logged by each module.

## Node orchestration

**`orchestration/src/observability.mjs`** — when `STYLIST_LOG_FORMAT=json`, emits structured lines for **`proxy_worker_*`** and **`chat_proxy_*`**.

**CORS:** `Access-Control-Expose-Headers` includes `X-Request-Id` and `X-Trace-Id` so browser clients can read them if needed.

## Optional frontend debug

**Clienteling:** `VITE_OBSERVABILITY=1` logs merged headers in dev (`apps/clienteling/src/lib/observability.ts`).

Next: [10 — Operations & troubleshooting](10-operations-and-troubleshooting.md).
