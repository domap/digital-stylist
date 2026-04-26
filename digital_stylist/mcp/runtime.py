"""MCP client for agents: stdio subprocesses (default) or remote streamable HTTP service."""

from __future__ import annotations

import asyncio
import logging
import sys
import time
from typing import Any

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

from digital_stylist.config import StylistSettings

_mcp_client_log = logging.getLogger("digital_stylist.mcp.client")


def _remote_mcp_endpoint(settings: StylistSettings) -> str | None:
    base = (settings.mcp_remote_url or "").strip().rstrip("/")
    if not base:
        return None
    path = (settings.mcp_remote_path or "/mcp").strip()
    if not path.startswith("/"):
        path = "/" + path
    return f"{base}{path}"


def build_mcp_connections(settings: StylistSettings) -> dict[str, dict[str, Any]]:
    """Remote streamable HTTP (one process) or stdio MCP servers (one subprocess per domain)."""
    endpoint = _remote_mcp_endpoint(settings)
    if endpoint:
        return {
            "stylist": {
                "transport": "streamable_http",
                "url": endpoint,
            }
        }
    py = settings.mcp_python_executable or sys.executable
    return {
        "customer": {
            "transport": "stdio",
            "command": py,
            "args": ["-m", "digital_stylist.domains.customer.mcp_server"],
        },
        "appointment": {
            "transport": "stdio",
            "command": py,
            "args": ["-m", "digital_stylist.domains.appointment.mcp_server"],
        },
        "email": {
            "transport": "stdio",
            "command": py,
            "args": ["-m", "digital_stylist.domains.email.mcp_server"],
        },
        "associate": {
            "transport": "stdio",
            "command": py,
            "args": ["-m", "digital_stylist.domains.associate.mcp_server"],
        },
    }


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


class McpRuntime:
    """Caches LangChain tools per MCP server and exposes sync :meth:`invoke`."""

    def __init__(
        self,
        client: MultiServerMCPClient,
        *,
        domain_servers: dict[str, str] | None = None,
    ) -> None:
        self._client = client
        self._tools: dict[str, list[BaseTool]] = {}
        self._domain_servers = domain_servers or {}

    def _resolve_server(self, server_name: str) -> str:
        return self._domain_servers.get(server_name, server_name)

    def tools_for(self, server_name: str) -> list[BaseTool]:
        resolved = self._resolve_server(server_name)
        if resolved not in self._tools:
            self._tools[resolved] = _run(self._client.get_tools(server_name=resolved))
        return self._tools[resolved]

    def invoke(self, server_name: str, tool_name: str, arguments: dict[str, Any]) -> str:
        for t in self.tools_for(server_name):
            if t.name == tool_name:
                t0 = time.perf_counter()
                _mcp_client_log.info(
                    "mcp_client_call_start",
                    extra={
                        "component": "mcp_client",
                        "event": "mcp_client_call_start",
                        "mcp_server": server_name,
                        "mcp_tool": tool_name,
                    },
                )
                try:
                    out = _run(t.ainvoke(arguments))
                except Exception as e:
                    _mcp_client_log.exception(
                        "mcp_client_call_error",
                        extra={
                            "component": "mcp_client",
                            "event": "mcp_client_call_error",
                            "mcp_server": server_name,
                            "mcp_tool": tool_name,
                            "duration_ms": int((time.perf_counter() - t0) * 1000),
                            "error_type": type(e).__name__,
                        },
                    )
                    raise
                _mcp_client_log.info(
                    "mcp_client_call_end",
                    extra={
                        "component": "mcp_client",
                        "event": "mcp_client_call_end",
                        "mcp_server": server_name,
                        "mcp_tool": tool_name,
                        "duration_ms": int((time.perf_counter() - t0) * 1000),
                        "success": True,
                    },
                )
                return _normalize_tool_content(out)
        raise KeyError(f"MCP tool not found: {server_name}.{tool_name}")


def _normalize_tool_content(out: Any) -> str:
    """LangChain MCP tools may return text, JSON strings, or content-block lists."""
    if isinstance(out, str):
        return out
    if isinstance(out, list) and out:
        first = out[0]
        if isinstance(first, dict) and "text" in first:
            return str(first["text"])
    return str(out)


def build_mcp_runtime(settings: StylistSettings) -> McpRuntime | None:
    """Connect to ``STYLIST_MCP_REMOTE_URL`` or spawn stdio MCP servers when enabled."""
    if not settings.mcp_enabled:
        return None
    client = MultiServerMCPClient(build_mcp_connections(settings))
    domain_map: dict[str, str] | None = None
    if _remote_mcp_endpoint(settings):
        domain_map = {k: "stylist" for k in ("customer", "appointment", "email", "associate")}
    return McpRuntime(client, domain_servers=domain_map)
