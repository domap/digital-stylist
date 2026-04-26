from __future__ import annotations

import json
import uuid

from mcp.server.fastmcp import FastMCP

from digital_stylist.mcp_servers.observability import mcp_tool_span

_QUEUE: dict[str, dict[str, str]] = {}


def register_email_tools(mcp: FastMCP) -> None:
    @mcp.tool()
    def email_queue_lookbook(payload_json: str, template_id: str = "lookbook_v1") -> str:
        """Queue a lookbook or transactional email; returns JSON with queue_id."""
        with mcp_tool_span("email", "email_queue_lookbook"):
            qid = f"em_{uuid.uuid4().hex[:10]}"
            _QUEUE[qid] = {"template_id": template_id, "payload": payload_json}
            return json.dumps({"queue_id": qid, "status": "queued", "template_id": template_id})

    @mcp.tool()
    def email_queue_status(queue_id: str) -> str:
        """Return queue entry JSON or empty object."""
        with mcp_tool_span("email", "email_queue_status"):
            return json.dumps(_QUEUE.get(queue_id, {}))
