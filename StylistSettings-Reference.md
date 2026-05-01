# StylistSettings Reference
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The `StylistSettings` class is the central configuration authority for the Digital Stylist Python worker and its associated subsystems. It manages environment variable parsing, validation, and provides a unified interface for runtime configuration.

## Overview and Implementation

Configuration is implemented using Pydantic's `BaseSettings`, which allows for automatic environment variable mapping, type coercion, and validation. The settings are instantiated as a singleton used across the `digital_stylist` package.

### Configuration Flow

The system follows a strict hierarchy for configuration resolution:

1. Environment Variables: Prefixed with `STYLIST_` (with some exceptions for standard tools like `CHROMA_`).
2. .env file: Loaded from the root directory if present.
3. Defaults: Hardcoded fallback values defined in the `StylistSettings` class.

### Key Classes and Functions

- `StylistSettings`: The primary configuration model [digital_stylist/config.py#28-192](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L28-L192)
- `get_settings()`: A function that returns a cached instance of the settings [digital_stylist/config.py#195-197](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L195-L197)
- `Field Validators`: Used to ensure data integrity for ports and complex strings [digital_stylist/config.py#126-141](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L126-L141)

Sources:[digital_stylist/config.py#28-197](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L28-L197)[.env.example#1-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L1-L78)

---

## Configuration Categories

### LLM and Embedding Providers

These settings determine which AI backend is used for the LangGraph agents and the RAG pipeline.

VariableTypeDefaultDescription`STYLIST_LLM_PROVIDER``Literal``"google_genai"`Backend provider: `"google_genai"` or `"openai"`[digital_stylist/config.py#32](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L32-L32)`STYLIST_LLM_API_KEY``SecretStr``None`API key for the selected provider [digital_stylist/config.py#33](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L33-L33)`STYLIST_CHAT_MODEL``str``None`Global chat model override (e.g., `gpt-4o`) [digital_stylist/config.py#34](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L34-L34)`STYLIST_EMBEDDING_MODEL``str``None`Global embedding model override [digital_stylist/config.py#35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L35-L35)`STYLIST_GOOGLE_EMBED_THROTTLE``float``0.1`Delay in seconds between Google embedding calls to avoid rate limits [digital_stylist/config.py#36](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L36-L36)

### Per-Agent Model Overrides

The system allows granular control over which model each specific agent uses, enabling cost and performance optimization.

VariableTarget Agent`STYLIST_MODEL_CUSTOMER``CustomerAgent`[digital_stylist/config.py#40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L40-L40)`STYLIST_MODEL_INTENT``IntentAgent`[digital_stylist/config.py#41](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L41-L41)`STYLIST_MODEL_STYLIST``StylistAgent`[digital_stylist/config.py#42](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L42-L42)`STYLIST_MODEL_CATALOG``CatalogAgent`[digital_stylist/config.py#43](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L43-L43)`STYLIST_MODEL_EXPLAINABILITY``ExplainabilityAgent`[digital_stylist/config.py#44](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L44-L44)`STYLIST_MODEL_APPOINTMENT``AppointmentAgent`[digital_stylist/config.py#45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L45-L45)`STYLIST_MODEL_EMAIL``EmailAgent`[digital_stylist/config.py#46](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L46-L46)`STYLIST_MODEL_SUPPORT``SupportAgent`[digital_stylist/config.py#47](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L47-L47)

### Vector Backend (Catalog)

Configuration for the RAG (Retrieval-Augmented Generation) storage.

VariableDefaultDescription`STYLIST_VECTOR_BACKEND``"chroma"`Supports `"chroma"` or `"memory"`[digital_stylist/config.py#51](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L51-L51)`CHROMA_PERSIST_DIR``"./chroma_data"`Filesystem path for ChromaDB persistence [digital_stylist/config.py#52](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L52-L52)`CHROMA_COLLECTION``"catalog"`The name of the vector collection [digital_stylist/config.py#53](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L53-L53)`STYLIST_CATALOG_RAG_MAX_ROUNDS``2`Max recursive search attempts for the Catalog agent [digital_stylist/config.py#54](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L54-L54)

### Model Context Protocol (MCP)

Settings for the MCP runtime which connects agents to external tools (Customer DB, Email, etc.).

VariableDefaultDescription`STYLIST_MCP_ENABLED``True`Global toggle for MCP features [digital_stylist/config.py#58](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L58-L58)`STYLIST_MCP_REMOTE_URL``None`URL for remote streamable-HTTP MCP [digital_stylist/config.py#59](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L59-L59)`STYLIST_MCP_REMOTE_PATH``"/mcp"`Path on the remote MCP server [digital_stylist/config.py#60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L60-L60)

### HTTP Worker and Observability

Runtime settings for the FastAPI application and logging behavior.

VariableDefaultDescription`STYLIST_WORKER_HOST``"0.0.0.0"`Bind address for the worker [digital_stylist/config.py#64](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L64-L64)`STYLIST_WORKER_PORT``8787`Bind port for the worker [digital_stylist/config.py#65](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L65-L65)`STYLIST_INVOKE_TIMEOUT_SEC``180`Max time for a graph execution [digital_stylist/config.py#67](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L67-L67)`STYLIST_LOG_FORMAT``"text"``"text"` or `"json"` for log aggregators [digital_stylist/config.py#72](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L72-L72)`STYLIST_LOG_LEVEL``"INFO"`Standard logging level [digital_stylist/config.py#73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L73-L73)

Sources:[digital_stylist/config.py#30-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L30-L80)[.env.example#22-44](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L22-L44)

---

## PostgreSQL and Data Persistence

The system uses PostgreSQL for customer records, appointment persistence, and agent state checkpointing.

### Datastore Modes

The `STYLIST_PG_DATASTORE` variable controls the persistence behavior:

- `auto`: Uses Postgres if connection details are provided, otherwise falls back based on environment [digital_stylist/config.py#84](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L84-L84)
- `postgres`: Forces Postgres connection; fails if unavailable.
- `memory`: Uses in-memory mocks for development [digital_stylist/config.py#84](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L84-L84)

### Model Validation for Postgres

The `StylistSettings` class includes a `model_validator` that ensures required fields are present when in `production` environment [digital_stylist/config.py#143-162](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L143-L162)

Natural Language to Code Entity Space: Persistence Configuration
The following diagram shows how environment variables map to the internal `StylistSettings` model and subsequent database components.

Sources:[digital_stylist/config.py#83-112](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L83-L112)[digital_stylist/config.py#143-162](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L143-L162)[.env.example#46-64](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L64)

---

## Security and API Visibility

The settings class includes helper methods to determine the visibility of internal details based on the environment.

### `expose_internal_errors()`

Determines if the worker should return detailed stack traces and internal error messages in the HTTP response [digital_stylist/config.py#168-176](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L168-L176)

- Returns `True`: If `STYLIST_DEBUG` is true or `STYLIST_ENV` is not "production".
- Implementation: Used in the FastAPI exception handlers in `worker_app.py`.

### `should_show_openapi()`

Controls whether the `/docs` and `/redoc` Swagger UI endpoints are enabled [digital_stylist/config.py#178-185](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L178-L185)

- Returns `True`: If `STYLIST_ENV` is "development" or "staging".
- Returns `False`: If `STYLIST_ENV` is "production" (unless explicitly overridden by debug flags).

Natural Language to Code Entity Space: Security Logic
This diagram maps the environmental logic to the FastAPI application configuration.

Sources:[digital_stylist/config.py#168-185](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L168-L185)[digital_stylist/config.py#23-26](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L23-L26)

---

## Validation Rules

The settings utilize Pydantic validators to enforce constraints on network and configuration fields.

1. Port Validation: The `validate_port` method ensures that `STYLIST_WORKER_PORT` and other port fields are within the valid range (1-65535) [digital_stylist/config.py#126-133](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L126-L133)
2. CORS Origins: `STYLIST_CORS_ORIGINS` is parsed from a comma-separated string into a list of strings [digital_stylist/config.py#135-141](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L135-L141)
3. Postgres Integrity: If `STYLIST_ENV` is "production", the validator checks that either a full `STYLIST_PG_DSN` is provided or the individual host/user/password fields are populated [digital_stylist/config.py#143-162](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L143-L162)

Sources:[digital_stylist/config.py#126-162](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L126-L162)