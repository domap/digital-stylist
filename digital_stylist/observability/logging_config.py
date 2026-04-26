"""JSON or text logging for ``digital_stylist`` loggers (worker, agents, MCP, stylist routes)."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from digital_stylist.config import StylistSettings
from digital_stylist.observability.context import obs_snapshot

_LOG_EXTRA_KEYS = frozenset(
    {
        "request_id",
        "trace_id",
        "thread_id",
        "component",
        "event",
        "agent",
        "duration_ms",
        "path",
        "method",
        "status_code",
        "mcp_domain",
        "mcp_tool",
        "mcp_error",
        "message_len",
        "success",
        "timeout_sec",
        "error_type",
        "host",
        "port",
        "mount_path",
        "environment",
        "docs",
    }
)

_configured: list[bool] = [False]


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)[:8000]
        payload.update(obs_snapshot())
        for key in _LOG_EXTRA_KEYS:
            if hasattr(record, key):
                val = getattr(record, key)
                if val is not None:
                    payload[key] = val
        return json.dumps(payload, default=str)


class _TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        snap = obs_snapshot()
        if not snap:
            return base
        bits = " ".join(f"{k}={snap[k]!s}" for k in sorted(snap))
        return f"{base} [{bits}]"


def configure_logging(settings: StylistSettings) -> None:
    """Attach a single handler to the ``digital_stylist`` logger tree (idempotent)."""
    if _configured[0]:
        return
    _configured[0] = True

    level_name = (settings.log_level or "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    pkg = logging.getLogger("digital_stylist")
    pkg.handlers.clear()
    pkg.setLevel(level)
    pkg.propagate = False

    fmt: logging.Formatter
    if settings.log_format == "json":
        fmt = _JsonFormatter()
    else:
        fmt = _TextFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")

    h = logging.StreamHandler(sys.stderr)
    h.setLevel(level)
    h.setFormatter(fmt)
    pkg.addHandler(h)
