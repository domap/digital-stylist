"""ChromaDB implementation of :class:`VectorCatalog` (composable with any LangChain embeddings)."""

from __future__ import annotations

from typing import Any

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from digital_stylist.config import StylistSettings, default_chroma_dir
from digital_stylist.providers.protocols import VectorCatalog


class ChromaVectorCatalog(VectorCatalog):
    """Chroma persistent store + metadata `where` filters (self-query style constraints)."""

    def __init__(
        self,
        *,
        embeddings: Embeddings,
        collection_name: str,
        persist_directory: str,
    ) -> None:
        self._store = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=persist_directory,
        )

    @property
    def langchain_store(self) -> Chroma:
        """Expose the underlying LangChain ``Chroma`` for advanced use (migrations, introspection)."""
        return self._store

    @classmethod
    def from_settings(
        cls, settings: StylistSettings, embeddings: Embeddings
    ) -> ChromaVectorCatalog:
        return cls(
            embeddings=embeddings,
            collection_name=settings.chroma_collection,
            persist_directory=default_chroma_dir(settings),
        )

    def similarity_search_filtered(
        self,
        query_text: str,
        *,
        k: int,
        user_budget: float | None,
        size: str | None,
    ) -> list[Document]:
        clauses: list[dict[str, Any]] = [{"status": "in_stock"}]
        if user_budget is not None:
            clauses.append({"price": {"$lte": float(user_budget)}})
        if size:
            clauses.append({"size": str(size)})
        where: dict[str, Any] = clauses[0] if len(clauses) == 1 else {"$and": clauses}
        return self._store.similarity_search(query_text, k=k, filter=where)

    def add_documents(self, documents: list[Document]) -> Any:
        return self._store.add_documents(documents)

    def clear_all_documents(self) -> int:
        """Remove all vectors in the collection (for full catalog re-index). Returns prior count."""
        existing = self._store.get()
        ids = existing.get("ids") or []
        if ids:
            self._store.delete(ids=ids)
        return len(ids)
