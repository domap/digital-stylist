"""LangGraph conditional edge from intent domain output (single routing function for the graph)."""

from __future__ import annotations

import logging
from typing import Literal

from digital_stylist.contracts.state import StylistState

logger = logging.getLogger(__name__)


def route_from_intent(
    state: StylistState,
) -> Literal["stylist", "appointment", "support", "email"]:
    n = state.get("next_node", "support")
    if n in ("stylist", "appointment", "support", "email"):
        return n
    logger.warning(
        "intent_route_invalid_next_node",
        extra={"next_node": n, "fallback": "support"},
    )
    return "support"
