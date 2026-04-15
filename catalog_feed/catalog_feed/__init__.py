"""Independent catalog → ChromaDB indexing pipeline (deployable alongside ``orchestration/``)."""

from catalog_feed.models import CatalogProduct
from catalog_feed.pipeline import FeedResult, run_catalog_feed

__all__ = ["CatalogProduct", "FeedResult", "run_catalog_feed"]
