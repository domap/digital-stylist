"""Support domain agent — general help without product retrieval."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, SystemMessage

from digital_stylist.contracts.state import StylistState
from digital_stylist.domains.support.prompts import SUPPORT_AGENT
from digital_stylist.framework.base import FiveBlockAgent, IdentityContext


class SupportAgent(FiveBlockAgent):
    """Handles SUPPORT intent with LLM-only replies."""

    agent_key = "support"

    def bind(self, state: StylistState) -> IdentityContext:
        return IdentityContext(system=SUPPORT_AGENT)

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
        return {"messages": [AIMessage(content=str(reasoning))]}
