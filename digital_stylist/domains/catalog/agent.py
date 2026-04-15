"""Catalog domain agent — agentic RAG over the configured vector index."""

from __future__ import annotations

from typing import Any

from langchain_core.documents import Document

from digital_stylist.contracts.message_utils import last_human_message_text
from digital_stylist.contracts.state import StylistState
from digital_stylist.domains.catalog.prompts import CATALOG_AGENT
from digital_stylist.domains.catalog.rag import run_agentic_catalog_rag
from digital_stylist.domains.catalog.recommendations import documents_to_recommendations
from digital_stylist.framework.base import FiveBlockAgent, IdentityContext


class CatalogAgent(FiveBlockAgent):
    """Iterative retrieval with LLM reflection; outputs recommendations + trace."""

    agent_key = "catalog"

    def bind(self, state: StylistState) -> IdentityContext:
        return IdentityContext(system=CATALOG_AGENT)

    def perceive(self, state: StylistState, identity: IdentityContext) -> Any:
        stylist_text = state.get("stylist_notes") or last_human_message_text(state)
        profile = state.get("user_profile", {})
        budget = profile.get("budget_ceiling")
        size = None
        sizes = profile.get("sizes") or {}
        if isinstance(sizes, dict):
            size = sizes.get("dress") or sizes.get("tops") or sizes.get("bottoms")
        return {"stylist_text": stylist_text, "budget": budget, "size": size}

    def reason(self, state: StylistState, identity: IdentityContext, perception: Any) -> Any:
        budget = perception.get("budget")
        size = perception.get("size")
        docs, trace = run_agentic_catalog_rag(
            self.llm,
            self.ctx.catalog,
            perception["stylist_text"],
            user_budget=float(budget) if budget is not None else None,
            size=str(size) if size else None,
            max_rounds=self.ctx.settings.catalog_rag_max_rounds,
            system_preamble=identity.system,
        )
        return {"documents": docs, "trace": trace}

    def act(self, state: StylistState, reasoning: Any) -> Any:
        return None

    def synthesize(
        self,
        state: StylistState,
        identity: IdentityContext,
        perception: Any,
        reasoning: Any,
        act_result: Any,
    ) -> dict[str, Any]:
        pack = reasoning if isinstance(reasoning, dict) else {}
        docs: list[Document] = pack.get("documents") or []
        recs = documents_to_recommendations(docs[:10])
        return {
            "recommendations": recs,
            "catalog_matches": recs,
            "catalog_rag_trace": pack.get("trace", ""),
        }
