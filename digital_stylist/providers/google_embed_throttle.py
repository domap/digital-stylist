"""Throttle Gemini document embedding for free-tier RPM limits (embed_query unchanged)."""

from __future__ import annotations

import os
import random
import re
import time

from langchain_core.embeddings import Embeddings


def _parse_retry_after_seconds(msg: str) -> float | None:
    m = re.search(r"retry in ([0-9.]+)\s*s", msg, re.I)
    if m:
        return float(m.group(1))
    return None


def _is_rate_limit(err: BaseException) -> bool:
    s = str(err).lower()
    return "429" in s or "resource_exhausted" in s


class ThrottledGoogleEmbeddings(Embeddings):
    """
    Splits ``embed_documents`` into smaller calls with pauses so free-tier
    ``embed_content`` limits (~100 RPM) are not exceeded. ``embed_query`` is passed
    through without delay.

    Env (optional):

    - ``STYLIST_GOOGLE_EMBED_DOCS_PER_CALL`` — texts per inner ``embed_documents`` (default ``1``)
    - ``STYLIST_GOOGLE_EMBED_PAUSE_SEC`` — sleep between sub-calls (default ``0.65``)
    """

    def __init__(
        self,
        inner: Embeddings,
        *,
        docs_per_subcall: int | None = None,
        pause_sec: float | None = None,
        max_retries: int = 10,
    ) -> None:
        self._inner = inner
        raw_docs = docs_per_subcall
        if raw_docs is None:
            raw_docs = int(os.environ.get("STYLIST_GOOGLE_EMBED_DOCS_PER_CALL", "1"))
        self._docs = max(1, raw_docs)
        if pause_sec is not None:
            self._pause = max(0.0, pause_sec)
        else:
            self._pause = max(0.0, float(os.environ.get("STYLIST_GOOGLE_EMBED_PAUSE_SEC", "0.65")))
        self._max_retries = max_retries

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        out: list[list[float]] = []
        n = len(texts)
        for start in range(0, n, self._docs):
            chunk = texts[start : start + self._docs]
            out.extend(self._embed_chunk_with_retry(chunk))
            if start + self._docs < n and self._pause > 0:
                time.sleep(self._pause)
        return out

    def _embed_chunk_with_retry(self, chunk: list[str]) -> list[list[float]]:
        last: BaseException | None = None
        for attempt in range(self._max_retries):
            try:
                return self._inner.embed_documents(chunk)
            except Exception as e:
                last = e
                if not _is_rate_limit(e):
                    raise
                delay = _parse_retry_after_seconds(str(e))
                if delay is None:
                    delay = min(120.0, (2**attempt) + random.uniform(0, 1.0))
                time.sleep(delay)
        assert last is not None
        raise last

    def embed_query(self, text: str) -> list[float]:
        return self._inner.embed_query(text)
