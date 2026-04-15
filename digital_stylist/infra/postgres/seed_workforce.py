"""Seed 10 retail stores (brand, address, hours), 100 associates, and separate stylists with calendars.

* **Stores** — ``brand_id``, full address, ``opens_at`` / ``closes_at``.
* **Associates** (100) — assigned to stores; most are *not* stylists; include ``email`` + ``phone``.
* **Stylists** — separate table ``stylist.stylists`` (not every associate is a stylist); ``email`` + ``phone``.
* **Calendar** — ``stylist.stylist_day_capacity`` (15 days, max 6 slots/day) keyed by ``stylist_id``.

Requires Postgres + base ``stylist`` schema. Applies extension DDL then inserts.

Run::

    .venv/bin/digital-stylist-seed-workforce --dev

(without ``--dev``, set ``STYLIST_PG_*`` in ``.env``.) Or::

    python -m digital_stylist.infra.postgres.seed_workforce --dev
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import re
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

_WORKFORCE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS stylist.stores (
    tenant_id text NOT NULL,
    store_id text NOT NULL,
    display_name text NOT NULL,
    city text,
    PRIMARY KEY (tenant_id, store_id)
);

ALTER TABLE stylist.stores ADD COLUMN IF NOT EXISTS brand_id text;
ALTER TABLE stylist.stores ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE stylist.stores ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE stylist.stores ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE stylist.stores ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE stylist.stores ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'US';
ALTER TABLE stylist.stores ADD COLUMN IF NOT EXISTS opens_at time without time zone;
ALTER TABLE stylist.stores ADD COLUMN IF NOT EXISTS closes_at time without time zone;

ALTER TABLE stylist.associates ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS stylist.stylists (
    tenant_id text NOT NULL,
    stylist_id text NOT NULL,
    store_id text NOT NULL,
    display_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, stylist_id),
    FOREIGN KEY (tenant_id, store_id) REFERENCES stylist.stores (tenant_id, store_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS stylists_store_idx ON stylist.stylists (tenant_id, store_id) WHERE active;

CREATE TABLE IF NOT EXISTS stylist.stylist_day_capacity (
    tenant_id text NOT NULL,
    stylist_id text NOT NULL,
    cal_date date NOT NULL,
    max_appointments int NOT NULL DEFAULT 6
        CHECK (max_appointments >= 1 AND max_appointments <= 6),
    booked_count int NOT NULL DEFAULT 0
        CHECK (booked_count >= 0 AND booked_count <= max_appointments),
    slot_hours int[] NOT NULL DEFAULT ARRAY[10, 11, 12, 14, 15, 17],
    PRIMARY KEY (tenant_id, stylist_id, cal_date),
    FOREIGN KEY (tenant_id, stylist_id)
        REFERENCES stylist.stylists (tenant_id, stylist_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS stylist_day_capacity_date_idx
    ON stylist.stylist_day_capacity (tenant_id, cal_date);

ALTER TABLE stylist.stylists ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.stylists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stylists_tenant_read ON stylist.stylists;
CREATE POLICY stylists_tenant_read ON stylist.stylists
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE stylist.stylist_day_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.stylist_day_capacity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stylist_day_capacity_tenant_read ON stylist.stylist_day_capacity;
CREATE POLICY stylist_day_capacity_tenant_read ON stylist.stylist_day_capacity
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE stylist.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist.stores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stores_tenant_read ON stylist.stores;
CREATE POLICY stores_tenant_read ON stylist.stores
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id', true));
"""

_TENANT = "default"
_STORE_COUNT = 10
_ASSOCIATE_COUNT = 100
_STYLISTS_TOTAL = 35
_CALENDAR_DAYS = 15
_MAX_APPOINTMENTS_PER_DAY = 6
_SLOT_HOURS = [10, 11, 12, 14, 15, 17]

