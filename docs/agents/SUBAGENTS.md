# Subagents — delegation, boundaries, and handoff contracts

Use **subagents** (or human specialists) when a task benefits from **isolated context**, **read-only exploration**, or **skills that do not need the full repo write scope**. This document defines **roles**, **inputs**, and **expected outputs** so the primary agent can merge work cleanly.

---

## General rules for all subagents

1. **Return structured handoffs** — File paths, symbol names, and 1–3 sentence conclusions; avoid dumping entire files unless requested.
2. **Respect repo conventions** — Follow [AGENT.md](AGENT.md); do not invent parallel patterns.
3. **Read-only unless scoped** — Exploration subagents should not refactor; implementation stays with the primary agent unless explicitly parallelized with isolated branches.
4. **No secrets** — Never paste API keys; read `.env.example` for variable names only.

---

## S1 — Explore / codebase map

**Trigger:** “Where does X happen?”, large refactors, unfamiliar domains, onboarding.

**Scope:** Read-only search and file reads across `digital_stylist/`, `apps/`, `orchestration/`.

**Output:**

- Bullet list of **relevant paths** with one-line responsibilities.
- **Call graph** or sequence (3–8 steps) for the user flow in question.
- **Risks** (checkpointing, MCP, threading) if touching invoke or graph.

**Must not:** Apply patches or run destructive commands.

---

## S2 — Shell / build / verify

**Trigger:** Run tests, compile graph, format, `pip install`, `npm test`, docker compose smoke.

**Scope:** Commands with explicit cwd; prefer workspace-relative paths.

**Output:**

- Commands run (or equivalent script).
- **Exit codes** and summarized stderr on failure.
- Suggested **next fix** if red.

**Must not:** Change git history without explicit request; avoid `rm -rf` outside safe targets.

---

## S3 — Graph & intent specialist

**Trigger:** New `next_node`, new edge, reordering nodes, checkpoint semantics.

**Scope:** `graph.py`, `domains/intent/*`, `contracts/state.py`, `agents/bundle.py`.

**Output:**

- Updated **routing table** (intent → node).
- Confirmation that **`build_graph()`** compiles.
- List of **state keys** added or deprecated.

**Coordination:** Update DeepWiki §03 and ARCHITECTURE mermaid if topology changes.

---

## S4 — MCP & tools specialist

**Trigger:** New tool, new server, stdio vs remote HTTP, handler errors.

**Scope:** `mcp/runtime.py`, `domains/*/mcp_server.py`, `mcp_servers/`.

**Output:**

- Tool **name**, **arguments schema**, and **server** key.
- **Idempotency** and **error** behavior notes.
- How **`McpRuntime.invoke`** is called from **`act`**.

---

## S5 — Observability specialist

**Trigger:** New cross-cutting log fields, tracing, request correlation.

**Scope:** `observability/context.py`, `observability/logging_config.py`, worker middleware, `orchestration/src/observability.mjs`.

**Output:**

- Which **`obs_bind_partial`** keys to set and when to **`obs_reset`**.
- If adding **`LogRecord.extra`**, extend **`_LOG_EXTRA_KEYS`** and document in **ARCHITECTURE** / DeepWiki §09.

---

## S6 — API & contracts specialist

**Trigger:** New `/api/v1` routes, invoke body shape, response fields.

**Scope:** `worker_app.py`, `stylist_api.py`, Pydantic models, TS clients under `apps/`.

**Output:**

- Request/response **JSON shape**; backward compatibility notes.
- **OpenAPI** impact if applicable.

---

## S7 — Data & Postgres specialist

**Trigger:** Migrations, GUCs, tenant behavior, seeds, RLS assumptions.

**Scope:** `infra/postgres/`, domain `repository.py`, SQL in retail modules.

**Output:**

- **Connection** requirements and **session** variables.
- **Migration/seed** steps and rollback considerations.

---

## Delegation matrix (quick reference)

| Task flavor | Subagent |
|-------------|----------|
| Find all callers of `build_graph` | S1 |
| Run ruff / pytest / graph compile | S2 |
| Add email branch from intent | S3 |
| Register `email_queue_foo` MCP tool | S4 |
| Add `correlation_id` to JSON logs | S5 |
| Change `InvokeBody` fields | S6 |
| New retail table + repository | S7 |

Primary agent **owns** integration: merging branches, resolving conflicts, and keeping **one** consistent story in git.
