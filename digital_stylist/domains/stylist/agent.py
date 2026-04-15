"""Stylist domain agent — outfit narrative from profile + context."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import SystemMessage

from digital_stylist.contracts.state import StylistState
from digital_stylist.domains.stylist.prompts import STYLIST_AGENT
from digital_stylist.framework.base import FiveBlockAgent, IdentityContext


class StylistAgent(FiveBlockAgent):
    """Produces stylist_notes for downstream catalog retrieval."""

    agent_key = "stylist"

    def bind(self, state: StylistState) -> IdentityContext:
        profile = state.get("user_profile", {})
        meta = state.get("context_metadata", {})
        return IdentityContext(
            system=STYLIST_AGENT + f"\nuser_profile: {json.dumps(profile, default=str)}\n"
            f"context_metadata: {json.dumps(meta, default=str)}"
        )

    def perceive(self, state: StylistState, identity: IdentityContext) -> Any:
        return list(state.get("messages", []))[-16:]

    def reason(self, state: StylistState, identity: IdentityContext, perception: Any) -> Any:
        sys = SystemMessage(content=identity.system)
        reply = self.llm.invoke([sys, *perception])
        return str(reply.content)

    def synthesize(
        self,
        state: StylistState,
        identity: IdentityContext,
        perception: Any,
        reasoning: Any,
        act_result: Any,
    ) -> dict[str, Any]:
        return {"stylist_notes": str(reasoning)}
