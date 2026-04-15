from __future__ import annotations

import json

from mcp.server.fastmcp import FastMCP

from digital_stylist.config import StylistSettings
from digital_stylist.domains.associate import repository as associate_repository


def _settings() -> StylistSettings:
    return StylistSettings()


def register_associate_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def associate_list_for_store(store_id: str) -> str:
        """Return JSON array of active associates for a store (tenant from STYLIST_PG_TENANT_ID)."""
        try:
            rows = associate_repository.associate_list_for_store(_settings(), store_id)
            return json.dumps({"store_id": store_id, "associates": rows}, default=str)
        except Exception as e:
            return json.dumps({"error": type(e).__name__, "message": str(e)})

    @mcp.tool()
    def associate_get(associate_id: str) -> str:
        """Return JSON for one associate by id."""
        try:
            data = associate_repository.associate_get(_settings(), associate_id)
            return json.dumps(data, default=str)
        except Exception as e:
            return json.dumps({"error": type(e).__name__, "message": str(e)})
