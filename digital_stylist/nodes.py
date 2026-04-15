"""Compatibility shim — nodes are domain agents on :class:`~digital_stylist.agents.bundle.StylistAgentBundle`."""

from digital_stylist.domains.intent.routing import route_from_intent

__all__ = ["route_from_intent"]
