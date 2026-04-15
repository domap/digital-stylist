"""Pluggable catalog dataset loaders."""

from catalog_feed.sources.json_source import load_products_from_json_path
from catalog_feed.sources.protocol import CatalogSource

__all__ = ["CatalogSource", "load_products_from_json_path"]
