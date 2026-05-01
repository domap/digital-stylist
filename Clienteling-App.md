# Clienteling App
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Clienteling App (`apps/clienteling/src/`) is a React-based TypeScript application designed for retail associates. It serves as the primary interface for managing customer relationships, orchestrating AI-driven styling sessions, and managing physical store tasks such as the fitting room queue.

The application implements a multi-pane workflow that integrates real-time chat with a LangGraph-backed digital stylist, deep customer insights, and a product catalog for manual and AI-driven recommendations.

## Core Architecture and Routing

The application is built as a Single Page Application (SPA) using `react-router-dom`. The routing structure is defined in `apps/clienteling/src/App.tsx`, providing distinct views for associate workflows.

### Main Routes

RouteComponentPurpose`/``Dashboard`The entry point for associates, showing active tasks and customer lists.`/customer/:id``CustomerDetail`The primary workspace for a specific customer interaction.`/tasks``TaskQueue`Management of the store's fitting room and service queue.

The root of the application is wrapped in a `DigitalStylistProvider` which manages the global state for the AI interaction, including the `thread_id` and the shared `StylistState`.

Sources: [apps/clienteling/src/App.tsx#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/App.tsx#L1-L40)[apps/clienteling/src/pages/Dashboard.tsx#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/pages/Dashboard.tsx#L1-L20)

## Associate Workflow: Code to Entity Mapping

The following diagram bridges the associate's physical actions to the code entities that handle them within the React application.

Associate Workflow Mapping

Sources: [apps/clienteling/src/components/DigitalStylistContainer.tsx#10-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/components/DigitalStylistContainer.tsx#L10-L50)[apps/clienteling/src/components/StylistChat.tsx#15-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/components/StylistChat.tsx#L15-L60)[apps/clienteling/src/components/ProductCatalog.tsx#5-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/components/ProductCatalog.tsx#L5-L30)

## Key Components

### DigitalStylistContainer

This is the layout orchestrator for the `CustomerDetail` page. It synchronizes data between the `CustomerProfilePanel` (left), `StylistChat` (center), and `ProductCatalog` (right). It ensures that when a new message is sent, the state updates are propagated to the recommendation engine.

### StylistChat

The core interaction hub. It handles message history, streaming responses from the LangGraph worker, and integrates the `VoiceInputButton`.

- Functions: `handleSendMessage`, `renderMessageBubble`.
- State Management: Uses the `useStylistChat` hook to interface with the `/v1/chat` endpoint.

### CustomerProfilePanel & CustomerInsightsView

These components display data fetched via the MCP (Model Context Protocol) customer handler.

- CustomerProfilePanel: Displays static metadata (loyalty status, sizes, preferences).
- CustomerInsightsView: Renders AI-generated insights such as "Style DNA" or "Purchase Propensity" derived from the `StylistState.customer_context`.

### ProductCatalog and ProductCard

The catalog provides a searchable view of the store's inventory.

- AI Recommendations: Products identified by the `CatalogAgent` in the Python worker appear here with a "Recommended" badge.
- ProductCard: Encapsulates product metadata, pricing, and the `AddToFittingRoom` action.

### AssociateTaskQueue

This component monitors the fitting room status. It communicates with the `fitting_room_api.py` on the worker to claim, complete, or cancel tasks (e.g., "Bring Size M to Room 4").

Sources: [apps/clienteling/src/components/DigitalStylistContainer.tsx#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/components/DigitalStylistContainer.tsx#L1-L100)[apps/clienteling/src/components/StylistChat.tsx#1-120](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/components/StylistChat.tsx#L1-L120)[apps/clienteling/src/components/CustomerProfilePanel.tsx#1-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/components/CustomerProfilePanel.tsx#L1-L45)[apps/clienteling/src/components/AssociateTaskQueue.tsx#1-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/components/AssociateTaskQueue.tsx#L1-L80)

## Data Flow: Chat and Recommendations

The data flow between the Clienteling App and the backend follows a strict request-response pattern where the React frontend maintains a local copy of the `StylistState`.

Data Flow Diagram

Sources: [apps/clienteling/src/hooks/useStylistChat.ts#10-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/hooks/useStylistChat.ts#L10-L50)[.env.example#66-73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L66-L73)

## Technical Utilities and Hooks

### Hooks (`apps/clienteling/src/hooks/`)

- `useStylistChat`: Manages the state of the current conversation, handling loading states and error boundaries for the `/v1/chat` endpoint.
- `useCustomerData`: Fetches and caches customer profile information using the `customer_id` from the URL.
- `useFittingRoom`: Provides a real-time stream (via SSE or polling) of the current task queue.

### Library Utilities (`apps/clienteling/src/lib/`)

- `api-client.ts`: A configured `axios` or `fetch` wrapper that injects necessary headers like `X-Request-Id` and handles base URL configuration from environment variables.
- `formatters.ts`: Utilities for currency formatting and date manipulation for the retail calendar.

## Voice Integration

The `VoiceInputButton` component utilizes the Web Speech API or a custom provider to capture associate intent hands-free.

1. Capture: Audio is transcribed locally or sent to a `/api/v1/voice/intent` endpoint.
2. Processing: The resulting text is injected into the `StylistChat` input.
3. Execution: The message is processed by the `IntentAgent` in the LangGraph to determine if the associate is asking for a product search or a task update.

Sources: [apps/clienteling/src/components/VoiceInputButton.tsx#5-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/components/VoiceInputButton.tsx#L5-L40)[apps/clienteling/src/hooks/useStylistChat.ts#60-85](https://github.com/domap/digital-stylist/blob/c8fd6fe5/apps/clienteling/src/hooks/useStylistChat.ts#L60-L85)