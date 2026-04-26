"""FastAPI router for stylist worker routes: catalog, in-store workforce reads, associate helpers."""

from __future__ import annotations

import json
import logging
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
from digital_stylist.infra.postgres.connection import postgres_connect_kwargs, uses_postgres_backend
from digital_stylist.providers.factories import build_chat_model, is_llm_api_key_resolved
from digital_stylist.stylist import repository as stylist_repo
from digital_stylist.stylist.session import session_set_internal_api, session_set_tenant
from digital_stylist.voice_intent_api import attach_voice_intent_routes

logger = logging.getLogger(__name__)


def _pg_settings(request: Request) -> StylistSettings:
    return request.app.state.settings


def _require_pg(settings: StylistSettings) -> None:
    if not uses_postgres_backend(settings):
        raise HTTPException(
            status_code=503,
            detail="PostgreSQL not configured — set STYLIST_PG_* or STYLIST_PG_DSN",
        )


def _tenant(settings: StylistSettings) -> str:
    t = (settings.pg_tenant_id or "").strip()
    if not t:
        raise HTTPException(status_code=503, detail="STYLIST_PG_TENANT_ID must be set to a non-empty value")
    return t


def _catalog_media_base(settings: StylistSettings) -> Path | None:
    raw = (settings.catalog_media_dir or "").strip()
    if not raw:
        return None
    p = Path(raw).expanduser().resolve()
    return p if p.is_dir() else None


def _resolve_stylist_try_on_labels(
    settings: StylistSettings, tenant: str, try_on_product_ids: list[str] | None
) -> list[str]:
    if not try_on_product_ids:
        return []
    name_by_id = stylist_repo.map_stylist_catalog_product_ids_to_names(
        settings, tenant, list(try_on_product_ids)
    )
    out: list[str] = []
    for x in try_on_product_ids:
        if not x:
            continue
        key = str(x).strip()
        label = name_by_id.get(key, key)
        if label and label not in out:
            out.append(label)
        if len(out) >= 8:
            break
    return out


def _require_stylist_tenant_config(settings: StylistSettings, tenant: str) -> dict[str, Any]:
    cfg = stylist_repo.fetch_stylist_tenant_config_json(settings, tenant)
    if not cfg:
        raise HTTPException(
            status_code=503,
            detail="Missing stylist.tenant_retail_config row (stylist tenant JSON `config`) for this tenant — run database bootstrap seed.",
        )
    return cfg


def _system_prompt(cfg: dict[str, Any], key: str) -> str:
    prompts = cfg.get("llm_system_prompts")
    if not isinstance(prompts, dict):
        raise HTTPException(
            status_code=503,
            detail="stylist.tenant_retail_config.config.llm_system_prompts must be a JSON object",
        )
    v = prompts.get(key)
    if not isinstance(v, str) or not v.strip():
        raise HTTPException(
            status_code=503,
            detail=f"stylist.tenant_retail_config.config.llm_system_prompts.{key} must be a non-empty string",
        )
    return v.strip()


def _fallback_dict(cfg: dict[str, Any]) -> dict[str, Any]:
    fb = cfg.get("fallback")
    if not isinstance(fb, dict):
        raise HTTPException(
            status_code=503,
            detail="stylist.tenant_retail_config.config.fallback must be a JSON object",
        )
    return fb


def _str_list(key: str, raw: Any, *, min_items: int) -> list[str]:
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise HTTPException(
            status_code=503,
            detail=f"stylist.tenant_retail_config.config.fallback.{key} must be a JSON array of strings",
        )
    out = [str(x).strip() for x in raw if isinstance(x, str) and str(x).strip()]
    if len(out) < min_items:
        raise HTTPException(
            status_code=503,
            detail=f"stylist.tenant_retail_config.config.fallback.{key} must contain at least {min_items} non-empty string(s)",
        )
    return out


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
    customer_id: str | None = Field(default=None, description="Customer user_id (stylist.customers)")


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


