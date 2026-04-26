"""Structured spans for MCP tool handlers (stdio / combined HTTP service process)."""

from __future__ import annotations

import logging
import time
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

_log = logging.getLogger("digital_stylist.mcp.tool")


@contextmanager
def mcp_tool_span(domain: str, tool_name: str) -> Generator[None, None, None]:
    """Log start/end and duration for one MCP tool execution in this process."""
    t0 = time.perf_counter()
    base: dict[str, Any] = {
        "component": "mcp",
        "event": "mcp_tool_start",
        "mcp_domain": domain,
        "mcp_tool": tool_name,
    }
    _log.info("mcp_tool_start", extra=base)
    err: str | None = None
    try:
        yield
    except Exception as e:
        err = type(e).__name__
        _log.exception(
            "mcp_tool_error",
            extra={**base, "event": "mcp_tool_error", "mcp_error": err},
        )
        raise
    finally:
        if err is None:
            _log.info(
                "mcp_tool_end",
                extra={
                    **base,
                    "event": "mcp_tool_end",
                    "duration_ms": int((time.perf_counter() - t0) * 1000),
                    "success": True,
                },
            )
