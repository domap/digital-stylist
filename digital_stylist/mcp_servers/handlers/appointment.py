from __future__ import annotations

import json

from mcp.server.fastmcp import FastMCP

from digital_stylist.config import StylistSettings
from digital_stylist.domains.appointment import repository as appointment_repository
from digital_stylist.mcp_servers.observability import mcp_tool_span


def _settings() -> StylistSettings:
    return StylistSettings()


def register_appointment_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def appointment_list_slots(store_id: str, days_ahead: int = 7) -> str:
        """Return JSON array of ISO-like slot strings for the next days_ahead days (stub calendar)."""
        with mcp_tool_span("appointment", "appointment_list_slots"):
            try:
                data = appointment_repository.appointment_list_slots(_settings(), store_id, days_ahead)
                return json.dumps(data, default=str)
            except Exception as e:
                return json.dumps({"error": type(e).__name__, "message": str(e)})

    @mcp.tool()
    def appointment_create_booking(
        store_id: str,
        slot: str,
        purpose: str = "styling_consultation",
        customer_user_id: str = "guest",
    ) -> str:
        """Create a booking and return JSON with booking_id and confirmed slot. customer_user_id scopes RLS."""
        with mcp_tool_span("appointment", "appointment_create_booking"):
            try:
                rec = appointment_repository.appointment_create_booking(
                    _settings(), store_id, slot, purpose, customer_user_id
                )
                return json.dumps(rec, default=str)
            except Exception as e:
                return json.dumps({"error": type(e).__name__, "message": str(e)})

    @mcp.tool()
    def appointment_get_booking(booking_id: str, customer_user_id: str = "guest") -> str:
        """Fetch booking JSON by id (customer_user_id must match the row owner under RLS)."""
        with mcp_tool_span("appointment", "appointment_get_booking"):
            try:
                data = appointment_repository.appointment_get_booking(
                    _settings(), booking_id, customer_user_id
                )
                return json.dumps(data, default=str)
            except Exception as e:
                return json.dumps({"error": type(e).__name__, "message": str(e)})
