"""Associate (store staff) directory — PostgreSQL (tenant RLS) or empty in-memory."""

from __future__ import annotations

from typing import Any

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import postgres_connect_kwargs, uses_postgres_backend
from digital_stylist.infra.postgres.session import apply_associate_read_session

_MEMORY_ASSOCIATES: list[dict[str, Any]] = []


def _skills_list(raw: Any) -> list[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return [raw]
    return list(raw)


def _require_psycopg() -> Any:
    try:
        import psycopg
    except ImportError as e:
        raise RuntimeError(
            "PostgreSQL backend requires the psycopg package. Install with: pip install 'psycopg[binary]>=3.2'"
        ) from e
    return psycopg


def associate_list_for_store(settings: StylistSettings, store_id: str) -> list[dict[str, Any]]:
    if not uses_postgres_backend(settings):
        return [a for a in _MEMORY_ASSOCIATES if a.get("store_id") == store_id]
    psycopg = _require_psycopg()
    kwargs = postgres_connect_kwargs(settings)
    with psycopg.connect(**kwargs) as conn, conn.transaction():
        apply_associate_read_session(conn, settings)
        with conn.cursor() as cur:
            cur.execute(
                """
                    SELECT associate_id, store_id, display_name, email, skills_json, active
                    FROM stylist.associates
                    WHERE tenant_id = %s AND store_id = %s AND active = true
                    ORDER BY display_name
                    """,
                (settings.pg_tenant_id.strip() or "default", store_id),
            )
            rows = cur.fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                out.append(
                    {
                        "associate_id": r[0],
                        "store_id": r[1],
                        "display_name": r[2],
                        "email": r[3],
                        "skills": _skills_list(r[4]),
                        "active": r[5],
                    }
                )
            return out


def associate_get(settings: StylistSettings, associate_id: str) -> dict[str, Any]:
    if not uses_postgres_backend(settings):
        for a in _MEMORY_ASSOCIATES:
            if a.get("associate_id") == associate_id:
                return dict(a)
        return {}
    psycopg = _require_psycopg()
    kwargs = postgres_connect_kwargs(settings)
    with psycopg.connect(**kwargs) as conn, conn.transaction():
        apply_associate_read_session(conn, settings)
        with conn.cursor() as cur:
            cur.execute(
                """
                    SELECT associate_id, store_id, display_name, email, skills_json, active
                    FROM stylist.associates
                    WHERE tenant_id = %s AND associate_id = %s
                    """,
                (settings.pg_tenant_id.strip() or "default", associate_id),
            )
            r = cur.fetchone()
            if not r:
                return {}
            return {
                "associate_id": r[0],
                "store_id": r[1],
                "display_name": r[2],
                "email": r[3],
                "skills": _skills_list(r[4]),
                "active": r[5],
            }
