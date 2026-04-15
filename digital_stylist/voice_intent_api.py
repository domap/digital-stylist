"""HTTP route: refine raw speech-to-text into a clear stylist-facing user message via LLM."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, ConfigDict, Field

from digital_stylist.config import StylistSettings
from digital_stylist.providers.factories import build_chat_model, is_llm_api_key_resolved

logger = logging.getLogger(__name__)

_SYSTEM = """You turn noisy retail fashion voice transcripts into ONE clear message for a digital stylist AI.

Rules:
- Infer what the shopper actually wants (occasion, outfit, sizing, product lookup, try-on, policy question, etc.).
- Remove filler (um, like, you know), false starts, stutters, and repeated phrases. Keep concrete details: colors, sizes, dates, SKU or product names, budget hints.
- Write as the shopper would type a single chat message: first person, fluent, no meta-commentary, no wrapping quotes, no preamble like "Here is the message:".
- If the transcript is unintelligible or empty of intent, output exactly: Help me find something to wear.
- Maximum 500 characters in your output."""


def _invoke(settings: StylistSettings, system: str, user: str) -> str:
    if not is_llm_api_key_resolved(settings):
        return ""
    try:
        llm = build_chat_model(settings)
        reply = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        content = getattr(reply, "content", "")
        return content.strip() if isinstance(content, str) else str(content).strip()
    except Exception as e:
        logger.warning("voice_intent_llm_failed", extra={"error": str(e)})
        return ""


class VoiceIntentBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    transcript: str = Field(default="", max_length=12000)
    surface: str | None = Field(
        default=None,
        description="Optional hint: connect | clienteling | cart",
    )


def _surface_preamble(surface: str | None) -> str:
    s = (surface or "").strip().lower()
    if s == "connect":
        return "Channel: consumer shopping app (Ann digital stylist).\n"
    if s == "clienteling":
        return "Channel: in-store associate console helping a client.\n"
    if s == "cart":
        return "Channel: associate cart / bag cross-sell assistant.\n"
    return ""


def attach_voice_intent_routes(router: APIRouter) -> None:
    @router.post("/voice/transcript-to-intent")
    def transcript_to_intent(request: Request, body: VoiceIntentBody) -> JSONResponse:
        """Derive a concise user message from raw STT; falls back to trimmed transcript if LLM is unavailable."""
        settings: StylistSettings = request.app.state.settings
        raw = (body.transcript or "").strip()
        if not raw:
            raise HTTPException(status_code=400, detail="transcript is required")

        if len(raw) > 8000:
            raw = raw[:8000].rsplit(" ", 1)[0] + "…"

        if not is_llm_api_key_resolved(settings):
            return JSONResponse(content={"message": raw, "refined": False})

        preamble = _surface_preamble(body.surface)
        user_block = f"{preamble}Raw speech-to-text transcript:\n{raw}\n\nOutput only the normalized shopper message."
        out = _invoke(settings, _SYSTEM, user_block)
        if not out or len(out) < 2:
            return JSONResponse(content={"message": raw, "refined": False})
        out = out.replace("\n", " ").strip()
        if len(out) > 2000:
            out = out[:1997] + "…"
        return JSONResponse(content={"message": out, "refined": True})
