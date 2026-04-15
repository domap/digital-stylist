"""Composable LLM and vector backends.

Import concrete factories from ``digital_stylist.providers.factories`` to avoid import cycles.
"""

from digital_stylist.providers.protocols import VectorCatalog

__all__ = ["VectorCatalog"]