_BRANDS = [
    ("brand_atelier", "Atelier Collective"),
    ("brand_urban_edge", "Urban Edge"),
    ("brand_luxe_line", "Luxe Line"),
    ("brand_studio_m", "Studio M"),
    ("brand_thread_co", "Thread & Co"),
]
_STREETS = [
    "400 Madison Ave",
    "1 Rodeo Dr",
    "200 N Michigan Ave",
    "701 Lincoln Rd",
    "600 Pine St",
    "301 Congress Ave",
    "88 Newbury St",
    "1500 17th St",
    "350 Peachtree St",
    "900 SW 5th Ave",
]
_CITIES_FULL = [
    ("New York", "NY", "10017"),
    ("Los Angeles", "CA", "90210"),
    ("Chicago", "IL", "60601"),
    ("Miami", "FL", "33139"),
    ("Seattle", "WA", "98101"),
    ("Austin", "TX", "78701"),
    ("Boston", "MA", "02116"),
    ("Denver", "CO", "80202"),
    ("Atlanta", "GA", "30309"),
    ("Portland", "OR", "97205"),
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
    "Drew",
    "Reese",
    "Skyler",
    "Blake",
    "Cameron",
]
_LAST = [
    "Rivera",
    "Chen",
    "Patel",
    "Okonkwo",
    "Nakamura",
    "Silva",
    "Bishop",
    "Garcia",
    "Kim",
    "Murphy",
    "Nguyen",
    "Hughes",
    "Bennett",
    "Price",
    "Foster",
]
_SKILL_SETS = [
    ["formalwear", "denim"],
    ["bridal", "evening"],
    ["streetwear", "sneakers"],
    ["workwear", "minimal"],
    ["outerwear", "layering"],
]


def _demo_phone(rng: random.Random, prefix: str, idx: int) -> str:
    mid = 200 + (idx % 700)
    last = 1000 + (idx * 17) % 9000
    return f"+1-555-{mid:03d}-{last:04d}"


def _demo_email(local: str) -> str:
    safe = re.sub(r"[^a-z0-9._-]", "", local.lower())
    return f"{safe}@workforce.demo.stylist.local"


