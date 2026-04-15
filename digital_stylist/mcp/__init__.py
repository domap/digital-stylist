"""Agent-side MCP client (stdio or remote HTTP to :mod:`digital_stylist.mcp_servers`)."""

from digital_stylist.mcp.runtime import McpRuntime, build_mcp_connections, build_mcp_runtime

__all__ = ["McpRuntime", "build_mcp_connections", "build_mcp_runtime"]
