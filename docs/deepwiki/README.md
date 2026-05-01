# Digital Stylist — DeepWiki

Deep, navigable documentation for contributors and operators. Start here, then follow links by topic.

| Article | What you’ll learn |
|---------|-------------------|
| [01 — System overview](01-system-overview.md) | Purpose, value proposition, tech stack at a glance |
| [02 — Runtime topology](02-runtime-topology.md) | Processes, ports, request paths, Docker |
| [03 — LangGraph & agents](03-langgraph-and-agents.md) | Graph shape, `StylistState`, `FiveBlockAgent`, intent routing |
| [04 — MCP & tools](04-mcp-and-tools.md) | stdio vs remote HTTP, `McpRuntime`, handler layout |
| [05 — HTTP API catalog](05-http-api-catalog.md) | Every meaningful `/api/v1` and `/v1` surface |
| [06 — Frontend apps](06-frontend-apps.md) | Clienteling vs Connect, proxies, API clients |
| [07 — Data: Postgres & Chroma](07-data-postgres-and-chroma.md) | RLS, seeds, vector catalog, fixtures |
| [08 — Configuration](08-configuration.md) | `StylistSettings`, env vars, LLM/MCP/DB toggles |
| [09 — Observability](09-observability.md) | Correlation IDs, JSON logs, events |
| [10 — Operations & troubleshooting](10-operations-and-troubleshooting.md) | Health, quotas, Postgres, scaling caveats |

**Also in repo:** [ARCHITECTURE.md](../../ARCHITECTURE.md) (diagrams + patterns), [README.md](../../README.md) (quick start), [.env.example](../../.env.example) (env template), [AGENTS.md](../../AGENTS.md) (AI agent entrypoint), [docs/agents/](../agents/) (full agent / subagent / review playbooks), [BUILDING_SIMILAR_PROJECT.md](../BUILDING_SIMILAR_PROJECT.md) (scaffold checklist for a comparable stack).
