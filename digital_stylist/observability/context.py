"""Request-scoped correlation for logs (propagates through agents and MCP client on same worker request)."""

from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Any

_stylist_obs: ContextVar[dict[str, Any] | None] = ContextVar("stylist_obs", default=None)


def obs_snapshot() -> dict[str, Any]:
    """Non-empty correlation fields for the active async context."""
    raw = _stylist_obs.get()
    if not raw:
        return {}
    return {k: v for k, v in raw.items() if v is not None and v != ""}


def obs_bind_partial(**kwargs: Any) -> Token:
    """Merge keys into the current observation context; return a token for :func:`obs_reset`."""
    cur = dict(_stylist_obs.get() or {})
    for k, v in kwargs.items():
        if v is not None and v != "":
            cur[k] = v
    return _stylist_obs.set(cur)


def obs_reset(token: Token) -> None:
    _stylist_obs.reset(token)
