# Digital Stylist

**Multi-agent retail AI styling** — LangGraph-orchestrated assistants with catalog RAG, MCP-backed tools, and Postgres-backed store data, served through a Node gateway to React storefront and associate consoles.

---

## Features

- **Conversational orchestration** — LangGraph pipeline (customer → intent → stylist / appointment / support → catalog & email) with checkpointed sessions via `thread_id`.
- **Composable LLMs** — Google Gen AI or OpenAI via environment configuration; optional per-agent model overrides.
- **Catalog intelligence** — ChromaDB vector store for RAG-style retrieval over product content; optional catalog feed indexing.
- **MCP tool layer** — Customer, appointment, email, and associate capabilities exposed as MCP tools (stdio subprocesses or a combined streamable HTTP service).
- **Retail HTTP APIs** — FastAPI routes under `/api/v1` for catalog, customers, voice intent refinement, fitting rooms, and related flows (proxied through orchestration).
- **Storefront UIs** — **Clienteling** (associate / store console) and **Connect** (customer-facing Ann experience), with Vite dev proxies to a single gateway.
- **PostgreSQL** — Schema bootstrap and seed scripts for calendars, workforce, customers, and sample stylists (optional for LLM-only experiments via `STYLIST_PG_DATASTORE=memory`).
- **Observability** — Correlated logs across gateway, worker, LangGraph agents, MCP client, and MCP tool handlers (`X-Request-Id` / `X-Trace-Id`, optional `STYLIST_LOG_FORMAT=json`). See [ARCHITECTURE.md](ARCHITECTURE.md#observability).

---

## Prerequisites

| Tool | Version / notes |
|------|------------------|
| **Python** | **3.11+** (see `pyproject.toml` `requires-python`) |
| **Node.js** | **18+** (see `orchestration/package.json` `engines`) |
| **npm** | Comes with Node; workspaces used at repo root |
| **Docker & Docker Compose** | Optional but recommended for **Postgres 16** (`docker-compose.yml` exposes host port **5433**) |
| **Git** | For clone and contributions |

Inference requires a provider API key (e.g. **Google Gen AI** or **OpenAI**) as documented in [`.env.example`](.env.example).

---

## Quick start

### 1. Clone and environment file

```bash
git clone <repository-url> digital-stylist
cd digital-stylist
cp .env.example .env
```

Edit **`.env`**: set at minimum **`STYLIST_LLM_API_KEY`** (and optionally `GOOGLE_API_KEY` / OpenAI keys per comments in [`.env.example`](.env.example)). For local development you typically set **`STYLIST_ENV=development`** so Postgres defaults apply when `STYLIST_PG_*` is unset (see `.env.example`).

### 2. Python worker (editable install)

```bash
python3.11 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

### 3. Node dependencies (apps + orchestration)

```bash
npm install
cd orchestration && npm install && cd ..
```

### 4. PostgreSQL (optional, for retail / MCP-backed data)

```bash
docker compose up -d postgres
```

Bootstrap schema and (optionally) seed data:

```bash
source .venv/bin/activate
digital-stylist-pg-bootstrap --dev    # or follow CLI help for non-dev DSN
# Optional seeds, e.g.:
# digital-stylist-seed-retail --dev
# digital-stylist-seed-workforce --dev
# digital-stylist-seed-customers --dev
```

### 5. Run the stack (three terminals)

**Terminal A — Python worker** (default **http://127.0.0.1:8787**):

```bash
source .venv/bin/activate
digital-stylist-worker
```

**Terminal B — Orchestration gateway** (default **http://127.0.0.1:3000**):

```bash
cd orchestration
npm run start
# Dev with reload: npm run dev
```

**Terminal C — Frontends** (pick one or both):

```bash
# Associate / clienteling — http://127.0.0.1:5173
npm run dev:clienteling

# Customer / Connect — http://127.0.0.1:5174
npm run dev:connect
```

Vite proxies **`/api`** and **`/v1`** to orchestration (**3000**), which forwards **`/api/*`** to the worker and handles **`POST /v1/chat`** → **`POST /v1/invoke`**.

### 6. Full stack in Docker (alternative)

With **`.env`** configured for production-style keys and paths:

```bash
docker compose up --build
```

See [`docker-compose.yml`](docker-compose.yml) for services (`worker`, `orchestration`, `postgres`, optional catalog profile).

---

## Project structure

```text
digital-stylist/
├── .env.example              # Template for STYLIST_* and gateway env vars
├── ARCHITECTURE.md           # System design and data flow
├── docker-compose.yml        # Worker, orchestration, Postgres (optional catalog profile)
├── pyproject.toml            # Python package, CLI entrypoints, Ruff/Black
├── orchestration/            # Express gateway → worker (/v1/chat, /api/* proxy)
├── digital_stylist/          # Core Python package
│   ├── worker_app.py         # FastAPI: /v1/invoke, health, retail router
│   ├── stylist_api.py         # /api/v1 stylist routes & catalog (Connect / clienteling)
│   ├── graph.py              # LangGraph definition
│   ├── agents/               # Agent bundle wiring
│   ├── domains/              # Per-domain agents, prompts, MCP servers, repositories
│   ├── mcp/                  # MCP runtime (stdio vs remote HTTP)
│   ├── mcp_servers/          # Combined MCP HTTP service entrypoint
│   ├── infra/postgres/       # DB bootstrap & seed scripts
│   └── providers/            # LLM factories, Chroma / vector catalog
├── apps/
│   ├── clienteling/          # Associate console (Vite + React)
│   └── connect/              # Customer storefront (Vite + React)
└── catalog_feed/             # Catalog feed tooling & related assets
```

---

## Testing

There is **no automated unit or integration test suite** checked into this repository yet (no `pytest` / `vitest` / `jest` configuration in `pyproject.toml` or app `package.json`).

**Quality checks you can run today:**

```bash
# Python — Ruff lint + format check (dev dependency)
source .venv/bin/activate
ruff check digital_stylist
ruff format --check digital_stylist
```

**Manual smoke tests:** hit **`GET http://127.0.0.1:3000/health`** (orchestration + worker), open **`GET /docs`** on the worker when OpenAPI is enabled (`STYLIST_DEBUG` / non-production), and send a **`POST /v1/chat`** message through the gateway after starting the dev stack.

When tests are added, prefer **`pytest`** for Python and the workspace’s **`npm test`** (or **Vitest**) for React apps — document the exact commands in this section.

---

## Contributing

- **Branches:** Use short, descriptive names with a prefix when it helps reviewers, e.g. `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- **Pull requests:** Keep changes **focused** (one concern per PR where possible), reference any issue or ticket in the description, and note **runtime impacts** (new env vars, migrations, or ports).
- **Style:** Python — **Ruff** + **Black** (see `pyproject.toml`). TypeScript/React — follow existing patterns in `apps/clienteling` and `apps/connect`.
- **Design context:** See **[ARCHITECTURE.md](ARCHITECTURE.md)** before large refactors or new services.

If the project adopts stricter rules (CODEOWNERS, required checks, Conventional Commits), update this section to match.

---

## Documentation

- **[DeepWiki](docs/deepwiki/README.md)** — Topic-based wiki (system design, APIs, agents, MCP, data, config, observability, ops).
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Diagrams, patterns, and extension workflow.

---

## License

Add a `LICENSE` file at the repository root if the project is open-sourced; until then, usage is governed by your organization’s policies.
