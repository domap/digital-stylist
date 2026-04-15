"""Construct FastMCP apps: combined (HTTP service) or single-domain (stdio subprocess)."""

from __future__ import annotations

import os

from mcp.server.fastmcp import FastMCP

from digital_stylist.mcp_servers.handlers import appointment, associate, customer, email


def build_combined_mcp(
    *,
    host: str | None = None,
    port: int | None = None,
    mount_path: str = "/",
) -> FastMCP:
    """All domain tools on one server (streamable HTTP in :mod:`digital_stylist.mcp_servers.main`)."""
    h = host if host is not None else os.environ.get("STYLIST_MCP_SERVICE_HOST", "127.0.0.1")
    p = port if port is not None else int(os.environ.get("STYLIST_MCP_SERVICE_PORT", "8800"))
    mcp = FastMCP("Digital Stylist MCP", host=h, port=p, mount_path=mount_path)
    customer.register_customer_tools(mcp)
    appointment.register_appointment_tools(mcp)
    email.register_email_tools(mcp)
    associate.register_associate_tools(mcp)
    return mcp


def build_customer_stdio_mcp() -> FastMCP:
    mcp = FastMCP("Digital Stylist — Customer")
    customer.register_customer_tools(mcp)
    return mcp


def build_appointment_stdio_mcp() -> FastMCP:
    mcp = FastMCP("Digital Stylist — Appointments")
    appointment.register_appointment_tools(mcp)
    return mcp


def build_email_stdio_mcp() -> FastMCP:
    mcp = FastMCP("Digital Stylist — Email")
    email.register_email_tools(mcp)
    return mcp


def build_associate_stdio_mcp() -> FastMCP:
    mcp = FastMCP("Digital Stylist — Associates")
    associate.register_associate_tools(mcp)
    return mcp
