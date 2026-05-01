# Agent instructions — Digital Stylist

This repository is a **multi-agent LangGraph** retail styling stack: **FastAPI worker**, **Node orchestration**, **MCP** tools, **Postgres + Chroma**, and **React** apps. Use this file as the default playbook for autonomous coding agents (Cursor, CI bots, etc.).

## Authoritative references

| Document | Use |
|----------|-----|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, components, data flow, observability |
| [docs/deepwiki/README.md](docs/deepwiki/README.md) | Topic wiki (graph, MCP, config, ops) |
| [docs/agents/AGENT.md](docs/agents/AGENT.md) | **Full** coding standards, patterns, and file map |
| [docs/agents/SUBAGENTS.md](docs/agents/SUBAGENTS.md) | When to delegate (explore, shell, domain focus) |
| [docs/agents/REVIEW_AGENTS.md](docs/agents/REVIEW_AGENTS.md) | Review personas and merge gates |
| [docs/BUILDING_SIMILAR_PROJECT.md](docs/BUILDING_SIMILAR_PROJECT.md) | Scaffold checklist for a comparable monorepo |

## Non-negotiables

1. **Scope** — Change only what the task requires. No drive-by refactors, no unrelated files, no extra markdown unless requested.
2. **Configuration** — No hardcoded model IDs, secrets, or DSNs in domain logic. Use **`StylistSettings`** / env (`digital_stylist/config.py`).
3. **Agents** — New graph-side behavior belongs in **`FiveBlockAgent`** subclasses under **`digital_stylist/domains/<domain>/`**, registered in **`StylistAgentBundle`**, wired in **`graph.py`** and **`route_from_intent`** when control flow changes.
4. **State** — Extend **`StylistState`** / intent schemas when adding fields; keep **`synthesize`** returns as **partial** updates LangGraph can merge.
5. **User-visible replies** — Branches that must surface in **`POST /v1/invoke`** should append **`AIMessage`** to **`messages`** in **`synthesize`** where appropriate (see explainability / appointment / email agents).
6. **Observability** — Use structured **`logger.*(..., extra={...})`** keys whitelisted in **`observability/logging_config.py`**; bind request scope via **`obs_bind_partial`** in HTTP paths (already done in worker).
7. **Quality** — Match existing naming, imports, and typing; run **Ruff** / tests for touched Python; keep prose in docs in **complete sentences**.

## Quick map

- **Graph:** `digital_stylist/graph.py`
- **Intent routing:** `digital_stylist/domains/intent/routing.py`
- **Agent base:** `digital_stylist/framework/base.py`
- **Bundle:** `digital_stylist/agents/bundle.py`
- **Invoke API:** `digital_stylist/worker_app.py`
- **MCP client:** `digital_stylist/mcp/runtime.py`

For extended rules, patterns, and anti-patterns, read **[docs/agents/AGENT.md](docs/agents/AGENT.md)**.