def apply_workforce_schema(settings: StylistSettings) -> None:
    kwargs = postgres_connect_kwargs(settings)
    with psycopg.connect(**kwargs, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(_WORKFORCE_SCHEMA_SQL)


def seed_data(settings: StylistSettings, *, seed: int) -> dict[str, object]:
    rng = random.Random(seed)
    tenant = settings.pg_tenant_id.strip() or _TENANT
    today = date.today()
    day_start = today + timedelta(days=1)
    day_dates = [day_start + timedelta(days=d) for d in range(_CALENDAR_DAYS)]

    kwargs = postgres_connect_kwargs(settings)
    store_ids: list[str] = []
    stylist_ids: list[str] = []
    availability_rows = 0

    with psycopg.connect(**kwargs, autocommit=False) as conn:
        with conn.cursor() as cur:
            for s in range(1, _STORE_COUNT + 1):
                store_id = f"store_{s:02d}"
                store_ids.append(store_id)
                city, region, postal = _CITIES_FULL[s - 1]
                brand_id, brand_label = _BRANDS[(s - 1) % len(_BRANDS)]
                display = f"{brand_label} — {city}"
                line1 = _STREETS[s - 1]
                opens = rng.choice(
                    [
                        "09:00:00",
                        "09:30:00",
                        "10:00:00",
                    ]
                )
                closes = rng.choice(
                    [
                        "20:00:00",
                        "21:00:00",
                        "21:30:00",
                    ]
                )
                cur.execute(
                    """
                    INSERT INTO stylist.stores (
                        tenant_id, store_id, display_name, city,
                        brand_id, address_line1, address_line2, region, postal_code, country,
                        opens_at, closes_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::time, %s::time)
                    ON CONFLICT (tenant_id, store_id) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        city = EXCLUDED.city,
                        brand_id = EXCLUDED.brand_id,
                        address_line1 = EXCLUDED.address_line1,
                        address_line2 = EXCLUDED.address_line2,
                        region = EXCLUDED.region,
                        postal_code = EXCLUDED.postal_code,
                        country = EXCLUDED.country,
                        opens_at = EXCLUDED.opens_at,
                        closes_at = EXCLUDED.closes_at
                    """,
                    (
                        tenant,
                        store_id,
                        display,
                        city,
                        brand_id,
                        line1,
                        f"Suite {100 + s}",
                        region,
                        postal,
                        "US",
                        opens,
                        closes,
                    ),
                )

            for a in range(1, _ASSOCIATE_COUNT + 1):
                aid = f"assoc_{a:03d}"
                sid = store_ids[(a - 1) % _STORE_COUNT]
                fname = rng.choice(_FIRST)
                lname = rng.choice(_LAST)
                name = f"{fname} {lname}"
                email = _demo_email(f"assoc{a}")
                phone = _demo_phone(rng, "a", a)
                skills = json.dumps(
                    ["operations", "floor"] if rng.random() < 0.6 else ["inventory", "cx"]
                )
                cur.execute(
                    """
                    INSERT INTO stylist.associates (
                        tenant_id, associate_id, store_id, display_name, email, phone, skills_json, active
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, true)
                    ON CONFLICT (tenant_id, associate_id) DO UPDATE SET
                        store_id = EXCLUDED.store_id,
                        display_name = EXCLUDED.display_name,
                        email = EXCLUDED.email,
                        phone = EXCLUDED.phone,
                        skills_json = EXCLUDED.skills_json,
                        active = EXCLUDED.active
                    """,
                    (tenant, aid, sid, name, email, phone, skills),
                )

            rem = _STYLISTS_TOTAL % _STORE_COUNT
            stylist_counts = [
                (_STYLISTS_TOTAL // _STORE_COUNT) + (1 if i < rem else 0)
                for i in range(_STORE_COUNT)
            ]
            stylist_counter = 0
            for store_idx, store_id in enumerate(store_ids):
                for _ in range(stylist_counts[store_idx]):
                    stylist_counter += 1
                    stid = f"stylist_{stylist_counter:03d}"
                    stylist_ids.append(stid)
                    fname = rng.choice(_FIRST)
                    lname = rng.choice(_LAST)
                    name = f"{fname} {lname}"
                    email = _demo_email(f"stylist{stylist_counter}")
                    phone = _demo_phone(rng, "s", stylist_counter + 500)
                    skills = json.dumps(rng.choice(_SKILL_SETS))
                    cur.execute(
                        """
                        INSERT INTO stylist.stylists (
                            tenant_id, stylist_id, store_id, display_name, email, phone, skills_json, active
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, true)
                        ON CONFLICT (tenant_id, stylist_id) DO UPDATE SET
                            store_id = EXCLUDED.store_id,
                            display_name = EXCLUDED.display_name,
                            email = EXCLUDED.email,
                            phone = EXCLUDED.phone,
                            skills_json = EXCLUDED.skills_json,
                            active = EXCLUDED.active
                        """,
                        (tenant, stid, store_id, name, email, phone, skills),
                    )
                    for cal in day_dates:
                        booked = rng.randint(0, _MAX_APPOINTMENTS_PER_DAY)
                        cur.execute(
                            """
                            INSERT INTO stylist.stylist_day_capacity (
                                tenant_id, stylist_id, cal_date,
                                max_appointments, booked_count, slot_hours
                            )
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (tenant_id, stylist_id, cal_date) DO UPDATE SET
                                max_appointments = EXCLUDED.max_appointments,
                                booked_count = EXCLUDED.booked_count,
                                slot_hours = EXCLUDED.slot_hours
                            """,
                            (
                                tenant,
                                stid,
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
        "stores": _STORE_COUNT,
        "associates": _ASSOCIATE_COUNT,
        "stylists": len(stylist_ids),
        "stylist_ids_sample": stylist_ids[:5],
        "associate_ids_sample": [f"assoc_{i:03d}" for i in (1, 2, 50, 100)],
        "availability_rows": availability_rows,
        "calendar": {
            "first_day": day_dates[0].isoformat(),
            "last_day": day_dates[-1].isoformat(),
            "days": _CALENDAR_DAYS,
        },
        "note": "Associates and stylists are separate rows; stylists are not a subset of associate_id.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Seed stores (brand, address, hours), 100 associates, stylists, and day capacity.",
    )
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Skip DDL (extensions already applied).",
    )
    parser.add_argument("--seed", type=int, default=42, help="RNG seed.")
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
        logger.info("applying_workforce_schema")
        apply_workforce_schema(settings)

    logger.info("seeding_workforce")
    summary = seed_data(settings, seed=args.seed)
    print(json.dumps(summary, indent=2))
    logger.info("seed_workforce_done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
