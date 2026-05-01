# LLM and Embedding Providers
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

This page documents the provider factory layer of the Digital Stylist system, located in `digital_stylist/providers/factories.py`. This layer is responsible for abstracting the selection, instantiation, and configuration of Large Language Models (LLMs), embedding models, and vector search backends based on environment settings.

## Overview of Provider Factories

The system utilizes a factory pattern to resolve dependencies for the LangGraph agents. This ensures that the specific choice of provider (e.g., Google GenAI vs. OpenAI) is transparent to the domain logic. The factories handle API key resolution, model ID fallbacks, and specialized wrappers like throttling for specific API limits.

### Key Factory Functions

FunctionPurpose`build_chat_model()`Instantiates a LangChain-compatible chat model based on `STYLIST_LLM_PROVIDER`.`build_embeddings()`Returns an embedding model for vectorizing queries and documents.`build_vector_catalog()`Resolves the `VectorCatalog` implementation (Chroma or In-Memory).`build_agent_run_context()`Assembles the `AgentRunContext` containing initialized providers for the graph.

Sources: [digital_stylist/providers/factories.py#1-120](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L1-L120)

## LLM Selection and Resolution

The system supports two primary providers: `google_genai` (default) and `openai`. The selection is driven by the `STYLIST_LLM_PROVIDER` environment variable.

### Inference Defaults

If specific model IDs are not provided via `STYLIST_CHAT_MODEL` or `STYLIST_EMBEDDING_MODEL`, the system falls back to constants defined in `inference_defaults.py`.

- Google GenAI Defaults:`gemini-1.5-flash` for chat, `text-embedding-004` for embeddings.
- OpenAI Defaults:`gpt-4o` for chat, `text-embedding-3-small` for embeddings.

### Provider Initialization Logic

The `build_chat_model()` function performs the following steps:

1. Determines the provider from `StylistSettings`.
2. Resolves the API key from `STYLIST_LLM_API_KEY` (or provider-specific env vars like `GOOGLE_API_KEY`).
3. Initializes either `ChatGoogleGenerativeAI` or `ChatOpenAI`.
4. Applies default parameters such as `temperature=0`.

Sources: [digital_stylist/providers/factories.py#22-55](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L22-L55)[digital_stylist/providers/inference_defaults.py#1-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/inference_defaults.py#L1-L15)

## Embedding Providers and Throttling

Embedding models are initialized via `build_embeddings()`. A notable implementation detail is the handling of Google's rate limits for embedding generation.

### ThrottledGoogleEmbeddings

When using the Google provider, the system wraps the standard `GoogleGenerativeAIEmbeddings` in a `ThrottledGoogleEmbeddings` class. This class uses a semaphore to limit concurrent requests to the embedding API, controlled by the `STYLIST_GOOGLE_EMBED_THROTTLE` setting (defaulting to 4). This prevents `429 Too Many Requests` errors during high-volume operations like batch indexing.

### Provider Data Flow

The following diagram illustrates how configuration variables flow into the instantiated code entities.

LLM and Embedding Factory Flow

Sources: [digital_stylist/providers/factories.py#58-91](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L58-L91)[digital_stylist/config.py#45-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L45-L60)

## Vector Catalog Resolution

The `build_vector_catalog()` function determines which implementation of the `VectorCatalog` protocol to use based on `STYLIST_VECTOR_BACKEND`.

1. Chroma Backend (`chroma`): Initializes `VectorCatalogChroma`. It requires an embedding model and uses `CHROMA_PERSIST_DIR` for storage.
2. Memory Backend (`memory`): Initializes `VectorCatalogMemory`. This is a non-persistent fallback typically used for testing or development where no Chroma instance is available.

Sources: [digital_stylist/providers/factories.py#94-110](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L94-L110)[.env.example#25-27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L27)

## Agent Run Context Assembly

The `build_agent_run_context()` function acts as the final assembly point for all provider-related dependencies. It constructs an `AgentRunContext` object, which is then passed into the LangGraph state.

### Context Composition

The `AgentRunContext` includes:

- `chat_model`: The resolved LLM.
- `catalog`: The resolved `VectorCatalog`.
- `mcp`: The `McpRuntime` (if enabled) for tool execution.

This context ensures that every agent in the graph has a unified interface to interact with the catalog and the LLM without needing to know the underlying provider details.

Provider to Context Association

Sources: [digital_stylist/providers/factories.py#113-125](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L113-L125)[digital_stylist/contracts/context.py#1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/context.py#L1-L20)

## Configuration Reference

The behavior of these factories is governed by the following environment variables:

VariableDefaultDescription`STYLIST_LLM_PROVIDER``google_genai`Primary provider (`google_genai` or `openai`).`STYLIST_LLM_API_KEY`NoneAPI key for the selected provider.`STYLIST_GOOGLE_EMBED_THROTTLE``4`Concurrent request limit for Google embeddings.`STYLIST_VECTOR_BACKEND``chroma`Backend for the catalog (`chroma` or `memory`).`STYLIST_CHAT_MODEL`(Provider Default)Specific model ID override.

Sources: [digital_stylist/config.py#35-70](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L35-L70)[.env.example#7-21](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L7-L21)