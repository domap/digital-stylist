# 04 — MCP & tools

[← LangGraph & agents](03-langgraph-and-agents.md) · [DeepWiki home](README.md) · [HTTP API catalog →](05-http-api-catalog.md)

## Why MCP exists here

MCP separates **durable / privileged operations** (Postgres writes, queue semantics) from **LLM reasoning**. Agents use **`ctx.mcp.invoke(server, tool, arguments)`** via **`McpRuntime`** instead of embedding SQL or secrets in prompts.

## Two transport modes

**Configured in:** `digital_stylist/mcp/runtime.py` → `build_mcp_connections(settings)`.

1. **Stdio (default)** — One Python subprocess per logical server:
   - `digital_stylist.domains.customer.mcp_server`
   - `digital_stylist.domains.appointment.mcp_server`
   - `digital_stylist.domains.email.mcp_server`
   - `digital_stylist.domains.associate.mcp_server`  
   Interpreter: `STYLIST_MCP_PYTHON` or `sys.executable`.

2. **Remote streamable HTTP** — When **`STYLIST_MCP_REMOTE_URL`** is set, a **single** MCP endpoint is used; domain names are mapped to the remote server name **`stylist`** (see `McpRuntime` constructor `domain_servers`).

## Combined MCP HTTP service

**CLI:** `digital-stylist-mcp-service` → `digital_stylist/mcp_servers/main.py`.

**Build:** `digital_stylist/mcp_servers/build_mcp.py` registers tools from:

- `mcp_servers/handlers/customer.py`
- `mcp_servers/handlers/appointment.py`
- `mcp_servers/handlers/email.py`
- `mcp_servers/handlers/associate.py`

Each handler wraps tool bodies with **`mcp_tool_span`** (`mcp_servers/observability.py`) for structured **`mcp_tool_*`** logs.

## Client-side invocation

**`McpRuntime.invoke`** (`mcp/runtime.py`):

- Resolves LangChain tools via **`MultiServerMCPClient`** (langchain-mcp-adapters).
- Caches tools per server name.
- Logs **`mcp_client_call_*`** with duration and errors.

**Toggle:** `STYLIST_MCP_ENABLED=false` disables MCP entirely (`build_mcp_runtime` returns `None`).

## Per-domain stdio entrypoints

Thin wrappers in `digital_stylist/domains/*/mcp_server.py` call `build_*_stdio_mcp()` from `build_mcp.py` — useful for debugging one domain in isolation.

Next: [05 — HTTP API catalog](05-http-api-catalog.md).
