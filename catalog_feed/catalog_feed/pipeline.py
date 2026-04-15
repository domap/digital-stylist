"""Run indexing into Chroma (embeddings only — no chat model)."""

from __future__ import annotations

from dataclasses import dataclass

from langchain_core.documents import Document

from catalog_feed.documents import catalog_product_to_document
from catalog_feed.models import CatalogProduct
from digital_stylist.config import StylistSettings, default_chroma_dir
from digital_stylist.providers.factories import build_embeddings, build_vector_catalog
from digital_stylist.providers.vector_chroma import ChromaVectorCatalog


@dataclass(frozen=True)
class FeedResult:
    documents_indexed: int
    documents_removed: int
    collection_name: str
    persist_directory: str


def run_catalog_feed(
    products: list[CatalogProduct],
    settings: StylistSettings | None = None,
    *,
    replace_collection: bool = True,
) -> FeedResult:
    """
    Embed ``products`` into the configured Chroma collection.

    * ``replace_collection`` — when True, clears existing vectors in the collection first (full sync).
    * Requires ``STYLIST_VECTOR_BACKEND=chroma`` and embedding API credentials on ``digital-stylist``.
    """
    s = settings or StylistSettings()
    if s.vector_backend != "chroma":
        raise ValueError("Catalog feed indexing requires STYLIST_VECTOR_BACKEND=chroma")

    emb = build_embeddings(s)
    catalog = build_vector_catalog(s, embeddings=emb)
    if not isinstance(catalog, ChromaVectorCatalog):
        raise TypeError("Expected ChromaVectorCatalog for chroma backend")

    removed = 0
    if replace_collection:
        removed = catalog.clear_all_documents()

    docs: list[Document] = [catalog_product_to_document(p) for p in products]
    if docs:
        catalog.add_documents(docs)

    return FeedResult(
        documents_indexed=len(docs),
        documents_removed=removed,
        collection_name=s.chroma_collection,
        persist_directory=default_chroma_dir(s),
    )