def build_stylist_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["stylist"])

    @router.get("/catalog/products")
    def list_catalog_products(request: Request) -> list[dict[str, Any]]:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant(settings)
        try:
            return stylist_repo.list_stylist_catalog_products(settings, tenant)
        except psycopg.Error as e:
            logger.exception("catalog_products_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e

    @router.get("/catalog/media/{filename:path}")
    def catalog_media(request: Request, filename: str) -> FileResponse:
        settings = _pg_settings(request)
        base = _catalog_media_base(settings)
        if base is None:
            raise HTTPException(
                status_code=503,
                detail="Catalog media is disabled — set STYLIST_CATALOG_MEDIA_DIR to an existing directory",
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
        tenant = _tenant(settings)
        kw = postgres_connect_kwargs(settings)
        rows: list[dict[str, Any]] = []
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                session_set_tenant(cur, tenant)
                session_set_internal_api(cur)
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
            logger.exception("stylist_customers_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(content=rows)

    @router.get("/retail/associate/capabilities")
    def associate_capabilities(request: Request) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant(settings)
        cfg = _require_stylist_tenant_config(settings, tenant)
        paths = cfg.get("associate_capability_post_paths")
        if not isinstance(paths, list) or not paths:
            raise HTTPException(
                status_code=503,
                detail="stylist.tenant_retail_config.config.associate_capability_post_paths must be a non-empty JSON array",
            )
        if not all(isinstance(p, str) and p.strip().startswith("/") for p in paths):
            raise HTTPException(
                status_code=503,
                detail="stylist.tenant_retail_config.config.associate_capability_post_paths entries must be non-empty path strings",
            )
        return JSONResponse(content={"post": [str(p).strip() for p in paths]})

    @router.post("/retail/associate/quick-notes")
    def associate_quick_notes(request: Request, body: AssociateQuickNotesBody) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        cid = (body.customer_id or "").strip()
        if not cid:
            return JSONResponse(content={"notes": ""})
        tenant = _tenant(settings)
        cfg = _require_stylist_tenant_config(settings, tenant)
        sys = _system_prompt(cfg, "associate_quick_notes")
        try:
            profile = stylist_repo.fetch_stylist_customer_profile(settings, tenant, cid)
        except psycopg.Error as e:
            logger.exception("associate_quick_notes_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        if not profile:
            return JSONResponse(content={"notes": ""})
        user = f"Customer profile JSON:\n{json.dumps(profile, default=str)[:12000]}"
        raw = _invoke_llm_text(settings, sys, user)
        if raw:
            return JSONResponse(content={"notes": raw.strip()[:4000]})
        fb = _fallback_dict(cfg)
        qn = fb.get("quick_notes_when_llm_unavailable")
        if qn is None:
            raise HTTPException(
                status_code=503,
                detail="LLM returned no output and stylist.tenant_retail_config.config.fallback.quick_notes_when_llm_unavailable is null — set a string or fix the model/key",
            )
        if not isinstance(qn, str) or not qn.strip():
            raise HTTPException(
                status_code=503,
                detail="stylist.tenant_retail_config.config.fallback.quick_notes_when_llm_unavailable must be a non-empty string when the LLM is unavailable or empty",
            )
        return JSONResponse(content={"notes": qn.strip()[:4000]})

    @router.post("/retail/associate/initial-suggestions")
    def associate_initial_suggestions(request: Request, body: AssociateSuggestionsBody) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant(settings)
        cfg = _require_stylist_tenant_config(settings, tenant)
        sys = _system_prompt(cfg, "associate_initial_suggestions")
        fb = _fallback_dict(cfg)
        walk_in = _str_list("walk_in_initial_suggestions", fb.get("walk_in_initial_suggestions"), min_items=1)
        sparse = _str_list("initial_suggestions_when_llm_sparse", fb.get("initial_suggestions_when_llm_sparse"), min_items=0)

        try_on = [str(x) for x in (body.try_on_product_ids or []) if str(x).strip()]
        labels = _resolve_stylist_try_on_labels(settings, tenant, try_on or None)
        profile: dict[str, Any] = {}
        cid = (body.customer_id or "").strip()
        if cid:
            try:
                row = stylist_repo.fetch_stylist_customer_profile(settings, tenant, cid)
                if row:
                    profile = row
            except psycopg.Error as e:
                logger.exception("associate_initial_suggestions_query_failed")
                raise HTTPException(status_code=503, detail="Database error") from e
        if not profile and not labels:
            return JSONResponse(content={"suggestions": walk_in[:8]})

        user_obj: dict[str, Any] = {"customer_profile": profile, "try_on_product_names": labels}
        raw = _invoke_llm_text(settings, sys, json.dumps(user_obj, default=str)[:12000])
        parsed = _parse_json_object(raw) if raw else None
        sug = _coerce_suggestions(parsed.get("suggestions") if parsed else None)
        if len(sug) < 3:
            for x in sparse:
                if x not in sug:
                    sug.append(x)
                if len(sug) >= 8:
                    break
        if len(sug) < 1:
            raise HTTPException(
                status_code=503,
                detail="No initial suggestions from LLM and tenant sparse fallback exhausted — check model output and stylist.tenant_retail_config.config.fallback.initial_suggestions_when_llm_sparse",
            )
        return JSONResponse(content={"suggestions": sug[:8]})

    @router.post("/retail/associate/thread-suggestions")
    def associate_thread_suggestions(request: Request, body: AssociateThreadSuggestionsBody) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant(settings)
        cfg = _require_stylist_tenant_config(settings, tenant)
        sys = _system_prompt(cfg, "associate_thread_suggestions")
        fb = _fallback_dict(cfg)
        if "thread_suggestions_when_no_history_or_tryon" not in fb:
            raise HTTPException(
                status_code=503,
                detail="stylist.tenant_retail_config.config.fallback.thread_suggestions_when_no_history_or_tryon is required",
            )
        no_ctx = fb["thread_suggestions_when_no_history_or_tryon"]
        if not isinstance(no_ctx, list):
            raise HTTPException(
                status_code=503,
                detail="stylist.tenant_retail_config.config.fallback.thread_suggestions_when_no_history_or_tryon must be a JSON array",
            )
        sparse = _str_list("thread_suggestions_when_llm_sparse", fb.get("thread_suggestions_when_llm_sparse"), min_items=0)

        try_on = [str(x) for x in (body.try_on_product_ids or []) if str(x).strip()]
        labels = _resolve_stylist_try_on_labels(settings, tenant, try_on or None)
        profile: dict[str, Any] = {}
        cid = (body.customer_id or "").strip()
        if cid:
            try:
                row = stylist_repo.fetch_stylist_customer_profile(settings, tenant, cid)
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
            out = [str(x).strip() for x in no_ctx if isinstance(x, str) and str(x).strip()]
            return JSONResponse(content={"suggestions": out[:8]})

        user_obj = {
            "customer_profile": profile,
            "try_on_product_names": labels,
            "conversation": history_snippet,
        }
        raw = _invoke_llm_text(settings, sys, json.dumps(user_obj, default=str)[:14000])
        parsed = _parse_json_object(raw) if raw else None
        sug = _coerce_suggestions(parsed.get("suggestions") if parsed else None)
        if len(sug) < 2:
            for x in sparse:
                if x not in sug:
                    sug.append(x)
                if len(sug) >= 8:
                    break
        if len(sug) < 1:
            raise HTTPException(
                status_code=503,
                detail="No thread suggestions from LLM and tenant sparse fallback exhausted",
            )
        return JSONResponse(content={"suggestions": sug[:8]})

    @router.get("/retail/associates")
    def list_associates(request: Request) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant(settings)
        kw = postgres_connect_kwargs(settings)
        rows: list[dict[str, Any]] = []
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                session_set_tenant(cur, tenant)
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
            logger.exception("stylist_associates_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(content=rows)

    @router.get("/retail/stylists")
    def list_stylists(request: Request) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant(settings)
        kw = postgres_connect_kwargs(settings)
        rows: list[dict[str, Any]] = []
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                session_set_tenant(cur, tenant)
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
                    raise HTTPException(
                        status_code=503,
                        detail="stylist.stylists is missing — apply workforce/calendar DDL seeds for this environment",
                    ) from None
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
        except HTTPException:
            raise
        except psycopg.Error as e:
            logger.exception("stylist_stylists_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(content=rows)

    @router.get("/retail/stores")
    def list_stores(request: Request) -> JSONResponse:
        settings = _pg_settings(request)
        _require_pg(settings)
        tenant = _tenant(settings)
        kw = postgres_connect_kwargs(settings)
        rows: list[dict[str, Any]] = []
        try:
            with psycopg.connect(**kw) as conn, conn.cursor() as cur:
                session_set_tenant(cur, tenant)
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
                    raise HTTPException(
                        status_code=503,
                        detail="stylist.stores is missing — apply calendar DDL seeds for this environment",
                    ) from None
                cols = [d[0] for d in cur.description or []]
                for tup in cur.fetchall():
                    row = dict(zip(cols, tup, strict=True))
                    rows.append(row)
        except HTTPException:
            raise
        except psycopg.Error as e:
            logger.exception("stylist_stores_query_failed")
            raise HTTPException(status_code=503, detail="Database error") from e
        return JSONResponse(content=rows)

    attach_fitting_room_routes(router)
    attach_voice_intent_routes(router)
    return router
