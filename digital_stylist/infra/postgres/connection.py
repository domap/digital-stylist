"""PostgreSQL connection construction — credentials only from process env (never tool args)."""

from __future__ import annotations

import os
from typing import Any

from digital_stylist.config import StylistSettings


def apply_dev_docker_env_defaults() -> None:
    """Match ``docker-compose.yml`` ``postgres`` service (host port 5433). Uses setdefault only."""
    os.environ.setdefault("STYLIST_PG_HOST", "127.0.0.1")
    os.environ.setdefault("STYLIST_PG_PORT", "5433")
    os.environ.setdefault("STYLIST_PG_DATABASE", "stylist")
    os.environ.setdefault("STYLIST_PG_USER", "stylist")
    os.environ.setdefault("STYLIST_PG_PASSWORD", "stylist")
    os.environ.setdefault("STYLIST_PG_SSLMODE", "disable")
    os.environ.setdefault("STYLIST_PG_DATASTORE", "postgres")


def maybe_apply_development_postgres_env() -> None:
    """Apply :func:`apply_dev_docker_env_defaults` in local dev so the HTTP worker sees Postgres like seed CLIs ``--dev``.

    Skipped when ``STYLIST_ENV`` is staging/production, or when ``STYLIST_PG_DATASTORE=memory``.
    """
    raw = (os.environ.get("STYLIST_ENV") or "development").strip().lower()
    if raw in ("production", "staging", "prod", "stage"):
        return
    if (os.environ.get("STYLIST_PG_DATASTORE") or "").strip().lower() == "memory":
        return
    apply_dev_docker_env_defaults()


def _effective_sslmode(settings: StylistSettings) -> str:
    if settings.pg_sslmode and settings.pg_sslmode.strip():
        return settings.pg_sslmode.strip()
    if settings.environment in ("staging", "production"):
        return "require"
    return "prefer"


def uses_postgres_backend(settings: StylistSettings) -> bool:
    """True when MCP domain servers should use PostgreSQL (not in-memory stubs)."""
    if settings.pg_datastore == "memory":
        return False
    if settings.pg_datastore == "postgres":
        return True
    return bool(settings.pg_dsn) or bool(
        settings.pg_host and settings.pg_database and settings.pg_user
    )


def postgres_connect_kwargs(settings: StylistSettings) -> dict[str, Any]:
    """
    Build kwargs for :func:`psycopg.connect`.

    Zero-trust defaults:

    - TLS toward the server is **required** in staging/production unless
      ``STYLIST_PG_SSLMODE`` overrides.
    - Passwords and DSNs are never read from MCP tool payloads — only
      :class:`~digital_stylist.config.StylistSettings` / environment.
    """
    sslmode = _effective_sslmode(settings)
    if settings.pg_dsn is not None:
        return {
            "conninfo": settings.pg_dsn.get_secret_value(),
            "connect_timeout": settings.pg_connect_timeout,
        }
    pwd = settings.pg_password.get_secret_value() if settings.pg_password else None
    kwargs: dict[str, Any] = {
        "host": settings.pg_host,
        "port": settings.pg_port,
        "dbname": settings.pg_database,
        "user": settings.pg_user,
        "password": pwd,
        "sslmode": sslmode,
        "connect_timeout": settings.pg_connect_timeout,
    }
    if settings.pg_sslrootcert:
        kwargs["sslrootcert"] = settings.pg_sslrootcert
    if settings.pg_sslcert:
        kwargs["sslcert"] = settings.pg_sslcert
    if settings.pg_sslkey:
        kwargs["sslkey"] = settings.pg_sslkey
    return {k: v for k, v in kwargs.items() if v is not None}
