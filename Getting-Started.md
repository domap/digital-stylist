# Getting Started
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)
- [.gitignore](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore)

This page provides a step-by-step guide to setting up the Digital Stylist codebase for local development and production environments. The system follows a multi-tier architecture involving a Node.js Express gateway, a Python FastAPI worker running a LangGraph pipeline, and supporting data stores (PostgreSQL and Chroma).

## Prerequisites

Before beginning, ensure the following are installed:

- Python 3.10+ (for the `digital_stylist` worker and `catalog_feed` tools).
- Node.js 18+ (for the `orchestration` gateway and frontend apps).
- Docker (optional, but recommended for running PostgreSQL and Chroma).

## 1. Repository Setup

Clone the repository and initialize the environments for both the Python and Node.js components.

```
git clone https://github.com/domap/digital-stylist.git
cd digital-stylist
 
# Set up Python virtual environment
python -m venv .venv
source .venv/bin/activate
pip install -e "./digital_stylist[dev]"
pip install -e "./catalog_feed"
 
# Set up Node.js dependencies
npm install
# Or install specifically for the gateway
cd orchestration && npm install
```

Sources: [.gitignore#1-12](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore#L1-L12)[.env.example#27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L27-L27)

## 2. Configuration (.env)

The system relies on environment variables for service discovery and provider configuration. Create a `.env` file in the root directory by copying the example template.

```
cp .env.example .env
```

### Key Configuration Categories

CategoryVariablesDescriptionInference`STYLIST_LLM_PROVIDER`, `STYLIST_LLM_API_KEY`Supports `google_genai` (default) or `openai`. [ .env.example#6-21](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L6-L21)Vector DB`STYLIST_VECTOR_BACKEND`, `CHROMA_PERSIST_DIR`Defines where the RAG catalog is stored. [ .env.example#25-26](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L25-L26)Worker`STYLIST_WORKER_HOST`, `STYLIST_WORKER_PORT`Network settings for the Python FastAPI app. [ .env.example#29-31](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L29-L31)Gateway`PORT`, `STYLIST_WORKER_URL`, `STYLIST_CORS_ORIGINS`Settings for the Express orchestration layer. [ .env.example#67-71](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L67-L71)Postgres`STYLIST_PG_DSN` or `STYLIST_PG_HOST/USER/PASS`Connection details for customer and appointment data. [ .env.example#46-61](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L46-L61)

Sources: [.env.example#1-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L1-L78)

## 3. Data Layer Initialization

The system requires two primary data stores to be initialized before the agents can function correctly.

### PostgreSQL (Relational Data)

The Postgres instance stores customer profiles, appointments, and workforce data.

1. Start the database (e.g., `docker compose up -d postgres`).
2. Run the bootstrap utility to create schemas and tables:

```
digital-stylist-pg-bootstrap --dev
```
3. (Optional) Seed the database with sample data using the provided scripts (e.g., `seed_customers.py`).

### Chroma (Vector Catalog)

The `CatalogAgent` uses Chroma for product RAG (Retrieval-Augmented Generation). You must index a product catalog JSON file:

```
digital-stylist-catalog-feed --path ./path/to/your/catalog.json
```

Sources: [.env.example#27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L27-L27)[.env.example#46-61](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L61)

## 4. Running the Services

The Digital Stylist operates as a coordinated pair of backend services.

### The Python Worker

The worker hosts the LangGraph multi-agent pipeline and the FastAPI `v1/invoke` endpoint.

```
# From the root with venv active
python -m digital_stylist.worker_app
```

By default, it listens on `http://0.0.0.0:8787`. [ .env.example#30-31](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L30-L31)

### The Express Gateway

The gateway handles security, rate limiting, and proxies requests to the worker.

```
cd orchestration
npm run dev
```

By default, it listens on `http://localhost:3000`. [ .env.example#67](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L67-L67)

### System Connectivity Diagram

This diagram shows how the configuration variables map to the communication paths between code entities.

Title: System Communication and Configuration Mapping

Sources: [.env.example#25-33](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L33)[.env.example#67-73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L67-L73)

## 5. Verification and Health Checks

Once services are running, verify their status via the health endpoints.

1. Worker Health: `GET http://localhost:8787/health`
- Returns the status of the Python FastAPI application.
2. Gateway Health: `GET http://localhost:3000/health`
- Aggregates its own status and the reachability of the `STYLIST_WORKER_URL`.

### Request Flow and Entity Association

The following diagram bridges the high-level request flow to the specific code entities involved in a "Getting Started" verification.

Title: Code Entity Association for Chat Request

Sources: [.env.example#30-33](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L30-L33)[.env.example#68-72](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L68-L72)

## 6. Development vs. Production

The system behavior changes based on the `STYLIST_ENV` variable:

- Development (`STYLIST_ENV=development` or unset):

- Missing `STYLIST_PG_*` variables are automatically filled with local defaults (`127.0.0.1:5433`). [ .env.example#47-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L47-L50)
- The LangGraph `MemorySaver` checkpointer is typically used (process-local). [ .env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L3-L4)
- Production (`STYLIST_ENV=production`):

- Postgres configuration is mandatory; no auto-fill occurs. [ .env.example#48-49](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L48-L49)
- `STYLIST_BEHIND_PROXY` should be `true` if running behind an ALB or Nginx to respect `X-Forwarded-*` headers. [ .env.example#32](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L32-L32)
- Horizontal scaling requires replacing the default `MemorySaver` with a shared checkpointer (e.g., Postgres). [ .env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/ .env.example#L3-L4)

Sources: [.env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L3-L4)[.env.example#23](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L23-L23)[.env.example#32](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L32-L32)[.env.example#46-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L50)