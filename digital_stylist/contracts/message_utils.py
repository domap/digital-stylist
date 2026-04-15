"""Neutral helpers for reading the workflow message list (wire format only)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from langchain_core.messages import HumanMessage


def last_human_message_text(state: Mapping[str, Any]) -> str:
    for m in reversed(state.get("messages") or []):
        if isinstance(m, HumanMessage):
            return str(m.content)
    return ""
