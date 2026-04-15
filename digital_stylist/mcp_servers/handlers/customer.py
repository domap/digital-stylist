from __future__ import annotations

import json

from mcp.server.fastmcp import FastMCP

from digital_stylist.config import StylistSettings
from digital_stylist.domains.customer import repository as customer_repository


def _settings() -> StylistSettings:
    return StylistSettings()


def register_customer_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def customer_get_profile(user_id: str) -> str:
        """Return JSON profile for user_id (sizes, budget_ceiling, brands, feedback, rules)."""
        try:
            data = customer_repository.customer_get_profile(_settings(), user_id)
            return json.dumps(data, default=str)
        except Exception as e:
            return json.dumps({"error": type(e).__name__, "message": str(e)})

    @mcp.tool()
    def customer_merge_profile(user_id: str, patch_json: str) -> str:
        """Merge a JSON object into the stored profile for user_id; returns updated profile JSON."""
        try:
            patch = json.loads(patch_json)
            merged = customer_repository.customer_merge_profile(_settings(), user_id, patch)
            return json.dumps(merged, default=str)
        except Exception as e:
            return json.dumps({"error": type(e).__name__, "message": str(e)})

    @mcp.tool()
    def customer_append_feedback(user_id: str, note: str) -> str:
        """Append a style feedback note to the user's profile."""
        try:
            rec = customer_repository.customer_append_feedback(_settings(), user_id, note)
            return json.dumps(rec, default=str)
        except Exception as e:
            return json.dumps({"error": type(e).__name__, "message": str(e)})
