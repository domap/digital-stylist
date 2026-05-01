# Digital Stylist — Architecture

This document describes the **digital-stylist** monorepo: how storefront and associate UIs, an HTTP gateway, the Python worker (LangGraph + retail APIs), MCP tool servers, and data stores fit together.

---

## High-level overview

**Purpose:** A **multi-agent “digital stylist”** for retail scenarios: conversational styling guidance, catalog-aware recommendations (RAG over a vector index), appointment and customer context, and operational flows (email drafts, support, associate tooling) coordinated by a **LangGraph** workflow.

**Core value proposition:**

- **Unified orchestration** — One LangGraph pipeline routes user intent to specialized agents (stylist, catalog, explainability, appointment, email, support) with shared state and optional **checkpointed sessions** (`thread_id`).
- **Composable inference** — LLM provider, models, and per-agent overrides are **environment-driven** (`StylistSettings`), not hardcoded.
- **Tooling via MCP** — Domain capabilities (customer lookup, appointments, email, associate tasks) are exposed as **MCP tools** (stdio subprocesses by default, or a **single remote streamable HTTP** MCP service).
- **Retail alignment** — **PostgreSQL** backs calendars, customers, workforce, fitting-room style flows; **read-only HTTP APIs** (`/api/v1/...`) serve the React apps with tenant/session GUC patterns.
- **Demo-ready UIs** — **Clienteling** (associate / rich console) and **Connect** (customer storefront) are Vite + React apps that proxy API traffic through a small **Node orchestration** layer to the Python worker.

---

## Tech stack

| Layer | Technologies |
|--------|----------------|
| **Language (backend)** | Python ≥ 3.11 |
| **AI / orchestration** | LangGraph, LangChain Core, LangChain Google GenAI / OpenAI, LangChain Chroma, `langchain-mcp-adapters` |
| **HTTP (worker)** | FastAPI, Uvicorn, Starlette middleware |
| **HTTP (gateway)** | Node.js ≥ 18, Express, Helmet, CORS, `express-rate-limit` |
| **Data** | PostgreSQL (`psycopg` v3), ChromaDB (vector catalog / RAG) |
| **Protocols** | MCP (`mcp` package), HTTP JSON APIs |
| **Frontend** | TypeScript, React 18, Vite 5, Tailwind CSS |
| **Clienteling UI** | Radix UI, TanStack Query, React Router, React Hook Form, Zod, Sonner, etc. |
| **Connect UI** | React Router, React Markdown (lighter dependency set) |
| **Tooling** | Ruff, Black (Python); npm workspaces for apps |

**Critical Python dependencies** (see `pyproject.toml`): `langgraph`, `langchain-*`, `chromadb`, `mcp`, `pydantic`, `pydantic-settings`, `fastapi`, `uvicorn`, `psycopg`.

---

## System design

The runtime splits into: **browsers** → **Vite dev proxy** (or static hosting) → **Orchestration (Express)** → **Worker (FastAPI)** → **LangGraph / retail routers / MCP / Postgres / Chroma**.

```mermaid
flowchart TB
  subgraph clients["Client applications"]
    CL["Clienteling<br/>(associate / store console)"]
    CN["Connect<br/>(customer storefront)"]
  end

  subgraph gateway["Orchestration API — Node Express :3000"]
    GW["Express<br/>Helmet, CORS, rate limit"]
    CHAT["POST /v1/chat → worker /v1/invoke"]
    APIPX["/api/* → worker (same path)"]
  end

  subgraph worker["Python worker — FastAPI :8787"]
    FA["FastAPI app"]
    INV["POST /v1/invoke<br/>LangGraph.invoke"]
    RET["APIRouter /api/v1<br/>retail + catalog + voice + fitting room"]
    MW["Middleware: X-Request-Id"]
    FA --> INV
    FA --> RET
    FA --> MW
  end

  subgraph graph["LangGraph"]
    N1["customer"]
    N2["intent"]
    N1 --> N2
    N2 -->|"next_node"| B1["stylist"]
    N2 --> B2["appointment"]
    N2 --> B3["email"]
    N2 --> B4["support"]
    B1 --> C1["catalog"]
    C1 --> C2["explainability → END"]
    B2 --> E1["END"]
    B3 --> E2["END"]
    B4 --> E3["END"]
  end

  subgraph mcp["MCP"]
    STDIO["stdio: customer, appointment,<br/>email, associate servers"]
    REMOTE["optional: streamable HTTP<br/>digital-stylist-mcp-service"]
  end

  subgraph data["Data & search"]
    PG[("PostgreSQL")]
    CH[("ChromaDB")]
  end

  CL --> GW
  CN --> GW
  GW --> CHAT
  GW --> APIPX
  CHAT --> INV
  APIPX --> RET
  INV --> graph
  graph --> mcp
  graph --> CH
  RET --> PG
  mcp --> PG
```

