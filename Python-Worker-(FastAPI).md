# Python Worker (FastAPI)
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Python Worker is the core execution engine of the Digital Stylist platform. Built with FastAPI, it serves as the bridge between the Express Orchestration Gateway and the LangGraph multi-agent pipeline. Its primary responsibility is to host the compiled agent graph, manage request lifecycles with strict timeouts, and expose auxiliary domain APIs for catalog and fitting room management.

## Application Lifecycle and Configuration

The worker application is initialized in `digital_stylist/worker_app.py`. On startup, it performs several critical setup tasks:

1. Logging Configuration: Initializes structured logging via `configure_logging`[digital_stylist/worker_app.py#53](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L53-L53)
2. Settings Loading: Loads `StylistSettings` which governs everything from LLM providers to timeout durations [digital_stylist/worker_app.py#55](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L55-L55)
3. Graph Compilation: Loads the compiled LangGraph instance. By default, this uses a process-local `MemorySaver` for checkpointing [digital_stylist/worker_app.py#56](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L56-L56)
4. Middleware Setup: Configures `CorrelationIdMiddleware` to ensure every request has a unique `X-Request-ID` for distributed tracing [digital_stylist/worker_app.py#65-67](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L65-L67)

### Configuration Mapping

SettingCode EntityPurpose`STYLIST_WORKER_PORT``settings.worker_port`The port the FastAPI app listens on [digital_stylist/config.py#108](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L108-L108)`STYLIST_INVOKE_TIMEOUT_SEC``settings.invoke_timeout_sec`Max duration for a graph execution [digital_stylist/config.py#110](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L110-L110)`STYLIST_BEHIND_PROXY``settings.behind_proxy`Enables `ProxyHeadersMiddleware` for correct IP detection [digital_stylist/config.py#109](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L109-L109)

Sources:[digital_stylist/worker_app.py#40-70](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L40-L70)[digital_stylist/config.py#105-115](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L105-L115)[.env.example#29-33](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L29-L33)

---

## The `/v1/invoke` Endpoint

The primary interface for agent interaction is the `POST /v1/invoke` endpoint. This endpoint accepts a partial `StylistState` and executes the graph until a terminal node is reached or a timeout occurs.

### Execution Flow

1. Validation: Validates the incoming `InvokeBody` which contains the `messages`, `thread_id`, and optional `context_metadata`[digital_stylist/worker_app.py#125-135](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L125-L135)
2. State Initialization: Merges session defaults and prepares the `StylistState`[digital_stylist/worker_app.py#145-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L145-L150)
3. Async Invocation: Calls `graph.ainvoke` within an `asyncio.wait_for` block to enforce the `STYLIST_INVOKE_TIMEOUT_SEC`[digital_stylist/worker_app.py#157-160](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L157-L160)
4. Response: Returns the updated state to the Orchestration Gateway.

### Request/Response Schema

The worker uses Pydantic models to enforce the contract between the Node.js gateway and the Python backend.

Sources:[digital_stylist/worker_app.py#125-165](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L125-L165)[digital_stylist/contracts/state.py#10-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L10-L40)

---

## System Architecture: Gateway to Graph

The following diagram illustrates how the `worker_app.py` bridges the Natural Language Space (User messages) to the Code Entity Space (LangGraph nodes).

Sources:[digital_stylist/worker_app.py#125-170](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L125-L170)[digital_stylist/graph.py#10-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L10-L50)

---

## Health and Readiness Probes

The worker implements standard probes for container orchestration (e.g., Kubernetes):

- `/health`: A simple liveness check that returns `{"status": "ok"}`[digital_stylist/worker_app.py#112-114](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L112-L114)
- `/ready`: A readiness check that ensures the LangGraph is loaded and the application is fully initialized [digital_stylist/worker_app.py#117-122](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L117-L122)

Sources:[digital_stylist/worker_app.py#110-123](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L110-L123)

---

## Error Handling and Middleware

The worker uses a structured approach to error handling to ensure the Orchestration Gateway receives actionable feedback:

1. Global Exception Handler: Catches unhandled exceptions and logs them with the `X-Request-ID` before returning a 500 status code [digital_stylist/worker_app.py#80-90](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L80-L90)
2. Timeout Handling: If `asyncio.wait_for` expires, the worker logs a timeout event and returns a 504 Gateway Timeout [digital_stylist/worker_app.py#168-175](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L168-L175)
3. Request ID Middleware: Every log entry generated during the request lifecycle is tagged with a `request_id`, allowing developers to trace a single user interaction across the FastAPI logs [digital_stylist/worker_app.py#65-67](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L65-L67)

Sources:[digital_stylist/worker_app.py#60-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L60-L100)[digital_stylist/observability/logging_config.py#10-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/logging_config.py#L10-L30)

---

## Domain API Extensions

Beyond the `/v1/invoke` agent endpoint, the worker mounts additional routers to handle specific domain logic that requires direct database or catalog access:

- Stylist Router: Mounted at `/api/v1`, providing endpoints for catalog browsing and associate workforce management [digital_stylist/worker_app.py#104](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L104-L104)
- Fitting Room Router: Mounted at `/api/v1/fitting-room`, handling real-time session management and physical room reservations [digital_stylist/worker_app.py#105](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L105-L105)

These routes are typically used by the Clienteling App via the Express Gateway's proxy.

Sources:[digital_stylist/worker_app.py#100-108](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L100-L108)[digital_stylist/stylist/router.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/stylist/router.py#L1-L50)