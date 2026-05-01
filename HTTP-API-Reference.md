# HTTP API Reference
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Digital Stylist system exposes a distributed HTTP API surface across two primary tiers: the Express Orchestration Gateway and the Python Stylist Worker. The gateway serves as the public-facing entry point for frontend applications, providing security, rate limiting, and request routing, while the worker executes the LangGraph-based AI logic and domain-specific operations.

## Architecture Overview

The API is structured to separate orchestration concerns (Node.js) from heavy AI inference and domain logic (Python).

- Orchestration Gateway (`orchestration/`): Acts as a reverse proxy and security layer. It exposes the `/v1/chat` endpoint for the unified chat interface and proxies `/api/*` requests directly to the Python worker.
- Stylist Worker (`digital_stylist/`): Executes the core business logic. It provides the `/v1/invoke` endpoint for the LangGraph pipeline and a set of auxiliary REST routes for catalog management, fitting room operations, and associate workflows.

### System Entry Points Diagram

This diagram illustrates how external requests from the `Clienteling` and `Connect` apps flow through the code entities of the gateway and worker.

Sources: [orchestration/src/server.mjs#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L100)[.env.example#66-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L66-L78)[digital_stylist/worker_app.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L50)

---

## Core Chat and Invoke Endpoints

The primary interaction pattern for the Digital Stylist is a stateful chat conversation. This is handled by two corresponding endpoints that share a common request contract.

### POST /v1/chat (Gateway)

The gateway endpoint is the intended consumer for frontend apps. It performs validation and passes the payload to the worker. It is configured via `STYLIST_WORKER_URL` and manages timeouts using `STYLIST_WORKER_TIMEOUT_MS`.

### POST /v1/invoke (Worker)

The worker endpoint is the engine of the system. It accepts an `InvokeBody` payload, which includes the conversation history (`messages`), the `thread_id` for state persistence, and `context_metadata` (e.g., `customer_id`).

For detailed request/response schemas, error codes (413 Payload Too Large, 504 Gateway Timeout), and tracing header protocols, see [Chat and Invoke Endpoints](#8.1).

Sources: [.env.example#33-34](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L33-L34)[.env.example#68-72](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L68-L72)[digital_stylist/worker_app.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L50)

---

## Stylist Worker Auxiliary Routes

Beyond the core chat functionality, the Python worker exposes a suite of RESTful routes to support the retail domain. These routes are primarily consumed by the `Clienteling` app to manage the physical store experience.

### Catalog and Media

Endpoints for searching the product catalog and serving media assets associated with products. These routes interact with the `VectorCatalog` and the `assets/` directory.

### Workforce and Fitting Room

The system manages real-time store operations through:

- Associate Routes: Reading associate profiles and task queues.
- Fitting Room API: Handling reservations (`POST /api/v1/fitting-room/reservations`) and task lifecycle (claim/complete).
- Notifications: An SSE (Server-Sent Events) stream for real-time updates to associates.

### Data Dependencies

These routes heavily rely on the PostgreSQL backend for persistence and enforce tenant isolation based on the `tenant_id` provided in requests.

For the full list of auxiliary routes and their parameters, see [Stylist Worker Auxiliary Routes](#8.2).

Sources: [.env.example#46-64](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L64)[digital_stylist/worker_app.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L50)

---

## API Communication Summary

SourceDestinationPathPurposeStorefront AppsGateway`/v1/chat`Main AI styling interactionStorefront AppsGateway`/api/v1/fitting-room/*`Proxy to worker for store opsGatewayWorker`/v1/invoke`Trigger LangGraph executionGatewayWorker`/api/*`Pass-through for auxiliary services

Sources: [.env.example#66-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L66-L78)[digital_stylist/worker_app.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L1-L50)