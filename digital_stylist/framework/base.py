"""Agent AI 5-block model: bind → perceive → reason → act → synthesize."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, ClassVar

from langchain_core.language_models.chat_models import BaseChatModel

from digital_stylist.contracts.context import AgentRunContext
from digital_stylist.contracts.state import StylistState


@dataclass(frozen=True)
class IdentityContext:
    """Block 1 — Identity: system role + constraints for this agent."""

    system: str


class FiveBlockAgent(ABC):
    """
    Composable agent skeleton (framework only).

    1. **bind** — Identity
    2. **perceive** — Structured inputs from workflow state
    3. **reason** — LLM inference
    4. **act** — Tools / side effects
    5. **synthesize** — State patches
    """

    agent_key: ClassVar[str] = ""

    def __init__(self, ctx: AgentRunContext) -> None:
        self.ctx = ctx

    @property
    def llm(self) -> BaseChatModel:
        if not self.agent_key:
            raise RuntimeError(f"{type(self).__name__} must define class-level agent_key")
        return self.ctx.llm_for(self.agent_key)

    @abstractmethod
    def bind(self, state: StylistState) -> IdentityContext: ...

    def perceive(self, state: StylistState, identity: IdentityContext) -> Any:
        return {}

    @abstractmethod
    def reason(self, state: StylistState, identity: IdentityContext, perception: Any) -> Any: ...

    def act(self, state: StylistState, reasoning: Any) -> Any:
        return None

    @abstractmethod
    def synthesize(
        self,
        state: StylistState,
        identity: IdentityContext,
        perception: Any,
        reasoning: Any,
        act_result: Any,
    ) -> dict[str, Any]: ...

    def run(self, state: StylistState) -> dict[str, Any]:
        """Execute the five blocks and return a **partial** state update (LangGraph merges immutably)."""
        identity = self.bind(state)
        perception = self.perceive(state, identity)
        reasoning = self.reason(state, identity, perception)
        act_result = self.act(state, reasoning)
        return self.synthesize(state, identity, perception, reasoning, act_result)
