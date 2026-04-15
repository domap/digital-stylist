"""Seed catalog documents via the composable :class:`~digital_stylist.providers.protocols.VectorCatalog`."""

from __future__ import annotations

import logging
import sys

from digital_stylist.config import StylistSettings, default_chroma_dir
from digital_stylist.providers.factories import build_embeddings, build_vector_catalog

try:
    from catalog_feed.documents import catalog_product_to_document
    from catalog_feed.models import CatalogProduct
except ImportError as e:
    raise ImportError(
        "Install the standalone catalog feed package: pip install -e ./catalog_feed "
        "(from the repository root)."
    ) from e

logger = logging.getLogger(__name__)


def seed() -> int:
    """Upsert sample catalog rows using the configured vector backend (embeddings only — no chat model)."""
    samples: list[CatalogProduct] = [
        CatalogProduct(
            sku="DRS-LB-001",
            name="Linen Breeze Midi",
            description="Light blue linen summer midi dress, breathable, sleeveless",
            price=128.0,
            category="Dresses",
            sizes=["8"],
            images=["https://example.com/img/drs-lb-001.jpg"],
            inventory_status="in_stock",
            attributes={"fabric": "linen"},
        ),
        CatalogProduct(
            sku="BLZ-SND-014",
            name="Sand Structure Blazer",
            description="Tailored linen blazer in sand, structured shoulders, half-lined",
            price=198.0,
            category="Jackets",
            sizes=["M"],
            images=["https://example.com/img/blz-snd-014.jpg"],
            inventory_status="in_stock",
        ),
        CatalogProduct(
            sku="DEN-IND-220",
            name="Indigo Straight Jean",
            description="High-rise straight jeans, indigo wash, stretch comfort",
            price=98.0,
            category="Pants",
            sizes=["32"],
            images=["https://example.com/img/den-ind-220.jpg"],
            inventory_status="in_stock",
        ),
    ]
    docs = [catalog_product_to_document(p) for p in samples]
    s = StylistSettings()
    emb = build_embeddings(s) if s.vector_backend == "chroma" else None
    catalog = build_vector_catalog(s, embeddings=emb)
    catalog.add_documents(docs)
    return len(docs)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stderr,
    )
    n = seed()
    s = StylistSettings()
    logger.info(
        "catalog_seeded",
        extra={
            "document_count": n,
            "collection": s.chroma_collection,
            "persist_dir": default_chroma_dir(s),
        },
    )
