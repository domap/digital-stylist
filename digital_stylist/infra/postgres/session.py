"""Per-transaction PostgreSQL session variables for RLS (set before queries)."""

from __future__ import annotations

from digital_stylist.config import StylistSettings


def apply_rls_session(conn, settings: StylistSettings, *, subject_user_id: str) -> None:
    """
    Set ``app.tenant_id`` and ``app.subject_user_id`` for the current transaction.

    Uses ``set_config(..., false)`` so values are **transaction-scoped** (not session-wide),
    limiting blast radius if the connection pool ever reuses connections.
    """
    tenant = settings.pg_tenant_id.strip() or "default"
    with conn.cursor() as cur:
        cur.execute("SELECT set_config('app.tenant_id', %s, false)", (tenant,))
        cur.execute("SELECT set_config('app.subject_user_id', %s, false)", (subject_user_id,))


def apply_associate_read_session(conn, settings: StylistSettings) -> None:
    """Tenant-scoped directory reads; subject GUC set to a sentinel (unused by associate RLS)."""
    tenant = settings.pg_tenant_id.strip() or "default"
    with conn.cursor() as cur:
        cur.execute("SELECT set_config('app.tenant_id', %s, false)", (tenant,))
        cur.execute("SELECT set_config('app.subject_user_id', %s, false)", ("__associate_mcp__",))
