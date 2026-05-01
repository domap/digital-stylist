# Repository Structure
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)
- [.gitignore](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore)

The Digital Stylist repository is organized as a monorepo that bridges a TypeScript/Node.js orchestration layer with a Python-based AI agentic core. This structure supports a multi-tier architecture where the frontend applications communicate through an Express gateway to reach a high-performance LangGraph worker.

## Monorepo Layout

The repository is divided into several functional directories, separating frontend applications, the core agent logic, data ingestion pipelines, and infrastructure tooling.

### `apps/` (Frontend Applications)

Contains the React/TypeScript storefront applications. These apps are configured to proxy API requests through the orchestration gateway.

- `apps/clienteling/`: The associate-facing application. Includes views for customer profiles, AI-assisted chat, and product recommendations `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/App.tsx#L1-L10" min=1 max=10 file-path="apps/clienteling/src/App.tsx">Hii</FileRef>`.
- `apps/connect/`: The customer-facing application. Features the "Ann" persona, itinerary layouts, and fitting-room reservation flows `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/connect/src/App.tsx#L1-L10" min=1 max=10 file-path="apps/connect/src/App.tsx">Hii</FileRef>`.

### `digital_stylist/` (Python Worker & Agent Core)

This is the heart of the system, containing the FastAPI worker and the LangGraph agent definitions.

- `worker_app.py`: The FastAPI entry point that exposes the `/v1/invoke` endpoint for the orchestration gateway `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L29-L31" min=29 max=31 file-path=".env.example">Hii</FileRef>`.
- `graph.py`: Defines the `StateGraph` topology, routing logic between agents (Customer, Intent, Stylist, etc.), and the shared state bus.
- `domains/`: Contains the logic for the eight specialized agents (e.g., `CatalogAgent`, `AppointmentAgent`).
- `contracts/`: Defines the strict data schemas for `StylistState` and `AgentRunContext`.
- `mcp/`: Implementation of the Model Context Protocol (MCP) for tool execution.

### `orchestration/` (Node.js Gateway)

A Node.js Express server that acts as the public-facing API gateway.

- `src/server.mjs`: Handles security (Helmet), CORS, and rate limiting. It proxies requests to the Python worker via the `STYLIST_WORKER_URL``<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L68-L73" min=68 max=73 file-path=".env.example">Hii</FileRef>`.

### `catalog_feed/` (Data Ingestion)

A standalone Python package used to index product data into the vector database.

- Provides the `digital-stylist-catalog-feed` CLI tool `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L27-L27" min=27  file-path=".env.example">Hii</FileRef>`.
- Processes raw JSON catalog files into Chroma vector embeddings `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L26" min=25 max=26 file-path=".env.example">Hii</FileRef>`.

### `docs/` & Tooling

- `docs/`: Technical documentation and architectural diagrams.
- `.pip-audit-cache/`: Tooling directory for security scanning of Python dependencies.

Sources:`<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L1-L78" min=1 max=78 file-path=".env.example">Hii</FileRef>`, `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore#L1-L13" min=1 max=13 file-path=".gitignore">Hii</FileRef>`

---

## Language and Build Split

The repository utilizes a dual-stack approach to leverage the strengths of both ecosystems: Node.js for high-concurrency I/O and Python for LLM orchestration and data science libraries.

LayerTechnologyPrimary DirectoryKey ArtifactsOrchestrationNode.js / Express`orchestration/``node_modules/`, `server.mjs`AI WorkerPython / FastAPI`digital_stylist/``.venv/`, `worker_app.py`AgentsLangGraph / LangChain`digital_stylist/graph.py``StateGraph`FrontendReact / Vite`apps/``dist/` bundlesData FeedPython / Click`catalog_feed/``digital-stylist-catalog-feed` CLI

Sources:`<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L23-L42" min=23 max=42 file-path=".env.example">Hii</FileRef>`, `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore#L11-L12" min=11 max=12 file-path=".gitignore">Hii</FileRef>`

---

## Data Flow Architecture

The following diagram illustrates how requests flow through the repository structure, from the frontend applications to the persistent data layers.

### Request Path: Client to Agent

Sources:`<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L33" min=25 max=33 file-path=".env.example">Hii</FileRef>`, `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L68-L72" min=68 max=72 file-path=".env.example">Hii</FileRef>`

---

## Code Entity Mapping

This diagram maps the conceptual "System Layers" to the specific files and classes that implement them within the monorepo.

### Implementation Map

Sources:`<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L27" min=25 max=27 file-path=".env.example">Hii</FileRef>`, `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L68-L72" min=68 max=72 file-path=".env.example">Hii</FileRef>`

---

## Infrastructure and Persistence

The repository supports two primary data backends, configured via environment variables in the `.env` file.

1. PostgreSQL: Stores relational data including customers, appointments, and associates. Managed via the `digital-stylist-pg-bootstrap` CLI `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L53-L53" min=53  file-path=".env.example">Hii</FileRef>`.
2. Chroma: A vector database used for product catalog search. It is populated by the `catalog_feed` package and persisted in the directory defined by `CHROMA_PERSIST_DIR``<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L26" min=25 max=26 file-path=".env.example">Hii</FileRef>`.

### Tooling Directories

- `.venv/`: Local Python virtual environment (ignored by git) `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore#L2-L2" min=2  file-path=".gitignore">Hii</FileRef>`.
- `__pycache__/`: Python bytecode cache `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore#L7-L7" min=7  file-path=".gitignore">Hii</FileRef>`.
- `node_modules/`: Node.js dependencies for the gateway and apps `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore#L11-L11" min=11  file-path=".gitignore">Hii</FileRef>`.
- `chroma_data/`: Default local storage for the vector database `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore#L9-L9" min=9  file-path=".gitignore">Hii</FileRef>`.

Sources:`<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L61" min=46 max=61 file-path=".env.example">Hii</FileRef>`, `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore#L1-L13" min=1 max=13 file-path=".gitignore">Hii</FileRef>`