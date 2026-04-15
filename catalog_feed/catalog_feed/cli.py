"""CLI for the catalog vector feed — ``digital-stylist-catalog-feed``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from catalog_feed.pipeline import run_catalog_feed
from catalog_feed.sources.json_source import load_products_from_json_path
from catalog_feed.ts_export import export_products_ts_to_json, fixtures_products_json_path
from digital_stylist.config import StylistSettings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Index product catalog datasets into ChromaDB (attributes, inventory, images).",
    )
    parser.add_argument(
        "--format",
        choices=("json",),
        default="json",
        help="Dataset loader (more formats can be added as separate modules).",
    )
    parser.add_argument(
        "--path",
        type=Path,
        default=None,
        help="Path to catalog JSON (array or {products: [...]}).",
    )
    parser.add_argument(
        "--from-ts",
        action="store_true",
        help="Export catalog_feed/data/products.ts (+ assets) to fixtures/products.json then index.",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append without clearing the collection (default is full replace).",
    )
    args = parser.parse_args(argv)

    if args.from_ts and args.path is not None:
        parser.error("Use either --from-ts or --path, not both")

    json_path: Path
    if args.from_ts:
        try:
            json_path = export_products_ts_to_json()
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            return 1
    elif args.path is not None:
        json_path = args.path
    else:
        default = fixtures_products_json_path()
        if default.is_file():
            json_path = default
        else:
            parser.error(
                f"Missing {default}; pass --path to a JSON file or --from-ts to export from "
                "data/products.ts (requires npm install in catalog_feed/)."
            )

    if args.format == "json":
        products = load_products_from_json_path(json_path)
    else:
        parser.error("Unsupported format")

    try:
        result = run_catalog_feed(products, StylistSettings(), replace_collection=not args.append)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 1

    print(
        f"Indexed {result.documents_indexed} documents "
        f"(removed {result.documents_removed} prior). "
        f"Collection={result.collection_name} dir={result.persist_directory}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
