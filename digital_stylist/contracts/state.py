"""LangGraph wire schema shared by the orchestrator (not owned by any single domain).

**Field ownership** (writers — readers may be wider):

- ``messages``: all nodes via LangGraph ``add_messages`` reducer
- ``user_profile``, ``mcp_customer_snapshot``: customer domain (+ MCP ingest)
- ``current_intent``, ``urgency``, ``next_node``: intent domain (``next_node`` consumed by ``route_from_intent``)
- ``stylist_notes``: stylist domain
- ``recommendations``, ``catalog_matches``, ``catalog_rag_trace``: catalog domain
- ``booking_id``, ``appointment_copy``: appointment domain
- ``email_draft``, ``mcp_email_queue_id``: email domain
- ``context_metadata``: CLI / HTTP worker seeding; read by domains as session context
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, NotRequired, Required, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class StylistState(TypedDict, total=False):
    """Workflow bus — update via **partial dict returns** from nodes (no in-place mutation)."""

    messages: Required[Annotated[list[BaseMessage], add_messages]]
    user_profile: NotRequired[dict[str, Any]]
    current_intent: NotRequired[str]
    recommendations: NotRequired[list[dict[str, Any]]]
    context_metadata: NotRequired[dict[str, Any]]
    urgency: NotRequired[int]
    next_node: NotRequired[str]
    booking_id: NotRequired[str | None]
    stylist_notes: NotRequired[str]
    catalog_matches: NotRequired[list[dict[str, Any]]]
    email_draft: NotRequired[str]
    appointment_copy: NotRequired[str]
    catalog_rag_trace: NotRequired[str]
    mcp_customer_snapshot: NotRequired[dict[str, Any]]
    mcp_email_queue_id: NotRequired[str]


IntentLiteral = Literal["PURCHASE", "INQUIRY", "APPOINTMENT", "SUPPORT"]

NextNodeLiteral = Literal["stylist", "appointment", "support", "respond"]
