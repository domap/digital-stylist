"""Fitting-room reservations persisted in Postgres, with ``pg_notify`` + optional SSE ``LISTEN``.

Clienteling polls ``GET /api/v1/notifications`` (Postgres backup) and may subscribe to
``GET /api/v1/notifications/stream`` for push hints. Connect creates rows via
``POST /api/v1/fitting-room/reservations``. Associates claim/complete via
``POST /api/v1/tasks/claim`` and ``POST /api/v1/tasks/complete`` (``task_status`` moves
off ``open`` so the live queue clears).
"""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
import uuid
from typing import Any

import psycopg
from psycopg import errors as pg_errors
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import postgres_connect_kwargs, uses_postgres_backend

logger = logging.getLogger(__name__)

NOTIFY_CHANNEL = "stylist_fitting_room"


def _pg_settings(request: Request) -> StylistSettings:
    return request.app.state.settings


def _require_pg(settings: StylistSettings) -> None:
    if not uses_postgres_backend(settings):
        raise HTTPException(
            status_code=503,
            detail="PostgreSQL not configured — set STYLIST_PG_* or STYLIST_PG_DSN",
        )


def _tenant_id(settings: StylistSettings) -> str:
    return (settings.pg_tenant_id or "default").strip() or "default"


def _session_set_tenant(cur: Any, tenant: str) -> None:
    cur.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant,))


def _session_set_internal_api(cur: Any) -> None:
    cur.execute("SELECT set_config('app.internal_api', 'true', true)")


def _catalog_total_cost(product_ids: list[str]) -> float:
    from digital_stylist.retail_api import get_catalog_products_cached

    ids = {str(x).strip() for x in product_ids if str(x).strip()}
    if not ids:
        return 0.0
    total = 0.0
    for p in get_catalog_products_cached():
        pid = str(p.get("id") or "")
        if pid in ids:
            try:
                total += float(p.get("price") or 0)
            except (TypeError, ValueError):
                continue
    return round(total, 2)


def _row_to_event(row: tuple[Any, ...], cols: list[str]) -> dict[str, Any]:
    d = dict(zip(cols, row, strict=True))
    rid = str(d["reservation_id"])
    created = d["created_at"]
    task_status = str(d["task_status"] or "open")
    claimed_by = d.get("claimed_by")
    claimed_at = d.get("claimed_at")
    done_at = d.get("done_at")
    channels = d.get("notification_channels") or ["email"]
    if isinstance(channels, str):
        try:
            channels = json.loads(channels)
        except json.JSONDecodeError:
            channels = ["email"]
    if not isinstance(channels, list):
        channels = ["email"]
    channels = [str(x).lower() for x in channels if str(x).lower() in ("email", "sms")][:4] or ["email"]
    product_ids = d.get("product_ids") or []
    if not isinstance(product_ids, list):
        product_ids = []
    product_ids = [str(x) for x in product_ids]
    cust = d.get("customer_user_id")
    source = d.get("source")
    if source not in (None, "connect", "clienteling"):
        source = None
    payload: dict[str, Any] = {
        "id": rid,
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created),
        "storeId": str(d.get("store_id") or ""),
        "slotLabel": str(d.get("slot_label") or ""),
        "productIds": product_ids,
        "totalCost": float(d.get("total_cost") or 0),
        "notificationChannels": channels,
    }
    if cust:
        payload["customerId"] = str(cust)
    if source:
        payload["source"] = source
    out: dict[str, Any] = {
        "id": rid,
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created),
        "type": "FITTING_ROOM_RESERVED",
        "payload": payload,
        "task": {
            "taskId": f"task-{rid}",
            "status": task_status,
            "assignedTo": str(claimed_by) if claimed_by else None,
            "assignedAt": claimed_at.isoformat() if claimed_at and hasattr(claimed_at, "isoformat") else None,
            "doneAt": done_at.isoformat() if done_at and hasattr(done_at, "isoformat") else None,
        },
    }
    if claimed_by:
        out["claimedBy"] = str(claimed_by)
    if claimed_at and hasattr(claimed_at, "isoformat"):
        out["claimedAt"] = claimed_at.isoformat()
    return out


