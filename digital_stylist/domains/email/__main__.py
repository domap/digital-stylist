"""Run the Email agent standalone: ``python -m digital_stylist.domains.email``."""

from __future__ import annotations

import json
import sys

from digital_stylist.domains.email.agent import EmailAgent
from digital_stylist.providers.factories import build_agent_run_context


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = {
            "current_intent": "INQUIRY",
            "stylist_notes": "Linen blazer + dress",
            "catalog_matches": [{"sku": "X1", "name": "Blazer", "image_url": ""}],
            "user_profile": {},
        }
    ctx = build_agent_run_context()
    print(json.dumps(EmailAgent(ctx).run(state), indent=2, default=str))


if __name__ == "__main__":
    main()
