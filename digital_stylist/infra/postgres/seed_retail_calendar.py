"""Seed 10 stores, 4–8 stylists per store, and 15 days of per-stylist availability (max 6 slots/day).

Requires PostgreSQL with the base ``stylist`` schema applied (:func:`digital_stylist.infra.postgres.bootstrap`).
Uses :class:`~digital_stylist.config.StylistSettings` for the connection (same env as the app).

Run::

    .venv/bin/digital-stylist-seed-retail --dev

(without ``--dev``, set ``STYLIST_PG_*`` in ``.env``.) Or::

    python -m digital_stylist.infra.postgres.seed_retail_calendar --dev
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
from datetime import date, timedelta

import psycopg

from digital_stylist.config import StylistSettings
from digital_stylist.infra.postgres.connection import (
    apply_dev_docker_env_defaults,
    postgres_connect_kwargs,
    uses_postgres_backend,
)

logger = logging.getLogger(__name__)

# Applied before inserts; embedded so packaged wheels include DDL without extra assets.
_RETAIL_CALENDAR_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS stylist.stores (
    tenant_id text NOT NULL,
    store_id text NOT NULL,
    display_name text NOT NULL,
    city text,
    PRIMARY KEY (tenant_id, store_id)
);

CREATE TABLE IF NOT EXISTS stylist.stylist_daily_availability (
    tenant_id text NOT NULL,
    associate_id text NOT NULL,
    cal_date date NOT NULL,
    max_appointments int NOT NULL DEFAULT 6
        CHECK (max_appointments >= 1 AND max_appointments <= 6),
    booked_count int NOT NULL DEFAULT 0
        CHECK (booked_count >= 0 AND booked_count <= max_appointments),
    slot_hours int[] NOT NULL DEFAULT ARRAY[10, 11, 12, 14, 15, 17],
    PRIMARY KEY (tenant_id, associate_id, cal_date),
    FOREIGN KEY (tenant_id, associate_id)
        REFERENCES stylist.associates (tenant_id, associate_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS stylist_daily_availability_date_idx
    ON stylist.stylist_daily_availability (tenant_id, cal_date);

ALTER TABLE stylist.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.stores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stores_tenant_read ON stylist.stores;
CREATE POLICY stores_tenant_read ON stylist.stores
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE stylist.stylist_daily_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.stylist_daily_availability FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stylist_daily_availability_tenant_read ON stylist.stylist_daily_availability;
CREATE POLICY stylist_daily_availability_tenant_read ON stylist.stylist_daily_availability
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id', true));
"""

_TENANT = "default"
_STORE_COUNT = 10
_CALENDAR_DAYS = 15
_MAX_APPOINTMENTS_PER_DAY = 6
_SLOT_HOURS = [10, 11, 12, 14, 15, 17]

_CITIES = [
    "New York",
    "Los Angeles",
    "Chicago",
    "Miami",
    "Seattle",
    "Austin",
    "Boston",
    "Denver",
    "Atlanta",
    "Portland",
]
_FIRST = [
    "Alex",
    "Jordan",
    "Sam",
    "Riley",
    "Casey",
    "Morgan",
    "Quinn",
    "Avery",
    "Taylor",
    "Jamie",
]
_LAST = [
    "Rivera",
    "Chen",
    "Patel",
    "Okonkwo",
    "Nakamura",
    "Silva",
    "Bishop",
    "García",
    "Kim",
    "Murphy",
]
_SKILL_SETS = [
    ["formalwear", "denim"],
    ["bridal", "evening"],
    ["streetwear", "sneakers"],
    ["workwear", "minimal"],
    ["outerwear", "layering"],
    ["petite", "tailoring"],
    ["menswear", "suits"],
    ["sustainable", "basics"],
]


