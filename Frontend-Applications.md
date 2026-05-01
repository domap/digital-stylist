# Frontend Applications
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)
- [.gitignore](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore)

The Digital Stylist platform provides two distinct React/TypeScript storefront applications located in the `apps/` directory. These applications serve different personas within the retail ecosystem: the Clienteling app for store associates and the Connect app for customers.

Both applications are built with modern frontend stacks (React, TypeScript, Vite) and communicate with the backend via the [Express Orchestration Gateway](#2.1).

### Application Overview

AppPersonaPrimary PurposePort (Dev)ClientelingStore AssociateCustomer profile management, AI-assisted styling, and task queue handling.`5173`ConnectEnd CustomerPersonalized discovery, multi-day itineraries, and fitting room reservations.`5174`

The development servers for both apps are configured to proxy `/api` and `/v1` requests to the Orchestration Gateway (typically on port `3000`), which in turn routes requests to the Python Worker [`.env.example#75-77](https://github.com/domap/digital-stylist/blob/c8fd6fe5/`.env.example#L75-L77)

---

### Shared Communication Pattern

The frontend applications interact with the system through two primary channels:

1. Orchestration Gateway (`/v1/chat`): Used for the core LLM-driven chat experience.
2. Stylist Worker API (`/api/v1/*`): Used for domain-specific operations such as fetching the product catalog, managing fitting room tasks, and retrieving associate/customer metadata [`.env.example#75-77](https://github.com/domap/digital-stylist/blob/c8fd6fe5/`.env.example#L75-L77)

### High-Level Architecture

The following diagram illustrates how the frontend applications bridge the gap between user interaction and the underlying LangGraph orchestration.

Frontend-to-Backend Mapping

Sources:[`.env.example#66-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/`.env.example#L66-L78)[`orchestration/src/server.mjs#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/`orchestration/src/server.mjs#L1-L50) (referenced conceptually).

---

### Clienteling App (Associate-Facing)

The Clienteling application is designed for the "Digital Stylist" (the store associate). It provides a comprehensive dashboard to manage customer relationships and fulfill styling requests.

Key Features:

- Customer Selection & Profiles: Associates can view detailed customer history and insights.
- AI-Assisted Chat: A specialized interface (`StylistChat`) that allows associates to use the AI as a co-pilot to generate product recommendations.
- Task Management: The `AssociateTaskQueue` handles real-time requests such as fitting room preparations or customer inquiries.
- Product Catalog: An integrated browser (`ProductCatalog`) to manually add items to a customer's curated list.

For a deep dive into the components and hooks used in this application, see [Clienteling App](#7.1).

---

### Connect App (Customer-Facing)

The Connect application is the consumer-facing touchpoint. It focuses on a high-end, personalized discovery experience, often branded under the "Ann" persona.

Key Features:

- Multi-Day Itineraries: The UI uses logic like `resolveConnectDayLayout` to group recommendations into a chronological "day-plan" format.
- Explainability: Uses `ConnectExplainability` to show customers *why* certain items were picked for them based on their profile.
- Interactive Discover: A "Tinder-style" or swipeable card interface (`RecommendedCards`) for quick feedback on styles.
- Fitting Room Integration: Allows customers to reserve a physical fitting room in-store directly from the app.

For details on the itinerary layout logic and the OTP authentication flow, see [Connect App](#7.2).

---

### Environment Configuration

Frontends are configured via environment variables to point to the correct gateway. In local development, the Vite proxy handles the routing to avoid CORS issues. In production, `STYLIST_CORS_ORIGINS` must be set in the gateway to allow these applications to communicate [`.env.example#69-71](https://github.com/domap/digital-stylist/blob/c8fd6fe5/`.env.example#L69-L71)

Sources:[`.env.example#66-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/`.env.example#L66-L78)[`.gitignore#12](https://github.com/domap/digital-stylist/blob/c8fd6fe5/`.gitignore#L12-L12)