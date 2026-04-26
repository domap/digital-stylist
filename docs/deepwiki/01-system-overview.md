# 01 — System overview

[← DeepWiki home](README.md) · [Runtime topology →](02-runtime-topology.md)

## What this repository is

**Digital Stylist** is a **retail AI styling platform**: a **LangGraph**-driven multi-agent workflow that combines **LLM reasoning**, **optional MCP tools** (customer, appointments, email, associates), **vector search (Chroma)** for catalog RAG, and **PostgreSQL** for store data. Two React apps (**Clienteling** for associates, **Connect** for shoppers) talk to a **Node orchestration** service that proxies to a **Python FastAPI worker**.

## Core value

1. **Single graph, many specialists** — One session flows through **customer** enrichment → **intent** classification → a branch (**stylist**, **appointment**, or **support**) → downstream **catalog** / **email** nodes as wired in `digital_stylist/graph.py`.
2. **Composable inference** — Provider and models come from **`StylistSettings`** (`digital_stylist/config.py`), not hardcoded model IDs in business logic.
3. **Tools without baking Postgres into prompts** — Agents call **`McpRuntime.invoke`** so customer/appointment/email/associate behavior stays behind MCP contracts.
4. **Same-origin developer UX** — Vite proxies `/api` and `/v1` to orchestration (port **3000**), which forwards `/api/*` to the worker (**8787**) and maps `POST /v1/chat` → `POST /v1/invoke`.

## Tech stack (authoritative list)

| Area | Stack |
|------|--------|
| Orchestration | Node 18+, Express, Helmet, CORS, express-rate-limit |
| Worker | Python ≥3.11, FastAPI, Uvicorn |
| AI | LangGraph, LangChain Core, Google GenAI / OpenAI integrations, langchain-mcp-adapters |
| Search | ChromaDB + LangChain Chroma; optional in-memory vector backend |
| Data | PostgreSQL via psycopg v3 |
| Protocols | MCP (stdio subprocesses or streamable HTTP combined service) |
| UIs | React 18, TypeScript, Vite 5, Tailwind; Clienteling adds Radix/shadcn-style stack |

See `pyproject.toml` and workspace `package.json` files for exact dependency pins.

## Repository map (high signal)

```
digital_stylist/     # Python package: graph, domains, retail API, MCP runtime, infra
orchestration/       # Express gateway
apps/clienteling/    # Associate / store console
apps/connect/        # Shopper “Ann” experience
catalog_feed/        # Catalog fixtures / feed tooling
docker-compose.yml   # worker + orchestration + postgres (+ optional catalog profile)
```

Next: [02 — Runtime topology](02-runtime-topology.md).
