"""Entry point for the standalone MCP HTTP service."""

from __future__ import annotations

import logging
import os
import sys

from digital_stylist.infra.postgres.connection import maybe_apply_development_postgres_env
from digital_stylist.mcp_servers.build_mcp import build_combined_mcp

logger = logging.getLogger("digital_stylist.mcp_servers")


def main() -> None:
    maybe_apply_development_postgres_env()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stderr,
    )
    host = os.environ.get("STYLIST_MCP_SERVICE_HOST", "127.0.0.1")
    port = int(os.environ.get("STYLIST_MCP_SERVICE_PORT", "8800"))
    path = os.environ.get("STYLIST_MCP_SERVICE_MOUNT_PATH", "/")
    mcp = build_combined_mcp(host=host, port=port, mount_path=path)
    logger.info(
        "mcp_service_starting",
        extra={"host": host, "port": port, "mount_path": path, "streamable_path": "/mcp"},
    )
    mcp.run(transport="streamable-http")
