"""Read-only HTTP routes for store / demo UIs — Postgres retail data + optional catalog JSON.

Uses :func:`digital_stylist.infra.postgres.connection.postgres_connect_kwargs` and session GUCs
(``app.tenant_id``, ``app.internal_api``) — not the ds-composable Express stack.

Enable CORS via ``STYLIST_STOREFRONT_CORS_ORIGINS`` (comma-separated), e.g.
``http://localhost:5173,http://localhost:5174``.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import psycopg
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from langchain_core.messages import HumanMessage, SystemMessage
from psycopg import errors as pg_errors
from pydantic import BaseModel, Field

from digital_stylist.config import StylistSettings
from digital_stylist.fitting_room_api import attach_fitting_room_routes
from digital_stylist.voice_intent_api import attach_voice_intent_routes
from digital_stylist.infra.postgres.connection import postgres_connect_kwargs, uses_postgres_backend
from digital_stylist.providers.factories import build_chat_model, is_llm_api_key_resolved

logger = logging.getLogger(__name__)

_DEFAULT_PRODUCTS_JSON = (
    Path(__file__).resolve().parent.parent / "catalog_feed" / "catalog_feed" / "fixtures" / "products.json"
)


def _default_catalog_media_dir() -> Path | None:
    p = Path(__file__).resolve().parent.parent / "catalog_feed" / "catalog_feed" / "assets" / "products"
    return p if p.is_dir() else None


def _products_json_path() -> Path:
    raw = (os.environ.get("STYLIST_PRODUCTS_JSON") or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return _DEFAULT_PRODUCTS_JSON.resolve()


def _catalog_media_dir() -> Path | None:
    raw = (os.environ.get("STYLIST_CATALOG_MEDIA_DIR") or "").strip()
    if raw:
        p = Path(raw).expanduser().resolve()
        return p if p.is_dir() else None
    return _default_catalog_media_dir()


def _load_catalog_products() -> list[dict[str, Any]]:
    path = _products_json_path()
    if not path.is_file():
        logger.warning("catalog_products_file_missing", extra={"path": str(path)})
        return []
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
        out.append(
            {
                "id": str(sku),
                "name": str(p.get("name", "")),
                "description": str(p.get("description", "")),
                "price": float(p.get("price") or 0),
                "brand": str(p.get("brand", "AnnTaylor")),
                "category": str(p.get("category", "")),
                "sizes": [str(x) for x in sizes][:32],
                "colors": colors,
                "fit": str(attr.get("fit", "Regular")) if isinstance(attr, dict) else "Regular",
                "imageAssetName": image_asset or "placeholder.svg",
            }
        )
    return out


_CACHED_PRODUCTS: list[dict[str, Any]] | None = None


def get_catalog_products_cached() -> list[dict[str, Any]]:
    global _CACHED_PRODUCTS
    if _CACHED_PRODUCTS is None:
        _CACHED_PRODUCTS = _load_catalog_products()
    return _CACHED_PRODUCTS


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
    """Set ``app.tenant_id`` for RLS. ``SET LOCAL ... = %s`` is not valid SQL (no placeholders); use ``set_config``."""
    cur.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant,))


def _session_set_internal_api(cur: Any) -> None:
    cur.execute("SELECT set_config('app.internal_api', 'true', true)")


def _profile_as_dict(raw: Any) -> dict[str, Any]:
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


def _try_on_labels(try_on_product_ids: list[str] | None) -> list[str]:
    if not try_on_product_ids:
        return []
    cat = get_catalog_products_cached()
    by_id = {str(p.get("id")): str(p.get("name", "") or p.get("id")) for p in cat}
    out: list[str] = []
    for x in try_on_product_ids:
        if not x:
            continue
        label = by_id.get(str(x), str(x))
        if label and label not in out:
            out.append(label)
        if len(out) >= 8:
            break
    return out


def _fetch_customer_profile(
    settings: StylistSettings, tenant: str, customer_id: str
) -> dict[str, Any] | None:
    kw = postgres_connect_kwargs(settings)
    with psycopg.connect(**kw) as conn, conn.cursor() as cur:
        _session_set_tenant(cur, tenant)
        _session_set_internal_api(cur)
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
        return _profile_as_dict(row[0])


def _events_snippet(profile: dict[str, Any], limit: int = 4) -> str:
    ev = profile.get("upcoming_events")
    if not isinstance(ev, list):
        return ""
    parts: list[str] = []
    for item in ev[:limit]:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("name") or "").strip()
        dt = str(item.get("date") or "").strip()
        note = str(item.get("notes") or "").strip()
        chunk = " · ".join(x for x in (dt, label, note) if x)
        if chunk:
            parts.append(chunk)
    return "; ".join(parts)


def _fallback_associate_quick_notes(profile: dict[str, Any]) -> str:
    lines: list[str] = []
    name = str(profile.get("display_name") or "Client").strip()
    lines.append(f"Client: {name}")
    tier = str(profile.get("loyalty_tier") or "").strip()
    if tier:
        lines.append(f"Loyalty tier: {tier}")
    prefs = profile.get("preferences")
    if isinstance(prefs, str) and prefs.strip():
        p = prefs.strip()
        lines.append(f"Style preferences: {p[:320]}{'…' if len(p) > 320 else ''}")
    notes = profile.get("interaction_notes")
    if isinstance(notes, str) and notes.strip():
        n = notes.strip()
        lines.append(f"Recent interaction notes: {n[:320]}{'…' if len(n) > 320 else ''}")
    ev = _events_snippet(profile)
    if ev:
        lines.append(f"Upcoming: {ev}")
    email = profile.get("email")
    if isinstance(email, str) and email.strip():
        lines.append(f"On file: {email.strip()}")
    return "\n".join(lines) if len(lines) > 1 else (lines[0] if lines else "")


def _fallback_initial_suggestions(profile: dict[str, Any], try_on_labels: list[str]) -> list[str]:
    dn = str(profile.get("display_name") or "").strip()
    first = dn.split()[0] if dn else "this client"
    tier = str(profile.get("loyalty_tier") or "").strip()
    tier_hint = f" She is {tier}." if tier else ""
    base = [
        f"Suggest three complete outfits for {first} that fit her profile and typical occasions.{tier_hint}",
        f"Pull sizing, fit, and color guidance I can use while {first} tries on today.",
        f"Surface add-on pieces (shoes, bag, jewelry) that elevate looks for {first} without pushing too hard.",
        f"What talking points should I use with {first} about fabric care and alterations for her picks?",
        f"Compare two outfit directions for {first}: polished workweek vs. elevated weekend.",
    ]
    if try_on_labels:
        rack = ", ".join(try_on_labels[:4])
        base.insert(
            0,
            f"Give me concise selling points for these try-on SKUs with {first}: {rack}.",
        )
    return base[:8]


def _fallback_thread_suggestions(
    profile: dict[str, Any], try_on_labels: list[str], history_snippet: str
) -> list[str]:
    dn = str(profile.get("display_name") or "").strip()
    first = dn.split()[0] if dn else "the client"
    out = [
        f"Based on our last messages, what should I offer {first} next on the floor?",
        f"Give me one alternative look if {first} hesitates on the current recommendation.",
        f"Draft a short recap I can repeat to {first} in plain language (benefits, not jargon).",
    ]
    if try_on_labels:
        out.insert(
            0,
            f"We're fitting {', '.join(try_on_labels[:3])} — what sizes or colors should I pull as backups?",
        )
    if "appointment" in history_snippet.lower() or "book" in history_snippet.lower():
        out.append(f"Help me confirm next steps to book or adjust a stylist visit for {first}.")
    return out[:8]


def _invoke_llm_text(settings: StylistSettings, system: str, user: str) -> str:
    if not is_llm_api_key_resolved(settings):
        return ""
    try:
        llm = build_chat_model(settings)
        reply = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        content = getattr(reply, "content", "")
        return content.strip() if isinstance(content, str) else str(content).strip()
    except Exception as e:
        logger.warning("associate_llm_invoke_failed", extra={"error": str(e)})
        return ""


def _parse_json_object(text: str) -> dict[str, Any] | None:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
        t = re.sub(r"\s*```\s*$", "", t)
    try:
        out = json.loads(t)
        return out if isinstance(out, dict) else None
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", t)
        if not m:
            return None
        try:
            out = json.loads(m.group(0))
            return out if isinstance(out, dict) else None
        except json.JSONDecodeError:
            return None


def _coerce_suggestions(raw: Any, *, limit: int = 8) -> list[str]:
    if isinstance(raw, list):
        out = [str(x).strip() for x in raw if str(x).strip()]
        return [x for x in out if len(x) > 5][:limit]
    return []


class AssociateQuickNotesBody(BaseModel):
    customer_id: str | None = Field(default=None, description="Retail customer user_id")


class AssociateSuggestionsBody(BaseModel):
    customer_id: str | None = None
    try_on_product_ids: list[str] = Field(default_factory=list)


class ThreadTurn(BaseModel):
    role: str
    content: str


class AssociateThreadSuggestionsBody(BaseModel):
    customer_id: str | None = None
    try_on_product_ids: list[str] = Field(default_factory=list)
    history: list[ThreadTurn] = Field(default_factory=list)


def build_retail_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["retail"])

    @router.get("/catalog/products")
    def list_catalog_products() -> list[dict[str, Any]]:
        return get_catalog_products_cached()

    @router.get("/catalog/media/{filename:path}")
    def catalog_media(filename: str) -> FileResponse:
        """Serve product images when ``STYLIST_CATALOG_MEDIA_DIR`` (or bundled assets dir) exists."""
        base = _catalog_media_dir()
        if base is None:
            raise HTTPException(
                status_code=404,
                detail="Catalog media directory not configured — set STYLIST_CATALOG_MEDIA_DIR",
            )
        safe = Path(filename).name
        if not safe or safe != filename.split("/")[-1]:
            raise HTTPException(status_code=400, detail="Invalid filename")
        path = (base / safe).resolve()
        try:
            path.relative_to(base.resolve())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid path") from None
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(path)

    @router.get("/retail/customers")
    def list_customers(request: Request) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        kw = postgres_connect_kwargs(settings)
        rows: list[dict[str, Any]] = []
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                _session_set_tenant(cur, tenant)
                _session_set_internal_api(cur)
                cur.execute(
                    """
                        SELECT user_id, profile_json, updated_at
                        FROM stylist.customers
                        WHERE tenant_id = %s
                        ORDER BY user_id
                        """,
                    (tenant,),
                )
                for uid, profile, updated in cur.fetchall():
                    rows.append(
                        {
                            "id": uid,
                            "user_id": uid,
                            "profile": profile,
                            "updated_at": updated.isoformat() if updated else None,
                        }
                    )
        except psycopg.Error as e:
            logger.exception("retail_customers_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(content=rows)

    # Register before GET `/retail/associates` — similar path prefix; static multi-segment paths first.
    @router.get("/retail/associate/capabilities")
    def associate_capabilities() -> JSONResponse:
        """Lightweight probe so devs can confirm routing (orchestration → worker) without POST."""
        return JSONResponse(
            content={
                "post": [
                    "/api/v1/retail/associate/quick-notes",
                    "/api/v1/retail/associate/initial-suggestions",
                    "/api/v1/retail/associate/thread-suggestions",
                ]
            }
        )

    @router.post("/retail/associate/quick-notes")
    def associate_quick_notes(request: Request, body: AssociateQuickNotesBody) -> JSONResponse:
        """LLM summary of ``profile_json`` for associates; falls back to structured bullets without an API key."""
        settings = _pg_settings(request)
        _require_pg(settings)
        cid = (body.customer_id or "").strip()
        if not cid:
            return JSONResponse(content={"notes": ""})
        tenant = _tenant_id(settings)
        try:
            profile = _fetch_customer_profile(settings, tenant, cid)
        except psycopg.Error as e:
            logger.exception("associate_quick_notes_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        if not profile:
            return JSONResponse(content={"notes": ""})
        sys = (
            "You write concise internal briefing notes for a retail sales associate who is WITH the customer on the floor. "
            "Use bullet lines starting with '- '. No marketing fluff. Do not address the customer directly; write for the associate. "
            "Max 8 bullets, max 90 words total. Focus on preferences, loyalty, sensitivities, upcoming occasions, and prior notes."
        )
        user = f"Customer profile JSON:\n{json.dumps(profile, default=str)[:12000]}"
        raw = _invoke_llm_text(settings, sys, user)
        notes = raw if raw else _fallback_associate_quick_notes(profile)
        if not notes:
            notes = _fallback_associate_quick_notes(profile)
        return JSONResponse(content={"notes": notes.strip()[:4000]})

    @router.post("/retail/associate/initial-suggestions")
    def associate_initial_suggestions(request: Request, body: AssociateSuggestionsBody) -> JSONResponse:
        """Short suggested prompts the associate can send to the Store AI Assistant (third person about the client)."""
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        try_on = [str(x) for x in (body.try_on_product_ids or []) if str(x).strip()]
        labels = _try_on_labels(try_on or None)
        profile: dict[str, Any] = {}
        cid = (body.customer_id or "").strip()
        if cid:
            try:
                row = _fetch_customer_profile(settings, tenant, cid)
                if row:
                    profile = row
            except psycopg.Error as e:
                logger.exception("associate_initial_suggestions_query_failed")
                raise HTTPException(status_code=503, detail="Database error") from e
        if not profile and not labels:
            return JSONResponse(
                content={
                    "suggestions": [
                        "Suggest three polished looks I can pull for this walk-in before we narrow sizes.",
                        "What questions should I ask on the floor to learn her occasion and budget quickly?",
                        "Give me a simple rack plan: tops, bottoms, third pieces, ordered by versatility.",
                    ]
                }
            )
        sys = (
            "Output only a JSON object with key 'suggestions' (array of 5 to 8 strings). "
            "Each string is one message a SALES ASSOCIATE will send to an in-store AI assistant while helping a CLIENT. "
            "Use third person for the client (she/her or they as appropriate from the profile). "
            "Never write as if the client is typing (no 'I need', 'help me'). "
            "Use imperative coaching requests: 'Suggest…', 'Pull…', 'What should I tell her…', 'Give me talking points…'. "
            "Incorporate try-on product names when provided."
        )
        user_obj: dict[str, Any] = {"customer_profile": profile, "try_on_product_names": labels}
        raw = _invoke_llm_text(settings, sys, json.dumps(user_obj, default=str)[:12000])
        parsed = _parse_json_object(raw) if raw else None
        sug = _coerce_suggestions(parsed.get("suggestions") if parsed else None)
        if len(sug) < 3:
            sug = _fallback_initial_suggestions(profile or {}, labels)
        return JSONResponse(content={"suggestions": sug[:8]})

    @router.post("/retail/associate/thread-suggestions")
    def associate_thread_suggestions(request: Request, body: AssociateThreadSuggestionsBody) -> JSONResponse:
        """Follow-up prompt chips after the associate has messaged the assistant."""
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        try_on = [str(x) for x in (body.try_on_product_ids or []) if str(x).strip()]
        labels = _try_on_labels(try_on or None)
        profile: dict[str, Any] = {}
        cid = (body.customer_id or "").strip()
        if cid:
            try:
                row = _fetch_customer_profile(settings, tenant, cid)
                if row:
                    profile = row
            except psycopg.Error as e:
                logger.exception("associate_thread_suggestions_query_failed")
                raise HTTPException(status_code=503, detail="Database error") from e
        hist_parts: list[str] = []
        for turn in body.history[-10:]:
            role = "Associate" if turn.role == "user" else "Assistant"
            t = (turn.content or "").strip()
            if t:
                hist_parts.append(f"{role}: {t[:500]}")
        history_snippet = "\n".join(hist_parts)
        if not history_snippet and not labels:
            return JSONResponse(content={"suggestions": []})
        sys = (
            "Output only JSON: {\"suggestions\": string[] } with 4 to 7 items. "
            "Each string is the next message the ASSOCIATE sends to the AI assistant (same voice as initial chips: "
            "third person about the client, imperative, floor-coaching). React to the thread."
        )
        user_obj = {
            "customer_profile": profile,
            "try_on_product_names": labels,
            "conversation": history_snippet,
        }
        raw = _invoke_llm_text(settings, sys, json.dumps(user_obj, default=str)[:14000])
        parsed = _parse_json_object(raw) if raw else None
        sug = _coerce_suggestions(parsed.get("suggestions") if parsed else None)
        if len(sug) < 2:
            sug = _fallback_thread_suggestions(profile, labels, history_snippet)
        return JSONResponse(content={"suggestions": sug[:8]})

    @router.get("/retail/associates")
    def list_associates(request: Request) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        kw = postgres_connect_kwargs(settings)
        rows: list[dict[str, Any]] = []
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                _session_set_tenant(cur, tenant)
                cur.execute(
                    """
                        SELECT associate_id, store_id, display_name, email, phone, skills_json, active, updated_at
                        FROM stylist.associates
                        WHERE tenant_id = %s
                        ORDER BY associate_id
                        """,
                    (tenant,),
                )
                for (
                    aid,
                    store_id,
                    display_name,
                    email,
                    phone,
                    skills,
                    active,
                    updated,
                ) in cur.fetchall():
                    rows.append(
                        {
                            "id": aid,
                            "associate_id": aid,
                            "store_id": store_id,
                            "display_name": display_name,
                            "email": email,
                            "phone": phone,
                            "skills": skills,
                            "active": active,
                            "updated_at": updated.isoformat() if updated else None,
                        }
                    )
        except psycopg.Error as e:
            logger.exception("retail_associates_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(content=rows)

    @router.get("/retail/stylists")
    def list_stylists(request: Request) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        kw = postgres_connect_kwargs(settings)
        rows: list[dict[str, Any]] = []
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                _session_set_tenant(cur, tenant)
                try:
                    cur.execute(
                        """
                            SELECT stylist_id, store_id, display_name, email, phone, skills_json, active, updated_at
                            FROM stylist.stylists
                            WHERE tenant_id = %s
                            ORDER BY stylist_id
                            """,
                        (tenant,),
                    )
                except pg_errors.UndefinedTable:
                    return JSONResponse(content=[])
                for (
                    sid,
                    store_id,
                    display_name,
                    email,
                    phone,
                    skills,
                    active,
                    updated,
                ) in cur.fetchall():
                    rows.append(
                        {
                            "id": sid,
                            "stylist_id": sid,
                            "store_id": store_id,
                            "display_name": display_name,
                            "email": email,
                            "phone": phone,
                            "skills": skills,
                            "active": active,
                            "updated_at": updated.isoformat() if updated else None,
                        }
                    )
        except psycopg.Error as e:
            logger.exception("retail_stylists_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(content=rows)

    @router.get("/retail/stores")
    def list_stores(request: Request) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant_id(settings)
        kw = postgres_connect_kwargs(settings)
        rows: list[dict[str, Any]] = []
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                _session_set_tenant(cur, tenant)
                try:
                    cur.execute(
                        """
                            SELECT store_id, display_name, city, brand_id, address_line1, region, postal_code,
                                   opens_at::text, closes_at::text
                            FROM stylist.stores
                            WHERE tenant_id = %s
                            ORDER BY store_id
                            """,
                        (tenant,),
                    )
                except pg_errors.UndefinedTable:
                    return JSONResponse(content=[])
                cols = [d[0] for d in cur.description or []]
                for tup in cur.fetchall():
                    row = dict(zip(cols, tup, strict=True))
                    rows.append(row)
        except psycopg.Error as e:
            logger.exception("retail_stores_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(content=rows)

    attach_fitting_room_routes(router)
    attach_voice_intent_routes(router)
    return router
