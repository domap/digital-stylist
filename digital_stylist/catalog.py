"""Legacy module — use :class:`digital_stylist.providers.vector_chroma.ChromaVectorCatalog` and factories."""

from __future__ import annotations

from langchain_core.documents import Document

from digital_stylist.config import StylistSettings, default_chroma_dir
from digital_stylist.providers.documents import documents_to_recommendations
from digital_stylist.providers.factories import build_embeddings, build_vector_catalog
from digital_stylist.providers.vector_chroma import ChromaVectorCatalog


def get_collection_name() -> str:
    return StylistSettings().chroma_collection


def get_persist_directory() -> str:
    return default_chroma_dir(StylistSettings())


def get_vectordb():
    """Return underlying LangChain Chroma instance (for advanced callers only)."""
    s = StylistSettings()
    emb = build_embeddings(s)
    cat = ChromaVectorCatalog.from_settings(s, emb)
    return cat.langchain_store


def query_catalog_self_query_style(
    query_text: str,
    *,
    user_budget: float | None,
    size: str | None,
    k: int = 3,
) -> list[Document]:
    s = StylistSettings()
    catalog = build_vector_catalog(s, embeddings=build_embeddings(s))
    return catalog.similarity_search_filtered(query_text, k=k, user_budget=user_budget, size=size)


__all__ = [
    "documents_to_recommendations",
    "get_collection_name",
    "get_persist_directory",
    "get_vectordb",
    "query_catalog_self_query_style",
]
