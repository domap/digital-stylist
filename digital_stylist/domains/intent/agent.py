"""Intent domain agent — structured routing over session messages."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import SystemMessage

from digital_stylist.contracts.state import NextNodeLiteral, StylistState
from digital_stylist.domains.intent.prompts import INTENT_AGENT, MASTER_ORCHESTRATION
from digital_stylist.domains.intent.schemas import IntentOutput
from digital_stylist.framework.base import FiveBlockAgent, IdentityContext


class IntentAgent(FiveBlockAgent):
    """Classifies user intent and selects the next graph branch."""

    agent_key = "intent"

    def bind(self, state: StylistState) -> IdentityContext:
        return IdentityContext(system=MASTER_ORCHESTRATION + "\n\n" + INTENT_AGENT)

    def perceive(self, state: StylistState, identity: IdentityContext) -> Any:
        return list(state.get("messages", []))[-12:]

    def reason(self, state: StylistState, identity: IdentityContext, perception: Any) -> Any:
        structured = self.llm.with_structured_output(IntentOutput)
        sys = SystemMessage(content=identity.system)
        return structured.invoke([sys, *perception])

    def synthesize(
        self,
        state: StylistState,
        identity: IdentityContext,
        perception: Any,
        reasoning: Any,
        act_result: Any,
    ) -> dict[str, Any]:
        out: IntentOutput = reasoning
        next_node: NextNodeLiteral = out.next_node
        if next_node == "respond":
            next_node = "support"
        # "email" is kept for the dedicated lookbook / email-queue branch (see graph).
        return {
            "current_intent": out.intent,
            "urgency": out.urgency,
            "next_node": next_node,
        }
