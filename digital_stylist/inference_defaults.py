"""When ``STYLIST_CHAT_MODEL`` / ``STYLIST_EMBEDDING_MODEL`` are unset, these provider-specific API identifiers apply."""

from __future__ import annotations

from typing import Literal

ProviderId = Literal["google_genai", "openai"]

# Keys match ``StylistSettings.llm_provider``. Values are API model resource names for that backend.
_FALLBACK_CHAT_MODEL: dict[ProviderId, str | None] = {
    "google_genai": "gemini-2.0-flash",
    "openai": None,
}

_FALLBACK_EMBEDDING_MODEL: dict[ProviderId, str | None] = {
    # Gemini Developer API: use embedContent-supported id (not legacy text-embedding-004).
    "google_genai": "gemini-embedding-001",
    "openai": None,
}
