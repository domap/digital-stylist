"""LangGraph orchestration: Customer → Intent → branches (stylist path, appointment, email, support)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from digital_stylist.agents.bundle import StylistAgentBundle
from digital_stylist.contracts.context import AgentRunContext
from digital_stylist.contracts.state import StylistState
from digital_stylist.domains.intent.routing import route_from_intent
from digital_stylist.providers.factories import build_agent_run_context

if TYPE_CHECKING:
    from langgraph.checkpoint.base import BaseCheckpointSaver


def default_checkpointer() -> BaseCheckpointSaver:
    """In-memory LangGraph checkpointer for session/thread state (dev default)."""
    from langgraph.checkpoint.memory import MemorySaver

    return MemorySaver()


def build_graph(
    context: AgentRunContext | None = None,
    *,
    agents: StylistAgentBundle | None = None,
    checkpointer: BaseCheckpointSaver | None = None,
) -> CompiledStateGraph[StylistState, None, StylistState, StylistState]:
    """
    Compile the multi-agent graph.

    Pass a custom :class:`~digital_stylist.contracts.context.AgentRunContext` to swap default LLM,
    per-agent LLM overrides (see :class:`~digital_stylist.config.StylistSettings`), vector catalog,
    or MCP without changing node wiring.
    """
    ctx = context or build_agent_run_context()
    bundle = agents or StylistAgentBundle.from_context(ctx)
    cp = checkpointer if checkpointer is not None else default_checkpointer()
    g = StateGraph(StylistState)
    g.add_node("customer", bundle.customer.run)
    g.add_node("intent", bundle.intent.run)
    g.add_node("stylist", bundle.stylist.run)
    g.add_node("catalog", bundle.catalog.run)
    g.add_node("explainability", bundle.explainability.run)
    g.add_node("email", bundle.email.run)
    g.add_node("appointment", bundle.appointment.run)
    g.add_node("support", bundle.support.run)

    g.add_edge(START, "customer")
    g.add_edge("customer", "intent")
    g.add_conditional_edges(
        "intent",
        route_from_intent,
        {
            "stylist": "stylist",
            "appointment": "appointment",
            "email": "email",
            "support": "support",
        },
    )
    g.add_edge("stylist", "catalog")
    g.add_edge("catalog", "explainability")
    g.add_edge("explainability", END)
    g.add_edge("appointment", END)
    g.add_edge("email", END)
    g.add_edge("support", END)

    return g.compile(checkpointer=cp)
