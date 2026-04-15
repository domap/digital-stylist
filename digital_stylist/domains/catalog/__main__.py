"""Run the Catalog agent standalone: ``python -m digital_stylist.domains.catalog``."""

from __future__ import annotations

import json
import sys

from digital_stylist.domains.catalog.agent import CatalogAgent
from digital_stylist.providers.factories import build_agent_run_context


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = {
            "messages": [],
            "stylist_notes": "Light blue linen summer dress for a hot day, budget under 200",
            "user_profile": {"budget_ceiling": 200.0, "sizes": {"dress": "8"}},
        }
    ctx = build_agent_run_context()
    print(json.dumps(CatalogAgent(ctx).run(state), indent=2, default=str))


if __name__ == "__main__":
    main()
