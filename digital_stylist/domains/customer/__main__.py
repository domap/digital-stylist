"""Run the Customer agent standalone: ``python -m digital_stylist.domains.customer``."""

from __future__ import annotations

import json
import sys

from digital_stylist.domains.customer.agent import CustomerAgent
from digital_stylist.providers.factories import build_agent_run_context


def _demo_state() -> dict:
    return {"messages": [], "context_metadata": {"user_id": "guest"}, "user_profile": {}}


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = _demo_state()
    ctx = build_agent_run_context()
    print(json.dumps(CustomerAgent(ctx).run(state), indent=2, default=str))


if __name__ == "__main__":
    main()
