# Glossary
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)
- [.gitignore](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore)
- [.pip-audit-cache/0/0/5/5/3/0055387fa5673ebb7adb10550dd21f2bfdda6469d0784a852e21c355](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.pip-audit-cache/0/0/5/5/3/0055387fa5673ebb7adb10550dd21f2bfdda6469d0784a852e21c355)

This page provides definitions for the domain-specific terminology, architectural patterns, and code entities used throughout the Digital Stylist codebase. It serves as a technical reference for onboarding engineers to understand how natural language concepts map to specific implementation details.

## Core Architectural Terms

### Gateway-Worker Pattern

The system employs a multi-tier architecture where an Express Orchestration Gateway acts as the public-facing entry point, and a Python Worker executes the intensive LLM and LangGraph logic.

- Orchestration Gateway: A Node.js service responsible for security (Helmet, CORS), rate limiting, and proxying requests to the internal Python worker [orchestration/src/server.mjs#1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L10)
- Python Worker: A FastAPI application that hosts the `LangGraph` agentic pipeline and exposes the `/v1/invoke` endpoint [digital_stylist/worker_app.py#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L20)

### StylistState

The "source of truth" for a single execution of the styling pipeline. It is a `TypedDict` that defines the schema for the data flowing between agents in the graph.

- Implementation: Defined in `contracts/state.py` as `StylistState`[digital_stylist/contracts/state.py#1-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L1-L15)
- Reducers: Uses the `add_messages` annotator to handle chat history concatenation [digital_stylist/contracts/state.py#10-12](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L10-L12)

### MCP (Model Context Protocol)

A standard protocol used to provide LLMs with access to external data and tools (e.g., customer profiles, email queues).

- McpRuntime: The class managing connections to MCP servers, whether via stdio subprocesses or remote HTTP streams [digital_stylist/mcp/runtime.py#10-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L10-L30)
- Domain Handlers: Specific logic for fetching data from Postgres, such as `customer.py` or `appointment.py`[digital_stylist/mcp_servers/handlers/customer.py#1-5](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/customer.py#L1-L5)

---

## Domain Concepts and Agents

TermDefinitionCode EntityIntentThe classification of the user's request (e.g., styling, support, appointment).`IntentAgent`[digital_stylist/domains/intent/routing.py#5-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L5-L15)Catalog RAGRetrieval-Augmented Generation used to find products in the vector database.`CatalogAgent`[digital_stylist/domains/stylist/rag.py#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/stylist/rag.py#L1-L20)ExplainabilityThe logic that justifies why specific products were recommended.`ExplainabilityAgent`[digital_stylist/domains/stylist/explainability.py#1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/stylist/explainability.py#L1-L10)CheckpointerMechanism for persisting `StylistState` across multiple turns in a thread.`MemorySaver` or `PostgresSaver`[digital_stylist/graph.py#25-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L25-L35)

### System Flow: Natural Language to Code Entity

The following diagram illustrates how a user's natural language input is transformed into structured data by specific code entities.

Diagram: Request Processing Pipeline

Sources:[orchestration/src/server.mjs#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L50)[digital_stylist/worker_app.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L40)[digital_stylist/graph.py#1-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L1-L60)[digital_stylist/contracts/state.py#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L1-L20)

---

## Data and Persistence

### Vector Catalog

A specialized database for storing product embeddings. It supports semantic search (finding products that match a "vibe" rather than just keywords).

- Chroma: The default vector backend for production [digital_stylist/providers/vector_chroma.py#1-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_chroma.py#L1-L15)
- In-Memory: A fallback backend for local development without persistence [digital_stylist/providers/vector_memory.py#1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_memory.py#L1-L10)
- Catalog Feed: The pipeline that converts raw product JSON into indexed vector documents [catalog_feed/catalog_feed/pipeline.py#10-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L10-L30)

### Tenant Isolation

The system uses PostgreSQL Row Level Security (RLS) and GUC (Global User Context) variables to ensure data isolation between different retail tenants.

- Implementation: SQL policies defined in `schema.sql`[digital_stylist/infra/postgres/schema.sql#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/schema.sql#L1-L100)
- Enforcement: The `stylist/router.py` ensures the `tenant_id` is set in the session context [digital_stylist/stylist/router.py#15-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/stylist/router.py#L15-L25)

---

## Technical Abbreviations

- RAG: Retrieval-Augmented Generation.
- GUC: Global User Configuration (Postgres session variables).
- MCP: Model Context Protocol.
- RLS: Row Level Security.
- SSE: Server-Sent Events (used for real-time notifications in the `Clienteling` app).

### Data Flow: State and Context

This diagram shows how configuration and runtime state are injected into the agent execution.

Diagram: Context Injection

Sources:[.env.example#1-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L1-L80)[digital_stylist/config.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L1-L50)[digital_stylist/providers/factories.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L1-L40)[digital_stylist/contracts/context.py#1-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/context.py#L1-L15)

---

## Environment Variables (Key References)

- `STYLIST_LLM_PROVIDER`: Determines if `google_genai` or `openai` is used [digital_stylist/config.py#20-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L20-L25)
- `STYLIST_VECTOR_BACKEND`: Switches between `chroma` and `memory`[digital_stylist/config.py#30-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L30-L35)
- `STYLIST_WORKER_URL`: Used by the Express gateway to find the Python worker [orchestration/src/server.mjs#15-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L15-L20)
- `STYLIST_PG_DATASTORE`: Controls if the system uses a real Postgres instance or an in-memory mock [digital_stylist/config.py#40-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L40-L45)

Sources:[.env.example#1-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L1-L78)[digital_stylist/config.py#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L1-L100)