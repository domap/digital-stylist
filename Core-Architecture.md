# Core Architecture
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Digital Stylist platform utilizes a multi-tier, decoupled architecture designed to bridge high-level natural language processing with structured retail data and enterprise services. The system follows a Gateway-Worker pattern, separating the concerns of edge orchestration (security, rate limiting, routing) from the heavy-lifting of LLM agent execution and state management.

## System Overview

The architecture is composed of three primary layers:

1. Orchestration Gateway (Node.js/Express): The public-facing entry point that manages client sessions, security headers, and proxies requests to the backend services.
2. Stylist Worker (Python/FastAPI): The execution environment for the agentic workflow. It hosts the LangGraph runtime and manages the lifecycle of agentic "invocations."
3. Domain Agents (LangGraph): A directed acyclic graph (DAG) of specialized agents that process state, query vector catalogs, and interact with external systems via the Model Context Protocol (MCP).

### High-Level Component Interaction

The following diagram illustrates how a user request flows from the storefront applications through the gateway into the agentic pipeline.

Diagram: Request Flow and Component Mapping

Sources:[orchestration/src/server.mjs#1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L10)[digital_stylist/worker_app.py#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L20)[digital_stylist/graph.py#1-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L1-L15)

---

## Express Orchestration Gateway

The Orchestration Gateway acts as a secure reverse proxy and API aggregator. It is responsible for protecting the internal Python worker from direct internet exposure and providing a unified API for the frontend applications.

Key responsibilities include:

- Security & Policy: Implements `helmet` for header security and `cors` for cross-origin resource sharing [orchestration/src/server.mjs#20-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L20-L40)
- Proxying: Forwards `/v1/chat` requests to the worker's `/v1/invoke` endpoint and passes through `/api/*` routes for auxiliary data access [orchestration/src/server.mjs#108-125](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L108-L125)
- Health Aggregation: Monitors its own health and the health of the downstream worker to provide a holistic `/health` status for load balancers.

For details, see [Express Orchestration Gateway](#2.1).

Sources:[orchestration/src/server.mjs#1-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L150)

---

## Python Worker (FastAPI)

The Stylist Worker is the core execution engine for the AI. It encapsulates the `StateGraph` and provides a standard HTTP interface for invoking the agents.

- Graph Lifecycle: On startup, the worker compiles the LangGraph defined in `graph.py`[digital_stylist/worker_app.py#50-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L50-L60)
- Concurrency: Uses `asyncio` to handle multiple concurrent graph executions, enforcing timeouts via `STYLIST_INVOKE_TIMEOUT_SEC`[.env.example#33](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L33-L33)
- Validation: Uses Pydantic schemas (e.g., `InvokeBody`) to validate incoming requests before they enter the agentic pipeline [digital_stylist/worker_app.py#120-135](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L120-L135)

For details, see [Python Worker (FastAPI)](#2.2).

Sources:[digital_stylist/worker_app.py#1-200](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L200)[.env.example#29-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L29-L35)

---

## LangGraph Multi-Agent Pipeline

The intelligence of the system is modeled as a stateful graph. Instead of a single monolithic prompt, the system routes the user's request through a series of specialized nodes.

Diagram: LangGraph Topology and Node Entities

- Nodes: Each node corresponds to a specific agent function (e.g., `stylist_agent` in `digital_stylist/domains/stylist/`).
- Edges: Transitions are determined by the `intent` classified by the `intent_agent`.
- Checkpointer: Supports persistence via `MemorySaver` (local) or external providers like Postgres for horizontal scaling [.env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L3-L4)

For details, see [LangGraph Multi-Agent Pipeline](#2.3).

Sources:[digital_stylist/graph.py#20-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L20-L100)[digital_stylist/contracts/state.py#10-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L10-L25)

---

## StylistState and Contracts

The "glue" that binds the agents together is the `StylistState`. This shared object is passed between nodes, with each agent performing partial updates to the state.

FieldTypeDescriptionOwner Node`messages``Annotated[list, add_messages]`The conversation historyAll`intent``IntentLiteral`The classified user goal`intent_agent``customer_id``str`Unique identifier for the customer`customer_agent``recommendations``list[Product]`List of products found in the catalog`catalog_agent`

The `StylistState` uses a "reducer" pattern for the `messages` field, ensuring that new AI responses are appended rather than overwriting the entire history [digital_stylist/contracts/state.py#45-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L45-L60)

For details, see [StylistState and Contracts](#2.4).

Sources:[digital_stylist/contracts/state.py#1-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L1-L80)[digital_stylist/contracts/context.py#1-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/context.py#L1-L30)