"""Interactive REPL — configure models via env (see :class:`~digital_stylist.config.StylistSettings`)."""

from __future__ import annotations

import logging
import os
import sys
import uuid

from langchain_core.messages import HumanMessage

from digital_stylist.config import StylistSettings
from digital_stylist.graph import build_graph
from digital_stylist.observability.logging_config import configure_logging
from digital_stylist.providers.factories import build_agent_run_context, is_llm_api_key_resolved

logger = logging.getLogger("digital_stylist.cli")


def main() -> None:
    if not is_llm_api_key_resolved(StylistSettings()):
        raise SystemExit(
            "Set STYLIST_LLM_API_KEY (runtime may also use GOOGLE_API_KEY for the default provider). "
            "See digital_stylist.config.StylistSettings."
        )
    try:
        ctx = build_agent_run_context()
    except ValueError as e:
        raise SystemExit(str(e)) from e
    configure_logging(StylistSettings())
    graph = build_graph(context=ctx)
    thread_id = os.environ.get("STYLIST_THREAD_ID", str(uuid.uuid4()))
    logger.info("repl_session_started", extra={"thread_id": thread_id})
    print(f"Thread id: {thread_id} (export STYLIST_THREAD_ID to resume)", file=sys.stderr)
    cfg = {"configurable": {"thread_id": thread_id}}
    seeded = False
    while True:
        try:
            line = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        if line.lower() in ("quit", "exit", "q"):
            break
        payload: dict = {"messages": [HumanMessage(content=line)]}
        if not seeded:
            payload["context_metadata"] = {
                "occasion": "general",
                "weather_f": 72,
                "location": "NYC",
            }
            seeded = True
        out = graph.invoke(payload, cfg)
        msgs = out.get("messages", [])
        if msgs:
            last = msgs[-1]
            content = getattr(last, "content", str(last))
            print(f"Assistant:\n{content}\n")


if __name__ == "__main__":
    main()