**Auth / identity (as implemented today):**

- There is **no centralized OAuth service** in this repo. The **worker** trusts **configuration and network placement** (CORS, optional reverse-proxy headers).
- **Connect** may use **demo OTP / email verification** flows implemented in the app and retail APIs for **customer linking** — treat as **product demo patterns**, not a production IAM layer.
- **Retail internal routes** use **Postgres session variables** (e.g. tenant / internal API flags) via the connection helpers — **not** end-user JWT validation inside every handler by default.

---

## Key components (directories & services)

| Path | Responsibility |
|------|----------------|
| **`orchestration/`** | Express gateway: proxies **`/api/*`** to the worker, exposes **`POST /v1/chat`** → worker **`POST /v1/invoke`**, health/ready, rate limiting. |
| **`digital_stylist/worker_app.py`** | FastAPI factory: lifespan builds **LangGraph** once (`app.state.graph`), **`/v1/invoke`** runs the graph in a thread with timeout, includes **retail router**, middleware, exception handlers. |
| **`digital_stylist/stylist_api.py`** | **`APIRouter` `/api/v1`**: catalog (Postgres), stylist workforce reads, associate helpers, wires **voice intent** and **fitting room** modules. |
| **`digital_stylist/graph.py`** | Compiles **`StateGraph`**: `customer` → `intent` → conditional **`route_from_intent`** → **`stylist` \| `appointment` \| `email` \| `support`**. Stylist path: **`stylist` → `catalog` → `explainability` → END**; **`appointment`**, **`email`**, and **`support`** each go **directly to END** (email is not chained after stylist or appointment). |
| **`digital_stylist/nodes.py`** | LangGraph node glue (if present alongside graph wiring — agents invoked from bundle). |
| **`digital_stylist/agents/bundle.py`** | **Composition root** for domain agents (`StylistAgentBundle.from_context`). |
| **`digital_stylist/domains/*`** | **Domain agents** (`agent.py`), **prompts**, optional **`mcp_server.py`** per domain (customer, appointment, email, associate), **repositories** where Postgres is used. |
| **`digital_stylist/framework/base.py`** | **`FiveBlockAgent`** abstract skeleton: bind → perceive → reason → act → synthesize. |
| **`digital_stylist/contracts/`** | **`StylistState`**, **`AgentRunContext`**, message helpers — shared types for graph and agents. |
| **`digital_stylist/mcp/runtime.py`** | **`McpRuntime`**: builds MCP client connections (stdio vs remote HTTP), caches tools per server, **`invoke(server, tool, args)`**. |
| **`digital_stylist/mcp_servers/`** | Standalone **combined MCP HTTP service** (`digital-stylist-mcp-service`) for streamable HTTP transport. |
| **`digital_stylist/providers/`** | Vector catalog (**Chroma** / in-memory), embeddings, document providers, **factory composition** in `factories.py`. |
| **`digital_stylist/infra/postgres/`** | Connection helpers, bootstrap, **seed scripts** (retail calendar, workforce, customers, sample stylists). |
| **`digital_stylist/config.py`** | **`StylistSettings`** (Pydantic Settings): LLM, MCP, Postgres, worker behavior — **single source of env-driven configuration**. |
| **`apps/clienteling/`** | Associate / store console UI: stylist chat, cart, calendar, voice input, proxies to `:3000`. |
| **`apps/connect/`** | Customer-facing storefront: Ann chat, catalog, checkout flows, voice; proxies to `:3000`. |
| **`catalog_feed/`** | Catalog feed pipeline / fixtures (product JSON, assets) consumed by retail API and indexing. |

