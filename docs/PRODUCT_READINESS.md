# Product readiness (Digital Stylist)

This document maps the **Product Readiness Checklist** to this repository: what is true today, what is partial, and what we enforce in code review.

**Python:** `requires-python >=3.11` in `pyproject.toml` (test on 3.11+).

**Primary surfaces:** LangGraph multi-agent flow (`digital_stylist/graph.py`), HTTP worker (`digital_stylist/worker_app.py`), interactive CLI (`digital_stylist/cli.py`).

**Ongoing enforcement:** `.cursor/rules/product-readiness.mdc` (Cursor agents). Install dev tools with `pip install -e ".[dev]"`, then run `ruff check digital_stylist` and `ruff format digital_stylist` (Black-compatible; `black` is also listed in dev extras if you prefer it).

---

## 1. Product & scope

| Item | Status | Notes |
|------|--------|--------|
| Problem statement | Partial | Described in package metadata and `StylistSettings` docstring; extend in product docs as needed |
| Users / scenarios | Partial | CLI + worker API; document Express/orchestration integration separately |
| Non-goals | Open | List explicitly when scope is finalized |
| Success metrics | Open | Define quality, latency, cost, reliability targets per environment |
| I/O contracts | **Yes** | Worker: `InvokeBody` + JSON response; graph: `StylistState` |
| Failure behavior | **Yes** | Worker timeouts, safe errors in prod (`expose_internal_errors`), health/ready |
| Compatibility | Open | Prefer additive state keys; document breaking graph changes |

---

## 2. Architecture & design

| Item | Status | Notes |
|------|--------|--------|
| Architecture diagram | Partial | Graph edges in `graph.py` docstring; add diagram when stabilizes |
| Component responsibilities | **Yes** | Domains under `digital_stylist/domains/*`; composition in `agents/bundle.py` |
| Data / control flow | **Yes** | `StylistState` + `FiveBlockAgent.run`; routing in `domains/intent/routing.py` only |
| Dependencies | **Yes** | `pyproject.toml`; external: LLM providers, Chroma, Postgres, MCP |
| Fallbacks | Partial | Vector `memory` backend; MCP disable; RAG degrades on search/reflection errors |
| Scalability / state | Partial | Worker holds one compiled graph; checkpointing via LangGraph (dev: `MemorySaver`) |

---

## 3. Code quality (Python)

| Item | Status | Notes |
|------|--------|--------|
| Version + deps | **Yes** | `pyproject.toml`; pin production installs with a lockfile where used |
| Type hints | **Yes** | Required for new code; graph return type `CompiledStateGraph` |
| Small functions / no dead code | Ongoing | Ruff + review |
| Secrets | **Yes** | Env / `SecretStr`; never commit credentials |
| Logging vs print | **Yes** | Services use `logging`; REPL/JSON CLIs may use stdout/stderr for UX (documented in rule) |
| Lint / format | **Yes** | `ruff check` + `ruff format`; Black in dev extras (see `pyproject.toml`) |

---

## 4. LangGraph / agents

| Item | Status | Notes |
|------|--------|--------|
| Typed state | **Yes** | `contracts/state.py` — field ownership documented |
| Minimal state | Ongoing | Avoid debug-only keys in production paths |
| Immutable updates | **Yes** | Nodes return `dict` patches; LangGraph merges |
| Persistence | Partial | Configurable checkpointer; default in-memory for dev |
| Nodes | **Yes** | `FiveBlockAgent`; routing not inside domain nodes (except intent output → `next_node`) |
| Centralized routing | **Yes** | `route_from_intent` only |
| Loops / termination | **Yes** | DAG + RAG `max_rounds` (`STYLIST_CATALOG_RAG_MAX_ROUNDS`) |
| Tools | Ongoing | Validate inputs in MCP tools; timeouts where applicable |

---

## 5. Model & AI

| Item | Status | Notes |
|------|--------|--------|
| Model choice | **Yes** | Env-driven via `StylistSettings` |
| Prompts in repo | **Yes** | `prompts.py`, `domains/*/prompts.py` |
| Structured outputs | **Yes** | e.g. `IntentOutput`, `RetrievalReflection` |
| Guardrails / cost | Partial | Message size limits, invoke timeout; extend budgets as needed |

---

## 6. Error handling & resilience

| Item | Status | Notes |
|------|--------|--------|
| Retryable vs fatal | Partial | Worker maps timeout to 504; graph errors to 500 |
| Bounded retries | Partial | RAG rounds bounded; LLM retries depend on LangChain defaults |
| Silent failures | Avoid | Log RAG/search/reflection failures; trace in `catalog_rag_trace` |

---

## 7. Testing

| Item | Status | Notes |
|------|--------|--------|
| Unit / integration | Open | Add tests for routing, RAG dedupe, worker validation |
| Agent loops | Open | Test RAG termination and bad structured output paths |

---

## 8. Observability

| Item | Status | Notes |
|------|--------|--------|
| Logging | **Yes** | Worker uses structured `extra=`; request IDs on worker |
| Metrics / tracing | Open | Optional LangSmith / OTel |
| Debug mode | **Yes** | `STYLIST_DEBUG` |

---

## 9. Security & compliance

| Item | Status | Notes |
|------|--------|--------|
| Secrets | **Yes** | See config |
| Input limits | **Yes** | `STYLIST_MAX_MESSAGE_CHARS` |
| PII / retention | Open | Document per deployment |
| Prompt injection / tool auth | Open | Review per tool surface |

---

## 10–13. Performance, deployment, docs, release

Track in your runbooks: latency budgets, load tests, IaC, on-call, kill-switch for agents (e.g. disable MCP / feature flags).

---

## Final gate

Ship only when critical items for **your** environment are satisfied, risks are accepted in writing, rollback is tested, and monitoring is live.

---

## Full checklist (source)

Use this as the master tick list in reviews:

- [ ] **1.** Product & scope — problem, users, non-goals, metrics, contracts, failures, compatibility  
- [ ] **2.** Architecture — diagram, responsibilities, data/control flow, deps, fallbacks, scale, state  
- [ ] **3.** Python quality — version, deps, types, structure, no secrets, logging, lint, format, dependency hygiene  
- [ ] **4.** LangGraph — state design, nodes, edges/routing, tools  
- [ ] **5.** Model & AI — model docs, prompts, structured output, guardrails, cost, rate limits, retries  
- [ ] **6.** Errors — cases, retry vs fatal, backoff, user messages, no silent failures, bounded self-correction  
- [ ] **7.** Testing — unit, integration, agent-specific  
- [ ] **8.** Observability — logs, metrics, tracing, debug defaults  
- [ ] **9.** Security — secrets, sanitization, PII, retention, access, injection, tool auth  
- [ ] **10.** Performance & cost  
- [ ] **11.** Deployment — envs, health, shutdown, rollback, versioning  
- [ ] **12.** Documentation — README, setup, API, runbooks  
- [ ] **13.** Release & ownership — owner, on-call, alerts, kill switch  
