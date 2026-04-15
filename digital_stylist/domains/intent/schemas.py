"""Intent domain structured outputs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class IntentOutput(BaseModel):
    intent: Literal["PURCHASE", "INQUIRY", "APPOINTMENT", "SUPPORT"]
    urgency: int = Field(ge=1, le=5)
    next_node: Literal["stylist", "appointment", "support", "respond"]
