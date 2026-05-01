# Deployment and Infrastructure
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)
- [.pip-audit-cache/0/0/5/5/3/0055387fa5673ebb7adb10550dd21f2bfdda6469d0784a852e21c355](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.pip-audit-cache/0/0/5/5/3/0055387fa5673ebb7adb10550dd21f2bfdda6469d0784a852e21c355)
- [.pip-audit-cache/0/3/f/b/0/03fb04c8dd73f6e96922d16b1161eeb8ddf2d58d5d9e49c966a9aacc](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.pip-audit-cache/0/3/f/b/0/03fb04c8dd73f6e96922d16b1161eeb8ddf2d58d5d9e49c966a9aacc)

This section details the containerization, environment configuration, and operational strategies for the Digital Stylist system. The architecture is designed for multi-tier deployment using Docker, supporting varied environments from local development to production-grade horizontal scaling.

## Docker Architecture

The system utilizes a multi-container strategy to separate the Node.js orchestration gateway, the Python FastAPI worker, and the supporting data services.

### Container Definitions

- Orchestration Gateway: Defined in the root `Dockerfile`, this Node.js environment runs the Express server found in `orchestration/src/server.mjs`. It serves as the ingress point for storefront applications [orchestration/src/server.mjs#1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L10)
- Python Worker: Defined in the root `Dockerfile`, this container runs the FastAPI application in `digital_stylist/worker_app.py`. It handles the LangGraph execution and domain logic [digital_stylist/worker_app.py#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L20)
- Catalog Feed: A specialized container defined in `catalog_feed/Dockerfile`. It is used as a standalone utility or job to index product data into the Chroma vector database [catalog_feed/Dockerfile#1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/Dockerfile#L1-L10)

### Docker Compose Patterns

The `docker-compose.yml` (implied by `.env.example`) typically orchestrates the following services:

1. `gateway`: The Express orchestrator.
2. `worker`: The Python FastAPI service.
3. `postgres`: The relational store for customers and appointments.
4. `chroma`: The vector database (if not using the in-memory backend).

Sources:[.env.example#66-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L66-L78)[digital_stylist/worker_app.py#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L20)

## Environment-Specific Behavior

The system behavior is governed by the `STYLIST_ENV` variable, which toggles security, logging, and data defaults.

VariableDevelopmentStaging/Production`STYLIST_ENV``development` (or unset)`production`Postgres DefaultsAuto-fills with `127.0.0.1:5433` if missingRequires explicit `STYLIST_PG_DSN` or variablesDebug Mode`STYLIST_DEBUG=true` enables verbose trace`STYLIST_DEBUG=false`OpenAPI DocsUsually enabled for testingControlled by `should_show_openapi()`Error ExposureDetailed tracebacks in HTTP responses`expose_internal_errors()` returns generic messages

Sources:[.env.example#23-24](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L23-L24)[.env.example#46-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L60)

## Horizontal Scaling Considerations

While the system is stateless at the HTTP level, the LangGraph `StateGraph` requires a checkpointer to persist conversation state across turns.

### Checkpointer Replacement

By default, the system uses `MemorySaver`, which is process-local and prevents horizontal scaling of the `worker` service [.env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L3-L4)

- Single Instance: Safe to use `MemorySaver` for single-replica deployments.
- Multi-Instance: For horizontal scaling, the checkpointer must be replaced with a shared backend (e.g., `PostgresSaver` or `RedisSaver`). This is configured in `digital_stylist/graph.py` during the `app.compile()` phase.

### Proxy Configuration

When running behind a Load Balancer or Ingress Controller:

- `STYLIST_BEHIND_PROXY=true`: Informs the Python worker to trust `X-Forwarded-*` headers for correct URL generation and logging [.env.example#32](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L32-L32)
- `TRUST_PROXY=true`: Informs the Express gateway to trust upstream proxy headers [orchestration/src/server.mjs#73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L73-L73)

Sources:[.env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L3-L4)[.env.example#32](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L32-L32)[.env.example#73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L73-L73)

## Security Scanning Workflow

The repository includes a `pip-audit` workflow to ensure the Python dependency tree is free of known vulnerabilities.

### .pip-audit-cache

The `.pip-audit-cache/` directory stores cached responses from the Python Package Index (PyPI) and vulnerability databases. This significantly speeds up CI/CD pipelines by avoiding redundant network requests when checking `requirements.txt` or `pyproject.toml` against the Vulnerability DB.

Sources:[.pip-audit-cache/0/0/5/5/3/0055387fa5673ebb7adb10550dd21f2bfdda6469d0784a852e21c355#1-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.pip-audit-cache/0/0/5/5/3/0055387fa5673ebb7adb10550dd21f2bfdda6469d0784a852e21c355#L1-L4)

## Infrastructure Diagrams

### System Deployment Flow

This diagram maps the natural language deployment concepts to the specific code entities and environment variables that control them.

Sources:[.env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L3-L4)[.env.example#32-33](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L32-L33)[orchestration/src/server.mjs#68](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L68-L68)[digital_stylist/worker_app.py#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L20)

### Data Ingestion and Catalog Infrastructure

This diagram shows the relationship between the `catalog_feed` package and the runtime environment.

Sources:[.env.example#25-27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L27)

## Operational Summary Table

ComponentPortKey ConfigRoleGateway`3000``STYLIST_WORKER_URL`CORS, Auth, and Proxying [.env.example#67-68](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L67-L68)Worker`8787``STYLIST_LLM_PROVIDER`Agent execution & LLM calls [.env.example#7-31](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L7-L31)MCP Service`8000``STYLIST_MCP_ENABLED`Tool & Context provision [.env.example#44](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L44-L44)Postgres`5433``STYLIST_PG_DSN`Relational data storage [.env.example#55-59](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L55-L59)

Sources:[.env.example#1-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L1-L78)