"""Run the Stylist agent standalone: ``python -m digital_stylist.domains.stylist``."""

from __future__ import annotations

import json
import sys

from langchain_core.messages import HumanMessage

from digital_stylist.domains.stylist.agent import StylistAgent
from digital_stylist.providers.factories import build_agent_run_context


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = {
            "messages": [HumanMessage(content="Wedding guest outfit, warm weather")],
            "user_profile": {"sizes": {"dress": "8"}, "budget_ceiling": 250},
            "context_metadata": {"occasion": "wedding", "weather_f": 82},
        }
    ctx = build_agent_run_context()
    print(json.dumps(StylistAgent(ctx).run(state), indent=2, default=str))


if __name__ == "__main__":
    main()
