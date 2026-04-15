"""Catalog domain — agentic RAG loop (retrieve → reflect → refine)."""

from __future__ import annotations

import hashlib
import logging

from langchain_core.documents import Document
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from digital_stylist.providers.protocols import VectorCatalog

logger = logging.getLogger(__name__)


class RetrievalReflection(BaseModel):
    """LLM judgment after each retrieval round."""

    is_sufficient: bool = Field(
        description="True if current docs satisfy inventory + size/budget fit"
    )
    rationale: str = ""
    next_search_query: str | None = Field(
        default=None,
        description="If not sufficient, a tighter or alternate catalog search string",
    )


def _dedupe_docs(docs: list[Document]) -> list[Document]:
    seen: set[str] = set()
    out: list[Document] = []
    for d in docs:
        key = hashlib.sha256((d.page_content or "").encode()).hexdigest()[:16]
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out


def run_agentic_catalog_rag(
    llm: BaseChatModel,
    catalog: VectorCatalog,
    stylist_notes: str,
    *,
    user_budget: float | None,
    size: str | None,
    k_per_round: int = 5,
    max_rounds: int = 3,
    system_preamble: str = "",
) -> tuple[list[Document], str]:
    structured = llm.with_structured_output(RetrievalReflection)
    trace: list[str] = []
    all_docs: list[Document] = []

    initial = llm.invoke(
        [
            SystemMessage(
                content=system_preamble
                + "\nProduce ONE short catalog search query (max 30 words) from the stylist text."
            ),
            HumanMessage(content=stylist_notes[:8000]),
        ]
    )
    query = str(getattr(initial, "content", initial)).strip().split("\n")[0][:500]
    trace.append(f"Round 0 plan: {query}")

    for r in range(max_rounds):
        try:
            batch = catalog.similarity_search_filtered(
                query,
                k=k_per_round,
                user_budget=user_budget,
                size=size,
            )
        except Exception:
            logger.exception(
                "catalog_rag_search_failed", extra={"round": r, "query_preview": query[:80]}
            )
            trace.append(f"Round {r} search error (see logs)")
            batch = []
        all_docs.extend(batch)
        trace.append(f"Round {r} hits: {len(batch)}")

        ctx = "\n\n".join(
            f"[{i + 1}] {d.page_content[:400]} | meta={d.metadata}" for i, d in enumerate(batch[:5])
        )
        try:
            refl: RetrievalReflection = structured.invoke(
                [
                    SystemMessage(
                        content=(
                            "You are a catalog retrieval critic. Given stylist goals and retrieved rows, "
                            "decide if we have enough in-stock matches respecting budget/size filters in metadata. "
                            "If not, propose ONE improved search query."
                        )
                    ),
                    HumanMessage(
                        content=f"Stylist brief:\n{stylist_notes[:4000]}\n\nRetrieved:\n{ctx or '(none)'}"
                    ),
                ]
            )
        except Exception as e:
            logger.exception("catalog_rag_reflection_failed", extra={"round": r})
            trace.append(f"Reflection r{r} failed ({e}); stopping.")
            break
        trace.append(f"Reflection r{r}: sufficient={refl.is_sufficient} — {refl.rationale}")
        if refl.is_sufficient or r == max_rounds - 1:
            break
        query = (refl.next_search_query or query).strip()[:500]
        trace.append(f"Round {r + 1} refined query: {query}")

    return _dedupe_docs(all_docs), "\n".join(trace)
