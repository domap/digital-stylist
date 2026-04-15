"""Appointment persistence — PostgreSQL (RLS) or in-process stub."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import postgres_connect_kwargs, uses_postgres_backend
from digital_stylist.infra.postgres.session import apply_rls_session

_MEMORY_BOOKINGS: dict[str, dict[str, Any]] = {}


def _require_psycopg() -> Any:
    try:
        import psycopg
    except ImportError as e:
        raise RuntimeError(
            "PostgreSQL backend requires the psycopg package. Install with: pip install 'psycopg[binary]>=3.2'"
        ) from e
    return psycopg


def appointment_list_slots(
    settings: StylistSettings, store_id: str, days_ahead: int
) -> dict[str, Any]:
    """Slot discovery stays algorithmic (no calendar table in v1)."""
    t0 = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(days=1)
    slots = [
        (t0 + timedelta(days=d) + timedelta(hours=h)).strftime("%Y-%m-%d %H:%M local")
        for d in range(max(1, min(days_ahead, 14)))
        for h in (10, 14, 16)
    ][:9]
    return {"store_id": store_id, "slots": slots}


def appointment_create_booking(
    settings: StylistSettings,
    store_id: str,
    slot: str,
    purpose: str,
    customer_user_id: str,
) -> dict[str, Any]:
    bid = f"bk_{uuid.uuid4().hex[:12]}"
    rec = {
        "booking_id": bid,
        "store_id": store_id,
        "slot": slot,
        "purpose": purpose,
        "status": "confirmed",
        "customer_user_id": customer_user_id,
    }
    if not uses_postgres_backend(settings):
        _MEMORY_BOOKINGS[bid] = rec
        return rec
    psycopg = _require_psycopg()
    kwargs = postgres_connect_kwargs(settings)
    with psycopg.connect(**kwargs) as conn, conn.transaction():
        apply_rls_session(conn, settings, subject_user_id=customer_user_id)
        with conn.cursor() as cur:
            cur.execute(
                """
                    INSERT INTO stylist.appointments (
                        tenant_id, booking_id, store_id, slot_label, purpose, status, customer_user_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                (
                    settings.pg_tenant_id.strip() or "default",
                    bid,
                    store_id,
                    slot,
                    purpose,
                    "confirmed",
                    customer_user_id,
                ),
            )
    return rec


def appointment_get_booking(
    settings: StylistSettings, booking_id: str, customer_user_id: str
) -> dict[str, Any]:
    if not uses_postgres_backend(settings):
        return dict(_MEMORY_BOOKINGS.get(booking_id, {}))
    psycopg = _require_psycopg()
    kwargs = postgres_connect_kwargs(settings)
    with psycopg.connect(**kwargs) as conn, conn.transaction():
        apply_rls_session(conn, settings, subject_user_id=customer_user_id)
        with conn.cursor() as cur:
            cur.execute(
                """
                    SELECT booking_id, store_id, slot_label, purpose, status, customer_user_id
                    FROM stylist.appointments
                    WHERE booking_id = %s
                    """,
                (booking_id,),
            )
            row = cur.fetchone()
            if not row:
                return {}
            return {
                "booking_id": row[0],
                "store_id": row[1],
                "slot": row[2],
                "purpose": row[3],
                "status": row[4],
                "customer_user_id": row[5],
            }
