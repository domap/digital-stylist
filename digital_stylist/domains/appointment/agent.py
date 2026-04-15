"""Appointment domain agent — MCP slots/booking + LLM user-facing copy."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from digital_stylist.contracts.state import StylistState
from digital_stylist.domains.appointment.prompts import APPOINTMENT_AGENT
from digital_stylist.framework.base import FiveBlockAgent, IdentityContext


class AppointmentAgent(FiveBlockAgent):
    """Lists slots and creates bookings through appointment MCP when enabled."""

    agent_key = "appointment"

    def bind(self, state: StylistState) -> IdentityContext:
        meta = state.get("context_metadata", {})
        return IdentityContext(
            system=APPOINTMENT_AGENT + f"\nStore context: {json.dumps(meta, default=str)}"
        )

    def perceive(self, state: StylistState, identity: IdentityContext) -> Any:
        meta = dict(state.get("context_metadata") or {})
        store_id = str(meta.get("store_id", "flagship_nyc"))
        customer_user_id = str(meta.get("user_id", "guest"))
        slots: list[str] = []
        booking_id = f"bk_{uuid.uuid4().hex[:12]}"
        if self.ctx.mcp:
            try:
                raw = self.ctx.mcp.invoke(
                    "appointment",
                    "appointment_list_slots",
                    {"store_id": store_id, "days_ahead": 7},
                )
                data = json.loads(raw)
                slots = list(data.get("slots") or [])[:3]
                if slots:
                    booked = self.ctx.mcp.invoke(
                        "appointment",
                        "appointment_create_booking",
                        {
                            "store_id": store_id,
                            "slot": slots[0],
                            "purpose": "styling_consultation",
                            "customer_user_id": customer_user_id,
                        },
                    )
                    binfo = json.loads(booked)
                    booking_id = str(binfo.get("booking_id", booking_id))
                    slots = [str(binfo.get("slot", slots[0]))] + slots[1:3]
            except (json.JSONDecodeError, KeyError, RuntimeError, OSError):
                slots = []
        if not slots:
            t0 = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(days=1)
            slots = [
                (t0 + timedelta(hours=i * 3)).strftime("%Y-%m-%d %H:%M local") for i in range(3)
            ]
        return {
            "messages_tail": list(state.get("messages", []))[-12:],
            "booking_id": booking_id,
            "slots": slots,
            "meta": meta,
            "store_id": store_id,
        }

    def reason(self, state: StylistState, identity: IdentityContext, perception: Any) -> Any:
        sys = SystemMessage(content=identity.system)
        prompt = HumanMessage(
            content=(
                f"booking_id={perception['booking_id']}. Propose these slots to the user: "
                f"{perception['slots']}. Keep the reply short and actionable."
            )
        )
        reply = self.llm.invoke([sys, *perception["messages_tail"], prompt])
        return str(reply.content)

    def synthesize(
        self,
        state: StylistState,
        identity: IdentityContext,
        perception: Any,
        reasoning: Any,
        act_result: Any,
    ) -> dict[str, Any]:
        meta = perception.get("meta") or {}
        return {
            "booking_id": perception["booking_id"],
            "appointment_copy": str(reasoning),
            "context_metadata": {
                **meta,
                "proposed_slots": perception["slots"],
                "store_id": perception.get("store_id"),
            },
        }
