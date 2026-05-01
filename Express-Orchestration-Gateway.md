# Express Orchestration Gateway
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Express Orchestration Gateway, located in `orchestration/src/server.mjs`, serves as the secure entry point and traffic controller for the Digital Stylist ecosystem. It provides a unified API surface for frontend applications (Clienteling and Connect), handles security concerns like CORS and rate limiting, and manages the lifecycle of requests flowing to the downstream Python worker.

### Core Responsibilities

The gateway is designed as a lightweight Node.js service that abstracts the complexity of the multi-tier architecture from the client. Its primary duties include:

- Security Enforcement: Implementing HTTP headers (Helmet), CORS policies, and request throttling.
- Request Routing: Handling the high-level `/v1/chat` orchestration and proxying auxiliary `/api/*` requests to the Python worker.
- Health Aggregation: Monitoring its own status and that of the downstream worker to provide a unified readiness signal.
- Resilience: Managing timeouts and ensuring graceful shutdowns during deployment cycles.

---

### Implementation and Security

The server is built using Express.js and follows a standard middleware pattern to secure incoming traffic before it reaches the application logic.

#### Security Middleware

The gateway implements several layers of protection:

- Helmet: Configured to set secure HTTP headers, including Content Security Policy (CSP) and frame protection [orchestration/src/server.mjs#26](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L26-L26)
- Rate Limiting: Prevents abuse by limiting the number of requests per IP address within a specific window [orchestration/src/server.mjs#28-32](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L28-L32)
- CORS: Dynamically configured via the `STYLIST_CORS_ORIGINS` environment variable to allow cross-origin requests from trusted storefronts [orchestration/src/server.mjs#23](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L23-L23)
- Trust Proxy: When `TRUST_PROXY` is set to `true`, the Express app is configured to trust `X-Forwarded-For` headers, which is essential for accurate rate limiting when deployed behind a load balancer [orchestration/src/server.mjs#15-17](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L15-L17)

#### Configuration Variables

VariableDescriptionSource`PORT`The port the Express server listens on (default: 3000).[.env.example#67](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L67-L67)`STYLIST_WORKER_URL`The base URL of the Python FastAPI worker (e.g., `http://worker:8787`).[.env.example#68](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L68-L68)`STYLIST_CORS_ORIGINS`Comma-separated list of allowed origins for CORS.[.env.example#69-71](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L69-L71)`STYLIST_WORKER_TIMEOUT_MS`Maximum time to wait for the worker to respond (default: 200,000ms).[.env.example#72](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L72-L72)`TRUST_PROXY`Boolean to enable/disable Express `trust proxy` setting.[.env.example#73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L73-L73)

Sources:[.env.example#66-74](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L66-L74)[orchestration/src/server.mjs#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L1-L40)

---

### Data Flow and Routing

The gateway handles two distinct types of traffic: high-level chat orchestration and low-level API operations.

#### 1. Chat Orchestration (`/v1/chat`)

This endpoint is the primary interface for the AI stylist. When a request hits `/v1/chat`, the gateway:

1. Validates the incoming payload.
2. Forwards the request to the Python worker's `/v1/invoke` endpoint.
3. Manages the connection lifetime based on `STYLIST_WORKER_TIMEOUT_MS`.

#### 2. Worker Proxy (`/api/*`)

To simplify frontend development, the gateway acts as a reverse proxy for all `/api` routes. Requests like `/api/v1/fitting-room/reservations` are transparently passed to the Python worker. This allows the frontend to communicate with a single host regardless of whether it is interacting with the LangGraph pipeline or the Postgres-backed auxiliary services.

#### Architecture: Code Entity Space to Network Flow

The following diagram maps the Express entities to the network flow between the Client and the Python Worker.

Sources:[orchestration/src/server.mjs#42-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L42-L80)[.env.example#68-76](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L68-L76)

---

### Health and Lifecycle Management

The gateway provides endpoints for container orchestrators (like Kubernetes or Docker Compose) to monitor the health of the entire stack.

#### Health and Readiness

- Liveness (`/health`): Returns a `200 OK` if the Express process is running.
- Readiness (`/ready`): Performs an "aggregation check." It pings the downstream Python worker's `/health` endpoint. If the worker is unreachable or unhealthy, the gateway returns a `503 Service Unavailable`, ensuring traffic is only routed when the full stack is ready.

#### Graceful Shutdown

The server implements a shutdown handler to prevent dropped connections during deployments. When a `SIGTERM` or `SIGINT` signal is received, the gateway:

1. Stops accepting new connections.
2. Waits for active requests (like long-running LLM generations) to complete or timeout.
3. Closes the HTTP server and exits the process.

#### Implementation: Component Interaction

This diagram illustrates how the `server.mjs` manages the lifecycle and health of the `STYLIST_WORKER_URL`.

Sources:[orchestration/src/server.mjs#100-130](https://github.com/domap/digital-stylist/blob/c8fd6fe5/orchestration/src/server.mjs#L100-L130)[.env.example#30-33](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L30-L33)