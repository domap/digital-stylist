"""Agent AI 5-block model: bind → perceive → reason → act → synthesize."""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, ClassVar

from langchain_core.language_models.chat_models import BaseChatModel

from digital_stylist.contracts.context import AgentRunContext
from digital_stylist.contracts.state import StylistState

_agent_log = logging.getLogger("digital_stylist.agent")


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
        agent = self.agent_key
        t0 = time.perf_counter()
        _agent_log.info(
            "agent_run_start",
            extra={"component": "agent", "event": "agent_run_start", "agent": agent},
        )
        try:
            identity = self.bind(state)
            perception = self.perceive(state, identity)
            reasoning = self.reason(state, identity, perception)
            act_result = self.act(state, reasoning)
            out = self.synthesize(state, identity, perception, reasoning, act_result)
        except Exception:
            _agent_log.exception(
                "agent_run_error",
                extra={
                    "component": "agent",
                    "event": "agent_run_error",
                    "agent": agent,
                    "duration_ms": int((time.perf_counter() - t0) * 1000),
                },
            )
            raise
        _agent_log.info(
            "agent_run_end",
            extra={
                "component": "agent",
                "event": "agent_run_end",
                "agent": agent,
                "duration_ms": int((time.perf_counter() - t0) * 1000),
                "success": True,
            },
        )
        return out
