# Primary agent — architecture, design, and coding standards

This playbook applies to any **autonomous coding agent** implementing features, fixes, or refactors in this repository. It encodes the conventions already reflected in **ARCHITECTURE.md**, **DeepWiki**, and the code layout.

---

## 1. Architectural principles

### 1.1 Separation of concerns

| Concern | Where it lives |
|---------|----------------|
| HTTP transport, timeouts, correlation | `worker_app.py`, middleware, `observability/` |
| Graph topology and edges | `graph.py` only (single source of truth) |
| Routing keys from LLM output | Intent domain (`schemas`, `agent`, `routing`) |
| LLM + tool side effects per step | Domain `agent.py` under `domains/<name>/` |
| Retail / catalog HTTP (non-graph) | `stylist_api.py` and feature modules |
| Persistence and seeds | `infra/postgres/` |
| Vector / embeddings | `providers/` |

Do not push HTTP handler logic into agents, or agent logic into raw SQL in API routes unless the codebase already does so for that feature.

### 1.2 Composition over singletons

- Build **`AgentRunContext`** via **`build_agent_run_context(settings)`**.
- Assemble agents with **`StylistAgentBundle.from_context(ctx)`**.
- Compile the graph once in app lifespan (**`app.state.graph`**), not per request.

### 1.3 Intent-driven branches

- **`route_from_intent`** returns a **finite** set of node names; keep it in sync with **`graph.add_conditional_edges`** mapping.
- **`next_node`** in state must match **`NextNodeLiteral`** / graph edges; invalid values should **log** and **fallback** (see `routing.py`).
- **Side-effect branches** (e.g. email) stay **first-class edges** from intent, not hidden post-steps on unrelated paths unless product explicitly requires chaining.

---

## 2. Design patterns (mandatory alignment)

### 2.1 Five-block agent

All LangGraph node agents follow **`FiveBlockAgent`**:

1. **bind** — `IdentityContext` (system prompt / role).
2. **perceive** — Read-only projection of `StylistState` (JSON-friendly dicts).
3. **reason** — LLM or deterministic logic.
4. **act** — MCP, HTTP, DB side effects; must tolerate missing MCP (**`None`** / exceptions handled narrowly).
5. **synthesize** — **Partial** `dict` merged into state; prefer small patches.

**Rules:**

- Set **`agent_key`** on every subclass; it drives **`ctx.llm_for(agent_key)`** and logs.
- **`run()`** must not be overridden without a strong reason — it wraps logging (`agent_run_*`).
- Heavy payloads to the LLM should be **truncated** (see explainability / catalog patterns).

### 2.2 State and messages

- **`StylistState`** is the shared **TypedDict**; use **`NotRequired`** for optional keys.
- Prefer **reducers** and LangGraph conventions for **`messages`** when appending.
- For API consumers, ensure terminal nodes on user-facing paths contribute **`AIMessage`** content when **`assistant_message`** is derived from the last AI message.

### 2.3 MCP

- Call tools through **`McpRuntime.invoke(server, tool, args)`** from **`act`**, not ad-hoc subprocesses in domain code.
- Tool names and payloads should stay stable for combined HTTP MCP and stdio servers.
- New tools: implement in domain **`mcp_server.py`** and/or **`mcp_servers/handlers/`**, register in **`build_mcp`** / connection config.

### 2.4 Configuration

- **`StylistSettings`** is the only source of truth for env-backed behavior.
- Add fields with **`Field(..., description=...)`** and document in class docstring or **`.env.example`** when user-visible.

---

## 3. Coding standards

### 3.1 Python

- Use `from __future__ import annotations` in new modules.
- Type hints on public functions; avoid bare `Any` unless at system boundaries (perception blobs, MCP JSON).
- **`dict[str, Any]`** for dynamic JSON-style payloads, not untyped dicts everywhere.
- Prefer **early returns** over deep nesting; **narrow** exceptions around MCP and external I/O.
- Format with **Black** / lint with **Ruff** to match `pyproject.toml`.

### 3.2 Logging

- Use **`logging.getLogger(__name__)`** (or the `digital_stylist.agent` pattern for framework code).
- Pass **`extra={}`** only with keys supported by **`logging_config._LOG_EXTRA_KEYS`** (or extend that set if you introduce a new cross-cutting field).
- Never log secrets, API keys, or full message bodies in production paths unless explicitly gated by debug flags.

### 3.3 HTTP / Node gateway

- Orchestration proxies **`/api/*`** and maps **`POST /v1/chat`** → **`POST /v1/invoke`**; preserve **`X-Request-Id`** / **`X-Trace-Id`**.
- Worker: validate bodies with **Pydantic** models; use consistent error JSON shape with existing helpers.

### 3.4 Frontend (when touched)

- Follow existing **Vite proxy** and API client patterns in `apps/clienteling` and `apps/connect`.
- Keep correlation header helpers consistent with **`mergeObservabilityHeaders`**.

---

## 4. Change workflow (agent behavior)

1. **Read** adjacent code and one level of callers before editing.
2. **Minimize diff** — every line should justify itself against the task.
3. **Graph changes** — Update **routing**, **state literals**, **intent prompts/schemas**, and **wiki** / **ARCHITECTURE** if topology or contracts change.
4. **Verify** — `python -c "from digital_stylist.graph import build_graph; build_graph()"` after graph edits; run targeted tests if present.
5. **Document** — Update **DeepWiki** or **ARCHITECTURE** when behavior crosses team boundaries (invoke contract, ports, env vars).

---

## 5. Anti-patterns (do not do)

- Hardcoding OpenAI/Google model strings in domain agents.
- Adding nodes in **`graph.py`** without **`StylistAgentBundle`** and **`route_from_intent`** updates.
- Swallowing exceptions in **`act`** without logging or without returning a safe partial state.
- Writing large **README** or **DeepWiki** rewrites when the user asked for a small fix.
- Using root logger configuration that fights **`configure_logging`** (package logger is **`digital_stylist`**).

---

## 6. File map (high signal)

```
digital_stylist/graph.py              # LangGraph wiring
digital_stylist/worker_app.py         # /v1/invoke, lifespan, graph
digital_stylist/config.py             # StylistSettings
digital_stylist/contracts/state.py    # StylistState
digital_stylist/framework/base.py     # FiveBlockAgent
digital_stylist/agents/bundle.py      # Composition root
digital_stylist/domains/*/agent.py    # Domain agents
digital_stylist/mcp/runtime.py        # MCP client
digital_stylist/observability/*       # context + logging
orchestration/src/server.mjs          # Gateway
```

When in doubt, cross-check **[ARCHITECTURE.md](../../ARCHITECTURE.md)** and **[docs/deepwiki/03-langgraph-and-agents.md](../deepwiki/03-langgraph-and-agents.md)**.
