"""Entry point for the standalone MCP HTTP service."""

from __future__ import annotations

import logging
import os

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import maybe_apply_development_postgres_env
from digital_stylist.mcp_servers.build_mcp import build_combined_mcp
from digital_stylist.observability.logging_config import configure_logging

logger = logging.getLogger("digital_stylist.mcp_servers")


def main() -> None:
    maybe_apply_development_postgres_env()
    configure_logging(StylistSettings())
    host = os.environ.get("STYLIST_MCP_SERVICE_HOST", "127.0.0.1")
    port = int(os.environ.get("STYLIST_MCP_SERVICE_PORT", "8800"))
    path = os.environ.get("STYLIST_MCP_SERVICE_MOUNT_PATH", "/")
    mcp = build_combined_mcp(host=host, port=port, mount_path=path)
    logger.info(
        "mcp_service_starting",
        extra={
            "component": "mcp_service",
            "event": "mcp_service_starting",
            "host": host,
            "port": port,
            "mount_path": path,
            "streamable_path": "/mcp",
        },
    )
    mcp.run(transport="streamable-http")
