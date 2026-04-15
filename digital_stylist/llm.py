"""LLM factory — prefer :func:`digital_stylist.providers.factories.build_chat_model` for composition."""

from __future__ import annotations

from digital_stylist.providers.factories import build_chat_model, build_default_settings


def get_chat_model():
    """Chat model from environment-backed settings (``STYLIST_LLM_PROVIDER``, keys, model ids)."""
    return build_chat_model(build_default_settings())
