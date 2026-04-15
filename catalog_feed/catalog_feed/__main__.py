"""Allow ``python -m catalog_feed``."""

from catalog_feed.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
