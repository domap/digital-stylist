"""Standalone MCP service: DB-backed tools for Digital Stylist agents.

Run the HTTP MCP process::

    digital-stylist-mcp-service

Point the worker at it (same tools as stdio, one streamable HTTP endpoint)::

    export STYLIST_MCP_REMOTE_URL=http://127.0.0.1:8800

See :mod:`digital_stylist.mcp_servers.main` and :mod:`digital_stylist.mcp.runtime`.
"""
