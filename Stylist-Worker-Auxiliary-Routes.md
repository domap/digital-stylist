# Stylist Worker Auxiliary Routes
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

This page documents the auxiliary HTTP routes registered by the Python worker. While the primary `/v1/invoke` endpoint handles the LangGraph agentic reasoning, these auxiliary routes provide the operational backbone for the Clienteling and Connect frontend applications. They manage catalog data, workforce availability, fitting-room logistics, and real-time notifications via Server-Sent Events (SSE).

## Overview of Auxiliary Routing

The worker application mounts two primary sets of auxiliary routes in addition to the core chat API:

1. Stylist Routes: Registered in `digital_stylist/stylist/router.py`, covering catalog access, workforce/associate management, and voice intent processing.
2. Fitting Room Routes: Registered in `digital_stylist/fitting_room_api.py`, managing the lifecycle of fitting-room reservations and task queues for store associates.

These routes interact heavily with the PostgreSQL persistence layer and the Vector Catalog (Chroma/In-Memory) to provide a unified API for the storefronts.

### Architecture and Data Flow

The following diagram illustrates how auxiliary routes bridge the frontend applications to the persistent data stores and the vector catalog.

Auxiliary Route Integration Map

Sources: [digital_stylist/stylist/router.py#1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/stylist/router.py#L1-L10)[digital_stylist/fitting_room_api.py#1-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/fitting_room_api.py#L1-L15)

---

## Catalog and Media Routes

The catalog routes allow the frontend to browse the product assortment and retrieve high-resolution assets.

### Product Discovery

The `GET /api/v1/catalog/products` route provides a paginated or filtered view of the catalog. It leverages the `VectorCatalog` protocol to fetch product metadata stored during the indexing process.

- Implementation: Queries the active `VectorCatalog` instance (either `ChromaVectorCatalog` or `MemoryVectorCatalog`).
- Media Serving: The route `GET /api/v1/catalog/media/{path:path}` serves product images directly from the `catalog_feed/assets/` directory, ensuring that the frontend can render product cards without external CDN dependencies in development.

Sources: [digital_stylist/stylist/router.py#40-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/stylist/router.py#L40-L60)[digital_stylist/providers/vector_chroma.py#10-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_chroma.py#L10-L30)

---

## Workforce and Associate Management

These routes support the Clienteling app's "Associate" persona, allowing the system to identify which stylist is currently handling a customer session.

EndpointMethodDescriptionData Source`/api/v1/workforce/associates`GETReturns a list of all active store associates.`stylist.associates` (PG)`/api/v1/workforce/associates/{id}`GETFetches detailed profile for a specific associate.`stylist.associates` (PG)

### Tenant Enforcement

All workforce queries are subject to tenant isolation. The worker utilizes the `tenant_id` (defaulting to `default`) to filter records in the PostgreSQL `stylist` schema, ensuring data privacy between different retail environments.

Sources: [digital_stylist/stylist/router.py#70-95](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/stylist/router.py#L70-L95)[digital_stylist/infra/postgres/schema.sql#20-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/schema.sql#L20-L45)

---

## Fitting Room Operations

The fitting room subsystem manages the physical interaction between the digital recommendation and the in-store experience. It follows a "Reservation -> Task -> Completion" lifecycle.

### Reservation Lifecycle

1. POST `/api/v1/fitting-room/reservations`: Triggered by the Connect App when a customer wants to try on items. This creates a record in the `stylist.appointments` table and generates a task for the workforce.
2. SSE Stream (`/api/v1/fitting-room/tasks/stream`): The Clienteling App maintains an EventSource connection to this endpoint. When a new reservation is created, the worker broadcasts a notification to all connected associates.
3. Task Management: Associates use `PATCH /api/v1/fitting-room/tasks/{id}/claim` and `POST /api/v1/fitting-room/tasks/{id}/complete` to update the task status in PostgreSQL.

Fitting Room Task Flow

Sources: [digital_stylist/fitting_room_api.py#20-110](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/fitting_room_api.py#L20-L110)[.env.example#46-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L60)

---

## Voice Intent Processing

The route `POST /api/v1/stylist/voice-intent` provides a specialized entry point for voice-to-action workflows. Unlike the general chat `/v1/invoke` which returns a full agentic response, this endpoint is optimized for high-speed intent classification.

- Functionality: It accepts a transcript from the frontend (Clienteling/Connect) and returns a structured `IntentLiteral` (e.g., `PRODUCT_SEARCH`, `BOOK_APPOINTMENT`).
- Logic: It bypasses the full LangGraph if only classification is needed, allowing the frontend to navigate the UI immediately based on the user's spoken words.

Sources: [digital_stylist/stylist/router.py#120-145](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/stylist/router.py#L120-L145)[digital_stylist/contracts/state.py#15-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L15-L30)

---

## Dependencies and Configuration

### PostgreSQL Requirement

These auxiliary routes require a running PostgreSQL instance with the `stylist` schema initialized. If `STYLIST_PG_DATASTORE` is set to `memory`, these routes will return empty results or 501 errors as they lack a persistent backing for workforce and appointments.

### Environment Variables

- `STYLIST_PG_DSN`: Connection string for the database.
- `STYLIST_TENANT_STYLIST_CONFIG_JSON`: Path to the tenant configuration used to seed the initial workforce and catalog settings.
- `STYLIST_BEHIND_PROXY`: Must be `true` if the worker is behind the Express Gateway to ensure SSE headers and CORS are handled correctly.

Sources: [.env.example#46-64](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L64)[digital_stylist/config.py#100-130](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L100-L130)