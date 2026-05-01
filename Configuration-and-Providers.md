# Configuration and Providers
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Digital Stylist system relies on a centralized configuration management system and a flexible provider factory layer to handle diverse LLM backends, vector databases, and external data integrations. This architecture allows the system to remain agnostic of specific model vendors or infrastructure choices while providing a unified interface for the multi-agent graph.

## Configuration Management

At the heart of the system is the `StylistSettings` class, which serves as a single source of truth for all environment-based configuration. It utilizes Pydantic for validation and type safety, ensuring that the system fails fast if required credentials or malformed URLs are provided at startup.

### Key Configuration Areas

The configuration is logically grouped into several functional areas:

- Inference: Controls which LLM provider (Google GenAI or OpenAI) is used for chat and embeddings.
- Runtime & Worker: Manages FastAPI server settings, timeouts, and CORS policies.
- Persistence: Configures PostgreSQL for agent state/domain data and Chroma for vector catalog storage.
- Integrations: Toggles MCP (Model Context Protocol) features and remote service URLs.

For a complete list of environment variables and their validation logic, see [StylistSettings Reference](#4.1).

Sources:[digital_stylist/config.py#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L1-L100)

## Provider Factories

The system uses a factory pattern to instantiate the concrete implementations of various services based on the active `StylistSettings`. This layer decouples the agent logic from the underlying SDKs (e.g., LangChain, Google GenAI, or OpenAI).

### Component Resolution

The factory layer is responsible for building the following core components:

- Chat Models: Resolves the appropriate `BaseChatModel` based on `STYLIST_LLM_PROVIDER`.
- Embeddings: Instantiates embedding models, including specialized wrappers like `ThrottledGoogleEmbeddings` to handle rate limits.
- Vector Catalogs: Determines whether to use a persistent `Chroma` instance or an in-memory fallback for local development.
- Run Context: Assembles the `AgentRunContext`, which injects dependencies like the catalog and MCP runtime into the agents.

For implementation details on model selection and API key resolution, see [LLM and Embedding Providers](#4.2).

Sources:[digital_stylist/providers/factories.py#1-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L1-L80)

## System Integration Diagram

The following diagram illustrates how `StylistSettings` drives the instantiation of providers and how those providers bridge the gap between Natural Language processing and the underlying data stores.

### Configuration to Provider Mapping

Sources:[digital_stylist/config.py#15-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L15-L150)[digital_stylist/providers/factories.py#20-110](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L20-L110)

## Vector Catalog and Storage

The system supports multiple backends for storing and retrieving product data via vector search. The `VectorCatalog` protocol defines the interface, while concrete implementations handle the specifics of ChromaDB or local memory.

- Chroma Backend: Used in production and staging for persistent, high-performance vector similarity searches.
- In-Memory Backend: A lightweight alternative for unit tests or quick local experimentation without external dependencies.

The selection is governed by the `STYLIST_VECTOR_BACKEND` setting. For details on how documents are indexed and retrieved, see [Vector Catalog (Chroma and In-Memory)](#4.3).

### Provider Lifecycle

The following sequence shows how a request triggers the resolution of providers via the factory.

Sources:[digital_stylist/worker_app.py#50-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/worker_app.py#L50-L80)[digital_stylist/providers/factories.py#115-140](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L115-L140)

## Sub-Pages

- [StylistSettings Reference](#4.1) — Detailed environment variable documentation and validation rules.
- [LLM and Embedding Providers](#4.2) — Deep dive into model instantiation and provider-specific logic.
- [Vector Catalog (Chroma and In-Memory)](#4.3) — Technical details on the vector storage layer and search implementation.