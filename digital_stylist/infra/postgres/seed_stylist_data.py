"""Bootstrap seed: load catalog rows and stylist tenant JSON into Postgres (ETL only).

Product source: ``STYLIST_PRODUCTS_JSON`` when set, else ``catalog_feed/catalog_feed/fixtures/products.json``
under the repository root when present. Tenant JSON path resolution (first match): ``STYLIST_TENANT_STYLIST_CONFIG_JSON``,
``STYLIST_TENANT_STYLIST_HTTP_CONFIG_JSON`` (legacy), ``STYLIST_TENANT_STOREFRONT_CONFIG_JSON`` (legacy),
``STYLIST_TENANT_RETAIL_CONFIG_JSON`` (legacy), else ``fixtures/tenant_stylist_config.default.json``.

Runtime handlers read only ``stylist.catalog_products`` and ``stylist.tenant_retail_config``; they do not read these files.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import psycopg

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import postgres_connect_kwargs

logger = logging.getLogger(__name__)

_FIXTURES = Path(__file__).resolve().parent / "fixtures"
_DEFAULT_TENANT_CONFIG = _FIXTURES / "tenant_stylist_config.default.json"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _default_products_path() -> Path | None:
    p = _repo_root() / "catalog_feed" / "catalog_feed" / "fixtures" / "products.json"
    return p if p.is_file() else None


def _products_json_path() -> Path | None:
    raw = (os.environ.get("STYLIST_PRODUCTS_JSON") or "").strip()
    if raw:
        p = Path(raw).expanduser().resolve()
        return p if p.is_file() else None
    return _default_products_path()


def _tenant_config_path() -> Path | None:
    for env_key in (
        "STYLIST_TENANT_STYLIST_CONFIG_JSON",
        "STYLIST_TENANT_STYLIST_HTTP_CONFIG_JSON",
        "STYLIST_TENANT_STOREFRONT_CONFIG_JSON",
        "STYLIST_TENANT_RETAIL_CONFIG_JSON",
    ):
        raw = (os.environ.get(env_key) or "").strip()
        if raw:
            p = Path(raw).expanduser().resolve()
            return p if p.is_file() else None
    return _DEFAULT_TENANT_CONFIG if _DEFAULT_TENANT_CONFIG.is_file() else None


def _parse_products_file(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    raw_list = data.get("products") if isinstance(data, dict) else data
    if not isinstance(raw_list, list):
        return []
    out: list[dict[str, Any]] = []
    for p in raw_list:
        if not isinstance(p, dict):
            continue
        sku = p.get("sku") or p.get("id")
        if not sku:
            continue
        imgs = p.get("images") if isinstance(p.get("images"), list) else []
        first = imgs[0] if imgs else ""
        image_asset = ""
        if isinstance(first, str) and first.strip():
            image_asset = first.strip().replace("\\", "/").split("/")[-1]
        attr = p.get("attributes") if isinstance(p.get("attributes"), dict) else {}
        colors_raw = attr.get("colors") if isinstance(attr, dict) else None
        colors: list[str] = []
        if isinstance(colors_raw, str) and colors_raw.strip():
            colors = [c.strip() for c in re.split(r"[,;/]", colors_raw) if c.strip()][:12]
        sizes = p.get("sizes") if isinstance(p.get("sizes"), list) else []
        fit_val = ""
        if isinstance(attr, dict):
            fv = attr.get("fit")
            fit_val = str(fv).strip() if fv is not None else ""
        out.append(
            {
                "product_id": str(sku),
                "name": str(p.get("name", "")),
                "description": str(p.get("description", "")),
                "price": float(p.get("price") or 0),
                "brand": str(p.get("brand", "")),
                "category": str(p.get("category", "")),
                "sizes": [str(x) for x in sizes][:32],
                "colors": colors,
                "fit": fit_val,
                "image_asset_name": image_asset,
            }
        )
    return out


def _truthy_env(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in ("1", "true", "yes")


def seed_stylist_data(settings: StylistSettings) -> None:
    if (
        _truthy_env("STYLIST_SKIP_STYLIST_SEED")
        or _truthy_env("STYLIST_SKIP_STYLIST_HTTP_SEED")
        or _truthy_env("STYLIST_SKIP_STOREFRONT_SEED")
        or _truthy_env("STYLIST_SKIP_RETAIL_SEED")
    ):
        logger.info(
            "stylist_seed_skipped",
            extra={
                "reason": "STYLIST_SKIP_STYLIST_SEED or legacy skip env (STYLIST_SKIP_STYLIST_HTTP_SEED / STOREFRONT / RETAIL)"
            },
        )
        return

    tenant = (settings.pg_tenant_id or "").strip() or "default"
    kw = postgres_connect_kwargs(settings)
    conn_kw = {**kw, "connect_timeout": min(30, settings.pg_connect_timeout)}

    products_path = _products_json_path()
    config_path = _tenant_config_path()

    with psycopg.connect(**conn_kw) as conn, conn.cursor() as cur:
        cur.execute("SELECT set_config('app.tenant_id', %s, false)", (tenant,))
        cur.execute("SELECT set_config('app.internal_api', 'true', false)")

        if config_path is not None:
            cfg = json.loads(config_path.read_text(encoding="utf-8"))
            if not isinstance(cfg, dict):
                raise ValueError(f"Stylist tenant config must be a JSON object: {config_path}")
            cur.execute(
                """
                INSERT INTO stylist.tenant_retail_config (tenant_id, config)
                VALUES (%s, %s::jsonb)
                ON CONFLICT (tenant_id) DO UPDATE SET
                    config = EXCLUDED.config,
                    updated_at = now()
                """,
                (tenant, json.dumps(cfg)),
            )
            logger.info("tenant_stylist_config_seeded", extra={"tenant_id": tenant, "path": str(config_path)})
        else:
            logger.warning("tenant_stylist_config_seed_skipped_no_file")

        if products_path is not None:
            rows = _parse_products_file(products_path)
            for r in rows:
                cur.execute(
                    """
                    INSERT INTO stylist.catalog_products (
                        tenant_id, product_id, name, description, price, brand, category,
                        sizes, colors, fit, image_asset_name
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s
                    )
                    ON CONFLICT (tenant_id, product_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        price = EXCLUDED.price,
                        brand = EXCLUDED.brand,
                        category = EXCLUDED.category,
                        sizes = EXCLUDED.sizes,
                        colors = EXCLUDED.colors,
                        fit = EXCLUDED.fit,
                        image_asset_name = EXCLUDED.image_asset_name,
                        updated_at = now()
                    """,
                    (
                        tenant,
                        r["product_id"],
                        r["name"],
                        r["description"],
                        r["price"],
                        r["brand"],
                        r["category"],
                        json.dumps(r["sizes"]),
                        json.dumps(r["colors"]),
                        r["fit"],
                        r["image_asset_name"],
                    ),
                )
            logger.info(
                "catalog_products_seeded",
                extra={"tenant_id": tenant, "count": len(rows), "path": str(products_path)},
            )
        else:
            logger.warning("catalog_products_seed_skipped_no_file")
