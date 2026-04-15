"""HTTP worker that runs the LangGraph — bind behind the Express orchestration API."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from langchain_core.messages import BaseMessage, HumanMessage
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware

from digital_stylist.config import StylistSettings
from digital_stylist.graph import build_graph
from digital_stylist.infra.postgres.connection import maybe_apply_development_postgres_env
from digital_stylist.providers.factories import build_agent_run_context
from digital_stylist.retail_api import build_retail_router

logger = logging.getLogger("digital_stylist.worker")


class InvokeBody(BaseModel):
    message: str = Field(..., min_length=1, description="User turn text")
    thread_id: str | None = Field(
        default=None, description="LangGraph thread id for checkpointed sessions"
    )
    context_metadata: dict[str, Any] | None = None
    merge_session_defaults: bool = Field(
        default=True,
        description="When true, merge default occasion/weather/location into context_metadata",
    )


def _default_context_metadata() -> dict[str, Any]:
    return {"occasion": "general", "weather_f": 72, "location": "NYC"}


def _serialize_message(m: BaseMessage) -> dict[str, Any]:
    typ = getattr(m, "type", "unknown")
    content = getattr(m, "content", "")
    if not isinstance(content, str):
        content = str(content)
    return {"type": typ, "content": content}


def _state_summary(out: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "current_intent",
        "urgency",
        "next_node",
        "booking_id",
        "stylist_notes",
        "catalog_rag_trace",
        "email_draft",
        "appointment_copy",
        "mcp_email_queue_id",
    )
    summary: dict[str, Any] = {}
    for k in keys:
        if k in out and out[k] is not None:
            summary[k] = out[k]
    if out.get("recommendations"):
        summary["recommendation_count"] = len(out["recommendations"])
    if out.get("user_profile") is not None:
        summary["user_profile"] = out["user_profile"]
    return summary


def _error_payload(request: Request, *, code: str, message: str, status: int) -> JSONResponse:
    rid = getattr(request.state, "request_id", None)
    body: dict[str, Any] = {"error": code, "message": message}
    if rid:
        body["request_id"] = rid
    return JSONResponse(status_code=status, content=body)


def create_app(settings: StylistSettings | None = None) -> FastAPI:
    if settings is None:
        maybe_apply_development_postgres_env()
        settings = StylistSettings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(
            "worker_startup",
            extra={"environment": settings.environment, "docs": settings.should_show_openapi()},
        )
        app.state.settings = settings
        ctx = build_agent_run_context(settings)
        app.state.graph = build_graph(context=ctx)
        try:
            yield
        finally:
            app.state.graph = None
            logger.info("worker_shutdown")

    app = FastAPI(
        title="Digital Stylist Worker",
        description="Internal service: loads the stylist graph once and invokes it per request.",
        lifespan=lifespan,
        docs_url="/docs" if settings.should_show_openapi() else None,
        redoc_url="/redoc" if settings.should_show_openapi() else None,
        openapi_url="/openapi.json" if settings.should_show_openapi() else None,
    )

    _cors = (os.environ.get("STYLIST_STOREFRONT_CORS_ORIGINS") or "").strip()
    if _cors:
        origins = [o.strip() for o in _cors.split(",") if o.strip()]
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )

    app.include_router(build_retail_router())

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = rid
        response: Response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return _error_payload(
            request,
            code="validation_error",
            message="Invalid request body",
            status=422,
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse | Response:
        if isinstance(exc, StarletteHTTPException):
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        s: StylistSettings = request.app.state.settings
        logger.exception(
            "unhandled_error", extra={"request_id": getattr(request.state, "request_id", None)}
        )
        msg = str(exc) if s.expose_internal_errors() else "An internal error occurred"
        return _error_payload(request, code="internal_error", message=msg, status=500)

    @app.get("/health")
    def health(request: Request) -> dict[str, Any]:
        g = getattr(request.app.state, "graph", None)
        ok = g is not None
        return {
            "status": "ok" if ok else "degraded",
            "service": "digital-stylist-worker",
            "graph_ready": ok,
        }

    @app.get("/ready")
    def ready(request: Request) -> Response:
        """Kubernetes-style readiness: graph loaded."""
        g = getattr(request.app.state, "graph", None)
        if g is None:
            return JSONResponse(status_code=503, content={"ready": False})
        return JSONResponse(status_code=200, content={"ready": True})

    @app.post("/v1/invoke")
    async def invoke(request: Request, body: InvokeBody) -> dict[str, Any]:
        graph: Any = getattr(request.app.state, "graph", None)
        s: StylistSettings = request.app.state.settings
        rid = getattr(request.state, "request_id", None)

        if graph is None:
            raise HTTPException(status_code=503, detail="Graph not initialized")

        if len(body.message) > s.max_user_message_chars:
            raise HTTPException(
                status_code=413,
                detail=f"message exceeds max length ({s.max_user_message_chars})",
            )

        tid = body.thread_id or str(uuid.uuid4())
        cfg = {"configurable": {"thread_id": tid}}
        payload: dict[str, Any] = {"messages": [HumanMessage(content=body.message.strip())]}
        meta = dict(body.context_metadata or {})
        if body.merge_session_defaults:
            merged = _default_context_metadata()
            merged.update(meta)
            meta = merged
        if meta:
            payload["context_metadata"] = meta

        timeout = s.graph_invoke_timeout_sec

        def _run_graph() -> dict[str, Any]:
            return graph.invoke(payload, cfg)

        try:
            out = await asyncio.wait_for(asyncio.to_thread(_run_graph), timeout=timeout)
        except TimeoutError:
            logger.warning(
                "invoke_timeout",
                extra={"request_id": rid, "timeout_sec": timeout},
            )
            raise HTTPException(
                status_code=504,
                detail=f"Graph invocation exceeded {timeout}s",
            ) from None
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("invoke_failed", extra={"request_id": rid})
            if s.expose_internal_errors():
                raise HTTPException(status_code=500, detail=str(e)) from e
            raise HTTPException(status_code=500, detail="Graph invocation failed") from e

        msgs = list(out.get("messages") or [])
        assistant_message = ""
        for m in reversed(msgs):
            if getattr(m, "type", None) == "ai":
                c = getattr(m, "content", "")
                assistant_message = c if isinstance(c, str) else str(c)
                break
        return {
            "thread_id": tid,
            "assistant_message": assistant_message,
            "messages": [_serialize_message(m) for m in msgs],
            "state": _state_summary(out),
        }

    return app


app = create_app()


def run() -> None:
    import os

    import uvicorn

    from digital_stylist.providers.factories import build_default_settings

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    s = build_default_settings()
    host = os.environ.get("STYLIST_WORKER_HOST", "127.0.0.1")
    port = int(os.environ.get("STYLIST_WORKER_PORT", "8787"))
    # Recreate app so OpenAPI and lifespan match current env (settings already loaded above).
    application = create_app(s)
    uvicorn.run(
        application,
        host=host,
        port=port,
        proxy_headers=s.behind_reverse_proxy,
        forwarded_allow_ips="*" if s.behind_reverse_proxy else None,
        timeout_keep_alive=75,
    )
