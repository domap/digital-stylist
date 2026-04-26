"""Start local Postgres (Docker Compose) if needed and apply ``schema.sql`` (idempotent).

Run from the repo with the project venv so ``psycopg`` and the CLI exist::

    cd /path/to/digital-stylist
    .venv/bin/pip install -e .
    .venv/bin/digital-stylist-pg-bootstrap --dev

Or: ``.venv/bin/python -m digital_stylist.infra.postgres --dev``

If Compose is missing but the ``docker`` CLI works, the bootstrap falls back to
``docker run`` with the same image and env as ``docker-compose.yml`` (named container
``digital-stylist-postgres``).

If Postgres is already running locally, use ``--no-ensure-docker``.
"""

from __future__ import annotations

import argparse
import logging
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import psycopg

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import (
    apply_dev_docker_env_defaults,
    postgres_connect_kwargs,
    uses_postgres_backend,
)

logger = logging.getLogger(__name__)

_SCHEMA_FILE = Path(__file__).resolve().parent / "schema.sql"


def _find_compose_project_dir() -> Path | None:
    here = Path(__file__).resolve().parent
    for d in [here, *here.parents]:
        compose = d / "docker-compose.yml"
        if not compose.is_file():
            continue
        try:
            text = compose.read_text(encoding="utf-8")
        except OSError:
            continue
        if "postgres:" in text and "services:" in text:
            return d
    return None


def _tcp_open(host: str, port: int, timeout_sec: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout_sec):
            return True
    except OSError:
        return False


