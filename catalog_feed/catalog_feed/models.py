"""Normalized catalog rows accepted by the vector feed — provider-agnostic."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class CatalogProduct(BaseModel):
    """
    One sellable SKU line. Maps to one :class:`~langchain_core.documents.Document` in Chroma.

    * ``inventory_status`` feeds metadata ``status`` (``in_stock`` / ``out_of_stock``) for retrieval filters.
    * ``images`` — image URLs; first is stored as ``image_url`` for UI / agents.
    * ``attributes`` — arbitrary product facets (material, color story, …) embedded into ``page_content``.
    """

    sku: str = Field(..., description="Stable product identifier")
    name: str
    description: str = ""
    price: float = Field(..., ge=0)
    brand: str | None = None
    category: str | None = None
    sizes: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list, description="Public image URLs, primary first")
    inventory_quantity: int | None = Field(default=None, ge=0)
    inventory_status: str | None = Field(
        default=None,
        description="e.g. in_stock, out_of_stock, low_stock, preorder — normalized in the feed",
    )
    attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("sku", mode="before")
    @classmethod
    def _sku_str(cls, v: object) -> str:
        return str(v).strip()

    @field_validator("price", mode="before")
    @classmethod
    def _price_number(cls, v: object) -> float:
        return float(v)  # type: ignore[arg-type]
