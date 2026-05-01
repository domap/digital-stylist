# Chat and Invoke Endpoints
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Digital Stylist platform exposes two primary HTTP interfaces for interacting with the LangGraph multi-agent pipeline: the Orchestration Gateway (Node.js/Express) and the Python Worker (FastAPI). The Gateway acts as a security and routing layer, while the Worker executes the agentic logic.

## System Interaction Flow

The flow of a request starts at the client application, moves through the Gateway for validation and tracing, and is then processed by the Python Worker's LangGraph engine.

### Data Flow Diagram

Title: Request Lifecycle from Gateway to Worker

Sources: [orchestration/src/server.mjs#125-168](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L125-L168)[digital_stylist/worker_app.py#101-143](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L101-L143)[digital_stylist/graph.py#23-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L23-L45)

---

## 1. Orchestration Gateway: POST /v1/chat

The gateway is the public-facing entry point defined in `orchestration/src/server.mjs`. It handles cross-cutting concerns like CORS, request tracing, and timeout management.

### Request Handling

The gateway expects a `POST` request with a JSON body. It primarily acts as a proxy to the Python worker's `/v1/invoke` endpoint but adds orchestration logic such as:

- Tracing: Ensuring `X-Request-Id` and `X-Trace-Id` headers are present or generated [orchestration/src/server.mjs#132-135](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L132-L135)
- Timeout Management: Enforcing `STYLIST_WORKER_TIMEOUT_MS` (default 200,000ms) to prevent hanging connections [orchestration/src/server.mjs#140-145](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L140-L145)

### Error Codes

CodeMeaningDescription`413`Payload Too LargeTriggered if message content exceeds `STYLIST_MAX_MESSAGE_CHARS`[digital_stylist/worker_app.py#112-115](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L112-L115)`502`Bad GatewayThe Gateway cannot reach the Python Worker [orchestration/src/server.mjs#161-165](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L161-L165)`504`Gateway TimeoutThe Python Worker did not respond within the configured timeout [orchestration/src/server.mjs#161-165](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L161-L165)

Sources: [orchestration/src/server.mjs#60-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L60-L80)[orchestration/src/server.mjs#125-168](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L125-L168)[.env.example#72](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L72-L72)

---

## 2. Python Worker: POST /v1/invoke

The Python worker, implemented in `digital_stylist/worker_app.py`, hosts the `InvokeBody` schema and the FastAPI route that triggers the LangGraph execution.

### InvokeBody Schema

The worker accepts a structured payload defined by the `InvokeBody` class.

FieldTypeDescription`input``dict`Contains the initial `StylistState` updates, typically `messages`.`thread_id``str`The LangGraph checkpoint identifier for session persistence.`context_metadata``dict`Metadata used by `AgentRunContext`, such as `customer_id`.`merge_session_defaults``bool`If true, applies default session configurations.

### Implementation Details

The `invoke` function in `worker_app.py` performs the following steps:

1. Context Initialization: Calls `build_agent_run_context` to prepare the environment for agents [digital_stylist/worker_app.py#118-121](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L118-L121)
2. State Merging: If `merge_session_defaults` is set, it populates initial state values [digital_stylist/worker_app.py#123-125](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L123-L125)
3. Graph Execution: Executes `app.ainvoke` with a timeout defined by `STYLIST_INVOKE_TIMEOUT_SEC`[digital_stylist/worker_app.py#127-135](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L127-L135)

Title: Python Worker Entity Mapping

Sources: [digital_stylist/worker_app.py#44-51](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L44-L51)[digital_stylist/worker_app.py#101-143](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L101-L143)

---

## 3. State and Headers

### Header Protocol

The system uses a specific header protocol to ensure observability across the Node.js and Python boundary:

- `X-Request-Id`: A unique identifier for the specific HTTP request.
- `X-Trace-Id`: A persistent identifier for a chain of related requests.
- `X-Tenant-Id`: (Optional) Used for multi-tenant data isolation in the Postgres layer.

### StylistState Summary

The response from the endpoints is a serialized version of the `StylistState`. Key fields include:

- `messages`: The full conversation history, including `add_messages` reducer logic [digital_stylist/contracts/state.py#34](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L34-L34)
- `intent_ranking`: Classified user intents from the `IntentAgent`[digital_stylist/contracts/state.py#44](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L44-L44)
- `catalog_response`: Products and search results from the `CatalogAgent`[digital_stylist/contracts/state.py#53](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L53-L53)
- `recommendation_rationale`: The "Why" behind suggestions from the `ExplainabilityAgent`[digital_stylist/contracts/state.py#56](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L56-L56)

Title: StylistState Data Structure

Sources: [digital_stylist/contracts/state.py#28-66](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L28-L66)[orchestration/src/server.mjs#132-135](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L132-L135)

---

## 4. Configuration Reference

The behavior of these endpoints is heavily influenced by the following environment variables:

VariableDefaultDescription`STYLIST_WORKER_URL``http://worker:8787`The location of the Python worker for the Gateway.`STYLIST_INVOKE_TIMEOUT_SEC``180`Hard timeout for the LangGraph execution in the Worker.`STYLIST_MAX_MESSAGE_CHARS``32000`Maximum allowed length for incoming message content.`TRUST_PROXY``true`Enables Express to trust `X-Forwarded-*` headers.

Sources: [.env.example#33-34](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L33-L34)[.env.example#68-73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L68-L73)[digital_stylist/config.py#76-85](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L76-L85)