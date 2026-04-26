"""Composable runtime configuration — model identifiers come only from environment / .env (never hardcoded)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal, Self

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class StylistSettings(BaseSettings):
    """
    Inference is composable: set ``STYLIST_LLM_PROVIDER`` and model resource ids via env.

    Core variables:

    - ``STYLIST_LLM_PROVIDER`` — ``google_genai`` (default) or ``openai``
    - ``STYLIST_LLM_API_KEY`` — API key for the active provider (see also runtime fallbacks in factories)
    - ``STYLIST_CHAT_MODEL`` — optional; when unset, a provider-specific default applies (see ``inference_defaults``)
    - ``STYLIST_EMBEDDING_MODEL`` — optional for Chroma; when unset, a provider-specific default applies
    - ``STYLIST_LLM_TEMPERATURE`` — optional sampling temperature

    Gemini document embedding (Chroma indexing; free-tier RPM):

    - ``STYLIST_GOOGLE_EMBED_THROTTLE`` — ``1`` (default) wraps document embedding with pacing; set ``0`` on paid/high-quota projects
    - ``STYLIST_GOOGLE_EMBED_DOCS_PER_CALL``, ``STYLIST_GOOGLE_EMBED_PAUSE_SEC`` — tune batch size and pause between sub-calls

    Optional per-agent chat overrides (each falls back to ``STYLIST_CHAT_MODEL`` / provider default):

    -       ``STYLIST_AGENT_MODEL_CUSTOMER``, ``STYLIST_AGENT_MODEL_INTENT``, ``STYLIST_AGENT_MODEL_STYLIST``,
      ``STYLIST_AGENT_MODEL_CATALOG``, ``STYLIST_AGENT_MODEL_EXPLAINABILITY``, ``STYLIST_AGENT_MODEL_APPOINTMENT``,
      ``STYLIST_AGENT_MODEL_EMAIL``, ``STYLIST_AGENT_MODEL_SUPPORT``

    MCP (tools for agents):

    - ``STYLIST_MCP_ENABLED`` — ``true`` / ``false`` (default: use MCP tools when true)
    - ``STYLIST_MCP_REMOTE_URL`` — e.g. ``http://127.0.0.1:8800`` to use the standalone ``digital-stylist-mcp-service``
      (streamable HTTP) instead of stdio subprocesses
    - ``STYLIST_MCP_REMOTE_PATH`` — path on that host (default ``/mcp``)

    HTTP worker / production:

    - ``STYLIST_ENV`` — ``development`` | ``staging`` | ``production`` (controls safe error responses)
    - ``STYLIST_DEBUG`` — verbose errors and interactive API docs in production (keep false in prod)
    - ``STYLIST_MAX_MESSAGE_CHARS``, ``STYLIST_INVOKE_TIMEOUT_SEC`` — request limits
    - ``STYLIST_BEHIND_PROXY`` — trust ``X-Forwarded-*`` when behind a reverse proxy
    - ``STYLIST_OPENAPI_DOCS`` — force enable/disable ``/docs`` (default: off in production unless debug)

    Observability (``digital_stylist`` loggers; JSON lines for aggregators):

    - ``STYLIST_LOG_FORMAT`` — ``text`` (default) or ``json``
    - ``STYLIST_LOG_LEVEL`` — ``INFO`` (default), ``DEBUG``, etc.

    PostgreSQL (MCP customer / appointment / associate data; zero-trust defaults):

    - ``STYLIST_PG_DATASTORE`` — ``auto`` (default: use Postgres when host or DSN set, else in-memory),
      ``postgres`` (require DB config), ``memory`` (force in-memory stubs)
    - ``STYLIST_PG_DSN`` — optional full libpq connection string (secret; never pass via MCP tools)
    - ``STYLIST_PG_HOST``, ``STYLIST_PG_PORT``, ``STYLIST_PG_DATABASE``, ``STYLIST_PG_USER``, ``STYLIST_PG_PASSWORD``
    - ``STYLIST_PG_SSLMODE``, ``STYLIST_PG_SSLROOTCERT`` — TLS toward Postgres (``require`` in staging/prod when unset)
    - ``STYLIST_PG_TENANT_ID`` — logical tenant for RLS (default ``default``)
    - ``STYLIST_PG_CONNECT_TIMEOUT`` — seconds (default ``10``)
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_provider: Literal["google_genai", "openai"] = Field(
        default="google_genai",
        validation_alias=AliasChoices("STYLIST_LLM_PROVIDER", "STYLIST_INFERENCE_PROVIDER"),
        description="Which LangChain integration backs chat and embeddings",
    )

    llm_api_key: str | None = Field(
        default=None,
        validation_alias="STYLIST_LLM_API_KEY",
        description="Secret for the configured provider (read from process env only)",
    )

    chat_model: str | None = Field(
        default=None,
        validation_alias="STYLIST_CHAT_MODEL",
        description="Provider chat model resource id (optional if using built-in provider default)",
    )

    embedding_model: str | None = Field(
        default=None,
        validation_alias="STYLIST_EMBEDDING_MODEL",
        description="Provider embedding model resource id (optional if using built-in provider default)",
    )

    llm_temperature: float | None = Field(
        default=None,
        validation_alias="STYLIST_LLM_TEMPERATURE",
        description="If set, passed to the chat client; if unset, provider default applies",
    )

    agent_model_customer: str | None = Field(
        default=None, validation_alias="STYLIST_AGENT_MODEL_CUSTOMER"
    )
    agent_model_intent: str | None = Field(
        default=None, validation_alias="STYLIST_AGENT_MODEL_INTENT"
    )
    agent_model_stylist: str | None = Field(
        default=None, validation_alias="STYLIST_AGENT_MODEL_STYLIST"
    )
    agent_model_catalog: str | None = Field(
        default=None, validation_alias="STYLIST_AGENT_MODEL_CATALOG"
    )
    agent_model_explainability: str | None = Field(
        default=None, validation_alias="STYLIST_AGENT_MODEL_EXPLAINABILITY"
    )
    agent_model_appointment: str | None = Field(
        default=None, validation_alias="STYLIST_AGENT_MODEL_APPOINTMENT"
    )
    agent_model_email: str | None = Field(
        default=None, validation_alias="STYLIST_AGENT_MODEL_EMAIL"
    )
    agent_model_support: str | None = Field(
        default=None, validation_alias="STYLIST_AGENT_MODEL_SUPPORT"
    )

    vector_backend: Literal["chroma", "memory"] = Field(
        default="chroma",
        validation_alias="STYLIST_VECTOR_BACKEND",
    )
    chroma_persist_dir: str | None = Field(default=None, validation_alias="CHROMA_PERSIST_DIR")
    chroma_collection: str = Field(default="stylist_catalog", validation_alias="CHROMA_COLLECTION")

    mcp_enabled: bool = Field(default=True, validation_alias="STYLIST_MCP_ENABLED")
    mcp_python_executable: str | None = Field(
        default=None,
        validation_alias="STYLIST_MCP_PYTHON",
        description="Interpreter used to spawn stdio MCP servers (defaults to sys.executable)",
    )
    mcp_remote_url: str | None = Field(
        default=None,
        validation_alias="STYLIST_MCP_REMOTE_URL",
        description=(
            "When set (e.g. http://127.0.0.1:8800), agents use streamable HTTP to "
            "``digital-stylist-mcp-service`` instead of stdio subprocesses. "
            "Combine with STYLIST_MCP_REMOTE_PATH (default /mcp)."
        ),
    )
    mcp_remote_path: str = Field(
        default="/mcp",
        validation_alias="STYLIST_MCP_REMOTE_PATH",
        description="Path on mcp_remote_url host for the streamable HTTP MCP endpoint",
    )

    pg_datastore: Literal["auto", "memory", "postgres"] = Field(
        default="auto",
        validation_alias="STYLIST_PG_DATASTORE",
        description="auto: Postgres when STYLIST_PG_DSN or host+db+user set; else in-memory MCP stubs",
    )
    pg_dsn: SecretStr | None = Field(default=None, validation_alias="STYLIST_PG_DSN")
    pg_host: str | None = Field(default=None, validation_alias="STYLIST_PG_HOST")
    pg_port: int = Field(default=5432, validation_alias="STYLIST_PG_PORT")
    pg_database: str | None = Field(default=None, validation_alias="STYLIST_PG_DATABASE")
    pg_user: str | None = Field(default=None, validation_alias="STYLIST_PG_USER")
    pg_password: SecretStr | None = Field(default=None, validation_alias="STYLIST_PG_PASSWORD")
    pg_sslmode: str | None = Field(
        default=None,
        validation_alias="STYLIST_PG_SSLMODE",
        description="If unset: require in staging/production, prefer in development",
    )
    pg_sslrootcert: str | None = Field(default=None, validation_alias="STYLIST_PG_SSLROOTCERT")
    pg_sslcert: str | None = Field(default=None, validation_alias="STYLIST_PG_SSLCERT")
    pg_sslkey: str | None = Field(default=None, validation_alias="STYLIST_PG_SSLKEY")
    pg_tenant_id: str = Field(default="default", validation_alias="STYLIST_PG_TENANT_ID")
    pg_connect_timeout: int = Field(
        default=10, ge=1, le=120, validation_alias="STYLIST_PG_CONNECT_TIMEOUT"
    )

    catalog_media_dir: str | None = Field(
        default=None,
        validation_alias="STYLIST_CATALOG_MEDIA_DIR",
        description="Directory of catalog image files for GET /catalog/media/{filename}; unset disables static media",
    )

    catalog_rag_max_rounds: int = Field(
        default=3, validation_alias="STYLIST_CATALOG_RAG_MAX_ROUNDS"
    )

    environment: Literal["development", "staging", "production"] = Field(
        default="development",
        validation_alias="STYLIST_ENV",
        description="Used for logging and safe error responses on the HTTP worker",
    )
    debug: bool = Field(
        default=False,
        validation_alias="STYLIST_DEBUG",
        description="Verbose errors and OpenAPI docs even in production (avoid in real prod)",
    )
    max_user_message_chars: int = Field(
        default=32_000,
        ge=256,
        le=200_000,
        validation_alias="STYLIST_MAX_MESSAGE_CHARS",
    )
    graph_invoke_timeout_sec: float = Field(
        default=180.0,
        ge=5.0,
        le=3600.0,
        validation_alias="STYLIST_INVOKE_TIMEOUT_SEC",
    )
    behind_reverse_proxy: bool = Field(
        default=False,
        validation_alias="STYLIST_BEHIND_PROXY",
        description="Trust X-Forwarded-* when the worker sits behind a reverse proxy",
    )
    openapi_docs_enabled: bool | None = Field(
        default=None,
        validation_alias="STYLIST_OPENAPI_DOCS",
        description="Override OpenAPI /docs (default: off in production unless debug)",
    )

    log_format: Literal["text", "json"] = Field(
        default="text",
        validation_alias="STYLIST_LOG_FORMAT",
        description="text: terminal-friendly; json: one JSON object per line",
    )
    log_level: str = Field(
        default="INFO",
        validation_alias="STYLIST_LOG_LEVEL",
        description="Logging level for the digital_stylist package loggers",
    )

    @field_validator("llm_provider", mode="before")
    @classmethod
    def _normalize_llm_provider(cls, v: object) -> str:
        if v is None:
            return "google_genai"
        if not isinstance(v, str):
            return str(v)
        s = v.strip().lower().replace("-", "_")
        if s in ("google", "google_genai", "gemini", "genai", "vertex"):
            return "google_genai"
        if s in ("openai", "oai"):
            return "openai"
        raise ValueError("STYLIST_LLM_PROVIDER must resolve to google_genai or openai")

    @field_validator("log_level", mode="before")
    @classmethod
    def _normalize_log_level(cls, v: object) -> str:
        if v is None:
            return "INFO"
        if isinstance(v, str):
            s = v.strip().upper()
            return s if s else "INFO"
        return str(v).strip().upper() or "INFO"

    @field_validator(
        "chat_model",
        "embedding_model",
        "agent_model_customer",
        "agent_model_intent",
        "agent_model_stylist",
        "agent_model_catalog",
        "agent_model_explainability",
        "agent_model_appointment",
        "agent_model_email",
        "agent_model_support",
        "pg_host",
        "pg_database",
        "pg_user",
        "pg_sslmode",
        "pg_sslrootcert",
        "pg_sslcert",
        "pg_sslkey",
        "pg_tenant_id",
        "catalog_media_dir",
        mode="before",
    )
    @classmethod
    def _strip_optional_str(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return str(v)

    @field_validator("environment", mode="before")
    @classmethod
    def _normalize_environment(cls, v: object) -> str:
        if v is None:
            return "development"
        if isinstance(v, str):
            s = v.strip().lower()
            if s in ("dev", "development"):
                return "development"
            if s in ("stage", "staging"):
                return "staging"
            if s in ("prod", "production"):
                return "production"
            if s in ("development", "staging", "production"):
                return s
        return str(v)

    @model_validator(mode="after")
    def _postgres_mode_requires_connection(self) -> Self:
        if self.pg_datastore != "postgres":
            return self
        has_dsn = self.pg_dsn is not None and bool(self.pg_dsn.get_secret_value().strip())
        has_parts = bool(self.pg_host and self.pg_database and self.pg_user)
        if not (has_dsn or has_parts):
            raise ValueError(
                "STYLIST_PG_DATASTORE=postgres requires STYLIST_PG_DSN or STYLIST_PG_HOST, "
                "STYLIST_PG_DATABASE, and STYLIST_PG_USER"
            )
        return self

    def expose_internal_errors(self) -> bool:
        """Whether API responses may include exception text (never in production unless debug)."""
        if self.environment == "production":
            return self.debug
        return True

    def should_show_openapi(self) -> bool:
        if self.openapi_docs_enabled is not None:
            return self.openapi_docs_enabled
        if self.environment == "production":
            return self.debug
        return True


def default_chroma_dir(settings: StylistSettings) -> str:
    return settings.chroma_persist_dir or str(Path.cwd() / "chroma_data")
