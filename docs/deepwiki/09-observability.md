# 09 — Observability

[← Configuration](08-configuration.md) · [DeepWiki home](README.md) · [Operations →](10-operations-and-troubleshooting.md)

## Correlation model

| Header | Scope | Set by |
|--------|--------|--------|
| **`X-Request-Id`** | One HTTP request | Client (UUID) or orchestration if absent |
| **`X-Trace-Id`** | Browser tab / session | Clienteling & Connect `sessionStorage` + `mergeObservabilityHeaders` |

The **worker** binds these into **context vars** (`digital_stylist/observability/context.py`) for every request so **`digital_stylist.*` log lines** include the same IDs without threading parameters through every function.

## Python logging

- **`configure_logging(StylistSettings)`** (`observability/logging_config.py`) attaches one handler to the **`digital_stylist`** logger (not root — avoids fighting Uvicorn’s default access logs).
- **`STYLIST_LOG_FORMAT=json`**: one JSON object per line on stderr — suitable for Loki, CloudWatch, Datadog, etc.
- **Key events:** `http_request`, `graph_invoke_*`, `agent_run_*`, `mcp_client_call_*`, `mcp_tool_*`, retail errors as logged by each module.

## Node orchestration

**`orchestration/src/observability.mjs`** — when `STYLIST_LOG_FORMAT=json`, emits structured lines for **`proxy_worker_*`** and **`chat_proxy_*`**.

**CORS:** `Access-Control-Expose-Headers` includes `X-Request-Id` and `X-Trace-Id` so browser clients can read them if needed.

## Optional frontend debug

**Clienteling:** `VITE_OBSERVABILITY=1` logs merged headers in dev (`apps/clienteling/src/lib/observability.ts`).

Next: [10 — Operations & troubleshooting](10-operations-and-troubleshooting.md).
