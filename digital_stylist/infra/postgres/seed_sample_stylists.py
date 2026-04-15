"""Insert validation sample rows into ``stylist.stylists`` (+ ``stylist_day_capacity``).

Names are chosen so **first** and **last** are not drawn from the customer seed pools
(:mod:`digital_stylist.infra.postgres.seed_customers`). Emails are
``firstname.lastname@ann.com`` (letters only in the local part). Phones are random
North-American style ``+1-AAA-BBB-CCCC``.

Requires at least one row in ``stylist.stores`` (run ``digital-stylist-seed-workforce --dev``
or retail seed first). Applies workforce extension DDL when ``--skip-schema`` is not set.

Run::

    .venv/bin/digital-stylist-seed-sample-stylists --dev

Or::

    python -m digital_stylist.infra.postgres.seed_sample_stylists --dev
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
from digital_stylist.infra.postgres.seed_customers import _FIRST_NAMES as _CUSTOMER_FIRST
from digital_stylist.infra.postgres.seed_customers import _LAST_NAMES as _CUSTOMER_LAST
from digital_stylist.infra.postgres.seed_workforce import apply_workforce_schema

logger = logging.getLogger(__name__)

_TENANT = "default"
_DEFAULT_COUNT = 15
_CALENDAR_DAYS = 15
_MAX_APPOINTMENTS_PER_DAY = 6
_SLOT_HOURS = [10, 11, 12, 14, 15, 17]

# Curated pools; any name that appears in customer seed lists is dropped at import time.
_STYLIST_FIRST_BANK = [
    "Marcus",
    "Elena",
    "Keiko",
    "Bruno",
    "Lucien",
    "Ingrid",
    "Omar",
    "Zara",
    "Helena",
    "Sergei",
    "Anika",
    "Tomás",
    "Bjorn",
    "Carmen",
    "Dmitri",
    "Finn",
    "Greta",
    "Henrik",
    "Javier",
    "Katya",
    "Lars",
    "Mara",
    "Niko",
    "Orla",
    "Petra",
    "Roland",
    "Soren",
    "Tilde",
    "Uma",
    "Viktor",
    "Willa",
    "Aurelia",
    "Cedric",
    "Ewan",
    "Fabian",
    "Hugo",
    "Ines",
    "Jochen",
    "Kira",
    "Mateo",
    "Nadia",
    "Paolo",
    "Rowan",
    "Stefano",
    "Tessa",
    "Yvonne",
    "Cillian",
    "Daphne",
    "Elodie",
    "Felix",
    "Gwen",
    "Ivo",
    "Jana",
    "Leif",
    "Mireille",
]
_STYLIST_LAST_BANK = [
    "Sullivan",
    "Walsh",
    "Olsen",
    "Bergmann",
    "Thakkar",
    "Vance",
    "Ibarra",
    "Fontaine",
    "Kaur",
    "Lindstrom",
    "Moreau",
    "Novak",
    "Okada",
    "Pritchard",
    "Renard",
    "Szabo",
    "Torp",
    "Valdez",
    "Weisz",
    "Yilmaz",
    "Zimmermann",
    "Archer",
    "Boyd",
    "Clarke",
    "Dawson",
    "Ellison",
    "Finch",
    "Goddard",
    "Hawke",
    "Ingram",
    "Jarvis",
    "Kline",
    "Lombard",
    "Mercer",
    "Norwood",
    "Ortega",
    "Pembroke",
    "Quincy",
    "Redmond",
    "Stirling",
    "Tavares",
    "Underwood",
    "Vaughn",
    "Whitaker",
    "Yates",
    "Ziegler",
]

_CUST_FIRST_F = frozenset(_CUSTOMER_FIRST)
_CUST_LAST_F = frozenset(_CUSTOMER_LAST)
_STYLIST_FIRST = [n for n in _STYLIST_FIRST_BANK if n not in _CUST_FIRST_F]
_STYLIST_LAST = [n for n in _STYLIST_LAST_BANK if n not in _CUST_LAST_F]

_SKILL_SETS = [
    ["formalwear", "denim", "tailoring"],
    ["bridal", "evening", "alterations"],
    ["streetwear", "sneakers", "menswear"],
    ["workwear", "minimal", "capsule"],
    ["outerwear", "layering", "travel"],
    ["color_analysis", "personal_shopping"],
]


def _ann_email(first: str, last: str) -> str:
    first_slug = re.sub(r"[^a-z]", "", first.lower())
    last_slug = re.sub(r"[^a-z]", "", last.lower())
    return f"{first_slug}.{last_slug}@ann.com"


def _random_phone(rng: random.Random) -> str:
    area = rng.randint(201, 989)
    mid = rng.randint(200, 999)
    line = rng.randint(1000, 9999)
    return f"+1-{area}-{mid:03d}-{line:04d}"


def _pick_name_pair(
    rng: random.Random, used_display: set[str], used_email_local: set[str]
) -> tuple[str, str, str]:
    """Return (first, last, display_name) disjoint from customer single-name pools; unique email local."""
    for _ in range(400):
        first = rng.choice(_STYLIST_FIRST)
        last = rng.choice(_STYLIST_LAST)
        display = f"{first} {last}"
        local = (
            re.sub(r"[^a-z]", "", first.lower()) + "." + re.sub(r"[^a-z]", "", last.lower())
        )
        if display in used_display or local in used_email_local:
            continue
        used_display.add(display)
        used_email_local.add(local)
        return first, last, display
    msg = "could not sample unique stylist name; increase pools or lower --count"
    raise RuntimeError(msg)


def seed_sample_stylists(
    settings: StylistSettings,
    *,
    seed: int,
    count: int,
) -> dict[str, object]:
    rng = random.Random(seed)
    tenant = settings.pg_tenant_id.strip() or _TENANT
    today = date.today()
    day_start = today + timedelta(days=1)
    day_dates = [day_start + timedelta(days=d) for d in range(_CALENDAR_DAYS)]
    kwargs = postgres_connect_kwargs(settings)

    used_display: set[str] = set()
    used_email_local: set[str] = set()
    rows_out: list[dict[str, str]] = []

    with psycopg.connect(**kwargs, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT store_id FROM stylist.stores
                WHERE tenant_id = %s
                ORDER BY store_id
                """,
                (tenant,),
            )
            store_rows = cur.fetchall()
            if not store_rows:
                raise RuntimeError(
                    "no stores for tenant — run digital-stylist-seed-workforce --dev "
                    "or digital-stylist-seed-retail --dev first",
                )
            store_ids = [r[0] for r in store_rows]

            for i in range(1, count + 1):
                stid = f"sample_stylist_{i:03d}"
                first, last, display = _pick_name_pair(rng, used_display, used_email_local)
                store_id = store_ids[(i - 1) % len(store_ids)]
                email = _ann_email(first, last)
                phone = _random_phone(rng)
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
                    (tenant, stid, store_id, display, email, phone, skills),
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
                rows_out.append(
                    {
                        "stylist_id": stid,
                        "store_id": store_id,
                        "display_name": display,
                        "email": email,
                        "phone": phone,
                    }
                )

        conn.commit()

    return {
        "tenant_id": tenant,
        "stylists_upserted": len(rows_out),
        "calendar_days": _CALENDAR_DAYS,
        "calendar_first": day_dates[0].isoformat(),
        "calendar_last": day_dates[-1].isoformat(),
        "stylists": rows_out,
        "tables": ["stylist.stylists", "stylist.stylist_day_capacity"],
        "name_rule": "first and last not from customer seed pools; email firstname.lastname@ann.com",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Seed sample stylists (disjoint names vs customers) for validation.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=_DEFAULT_COUNT,
        help=f"Number of stylists (default {_DEFAULT_COUNT}).",
    )
    parser.add_argument("--seed", type=int, default=42, help="RNG seed.")
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Skip workforce DDL (stylists / capacity tables already exist).",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Use docker-compose postgres defaults; same as other seed CLIs.",
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
            "postgres_not_configured — set STYLIST_PG_* or STYLIST_PG_DSN, or pass --dev.",
        )
        return 1

    if args.count < 1 or args.count > 60:
        logger.error("count must be between 1 and 60")
        return 1

    if len(_STYLIST_FIRST) < 5 or len(_STYLIST_LAST) < 5:
        logger.error("stylist name pools too small after excluding customer names")
        return 1

    if not args.skip_schema:
        logger.info("applying_workforce_schema_for_stylist_tables")
        apply_workforce_schema(settings)

    try:
        logger.info("seeding_sample_stylists", extra={"count": args.count})
        summary = seed_sample_stylists(settings, seed=args.seed, count=args.count)
    except RuntimeError as e:
        logger.error("%s", e)
        return 1

    print(json.dumps(summary, indent=2))
    logger.info("seed_sample_stylists_done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
