"""Compose :class:`~digital_stylist.contracts.context.AgentRunContext` from settings."""

from __future__ import annotations

import os

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from digital_stylist.config import StylistSettings
from digital_stylist.contracts.context import AGENT_LLM_KEYS, AgentRunContext
from digital_stylist.inference_defaults import _FALLBACK_CHAT_MODEL, _FALLBACK_EMBEDDING_MODEL
from digital_stylist.infra.postgres.connection import maybe_apply_development_postgres_env
from digital_stylist.mcp.runtime import build_mcp_runtime
from digital_stylist.providers.google_embed_throttle import ThrottledGoogleEmbeddings
from digital_stylist.providers.protocols import VectorCatalog
from digital_stylist.providers.vector_chroma import ChromaVectorCatalog
from digital_stylist.providers.vector_memory import InMemoryVectorCatalog


def _google_embed_throttle_enabled() -> bool:
    v = os.environ.get("STYLIST_GOOGLE_EMBED_THROTTLE", "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def build_default_settings() -> StylistSettings:
    maybe_apply_development_postgres_env()
    return StylistSettings()


def is_llm_api_key_resolved(settings: StylistSettings | None = None) -> bool:
    """True if ``STYLIST_LLM_API_KEY`` or provider-specific env fallbacks supply a key."""
    return _resolve_api_key(settings or build_default_settings()) is not None


def _resolve_api_key(settings: StylistSettings) -> str | None:
    if settings.llm_api_key:
        return settings.llm_api_key
    if settings.llm_provider == "google_genai":
        return os.environ.get("STYLIST_LLM_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if settings.llm_provider == "openai":
        return os.environ.get("STYLIST_LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
    return os.environ.get("STYLIST_LLM_API_KEY")


def _require_api_key(settings: StylistSettings) -> str:
    key = _resolve_api_key(settings)
    if not key:
        raise ValueError(
            "LLM API key is not configured. Set STYLIST_LLM_API_KEY (or GOOGLE_API_KEY for the "
            "default Google Gen AI provider)."
        )
    return key


def _resolve_chat_model_id(settings: StylistSettings) -> str:
    if settings.chat_model:
        return settings.chat_model
    fb = _FALLBACK_CHAT_MODEL.get(settings.llm_provider)
    if fb:
        return fb
    raise ValueError(
        "Chat model is not configured. Set STYLIST_CHAT_MODEL to your provider's model resource id."
    )


def _google_embedding_model_for_api(model_id: str) -> str:
    """
    Map legacy / Vertex-only embedding names to a model that supports Gemini Developer
    ``embedContent`` (avoids 404 on e.g. ``text-embedding-004``).
    """
    mid = model_id.strip()
    if mid in (
        "text-embedding-004",
        "models/text-embedding-004",
        "embedding-001",
        "models/embedding-001",
    ) or mid.endswith("/text-embedding-004"):
        return "gemini-embedding-001"
    return mid


def _resolve_embedding_model_id(settings: StylistSettings) -> str:
    if settings.embedding_model:
        resolved = settings.embedding_model
    else:
        fb = _FALLBACK_EMBEDDING_MODEL.get(settings.llm_provider)
        if not fb:
            raise ValueError(
                "Embedding model is not configured. Set STYLIST_EMBEDDING_MODEL to your "
                "provider's model resource id."
            )
        resolved = fb
    if settings.llm_provider == "google_genai":
        return _google_embedding_model_for_api(resolved)
    return resolved


def build_chat_model(settings: StylistSettings, *, model_id: str | None = None) -> BaseChatModel:
    mid = model_id if model_id is not None else _resolve_chat_model_id(settings)
    key = _require_api_key(settings)
    temperature = settings.llm_temperature

    if settings.llm_provider == "google_genai":
        kwargs: dict = {"model": mid, "google_api_key": key}
        if temperature is not None:
            kwargs["temperature"] = temperature
        return ChatGoogleGenerativeAI(**kwargs)

    if settings.llm_provider == "openai":
        kwargs = {"model": mid, "api_key": key}
        if temperature is not None:
            kwargs["temperature"] = temperature
        return ChatOpenAI(**kwargs)

    raise ValueError(f"Unsupported llm_provider: {settings.llm_provider}")


def _chat_model_id_for_agent(settings: StylistSettings, agent: str) -> str:
    override = getattr(settings, f"agent_model_{agent}", None)
    if override:
        return override
    return _resolve_chat_model_id(settings)


def build_agent_llm_map(
    settings: StylistSettings,
) -> tuple[BaseChatModel, dict[str, BaseChatModel]]:
    """Default LLM plus one chat client per graph agent (deduped by model id)."""
    default_mid = _resolve_chat_model_id(settings)
    default_llm = build_chat_model(settings, model_id=default_mid)
    by_model_id: dict[str, BaseChatModel] = {default_mid: default_llm}

    def model_for_id(mid: str) -> BaseChatModel:
        if mid not in by_model_id:
            by_model_id[mid] = build_chat_model(settings, model_id=mid)
        return by_model_id[mid]

    agent_llms = {
        key: model_for_id(_chat_model_id_for_agent(settings, key)) for key in AGENT_LLM_KEYS
    }
    return default_llm, agent_llms


def build_embeddings(settings: StylistSettings) -> Embeddings:
    model_id = _resolve_embedding_model_id(settings)
    key = _require_api_key(settings)

    if settings.llm_provider == "google_genai":
        inner = GoogleGenerativeAIEmbeddings(model=model_id, google_api_key=key)
        if _google_embed_throttle_enabled():
            return ThrottledGoogleEmbeddings(inner)
        return inner

    if settings.llm_provider == "openai":
        return OpenAIEmbeddings(model=model_id, api_key=key)

    raise ValueError(f"Unsupported llm_provider: {settings.llm_provider}")


def build_vector_catalog(
    settings: StylistSettings, embeddings: Embeddings | None = None
) -> VectorCatalog:
    if settings.vector_backend == "memory":
        return InMemoryVectorCatalog()
    emb = embeddings or build_embeddings(settings)
    return ChromaVectorCatalog.from_settings(settings, emb)


def build_agent_run_context(settings: StylistSettings | None = None) -> AgentRunContext:
    s = settings or build_default_settings()
    llm, agent_llms = build_agent_llm_map(s)
    emb = build_embeddings(s) if s.vector_backend == "chroma" else None
    catalog = build_vector_catalog(s, embeddings=emb)
    mcp = build_mcp_runtime(s)
    return AgentRunContext(
        settings=s,
        llm=llm,
        embeddings=emb,
        catalog=catalog,
        mcp=mcp,
        agent_llms=agent_llms,
    )
