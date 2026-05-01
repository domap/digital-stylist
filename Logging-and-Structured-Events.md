# Logging and Structured Events
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

This page documents the observability architecture of the Digital Stylist system, focusing on structured logging, request context propagation, and event-driven monitoring across the Python worker and the Node.js orchestration gateway.

## Overview

The system utilizes a structured logging approach to ensure that logs from both the Python Worker (FastAPI/LangGraph) and the Orchestration Gateway (Express) can be aggregated and analyzed efficiently. By using structured JSON formats in production, the system provides high-fidelity traces of agentic workflows and HTTP request lifecycles.

### Data Flow and Context Propagation

Observability is maintained through a shared context that follows a request from the initial gateway entry point down to individual tool calls within the LangGraph agents.

1. Orchestration Gateway: Generates or propagates a `X-Request-Id`.
2. Python Worker: Captures the request ID via middleware and binds it to the thread-local or task-local context.
3. Observability Context: Any logs emitted during that request automatically include the request ID and other bound metadata (e.g., `thread_id`).

### Architecture Diagram: Observability Context Flow

The following diagram illustrates how context is bound and propagated across the system.

"Observability Context Flow"

Sources: [orchestration/src/server.mjs#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L100)[digital_stylist/worker_app.py#1-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L150)[digital_stylist/observability/context.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/context.py#L1-L50)

---

## Python Logging Configuration

The Python worker uses `digital_stylist/observability/logging_config.py` to initialize the logging subsystem. It supports both human-readable text output (for development) and machine-readable JSON (for production).

### Key Configuration Parameters

VariableDescriptionDefault`STYLIST_LOG_FORMAT`Sets the output format. Options: `text` or `json`.`text``STYLIST_LOG_LEVEL`Minimum log level (DEBUG, INFO, WARNING, ERROR).`INFO`

The `configure_logging` function sets up the root logger and configures standard library logging to interoperate with structured logs.

Sources: [.env.example#36-39](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L36-L39)[digital_stylist/observability/logging_config.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/logging_config.py#L1-L40)

---

## Observability Context (Python)

The `digital_stylist/observability/context.py` module provides utilities for managing request-scoped metadata. This is critical for tracing logs back to a specific user session or LangGraph thread.

### Context Management Functions

- `obs_bind_partial(**kwargs)`: Binds key-value pairs to the current execution context. All subsequent logs in the same task/thread will include these fields.
- `obs_reset()`: Clears the current context. This is typically called at the end of a request lifecycle to prevent context leakage between requests.

### Implementation Details

The system uses `ContextVar` to ensure that context is maintained correctly across asynchronous `asyncio` boundaries, which is essential for FastAPI and LangGraph's concurrent execution.

"Context Binding Entity Mapping"

Sources: [digital_stylist/observability/context.py#1-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/context.py#L1-L45)

---

## Node.js Orchestration Logging

The orchestration gateway in `orchestration/src/observability.mjs` provides a `logEvent` function. This ensures that the Node.js side of the house follows the same structured logging patterns as the Python worker.

### logEvent Function

The `logEvent(eventName, data)` function is used to record significant lifecycle events. If `STYLIST_LOG_FORMAT` is set to `json`, it outputs a single-line JSON object containing:

- `timestamp`: ISO 8601 string.
- `event`: The name of the event (e.g., `http_request`).
- `level`: Log level (defaulting to `info`).
- `data`: Arbitrary metadata provided by the caller.

Sources: [.env.example#40-42](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L40-L42)[orchestration/src/observability.mjs#1-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/observability.mjs#L1-L30)

---

## Key Structured Event Names

The following table lists the standardized event names used throughout the codebase to track the flow of data and agent performance.

Event NameSourceDescription`http_request`Orchestration GatewayRecorded when a request hits the `/v1/chat` endpoint.`graph_invoke_start`Python WorkerEmitted immediately before calling `graph.ainvoke()`.`graph_invoke_end`Python WorkerEmitted after the LangGraph execution completes successfully.`mcp_client_call_start`MCP RuntimeEmitted before invoking a tool via the Model Context Protocol.`mcp_client_call_end`MCP RuntimeEmitted after an MCP tool call returns results.`vector_search_start`Vector CatalogEmitted before querying Chroma or Memory vector stores.`vector_search_end`Vector CatalogEmitted with results/count from the vector store.

Sources: [digital_stylist/worker_app.py#100-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L100-L150)[orchestration/src/observability.mjs#10-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/observability.mjs#L10-L25)[digital_stylist/mcp/runtime.py#50-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L50-L100)

---

## Example Log Output (JSON)

When `STYLIST_LOG_FORMAT=json` is enabled, a typical log entry for an MCP tool call looks like this:

```
{
  "timestamp": "2023-10-27T10:00:01.123Z",
  "level": "INFO",
  "event": "mcp_client_call_end",
  "request_id": "req-789",
  "thread_id": "thread-456",
  "tool_name": "get_customer_profile",
  "duration_ms": 145,
  "status": "success"
}
```

This structure allows operations teams to build dashboards monitoring tool latency, error rates per agent, and request volume across the entire monorepo.

Sources: [digital_stylist/observability/logging_config.py#15-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/observability/logging_config.py#L15-L30)[.env.example#36-42](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L36-L42)