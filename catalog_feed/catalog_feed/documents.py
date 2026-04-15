"""Map :class:`CatalogProduct` rows to LangChain documents for embedding."""

from __future__ import annotations

from langchain_core.documents import Document

from catalog_feed.models import CatalogProduct


def _chroma_status(product: CatalogProduct) -> str:
    """Map to ``in_stock`` / ``out_of_stock`` for ``ChromaVectorCatalog`` similarity filters."""
    raw = (product.inventory_status or "").strip().lower().replace(" ", "_").replace("-", "_")
    if raw in ("out_of_stock", "sold_out", "unavailable"):
        return "out_of_stock"
    if product.inventory_quantity is not None and product.inventory_quantity <= 0:
        return "out_of_stock"
    return "in_stock"


def _primary_size(product: CatalogProduct) -> str:
    if not product.sizes:
        return ""
    return str(product.sizes[0])


def _primary_image(product: CatalogProduct) -> str:
    if not product.images:
        return ""
    return str(product.images[0])


def catalog_product_to_document(product: CatalogProduct) -> Document:
    """Build searchable text + Chroma metadata (filters align with ``ChromaVectorCatalog``)."""
    parts: list[str] = [product.name, product.description]
    if product.brand:
        parts.append(f"Brand {product.brand}")
    if product.category:
        parts.append(f"Category {product.category}")
    for k, v in sorted(product.attributes.items()):
        parts.append(f"{k}: {v}")
    if product.sizes:
        parts.append("Sizes: " + ", ".join(str(s) for s in product.sizes))
    page_content = ". ".join(p for p in parts if p and str(p).strip())

    status = _chroma_status(product)
    meta: dict = {
        "sku": product.sku,
        "name": product.name,
        "price": float(product.price),
        "status": status,
        "size": _primary_size(product),
        "image_url": _primary_image(product),
    }
    if product.brand:
        meta["brand"] = product.brand
    if product.category:
        meta["category"] = product.category
    if product.inventory_quantity is not None:
        meta["inventory_qty"] = int(product.inventory_quantity)
    if product.inventory_status:
        meta["inventory_status_raw"] = str(product.inventory_status)
    if len(product.images) > 1:
        meta["image_urls_extra"] = ",".join(product.images[1:12])

    return Document(page_content=page_content, metadata=meta)
