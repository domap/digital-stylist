"""Dataset sources implement a single load entrypoint."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from catalog_feed.models import CatalogProduct


@runtime_checkable
class CatalogSource(Protocol):
    """Load a product catalog (any upstream: file, API, warehouse export)."""

    def load(self) -> list[CatalogProduct]:
        ...
