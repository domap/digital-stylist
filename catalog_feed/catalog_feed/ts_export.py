"""Export ``data/products.ts`` to ``fixtures/products.json`` via npm + esbuild (Node required)."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def _catalog_feed_package_dir() -> Path:
    """Directory containing this Python package (``catalog_feed/catalog_feed``)."""
    return Path(__file__).resolve().parent


def _catalog_feed_project_root() -> Path:
    """Setuptools project root (``catalog_feed/``) with ``package.json`` and ``tsconfig.json``."""
    return _catalog_feed_package_dir().parent


def fixtures_products_json_path() -> Path:
    return _catalog_feed_package_dir() / "fixtures" / "products.json"


def export_products_ts_to_json() -> Path:
    """
    Run ``npm run export-products`` from the catalog_feed project root.

    Writes ``fixtures/products.json`` next to this package. Requires Node/npm and ``npm install``
    in that directory (installs esbuild).
    """
    root = _catalog_feed_project_root()
    if shutil.which("npm") is None:
        raise RuntimeError("npm not found on PATH; install Node.js to export products.ts")

    npm = shutil.which("npm")
    assert npm is not None
    proc = subprocess.run(
        [npm, "run", "export-products"],
        cwd=root,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout or "")
        sys.stderr.write(proc.stderr or "")
        raise RuntimeError("npm run export-products failed (see stderr above)")

    out = fixtures_products_json_path()
    if not out.is_file():
        raise RuntimeError(f"Expected export output missing: {out}")
    return out
