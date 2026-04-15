"""Injectable runtime dependencies (LLM, vector index, MCP) — no domain prompts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel

from digital_stylist.config import StylistSettings
from digital_stylist.providers.protocols import VectorCatalog

if TYPE_CHECKING:
    from digital_stylist.mcp.runtime import McpRuntime

# Keys match :class:`~digital_stylist.framework.base.FiveBlockAgent` subclasses in the graph bundle.
AGENT_LLM_KEYS: tuple[str, ...] = (
    "customer",
    "intent",
    "stylist",
    "catalog",
    "appointment",
    "email",
    "support",
)
_AGENT_LLM_KEY_SET = frozenset(AGENT_LLM_KEYS)


@dataclass
class AgentRunContext:
    """Shared runtime wiring; individual domains receive this but do not import each other."""

    settings: StylistSettings
    llm: BaseChatModel
    embeddings: Embeddings | None
    catalog: VectorCatalog
    mcp: McpRuntime | None = None
    agent_llms: dict[str, BaseChatModel] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for k in AGENT_LLM_KEYS:
            self.agent_llms.setdefault(k, self.llm)

    def llm_for(self, agent: str) -> BaseChatModel:
        """Chat model for a graph agent name; uses per-agent env override when configured."""
        if agent not in _AGENT_LLM_KEY_SET:
            raise KeyError(f"Unknown agent key for LLM lookup: {agent!r}")
        return self.agent_llms[agent]
