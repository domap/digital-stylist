"""Run the Support agent standalone: ``python -m digital_stylist.domains.support``."""

from __future__ import annotations

import json
import sys

from langchain_core.messages import HumanMessage

from digital_stylist.domains.support.agent import SupportAgent
from digital_stylist.providers.factories import build_agent_run_context


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = {"messages": [HumanMessage(content="What is your return policy?")]}
    ctx = build_agent_run_context()
    print(json.dumps(SupportAgent(ctx).run(state), indent=2, default=str))


if __name__ == "__main__":
    main()