---

## Data flow: primary user prompt (chat)

1. **Browser** sends **`POST /v1/chat`** (or dev proxy forwards to orchestration) with JSON body `{ message, thread_id?, context_metadata? }`.
2. **Orchestration** forwards to **`POST {WORKER_URL}/v1/invoke`** with the same payload (and **`X-Request-Id`**).
3. **Worker** validates **`InvokeBody`**, merges optional **session defaults** into `context_metadata`, builds **`HumanMessage`**, and invokes **`graph.invoke(payload, { configurable: { thread_id } })`** (async wrapper with timeout).
4. **LangGraph** runs:
   - **`customer`** — profile / context enrichment.
   - **`intent`** — structured intent and **`next_node`** for the branch.
   - **Conditional edge** — **`stylist`**, **`appointment`**, **`email`**, or **`support`** (`domains/intent/routing.py`).
   - **Stylist path** — **`catalog`** (RAG + recommendations) → **`explainability`** (rationale + user-visible **`AIMessage`**). **Email path** — only when intent selects **`email`**: **`email`** drafts / queues lookbook via MCP, then END. **Appointment** and **support** end after their own nodes (each may append assistant-visible content in **`synthesize`**).
5. **MCP** tools may run inside agent **`act`** phases — **`McpRuntime`** resolves LangChain tools from MCP servers (stdio or remote).
6. **Response** JSON includes **`assistant_message`**, serialized **`messages`**, and a **`state`** summary for debugging.

**Parallel path — retail / catalog HTTP:**  
Connect and clienteling call **`/api/v1/...`** (catalog, customers, voice transcript-to-intent, fitting room, etc.). The orchestration proxy passes them **unchanged** to the worker’s **`build_stylist_router()`**, which reads **Postgres** (catalog + tenant JSON) and may call **LLM** for specific endpoints.

---

## Design patterns (where they appear)

| Pattern | Implementation |
|--------|------------------|
| **Composition root** | **`StylistAgentBundle`** assembles all domain agents from **`AgentRunContext`**. |
| **Factory** | **`build_agent_run_context`**, **`build_chat_model`**, **`build_mcp_runtime`**, **`build_graph`** — construct concrete implementations from **`StylistSettings`**. |
| **Strategy / routing** | **`route_from_intent`** in `domains/intent/routing.py` drives LangGraph **conditional edges**. |
| **Template method** | **`FiveBlockAgent`**: subclasses implement **`bind`**, **`reason`**, **`synthesize`**; optional hooks **`perceive`**, **`act`**. |
| **Repository (data access)** | Domain **`repository.py`** modules (e.g. customer, appointment, associate) encapsulate Postgres access. |
| **Adapter** | **MCP** tools adapted to LangChain **`BaseTool`** via **`langchain_mcp_adapters`**; vector stores behind **`VectorCatalog`** protocol. |
| **Singleton (process scope)** | **Compiled graph** on **`app.state.graph`**; optional **cached catalog list** in retail API module globals. |
| **Middleware** | FastAPI **request ID**; Express **Helmet**, **CORS**, **rate limiting**. |
| **Dependency injection (light)** | **`AgentRunContext`** passed into agents; settings loaded once per app lifespan. |

---

## Development workflow: adding a feature or endpoint

### A. New **HTTP API** under `/api/v1` (catalog, retail, voice, etc.)

1. Prefer a dedicated module (e.g. `your_feature_api.py`) with **`attach_*_routes(router: APIRouter)`** or inline handlers for clarity.
2. Register routes in **`build_stylist_router()`** in `stylist_api.py` (or include a sub-router).
3. Use **`StylistSettings`** / **`Request`** for config and **`postgres_connect_kwargs`** when touching the database; follow existing **GUC / tenant** patterns from `infra/postgres`.
4. **Orchestration** already proxies **`/api/*`** — no Node change required unless you add a **non-standard path**.
5. Add or extend **TypeScript clients** in `apps/clienteling/src/lib` or `apps/connect/src/api` as needed.

### B. New **LangGraph node or agent behavior**

