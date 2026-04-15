"""Appointment MCP (stdio). Prefer ``digital-stylist-mcp-service`` + ``STYLIST_MCP_REMOTE_URL`` for a separate process."""

from __future__ import annotations

from digital_stylist.mcp_servers.build_mcp import build_appointment_stdio_mcp

mcp = build_appointment_stdio_mcp()

if __name__ == "__main__":
    mcp.run(transport="stdio")