def _fetch_notifications(settings: StylistSettings, tenant: str, limit: int) -> list[dict[str, Any]]:
    kw = postgres_connect_kwargs(settings)
    out: list[dict[str, Any]] = []
    with psycopg.connect(**kw) as conn, conn.cursor() as cur:
        _session_set_tenant(cur, tenant)
        _session_set_internal_api(cur)
        cur.execute(
            """
            SELECT reservation_id, store_id, slot_label, customer_user_id, product_ids,
                   total_cost, notification_channels, source, task_status,
                   claimed_by, claimed_at, done_at, created_at
            FROM stylist.fitting_room_reservations
            WHERE tenant_id = %s AND task_status <> 'done'
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (tenant, limit),
        )
        cols = [c.name for c in cur.description or []]
        for row in cur.fetchall():
            out.append(_row_to_event(row, cols))
    return out


class FittingRoomReserveBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    store_id: str = Field(..., alias="storeId", min_length=1)
    slot_label: str = Field(..., alias="slotLabel", min_length=1)
    customer_id: str | None = Field(default=None, alias="customerId")
    product_ids: list[str] = Field(default_factory=list, alias="productIds")
    source: str | None = Field(default="connect")
    notification_channels: list[str] | None = Field(default=None, alias="notificationChannels")


class TaskActionBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    event_id: str = Field(..., alias="eventId", min_length=1)
    associate_id: str = Field(..., alias="associateId", min_length=1)


def attach_fitting_room_routes(router: APIRouter) -> None:
    @router.get("/notifications")
    def list_notifications(request: Request, limit: int = 20) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        lim = max(1, min(limit, 100))
        try:
            events = _fetch_notifications(settings, tenant, lim)
        except pg_errors.UndefinedTable:
            return JSONResponse(content={"events": []})
        except psycopg.Error:
            logger.exception("notifications_list_failed")
            raise HTTPException(status_code=503, detail="Database error") from None
        return JSONResponse(content={"events": events})

    @router.get("/notifications/stream")
    async def notifications_stream(request: Request) -> StreamingResponse:
        """SSE: ``LISTEN`` on ``stylist_fitting_room``; payload hints Clienteling to refetch Postgres."""
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)

        async def gen():
            q: queue.Queue[str | None] = queue.Queue(maxsize=32)
            stop = threading.Event()
            conn_holder: dict[str, Any] = {"conn": None}

            def listen_worker() -> None:
                conn: psycopg.Connection | None = None
                try:
                    kw = postgres_connect_kwargs(settings)
                    conn = psycopg.connect(**kw, autocommit=True)
                    conn_holder["conn"] = conn
                    conn.execute(f"LISTEN {NOTIFY_CHANNEL}")
                    while not stop.is_set():
                        try:
                            for notify in conn.notifies():
                                if stop.is_set():
                                    break
                                if not notify.payload:
                                    continue
                                try:
                                    payload = json.loads(notify.payload)
                                except json.JSONDecodeError:
                                    continue
                                if str(payload.get("tenant_id")) != tenant:
                                    continue
                                try:
                                    q.put_nowait("refresh")
                                except queue.Full:
                                    pass
                        except Exception:
                            if not stop.is_set():
                                logger.exception("notifications_listen_loop_error")
                            break
                finally:
                    conn_holder["conn"] = None
                    if conn is not None:
                        try:
                            conn.close()
                        except Exception:
                            pass
                    try:
                        q.put_nowait(None)
                    except queue.Full:
                        pass

            wait_sentinel = object()

            def _q_get() -> str | None | object:
                try:
                    return q.get(timeout=20.0)
                except queue.Empty:
                    return wait_sentinel

            th = threading.Thread(target=listen_worker, name="pg-listen-fitting-room", daemon=True)
            th.start()
            try:
                yield f"data: {json.dumps({'type': 'connected', 'tenantId': tenant})}\n\n"
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        item = await asyncio.wait_for(asyncio.to_thread(_q_get), timeout=25.0)
                    except asyncio.TimeoutError:
                        item = wait_sentinel
                    if item is wait_sentinel:
                        yield ": keepalive\n\n"
                        continue
                    if item is None:
                        break
                    yield f"data: {json.dumps({'type': 'fitting_room_event', 'tenantId': tenant})}\n\n"
            finally:
                stop.set()
                c = conn_holder.get("conn")
                if c is not None:
                    try:
                        c.close()
                    except Exception:
                        pass

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @router.post("/fitting-room/reservations")
    def create_fitting_room_reservation(request: Request, body: FittingRoomReserveBody) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        src = (body.source or "connect").strip().lower()
        if src not in ("connect", "clienteling"):
            src = "connect"
        chans = body.notification_channels or ["email"]
        norm_chans: list[str] = []
        for c in chans:
            s = str(c).lower().strip()
            if s in ("email", "sms") and s not in norm_chans:
                norm_chans.append(s)
        if not norm_chans:
            norm_chans = ["email"]
        total = _catalog_total_cost(body.product_ids)
        rid = str(uuid.uuid4())
        kw = postgres_connect_kwargs(settings)
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                _session_set_tenant(cur, tenant)
                _session_set_internal_api(cur)
                cur.execute(
                    """
                    INSERT INTO stylist.fitting_room_reservations (
                        tenant_id, reservation_id, store_id, slot_label, customer_user_id,
                        product_ids, total_cost, notification_channels, source, task_status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, 'open')
                    """,
                    (
                        tenant,
                        rid,
                        body.store_id.strip(),
                        body.slot_label.strip(),
                        (body.customer_id or "").strip() or None,
                        [str(x).strip() for x in body.product_ids if str(x).strip()],
                        total,
                        json.dumps(norm_chans),
                        src,
                    ),
                )
                conn.commit()
        except psycopg.Error as e:
            logger.exception("fitting_room_reservation_insert_failed")
            err = getattr(e, "diag", None)
            if err and getattr(err, "sqlstate", None) == "42P01":
                raise HTTPException(
                    status_code=503,
                    detail="fitting_room_reservations table missing — run digital-stylist-pg-bootstrap",
                ) from e
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(
            content={
                "reservationId": rid,
                "slotLabel": body.slot_label,
                "storeId": body.store_id,
                "totalCost": total,
                "notificationChannels": norm_chans,
                "message": "Reservation saved. Associates will see it in Clienteling.",
            }
        )

    @router.post("/tasks/claim")
    def claim_task(request: Request, body: TaskActionBody) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        eid = body.event_id.strip()
        aid = body.associate_id.strip()
        kw = postgres_connect_kwargs(settings)
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                _session_set_tenant(cur, tenant)
                _session_set_internal_api(cur)
                cur.execute(
                    """
                    UPDATE stylist.fitting_room_reservations
                    SET task_status = 'in_progress',
                        claimed_by = %s,
                        claimed_at = COALESCE(claimed_at, now()),
                        updated_at = now()
                    WHERE tenant_id = %s
                      AND reservation_id::text = %s
                      AND task_status = 'open'
                    RETURNING reservation_id
                    """,
                    (aid, tenant, eid),
                )
                row = cur.fetchone()
                conn.commit()
        except psycopg.Error as e:
            logger.exception("tasks_claim_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        if not row:
            raise HTTPException(status_code=409, detail="Task not available or already claimed")
        return JSONResponse(content={"ok": True, "eventId": eid, "status": "in_progress"})

    @router.post("/tasks/complete")
    def complete_task(request: Request, body: TaskActionBody) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        eid = body.event_id.strip()
        kw = postgres_connect_kwargs(settings)
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                _session_set_tenant(cur, tenant)
                _session_set_internal_api(cur)
                cur.execute(
                    """
                    UPDATE stylist.fitting_room_reservations
                    SET task_status = 'done',
                        done_at = now(),
                        updated_at = now()
                    WHERE tenant_id = %s
                      AND reservation_id::text = %s
                      AND task_status IN ('open', 'in_progress')
                    RETURNING reservation_id
                    """,
                    (tenant, eid),
                )
                row = cur.fetchone()
                conn.commit()
        except psycopg.Error as e:
            logger.exception("tasks_complete_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        if not row:
            raise HTTPException(status_code=409, detail="Task not found or already completed")
        return JSONResponse(content={"ok": True, "eventId": eid, "status": "done"})
