"""Email domain agent — LLM draft + MCP queue."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from digital_stylist.contracts.state import StylistState
from digital_stylist.domains.email.prompts import EMAIL_AGENT
from digital_stylist.framework.base import FiveBlockAgent, IdentityContext


class EmailAgent(FiveBlockAgent):
    """Drafts email body and enqueues via email MCP when configured."""

    agent_key = "email"

    def bind(self, state: StylistState) -> IdentityContext:
        return IdentityContext(system=EMAIL_AGENT)

    def perceive(self, state: StylistState, identity: IdentityContext) -> Any:
        return {
            "intent": state.get("current_intent", "INQUIRY"),
            "stylist_notes": state.get("stylist_notes"),
            "catalog_matches": state.get("catalog_matches") or state.get("recommendations"),
            "booking_id": state.get("booking_id"),
            "user_profile": state.get("user_profile"),
        }

    def reason(self, state: StylistState, identity: IdentityContext, perception: Any) -> Any:
        sys = SystemMessage(content=identity.system)
        reply = self.llm.invoke([sys, HumanMessage(content=json.dumps(perception, default=str))])
        draft = str(reply.content)
        tracking = "\n\n---\nTracking: {{open_pixel_url}} · Product clicks: {{product_click_base_url}}?sku="
        return {"draft": draft, "full": draft + tracking}

    def act(self, state: StylistState, reasoning: Any) -> Any:
        if not self.ctx.mcp or not isinstance(reasoning, dict):
            return None
        try:
            return self.ctx.mcp.invoke(
                "email",
                "email_queue_lookbook",
                {"payload_json": reasoning["full"], "template_id": "lookbook_v1"},
            )
        except (KeyError, RuntimeError, OSError):
            return None

    def synthesize(
        self,
        state: StylistState,
        identity: IdentityContext,
        perception: Any,
        reasoning: Any,
        act_result: Any,
    ) -> dict[str, Any]:
        if not isinstance(reasoning, dict):
            reasoning = {"draft": str(reasoning), "full": str(reasoning)}
        full = reasoning["full"]
        draft = reasoning["draft"]
        queue_id: str | None = None
        if act_result and isinstance(act_result, str) and act_result.strip().startswith("{"):
            try:
                queue_id = json.loads(act_result).get("queue_id")
            except json.JSONDecodeError:
                queue_id = None
        matches = perception.get("catalog_matches") or []
        sku_lines = "\n".join(
            f"- {m.get('name', m.get('sku'))} (SKU {m.get('sku')}) — {m.get('image_url', '')}"
            for m in matches[:5]
        )
        qnote = f"\n\n_(MCP email queue id: {queue_id})_" if queue_id else ""
        if state.get("booking_id"):
            appt = state.get("appointment_copy") or ""
            bid = state.get("booking_id", "")
            user_visible = (
                f"Your consultation is noted. Booking reference: **{bid}**.\n\n"
                f"{appt}\n\n---\nEmail draft (queued):\n\n{draft[:2500]}" + qnote
            )
        else:
            user_visible = (
                f"### Your look\n\n{state.get('stylist_notes', '')}\n\n"
                f"### Verified catalog matches\n{sku_lines or '_(No matching in-stock SKU in vector index — seed or widen search.)_'}\n\n"
                f"### Lookbook email (queued)\n{draft[:2000]}" + qnote
            )
        out: dict[str, Any] = {"email_draft": full, "messages": [AIMessage(content=user_visible)]}
        if queue_id:
            out["mcp_email_queue_id"] = queue_id
        return out