def _docker_compose_v2_available() -> bool:
    docker = shutil.which("docker")
    if not docker:
        return False
    try:
        r = subprocess.run(
            [docker, "compose", "version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
        return r.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False


def _docker_compose_v1_usable(exe: str) -> bool:
    """Return False for broken installs (e.g. old Homebrew docker-compose with missing dylib)."""
    try:
        r = subprocess.run(
            [exe, "version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
        return r.returncode == 0
    except OSError:
        return False


_POSTGRES_IMAGE = "postgres:16-alpine"
_CONTAINER_NAME = "digital-stylist-postgres"


def try_compose_prefix() -> list[str] | None:
    if _docker_compose_v2_available():
        return ["docker", "compose"]
    dc = shutil.which("docker-compose")
    if dc and _docker_compose_v1_usable(dc):
        return [dc]
    return None


def _require_docker_daemon(docker: str) -> None:
    """Raise ``RuntimeError`` if the Docker engine is not accepting commands (daemon down)."""
    try:
        r = subprocess.run(
            [docker, "info"],
            check=False,
            capture_output=True,
            text=True,
            timeout=25,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as e:
        raise RuntimeError(f"Could not run `{docker} info`: {e}") from e
    if r.returncode == 0:
        return
    combined = f"{r.stderr or ''}\n{r.stdout or ''}".lower()
    daemon_down = any(
        s in combined
        for s in (
            "cannot connect",
            "docker daemon",
            "is the docker daemon running",
            "connection refused",
            "no such file or directory",
            "error during connect",
        )
    )
    if daemon_down or "pretty printing" in combined:
        raise RuntimeError(
            "Docker daemon is not running or not reachable (e.g. nothing listening on the Docker socket). "
            "Open Docker Desktop and wait until it is fully started, then retry. "
            "If Postgres is already running without Docker: digital-stylist-pg-bootstrap --dev --no-ensure-docker"
        )
    detail = (r.stderr or r.stdout or "").strip().split("\n")[0].strip()
    raise RuntimeError(
        f"{detail or '`docker info` failed'}. "
        "Start Docker Desktop (macOS/Windows) or the Docker service on Linux, then retry. "
        "If Postgres is already running without Docker: digital-stylist-pg-bootstrap --dev --no-ensure-docker"
    )


def _docker_container_state(docker: str, name: str) -> str | None:
    """Return ``running``, ``exited``, or ``None`` if the container does not exist."""
    r = subprocess.run(
        [docker, "inspect", "-f", "{{.State.Status}}", name],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r.returncode != 0:
        return None
    return r.stdout.strip().lower() or None


def start_postgres_via_docker_run(settings: StylistSettings) -> None:
    """
    Start the same Postgres as ``docker-compose.yml`` without Compose (plain ``docker run``).
    Only for local connections (``127.0.0.1`` / ``localhost``).
    """
    docker = shutil.which("docker")
    if not docker:
        raise FileNotFoundError(
            "Neither Docker Compose nor the `docker` CLI is available. "
            "Install Docker Desktop / Docker Engine, or use --no-ensure-docker."
        )
    _require_docker_daemon(docker)
    h = (settings.pg_host or "127.0.0.1").strip().lower()
    if h not in ("127.0.0.1", "localhost"):
        raise RuntimeError(
            f"Docker run fallback needs STYLIST_PG_HOST 127.0.0.1 or localhost; got {settings.pg_host!r}. "
            "Install Docker Compose or point at an existing server with --no-ensure-docker."
        )
    port = int(settings.pg_port)
    user = (settings.pg_user or "stylist").strip()
    db = (settings.pg_database or "stylist").strip()
    pwd = settings.pg_password.get_secret_value() if settings.pg_password else ""

    state = _docker_container_state(docker, _CONTAINER_NAME)
    if state == "running":
        logger.info("postgres_container_already_running", extra={"container": _CONTAINER_NAME})
        return
    if state in ("exited", "created"):
        logger.info("postgres_container_start", extra={"container": _CONTAINER_NAME})
        subprocess.run([docker, "start", _CONTAINER_NAME], check=True)
        return

    logger.info(
        "postgres_container_create",
        extra={"container": _CONTAINER_NAME, "image": _POSTGRES_IMAGE, "host_port": port},
    )
    subprocess.run(
        [
            docker,
            "run",
            "-d",
            "--name",
            _CONTAINER_NAME,
            "-e",
            f"POSTGRES_USER={user}",
            "-e",
            f"POSTGRES_PASSWORD={pwd}",
            "-e",
            f"POSTGRES_DB={db}",
            "-p",
            f"127.0.0.1:{port}:5432",
            _POSTGRES_IMAGE,
        ],
        check=True,
    )


def ensure_postgres_with_docker(compose_dir: Path, settings: StylistSettings) -> None:
    docker_bin = shutil.which("docker")
    if docker_bin:
        _require_docker_daemon(docker_bin)
    compose = try_compose_prefix()
    if compose is not None:
        logger.info("docker_compose_postgres_up", extra={"compose_dir": str(compose_dir)})
        subprocess.run([*compose, "up", "-d", "postgres"], cwd=compose_dir, check=True)
        return
    logger.info("docker_compose_unavailable_trying_docker_run")
    start_postgres_via_docker_run(settings)


def wait_for_postgres(settings: StylistSettings, *, deadline_sec: float = 60.0) -> None:
    kwargs = postgres_connect_kwargs(settings)
    t0 = time.monotonic()
    last_err: str | None = None
    while time.monotonic() - t0 < deadline_sec:
        try:
            conn_kw = {**kwargs, "connect_timeout": 3}
            with psycopg.connect(**conn_kw) as conn:
                conn.execute("SELECT 1")
            logger.info("postgres_ready", extra={"host": settings.pg_host, "port": settings.pg_port})
            return
        except Exception as e:
            last_err = str(e)
            time.sleep(1.0)
    raise RuntimeError(f"Postgres not reachable within {deadline_sec}s: {last_err}")


def apply_schema(settings: StylistSettings) -> None:
    if not _SCHEMA_FILE.is_file():
        raise FileNotFoundError(f"Schema file missing: {_SCHEMA_FILE}")
    sql = _SCHEMA_FILE.read_text(encoding="utf-8")
    kwargs = postgres_connect_kwargs(settings)
    logger.info("applying_schema", extra={"path": str(_SCHEMA_FILE)})
    conn_kw = {
        **kwargs,
        "autocommit": True,
        "connect_timeout": min(30, settings.pg_connect_timeout),
    }
    with (
        psycopg.connect(**conn_kw) as conn,
        conn.cursor() as cur,
    ):
        cur.execute(sql)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Ensure Postgres is up (optional Docker Compose) and apply stylist schema.",
    )
    parser.add_argument(
        "--no-ensure-docker",
        action="store_true",
        help="Do not start Postgres via Compose or docker run; only apply schema.",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Shorthand for defaults matching docker-compose postgres (127.0.0.1:5433, user/db stylist).",
    )
    parser.add_argument(
        "--wait-sec",
        type=float,
        default=90.0,
        help="Max seconds to wait for Postgres after docker up.",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stderr,
    )

    if args.dev:
        apply_dev_docker_env_defaults()

    settings = StylistSettings()
    ensure_docker = not args.no_ensure_docker
    if settings.pg_dsn is not None and (settings.pg_dsn.get_secret_value() or "").strip():
        ensure_docker = False

    if not uses_postgres_backend(settings):
        logger.error(
            "postgres_not_configured",
            extra={"hint": "Set STYLIST_PG_* or use --dev with compose postgres."},
        )
        return 1

    host = (settings.pg_host or "127.0.0.1").strip() or "127.0.0.1"
    port = int(settings.pg_port)

    if ensure_docker:
        compose_dir = _find_compose_project_dir()
        if _tcp_open(host, port):
            logger.info("postgres_port_open_skip_docker", extra={"host": host, "port": port})
        else:
            try:
                if compose_dir is not None:
                    ensure_postgres_with_docker(compose_dir, settings)
                else:
                    logger.warning("compose_yml_not_found_trying_docker_run")
                    start_postgres_via_docker_run(settings)
            except (subprocess.CalledProcessError, FileNotFoundError, RuntimeError) as e:
                logger.error(
                    "docker_postgres_failed: %s",
                    e,
                    extra={"hint": "Install Docker, or run with --no-ensure-docker if Postgres is up."},
                )
                if isinstance(e, subprocess.CalledProcessError):
                    logger.error("docker_exit_code=%s", e.returncode)
                return 1

    try:
        wait_for_postgres(settings, deadline_sec=args.wait_sec)
    except Exception as e:
        logger.exception("postgres_wait_failed", extra={"error": str(e)})
        return 1

    try:
        apply_schema(settings)
    except Exception:
        logger.exception("schema_apply_failed")
        return 1

    try:
        from digital_stylist.infra.postgres.seed_stylist_data import seed_stylist_data

        seed_stylist_data(settings)
    except Exception:
        logger.exception("stylist_seed_failed")
        return 1

    logger.info("schema_apply_ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
