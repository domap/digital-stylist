"""Run the Intent agent standalone: ``python -m digital_stylist.domains.intent``."""

from __future__ import annotations

import json
import sys

from langchain_core.messages import HumanMessage

from digital_stylist.domains.intent.agent import IntentAgent
from digital_stylist.providers.factories import build_agent_run_context


def main() -> None:
    # For file input, provide JSON-serializable messages only; default demo uses LangChain messages.
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = {
            "messages": [HumanMessage(content="I need a summer outfit under $200")],
            "user_profile": {"budget_ceiling": 200},
        }
    ctx = build_agent_run_context()
    print(json.dumps(IntentAgent(ctx).run(state), indent=2, default=str))


if __name__ == "__main__":
    main()
