"""In-memory vector catalog for tests and offline composition (no Chroma)."""

from __future__ import annotations

import re
from typing import Any

from langchain_core.documents import Document

from digital_stylist.providers.protocols import VectorCatalog


class InMemoryVectorCatalog(VectorCatalog):
    """Naive keyword + metadata filter over an in-RAM document list."""

    def __init__(self, documents: list[Document] | None = None) -> None:
        self._docs = list(documents or [])

    def similarity_search_filtered(
        self,
        query_text: str,
        *,
        k: int,
        user_budget: float | None,
        size: str | None,
    ) -> list[Document]:
        tokens = [t for t in re.split(r"\W+", query_text.lower()) if len(t) > 2]
        scored: list[tuple[float, Document]] = []
        for d in self._docs:
            md = d.metadata or {}
            if md.get("status") != "in_stock":
                continue
            p = md.get("price")
            if user_budget is not None and p is not None and float(p) > float(user_budget):
                continue
            if size and str(md.get("size", "")) != str(size):
                continue
            text = (d.page_content or "").lower()
            score = sum(1 for t in tokens if t in text)
            scored.append((score, d))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [d for _, d in scored[:k]]

    def add_documents(self, documents: list[Document]) -> Any:
        self._docs.extend(documents)
        return len(self._docs)
