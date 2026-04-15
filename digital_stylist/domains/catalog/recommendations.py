"""Catalog domain — map retrieved documents to API-friendly recommendation rows."""

from __future__ import annotations

from typing import Any

from langchain_core.documents import Document


def documents_to_recommendations(docs: list[Document]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for d in docs:
        md = d.metadata or {}
        out.append(
            {
                "sku": md.get("sku", ""),
                "name": d.page_content[:200] if d.page_content else md.get("name", ""),
                "price": md.get("price"),
                "image_url": md.get("image_url", ""),
                "status": md.get("status", ""),
                "size": md.get("size", ""),
            }
        )
    return out