def apply_extension_schema(settings: StylistSettings) -> None:
    kwargs = postgres_connect_kwargs(settings)
    sql = _RETAIL_CALENDAR_SCHEMA_SQL
    with psycopg.connect(**kwargs, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(sql)


def seed_data(settings: StylistSettings, *, seed: int) -> dict[str, object]:
    rng = random.Random(seed)
    tenant = settings.pg_tenant_id.strip() or _TENANT
    today = date.today()
    day_start = today + timedelta(days=1)
    day_dates = [day_start + timedelta(days=d) for d in range(_CALENDAR_DAYS)]

    kwargs = postgres_connect_kwargs(settings)
    stores_out: list[dict[str, str]] = []
    stylists_out: list[dict[str, str]] = []
    availability_rows = 0

    with psycopg.connect(**kwargs, autocommit=False) as conn:
        with conn.cursor() as cur:
            for s in range(1, _STORE_COUNT + 1):
                store_id = f"store_{s:02d}"
                city = _CITIES[s - 1]
                display = f"Stylist Co — {city}"
                cur.execute(
                    """
                    INSERT INTO stylist.stores (tenant_id, store_id, display_name, city)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (tenant_id, store_id) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        city = EXCLUDED.city
                    """,
                    (tenant, store_id, display, city),
                )
                stores_out.append({"store_id": store_id, "display_name": display, "city": city})

                n_stylists = rng.randint(4, 8)
                for i in range(1, n_stylists + 1):
                    aid = f"as_s{s:02d}_{i:02d}"
                    fname = rng.choice(_FIRST)
                    lname = rng.choice(_LAST)
                    name = f"{fname} {lname}"
                    email = f"{aid}@demo.stylist.local"
                    skills = json.dumps(rng.choice(_SKILL_SETS))
                    cur.execute(
                        """
                        INSERT INTO stylist.associates (
                            tenant_id, associate_id, store_id, display_name, email, skills_json, active
                        )
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, true)
                        ON CONFLICT (tenant_id, associate_id) DO UPDATE SET
                            store_id = EXCLUDED.store_id,
                            display_name = EXCLUDED.display_name,
                            email = EXCLUDED.email,
                            skills_json = EXCLUDED.skills_json,
                            active = EXCLUDED.active
                        """,
                        (tenant, aid, store_id, name, email, skills),
                    )
                    stylists_out.append(
                        {"associate_id": aid, "store_id": store_id, "display_name": name}
                    )

                    for cal in day_dates:
                        booked = rng.randint(0, _MAX_APPOINTMENTS_PER_DAY)
                        cur.execute(
                            """
                            INSERT INTO stylist.stylist_daily_availability (
                                tenant_id, associate_id, cal_date,
                                max_appointments, booked_count, slot_hours
                            )
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (tenant_id, associate_id, cal_date) DO UPDATE SET
                                max_appointments = EXCLUDED.max_appointments,
                                booked_count = EXCLUDED.booked_count,
                                slot_hours = EXCLUDED.slot_hours
                            """,
                            (
                                tenant,
                                aid,
                                cal,
                                _MAX_APPOINTMENTS_PER_DAY,
                                booked,
                                _SLOT_HOURS,
                            ),
                        )
                        availability_rows += 1

        conn.commit()

    return {
        "tenant_id": tenant,
        "stores": len(stores_out),
        "stylists": len(stylists_out),
        "availability_rows": availability_rows,
        "calendar_day_range": {
            "first": day_dates[0].isoformat(),
            "last": day_dates[-1].isoformat(),
            "days": _CALENDAR_DAYS,
        },
        "max_appointments_per_day": _MAX_APPOINTMENTS_PER_DAY,
        "sample_stores": stores_out[:3],
        "sample_stylists": stylists_out[:5],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Seed retail stores, stylists, and 15-day availability calendars in Postgres.",
    )
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Do not run retail_calendar_schema.sql (tables already exist).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="RNG seed for reproducible demo data.",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Use docker-compose postgres defaults (127.0.0.1:5433, stylist/stylist); same as pg-bootstrap --dev.",
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
    if not uses_postgres_backend(settings):
        logger.error(
            "postgres_not_configured — set STYLIST_PG_* or STYLIST_PG_DSN, or pass --dev for local "
            "docker-compose defaults (see digital-stylist-pg-bootstrap --dev).",
        )
        return 1

    if not args.skip_schema:
        logger.info("applying_retail_calendar_schema")
        apply_extension_schema(settings)

    logger.info("seeding_demo_data")
    summary = seed_data(settings, seed=args.seed)
    print(json.dumps(summary, indent=2))
    logger.info(
        "seed_complete", extra={"stylists": summary["stylists"], "stores": summary["stores"]}
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
