# Observability and Operations
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

This section provides an overview of the operational lifecycle and monitoring capabilities of the Digital Stylist system. The architecture utilizes a multi-tier approach to observability, ensuring that requests can be traced from the Node.js orchestration gateway through to the Python LangGraph execution and underlying MCP tool calls.

The system is designed for containerized environments, providing standard health probes, structured logging for ingestion into log aggregators, and environment-driven configuration for scaling and security.

### Monitoring and Logging Strategy

Digital Stylist implements structured logging across both its primary runtimes. By setting `STYLIST_LOG_FORMAT=json` in the environment, both the Express gateway and the Python worker emit logs as single-line JSON objects, facilitating integration with tools like Datadog, ELK, or CloudWatch.

- Request Tracing: The system propagates `X-Request-Id` headers across service boundaries to correlate gateway logs with worker execution.
- Contextual Binding: The Python worker uses thread-local context to automatically attach metadata (like `thread_id` or `customer_id`) to every log statement emitted during an agent's run.
- Structured Events: Key lifecycle events, such as `graph_invoke_start`, `mcp_client_call_end`, and `http_request`, are emitted with consistent schemas for performance monitoring and auditing.

For implementation details on log formats and context management, see [Logging and Structured Events](#9.1).

### Health and Readiness Probes

The system exposes standard endpoints to support orchestration platforms like Kubernetes or Docker Swarm.

ComponentEndpointPurposeFile ReferenceExpress Gateway`/health`Shallow check of the Node.js process.[orchestration/src/server.mjs#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L100)Express Gateway`/ready`Deep check; verifies connectivity to the Python worker.[orchestration/src/server.mjs#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L100)Python Worker`/health`Verifies the FastAPI application is responsive.[digital_stylist/worker_app.py#126-128](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L126-L128)Python Worker`/ready`Verifies that the LangGraph and LLM providers are initialized.[digital_stylist/worker_app.py#130-132](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L130-L132)

Sources:

- [orchestration/src/server.mjs#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L100)
- [digital_stylist/worker_app.py#126-132](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L126-L132)

### Operational Architecture

The following diagram illustrates how operational concerns are distributed across the codebase, linking natural language concepts to specific code entities.

System Operational Mapping

Sources:

- [orchestration/src/observability.mjs#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/observability.mjs#L1-L50)
- [digital_stylist/observability/logging_config.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/logging_config.py#L1-L40)
- [digital_stylist/observability/context.py#1-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/context.py#L1-L30)
- [digital_stylist/config.py#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L1-L100)

### Deployment and Scaling

Digital Stylist is configured via environment variables, typically managed through a `.env` file or container orchestration secrets.

- Environment Modes: The `STYLIST_ENV` variable (set to `development`, `staging`, or `production`) controls security behaviors, such as whether internal error details are exposed in API responses.
- Horizontal Scaling: While the default configuration uses an in-memory `MemorySaver` for LangGraph checkpoints, production deployments should transition to a shared `Postgres` or `Redis` checkpointer to allow multiple worker replicas to handle the same `thread_id`.
- Security Scanning: The repository includes a `.pip-audit-cache/` configuration to support automated security scanning of Python dependencies.

For details on Docker configuration, environment variables, and scaling considerations, see [Deployment and Infrastructure](#9.2).

Sources:

- [.env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L3-L4)
- [.env.example#23-24](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L23-L24)
- [.env.example#47-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L47-L50)

### Key Operational Components

The table below maps operational tasks to the relevant code entities:

TaskCode EntityFileLog Initialization`configure_logging`[digital_stylist/observability/logging_config.py#10-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/logging_config.py#L10-L45)Contextual Metadata`obs_bind_partial`[digital_stylist/observability/context.py#15-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/context.py#L15-L25)Configuration Validation`StylistSettings`[digital_stylist/config.py#20-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L20-L150)Gateway Observability`logEvent`[orchestration/src/observability.mjs#5-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/observability.mjs#L5-L20)Catalog Indexing`run_catalog_feed`[catalog_feed/catalog_feed/pipeline.py#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L1-L100)

Sources:

- [digital_stylist/observability/logging_config.py#10-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/logging_config.py#L10-L45)
- [digital_stylist/observability/context.py#15-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/context.py#L15-L25)
- [digital_stylist/config.py#20-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L20-L150)
- [orchestration/src/observability.mjs#5-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/observability.mjs#L5-L20)
- [catalog_feed/catalog_feed/pipeline.py#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L1-L100)