"""Run the Appointment agent standalone: ``python -m digital_stylist.domains.appointment``."""

from __future__ import annotations

import json
import sys

from langchain_core.messages import HumanMessage

from digital_stylist.domains.appointment.agent import AppointmentAgent
from digital_stylist.providers.factories import build_agent_run_context


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = {
            "messages": [HumanMessage(content="Book a fitting next week")],
            "context_metadata": {"store_id": "flagship_nyc"},
        }
    ctx = build_agent_run_context()
    print(json.dumps(AppointmentAgent(ctx).run(state), indent=2, default=str))


if __name__ == "__main__":
    main()
