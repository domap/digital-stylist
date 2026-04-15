"""Load :class:`CatalogProduct` lists from JSON files (multiple shapes)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from catalog_feed.models import CatalogProduct


def _coerce_record(raw: dict[str, Any]) -> dict[str, Any]:
    """Map common alternate column names without tying to one retailer schema."""
    out = dict(raw)
    if "sku" not in out and "id" in out:
        out["sku"] = out.pop("id")
    if "images" not in out and "image_urls" in out:
        out["images"] = out.pop("image_urls")
    if "images" not in out and "image_url" in out:
        out["images"] = [out.pop("image_url")]
    if "images" not in out and "image" in out:
        img = out.pop("image")
        if isinstance(img, list):
            out["images"] = [str(x) for x in img]
        elif img is not None:
            out["images"] = [str(img)]
    if "inventory_quantity" not in out and "qty" in out:
        out["inventory_quantity"] = out.pop("qty")
    if "inventory_quantity" not in out and "stock" in out:
        out["inventory_quantity"] = out.pop("stock")
    if "inventory_status" not in out and "stock_status" in out:
        out["inventory_status"] = out.pop("stock_status")
    return out


def load_products_from_json_path(path: Path | str) -> list[CatalogProduct]:
    """
    Accepts:

    * JSON array of product objects
    * ``{\"products\": [ ... ] }``
    * ``{\"catalog\": [ ... ] }``
    * ``{\"items\": [ ... ] }``
    """
    p = Path(path)
    data = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        rows = None
        for key in ("products", "catalog", "items", "rows"):
            if key in data and isinstance(data[key], list):
                rows = data[key]
                break
        if rows is None:
            raise ValueError(
                f"JSON root must be a list or an object with products/catalog/items/rows: {p}"
            )
    else:
        raise ValueError(f"Unsupported JSON root type in {p}")

    out: list[CatalogProduct] = []
    for i, raw in enumerate(rows):
        if not isinstance(raw, dict):
            raise ValueError(f"Row {i} is not an object")
        out.append(CatalogProduct.model_validate(_coerce_record(raw)))
    return out
