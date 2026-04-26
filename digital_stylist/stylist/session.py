"""Postgres session GUCs for stylist worker RLS (``app.tenant_id``, ``app.internal_api``)."""

from __future__ import annotations

from typing import Any


def session_set_tenant(cur: Any, tenant: str) -> None:
    cur.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant,))


def session_set_internal_api(cur: Any) -> None:
    cur.execute("SELECT set_config('app.internal_api', 'true', true)")