1. Implement or extend a domain agent under **`digital_stylist/domains/<domain>/`**, following **`FiveBlockAgent`** if applicable.
2. Register the agent in **`StylistAgentBundle`** and wire **`graph.py`** edges / **`route_from_intent`** if the control flow changes.
3. If new **tools** are needed, add MCP handlers in **`domains/<domain>/mcp_server.py`** and/or **`mcp_servers/handlers/`**, and ensure **`build_mcp_connections`** includes the server (stdio or combined HTTP service).

### C. New **MCP-only** capability (tool surface)

1. Implement tools in the relevant **`mcp_server.py`** (per-domain) or extend **`mcp_servers/build_mcp.py`** for the combined HTTP service.
2. Point **`STYLIST_MCP_REMOTE_URL`** at the combined service in dev, or rely on stdio defaults.
3. Invoke from agents via **`ctx.mcp`** / **`McpRuntime.invoke`** consistent with existing agents.

### D. **Frontend** feature (Clienteling / Connect)

1. Use **Vite proxy** to **`http://127.0.0.1:3000`** for **`/api`** and **`/v1`** (already configured).
2. Run **orchestration** (3000) and **worker** (8787) locally; set **`.env`** for LLM keys and Postgres as documented in `config.py`.

---

## Operational quick reference

| Service | Default port | Role |
|---------|----------------|------|
| Orchestration | **3000** | Gateway, `/v1/chat`, `/api/*` proxy |
| Python worker | **8787** | FastAPI + LangGraph + retail API |
| MCP HTTP (optional) | **8800** | Streamable MCP (`digital-stylist-mcp-service`) |
| Clienteling | **5173** | Vite dev |
| Connect | **5174** | Vite dev |

Environment variables are centralized in **`StylistSettings`** (`digital_stylist/config.py`); start there when tuning models, MCP mode, Postgres, or timeouts.

---

## Observability

- **Correlation** — **`X-Request-Id`** (per HTTP call) and optional **`X-Trace-Id`** (stable per browser tab via `sessionStorage`) are sent from **Clienteling** / **Connect** (`mergeObservabilityHeaders`), forwarded by **orchestration** (`orchestration/src/server.mjs`), and merged into **`digital_stylist.observability.context`** via **`obs_bind_partial`** on the worker so **`obs_snapshot()`** returns the active IDs for the request (no threading through every call site).
- **Python logging** — **`configure_logging(StylistSettings)`** (`observability/logging_config.py`) is **idempotent**: one **`StreamHandler`** on the **`digital_stylist`** package logger only (**`propagate=False`**). **`STYLIST_LOG_LEVEL`** sets verbosity; **`STYLIST_LOG_FORMAT=json`** emits one JSON object per line on stderr with **`ts`**, **`level`**, **`logger`**, **`message`**, optional **`exception`**, then **`obs_snapshot()`** fields, then any **structured `LogRecord` extras** whitelisted in **`logging_config`** (e.g. **`request_id`**, **`trace_id`**, **`thread_id`**, **`component`**, **`event`**, **`agent`**, **`duration_ms`**, **`path`**, **`method`**, **`status_code`**, MCP fields, **`error_type`**, etc.). Default **`text`** format uses a standard line prefix and appends **`[key=value …]`** from **`obs_snapshot()`** when present.
- **Notable events** — e.g. **`http_request`**, **`graph_invoke_*`**, **`agent_run_*`** (`FiveBlockAgent.run`), **`mcp_client_call_*`** (`McpRuntime.invoke`), **`mcp_tool_*`** in **`mcp_servers/handlers/*`**.
- **Orchestration** — **`STYLIST_LOG_FORMAT=json`** enables JSON lines for **`proxy_worker_*`**, **`chat_proxy_*`**, and error variants (`orchestration/src/observability.mjs`).
- **Optional UI debug** — Clienteling: **`VITE_OBSERVABILITY=1`** logs correlation headers in the dev console (`apps/clienteling/src/lib/observability.ts`).

---

## Document maintenance

Update this file when:

- Adding a **new top-level service** or **deployment unit**.
- Changing **graph topology** or **orchestration routing**.
- Introducing **new auth** or **tenant** boundaries at the API layer.

AI contributor playbooks live under **`docs/agents/`** with a short index at the repo root **`AGENTS.md`**. For cloning this architecture elsewhere, see **`docs/BUILDING_SIMILAR_PROJECT.md`**.
