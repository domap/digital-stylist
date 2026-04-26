"""Explainability domain agent — summarizes why recommended SKUs fit the shopper."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from digital_stylist.contracts.message_utils import last_human_message_text
from digital_stylist.contracts.state import StylistState
from digital_stylist.domains.explainability.prompts import EXPLAINABILITY_AGENT
from digital_stylist.framework.base import FiveBlockAgent, IdentityContext


def _sku_lines(matches: list[dict[str, Any]], *, limit: int = 5) -> str:
    lines: list[str] = []
    for m in matches[:limit]:
        if not isinstance(m, dict):
            continue
        lines.append(
            f"- {m.get('name', m.get('sku'))} (SKU {m.get('sku')}) — {m.get('image_url', '')}"
        )
    return "\n".join(lines)


def _compact_recommendations(recs: list[dict[str, Any]], *, limit: int = 8) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in recs[:limit]:
        if not isinstance(r, dict):
            continue
        out.append(
            {
                k: r.get(k)
                for k in ("sku", "name", "price", "status", "size", "image_url")
                if r.get(k) is not None and r.get(k) != ""
            }
        )
    return out


class ExplainabilityAgent(FiveBlockAgent):
    """Turns retrieval context + picks into a concise rationale for the final reply."""

    agent_key = "explainability"

    def bind(self, state: StylistState) -> IdentityContext:
        return IdentityContext(system=EXPLAINABILITY_AGENT)

    def perceive(self, state: StylistState, identity: IdentityContext) -> Any:
        recs = list(state.get("recommendations") or state.get("catalog_matches") or [])
        trace = str(state.get("catalog_rag_trace") or "").strip()
        if len(trace) > 6000:
            trace = trace[:6000] + "\n…(trace truncated)"
        profile = state.get("user_profile") or {}
        slim_profile = {
            k: profile.get(k)
            for k in ("sizes", "budget_ceiling", "agent_summary", "guardrails")
            if profile.get(k) is not None
        }
        return {
            "last_user_message": last_human_message_text(state),
            "stylist_notes": state.get("stylist_notes") or "",
            "recommendations": _compact_recommendations(recs),
            "catalog_rag_trace": trace,
            "user_profile_hints": slim_profile,
            "current_intent": state.get("current_intent", "INQUIRY"),
        }

    def reason(self, state: StylistState, identity: IdentityContext, perception: Any) -> Any:
        sys = SystemMessage(content=identity.system)
        payload = json.dumps(perception, default=str, indent=2)[:14_000]
        reply = self.llm.invoke([sys, HumanMessage(content=f"Context JSON:\n{payload}")])
        return str(getattr(reply, "content", reply)).strip()

    def synthesize(
        self,
        state: StylistState,
        identity: IdentityContext,
        perception: Any,
        reasoning: Any,
        act_result: Any,
    ) -> dict[str, Any]:
        text = str(reasoning).strip() if reasoning else ""
        if not text:
            text = "- We could not generate a rationale for this turn."
        rationale = text[:6000]
        matches = list(state.get("recommendations") or state.get("catalog_matches") or [])
        sku = _sku_lines(matches)
        rationale_block = f"### Why these picks\n\n{rationale}\n\n"
        user_visible = (
            f"### Your look\n\n{state.get('stylist_notes', '')}\n\n"
            f"{rationale_block}"
            f"### Verified catalog matches\n"
            f"{sku or '_(No matching in-stock SKU in vector index — seed or widen search.)_'}\n"
        )
        return {
            "recommendation_rationale": rationale,
            "messages": [AIMessage(content=user_visible)],
        }
