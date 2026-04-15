"""Protocols for swappable reasoning (LLM) and retrieval (vector) implementations."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from langchain_core.documents import Document


@runtime_checkable
class VectorCatalog(Protocol):
    """Pluggable catalog / vector index (Chroma, LanceDB, in-memory tests, etc.)."""

    def similarity_search_filtered(
        self,
        query_text: str,
        *,
        k: int,
        user_budget: float | None,
        size: str | None,
    ) -> list[Document]:
        """Embed `query_text` and return top-k docs matching inventory constraints."""
        ...

    def add_documents(self, documents: list[Document]) -> Any:
        """Optional ingestion hook (seed scripts). Return provider-specific receipt."""
        ...
