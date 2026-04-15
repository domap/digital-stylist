"""Customer profile persistence — PostgreSQL (RLS) or in-memory fallback."""

from __future__ import annotations

import json
from typing import Any

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import postgres_connect_kwargs, uses_postgres_backend
from digital_stylist.infra.postgres.session import apply_rls_session

_MEMORY: dict[str, dict[str, Any]] = {
    "guest": {
        "user_id": "guest",
        "sizes": {"tops": "M", "bottoms": "32", "dress": "8"},
        "budget_ceiling": 200.0,
        "preferred_brands": [],
        "style_feedback": [],
        "hard_rules": ["Never over budget_ceiling for full outfits unless user opts in."],
    },
}


def _require_psycopg() -> Any:
    try:
        import psycopg
    except ImportError as e:
        raise RuntimeError(
            "PostgreSQL backend requires the psycopg package. Install with: pip install 'psycopg[binary]>=3.2'"
        ) from e
    return psycopg


def customer_get_profile(settings: StylistSettings, user_id: str) -> dict[str, Any]:
    if not uses_postgres_backend(settings):
        return dict(_MEMORY.get(user_id, {}))
    psycopg = _require_psycopg()
    kwargs = postgres_connect_kwargs(settings)
    with psycopg.connect(**kwargs) as conn, conn.transaction():
        apply_rls_session(conn, settings, subject_user_id=user_id)
        with conn.cursor() as cur:
            cur.execute("SELECT profile_json FROM stylist.customers")
            row = cur.fetchone()
            if not row or row[0] is None:
                return {}
            data = row[0]
            return dict(data) if isinstance(data, dict) else dict(data)


def customer_merge_profile(
    settings: StylistSettings, user_id: str, patch: dict[str, Any]
) -> dict[str, Any]:
    if not uses_postgres_backend(settings):
        base = dict(_MEMORY.get(user_id, {"user_id": user_id}))
        merged = {**base, **patch}
        _MEMORY[user_id] = merged
        return merged
    psycopg = _require_psycopg()
    kwargs = postgres_connect_kwargs(settings)
    with psycopg.connect(**kwargs) as conn, conn.transaction():
        apply_rls_session(conn, settings, subject_user_id=user_id)
        with conn.cursor() as cur:
            cur.execute("SELECT profile_json FROM stylist.customers")
            row = cur.fetchone()
            base: dict[str, Any] = dict(row[0]) if row and row[0] else {"user_id": user_id}
            merged = {**base, **patch}
            cur.execute(
                """
                    INSERT INTO stylist.customers (tenant_id, user_id, profile_json)
                    VALUES (%s, %s, %s::jsonb)
                    ON CONFLICT (tenant_id, user_id) DO UPDATE
                    SET profile_json = EXCLUDED.profile_json, updated_at = now()
                    """,
                (settings.pg_tenant_id.strip() or "default", user_id, json.dumps(merged)),
            )
            return merged


def customer_append_feedback(settings: StylistSettings, user_id: str, note: str) -> dict[str, Any]:
    if not uses_postgres_backend(settings):
        rec = dict(_MEMORY.get(user_id, {"user_id": user_id}))
        fb = list(rec.get("style_feedback") or [])
        fb.append(note)
        rec["style_feedback"] = fb
        _MEMORY[user_id] = rec
        return rec
    psycopg = _require_psycopg()
    kwargs = postgres_connect_kwargs(settings)
    with psycopg.connect(**kwargs) as conn, conn.transaction():
        apply_rls_session(conn, settings, subject_user_id=user_id)
        with conn.cursor() as cur:
            cur.execute("SELECT profile_json FROM stylist.customers")
            row = cur.fetchone()
            rec: dict[str, Any] = dict(row[0]) if row and row[0] else {"user_id": user_id}
            fb = list(rec.get("style_feedback") or [])
            fb.append(note)
            rec["style_feedback"] = fb
            cur.execute(
                """
                    INSERT INTO stylist.customers (tenant_id, user_id, profile_json)
                    VALUES (%s, %s, %s::jsonb)
                    ON CONFLICT (tenant_id, user_id) DO UPDATE
                    SET profile_json = EXCLUDED.profile_json, updated_at = now()
                    """,
                (settings.pg_tenant_id.strip() or "default", user_id, json.dumps(rec)),
            )
            return rec
