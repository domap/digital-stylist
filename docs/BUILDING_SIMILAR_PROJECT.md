# Building a similar project

This checklist distills how **digital-stylist** is structured so you can **scaffold a comparable system**: multi-agent **LangGraph**, **FastAPI** worker, **Node** gateway, **MCP** tools, **vector RAG**, and **Postgres**, with **correlated observability**.

For day-to-day agent rules on *this* repo, see **[AGENTS.md](../AGENTS.md)** and **[docs/agents/AGENT.md](agents/AGENT.md)**.

---

## 1. Repository layout (recommended monorepo)

```
python_package/           # Core: graph, domains, contracts, config, worker
  graph.py
  worker_app.py           # FastAPI: lifespan, /v1/invoke, routers
  config.py               # Pydantic Settings — single env surface
  contracts/              # TypedDict state, invoke DTOs, context
  framework/              # Agent base class (e.g. five-block)
  agents/                   # Bundle / composition root
  domains/<name>/         # agent.py, prompts.py, optional mcp_server.py, repository.py
  mcp/                    # Client runtime (stdio + remote HTTP)
  mcp_servers/            # Optional combined HTTP MCP service
  providers/              # Vector store, embeddings factories
  infra/                  # DB connection, migrations, seeds
  observability/          # contextvars + logging formatter
orchestration/            # Express: /v1/chat → worker, /api/* proxy
apps/<ui>/                # Vite + React, proxy to gateway
docs/
  deepwiki/               # Topic-oriented internal wiki
  agents/                 # AGENT / SUBAGENTS / REVIEW playbooks
ARCHITECTURE.md           # One system diagram + component table
```

---

## 2. Core runtime flows

### 2.1 Chat (graph)

1. Gateway **`POST /v1/chat`** → worker **`POST /v1/invoke`** with **`thread_id`** optional.
2. Worker builds **`HumanMessage`**, binds **`obs_bind_partial(request_id=..., trace_id=...)`**, invokes **`graph.invoke`** with timeout.
3. Response JSON: **`assistant_message`** (often last **`AIMessage`**), **`messages`**, **`state`** summary for debugging.

### 2.2 Side APIs

- Same worker serves **`/api/v1/...`** for catalog, retail, voice, etc., proxied unchanged through the gateway.

---

## 3. LangGraph design

- **Single `StateGraph`** module as source of truth for nodes and edges.
- **Intent node** outputs a **routing key** consumed by **`add_conditional_edges`**.
- **Branch-specific subgraphs:** keep **side-effect branches** (email, payments, etc.) as **explicit intent routes** when they change user expectations or compliance, instead of silently chaining after unrelated nodes.
- **Checkpointing:** default in-memory checkpointer is fine for dev; production needs a **shared** checkpointer store if you scale workers horizontally.

---

## 4. Agent framework (five-block pattern)

Implement each node as:

1. **bind** — system / role  
2. **perceive** — state → compact JSON for LLM  
3. **reason** — LLM or rules  
4. **act** — tools (MCP, HTTP)  
5. **synthesize** — partial state update  

Centralize **LLM selection** in a context object (**`llm_for(agent_key)`**) backed by **per-agent model env vars**.

---

## 5. MCP

- Prefer **one client abstraction** (`invoke(server, tool, args)`) used from **`act`** only.
- Support **stdio** for local dev and **streamable HTTP** for combined deployments.
- Keep **tool names and JSON args** stable across transports.

---

## 6. Configuration

- One **`Settings`** class (Pydantic Settings v2): load **`.env`**, validate paths, expose **`log_format`**, **`log_level`**, LLM keys, DB DSN, MCP flags.
- Document every important variable in **class docstring** or **`.env.example`**.

---

## 7. Observability

- **Correlation:** `X-Request-Id` + optional stable `X-Trace-Id` from browsers → gateway → worker **contextvars**.
- **Logging:** attach one handler to your **application** logger (not necessarily root); support **JSON** and **text**; merge snapshot + structured **`extra`** with an explicit allowlist to avoid leaking arbitrary attributes.

---

## 8. Gateway (Node)

- **Helmet**, **CORS**, **rate limit** on public routes.
- Forward **observability headers** to the worker.
- Optional **JSON logs** for proxy completion events mirroring worker format.

---

## 9. Frontend

- **Vite dev server** proxies **`/api`** and **`/v1`** to the gateway (same-origin cookies/headers simpler).
- Centralize API base URL and header merge for **request id** / **trace id**.

---

## 10. Quality gates (minimal)

| Gate | Command / action |
|------|-------------------|
| Lint | `ruff check` (and format tool if adopted) |
| Graph compile | One-liner import `build_graph()` |
| Types | `pyright` or `mypy` if configured |
| Gateway | `npm test` or lint script if present |
| Docs | ARCHITECTURE + wiki updated when contracts change |

---

## 11. Optional extensions

- **Horizontal scaling** of workers → shared LangGraph checkpointer + sticky sessions or external session store.
- **Auth** — replace demo patterns with real OIDC/JWT at gateway or worker.
- **Feature flags** — wrap risky graph edges in settings-driven toggles.

---

## 12. References in this repo

| Topic | Path |
|-------|------|
| Architecture overview | `ARCHITECTURE.md` |
| Graph & state | `docs/deepwiki/03-langgraph-and-agents.md` |
| MCP | `docs/deepwiki/04-mcp-and-tools.md` |
| Config | `docs/deepwiki/08-configuration.md` |
| Observability | `docs/deepwiki/09-observability.md` |
| Agent playbooks | `docs/agents/` |
