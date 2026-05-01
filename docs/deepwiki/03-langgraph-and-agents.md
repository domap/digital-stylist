# 03 — LangGraph & agents

[← Runtime topology](02-runtime-topology.md) · [DeepWiki home](README.md) · [MCP & tools →](04-mcp-and-tools.md)

## Graph compilation

**Source of truth:** `digital_stylist/graph.py`.

Flow:

1. **`START` → `customer`** — Profile / MCP-backed customer context.
2. **`customer` → `intent`** — Structured intent + `next_node`.
3. **`intent` → conditional** — `route_from_intent` in `digital_stylist/domains/intent/routing.py` selects **`stylist`**, **`appointment`**, **`email`**, or **`support`**.
4. **Stylist path:** `stylist` → `catalog` → `explainability` → `END`.
5. **Appointment path:** `appointment` → `END`.
6. **Email path:** `email` → `END` (lookbook draft / MCP queue when intent is explicitly email-related).
7. **Support path:** `support` → `END`.

The compiled graph is built once in the worker **lifespan** (`worker_app.py`) and stored on **`app.state.graph`**.

## State: `StylistState`

**File:** `digital_stylist/contracts/state.py` (`TypedDict`, partial updates).

Important fields (non-exhaustive):

| Field | Typical writers |
|-------|-----------------|
| `messages` | All nodes (LangGraph `add_messages` reducer) |
| `current_intent`, `urgency`, `next_node` | Intent agent |
| `user_profile`, `mcp_customer_snapshot` | Customer / MCP |
| `stylist_notes` | Stylist |
| `recommendations`, `catalog_matches`, `catalog_rag_trace` | Catalog / RAG |
| `booking_id`, `appointment_copy` | Appointment |
| `recommendation_rationale` | Explainability |
| `email_draft`, `mcp_email_queue_id` | Email + MCP |
| `context_metadata` | HTTP invoke body / CLI seeding |

Nodes return **partial dicts**; LangGraph merges immutably.

## Agent implementation pattern

**Base class:** `digital_stylist/framework/base.py` — **`FiveBlockAgent`**:

1. **bind** — System / identity for this turn  
2. **perceive** — Structured view of state (default empty)  
3. **reason** — LLM or structured output  
4. **act** — Side effects / MCP (default no-op)  
5. **synthesize** — Return a **partial** `StylistState` update (on the stylist, appointment, and email paths, implementations typically append an **`AIMessage`** to **`messages`** so **`POST /v1/invoke`** can derive **`assistant_message`** from the last AI turn).

**`run()`** wraps all blocks and emits **observability** logs (`agent_run_*`) under the `digital_stylist.agent` logger.

## Bundle composition

**`digital_stylist/agents/bundle.py`** — `StylistAgentBundle.from_context(ctx)` wires:

`CustomerAgent`, `IntentAgent`, `StylistAgent`, `CatalogAgent`, `ExplainabilityAgent`, `AppointmentAgent`, `EmailAgent`, `SupportAgent`.

Each receives **`AgentRunContext`** (`digital_stylist/contracts/context.py`): settings, shared/default LLM, per-agent LLM overrides, vector catalog, optional **`McpRuntime`**.

## Intent routing contract

**`IntentOutput`** / **`NextNodeLiteral`** live in `domains/intent/schemas.py`. Valid model outputs include **`stylist`**, **`appointment`**, **`support`**, **`email`**, and **`respond`**; **`respond`** is normalized to **`support`** in the intent agent before `route_from_intent` runs.

Next: [04 — MCP & tools](04-mcp-and-tools.md).
