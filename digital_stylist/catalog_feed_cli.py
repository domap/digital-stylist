"""Console entry for ``digital-stylist-catalog-feed`` (optional ``stylist-catalog-feed`` package)."""

from __future__ import annotations

import logging
import sys

logger = logging.getLogger(__name__)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stderr,
    )
    try:
        from catalog_feed.cli import main as run
    except ImportError:
        logger.error(
            "catalog_feed_package_missing: pip install -e ./catalog_feed (from repo root)",
        )
        return 127
    return run()


if __name__ == "__main__":
    raise SystemExit(main())
