"""Postgres reads for stylist worker routes — catalog, tenant config blob, customers."""

from __future__ import annotations

import json
from typing import Any

import psycopg

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import postgres_connect_kwargs
from digital_stylist.stylist.session import session_set_internal_api, session_set_tenant


def sum_stylist_catalog_prices_for_product_ids(
    settings: StylistSettings, tenant: str, product_ids: list[str]
) -> float:
    ids = [str(x).strip() for x in product_ids if str(x).strip()]
    if not ids:
        return 0.0
    kw = postgres_connect_kwargs(settings)
    with psycopg.connect(**kw) as conn, conn.cursor() as cur:
        session_set_tenant(cur, tenant)
        session_set_internal_api(cur)
        cur.execute(
            """
            SELECT COALESCE(SUM(price), 0)
            FROM stylist.catalog_products
            WHERE tenant_id = %s AND product_id = ANY(%s)
            """,
            (tenant, ids),
        )
        row = cur.fetchone()
        total = float(row[0] or 0) if row else 0.0
    return round(total, 2)


def list_stylist_catalog_products(settings: StylistSettings, tenant: str) -> list[dict[str, Any]]:
    kw = postgres_connect_kwargs(settings)
    out: list[dict[str, Any]] = []
    with psycopg.connect(**kw) as conn, conn.cursor() as cur:
        session_set_tenant(cur, tenant)
        session_set_internal_api(cur)
        cur.execute(
            """
            SELECT product_id, name, description, price, brand, category, sizes, colors, fit, image_asset_name
            FROM stylist.catalog_products
            WHERE tenant_id = %s
            ORDER BY product_id
            """,
            (tenant,),
        )
        for row in cur.fetchall():
            pid, name, desc, price, brand, cat, sizes_raw, colors_raw, fit, img = row
            sizes = sizes_raw if isinstance(sizes_raw, list) else json.loads(sizes_raw or "[]")
            colors = colors_raw if isinstance(colors_raw, list) else json.loads(colors_raw or "[]")
            if not isinstance(sizes, list):
                sizes = []
            if not isinstance(colors, list):
                colors = []
            out.append(
                {
                    "id": str(pid),
                    "name": str(name or ""),
                    "description": str(desc or ""),
                    "price": float(price or 0),
                    "brand": str(brand or ""),
                    "category": str(cat or ""),
                    "sizes": [str(x) for x in sizes][:32],
                    "colors": [str(x) for x in colors][:32],
                    "fit": str(fit or ""),
                    "imageAssetName": str(img or ""),
                }
            )
    return out


def map_stylist_catalog_product_ids_to_names(
    settings: StylistSettings, tenant: str, product_ids: list[str]
) -> dict[str, str]:
    ids = [str(x).strip() for x in product_ids if str(x).strip()]
    if not ids:
        return {}
    kw = postgres_connect_kwargs(settings)
    with psycopg.connect(**kw) as conn, conn.cursor() as cur:
        session_set_tenant(cur, tenant)
        session_set_internal_api(cur)
        cur.execute(
            """
            SELECT product_id, name
            FROM stylist.catalog_products
            WHERE tenant_id = %s AND product_id = ANY(%s)
            """,
            (tenant, ids),
        )
        return {str(r[0]): str(r[1] or r[0]) for r in cur.fetchall()}


def fetch_stylist_tenant_config_json(settings: StylistSettings, tenant: str) -> dict[str, Any] | None:
    kw = postgres_connect_kwargs(settings)
    with psycopg.connect(**kw) as conn, conn.cursor() as cur:
        session_set_tenant(cur, tenant)
        session_set_internal_api(cur)
        cur.execute(
            "SELECT config FROM stylist.tenant_retail_config WHERE tenant_id = %s",
            (tenant,),
        )
        row = cur.fetchone()
        if not row:
            return None
        cfg = row[0]
        if isinstance(cfg, dict):
            return cfg
        if isinstance(cfg, str):
            try:
                out = json.loads(cfg)
                return out if isinstance(out, dict) else None
            except json.JSONDecodeError:
                return None
        return None


def fetch_stylist_customer_profile(
    settings: StylistSettings, tenant: str, customer_id: str
) -> dict[str, Any] | None:
    kw = postgres_connect_kwargs(settings)
    with psycopg.connect(**kw) as conn, conn.cursor() as cur:
        session_set_tenant(cur, tenant)
        session_set_internal_api(cur)
        cur.execute(
            """
            SELECT profile_json
            FROM stylist.customers
            WHERE tenant_id = %s AND user_id = %s
            """,
            (tenant, customer_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        return _coerce_stylist_customer_profile_json(row[0])


def _coerce_stylist_customer_profile_json(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            out = json.loads(raw)
            return out if isinstance(out, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}
