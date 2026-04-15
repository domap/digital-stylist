"""Customer domain agent — MCP profile fetch + LLM guardrail summary."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from digital_stylist.contracts.state import StylistState
from digital_stylist.domains.customer.prompts import CUSTOMER_AGENT
from digital_stylist.framework.base import FiveBlockAgent, IdentityContext


class CustomerAgent(FiveBlockAgent):
    """Fetches profile via customer MCP (when configured), merges session overrides, summarizes guardrails."""

    agent_key = "customer"

    def bind(self, state: StylistState) -> IdentityContext:
        return IdentityContext(
            system=CUSTOMER_AGENT
            + "\nSummarize guardrails in one short bullet list for downstream agents. "
            'Output JSON only: {"profile_summary": string, "guardrails": [string]}'
        )

    def perceive(self, state: StylistState, identity: IdentityContext) -> Any:
        meta = state.get("context_metadata") or {}
        uid = str(meta.get("user_id", "guest"))
        defaults: dict[str, Any] = {
            "user_id": uid,
            "sizes": {"tops": "M", "bottoms": "32", "dress": "8"},
            "budget_ceiling": 200.0,
            "preferred_brands": [],
            "style_feedback": [],
            "hard_rules": ["Never over budget_ceiling for full outfits unless user opts in."],
        }
        remote: dict[str, Any] = {}
        mcp_ok = False
        if self.ctx.mcp:
            try:
                raw = self.ctx.mcp.invoke("customer", "customer_get_profile", {"user_id": uid})
                mcp_ok = True
                if raw.strip().startswith("{"):
                    remote = json.loads(raw)
            except (json.JSONDecodeError, KeyError, RuntimeError, OSError):
                remote = {}
        session_patch = dict(state.get("user_profile") or {})
        merged = {**defaults, **{k: v for k, v in remote.items() if v is not None}, **session_patch}
        return {"user_id": uid, "profile": merged, "mcp_used": mcp_ok}

    def reason(self, state: StylistState, identity: IdentityContext, perception: Any) -> Any:
        sys = SystemMessage(content=identity.system)
        human = HumanMessage(
            content=f"User profile payload: {json.dumps(perception['profile'], default=str)}"
        )
        out = self.llm.invoke([sys, human])
        raw = str(out.content).strip()
        try:
            return json.loads(raw) if raw.startswith("{") else {}
        except json.JSONDecodeError:
            return {}

    def synthesize(
        self,
        state: StylistState,
        identity: IdentityContext,
        perception: Any,
        reasoning: Any,
        act_result: Any,
    ) -> dict[str, Any]:
        blob = reasoning if isinstance(reasoning, dict) else {}
        merged = dict(perception["profile"])
        merged["agent_summary"] = blob.get(
            "profile_summary", "Standard sizing and budget rules apply."
        )
        merged["guardrails"] = blob.get("guardrails", merged.get("hard_rules", []))
        out: dict[str, Any] = {"user_profile": merged}
        if perception.get("mcp_used") is True:
            out["mcp_customer_snapshot"] = {
                "user_id": perception.get("user_id"),
                "source": "mcp:customer",
            }
        return out
