"""Seed 20 demo customers with rich ``profile_json`` (preferences, notes, events, birthday, anniversary, loyalty).

Loyalty tier is **VIP** or **Insider**, chosen at random per customer. Names are chosen at random from expanded first/last lists.
**Preferences** are plain-language sentences (palette, brands, fit, budget, avoids)—not bare attribute keys.
**Interaction notes** and **upcoming events** are varied (work, family milestones, galas, destination weddings, etc.).
Each profile includes **email** as ``firstname.lastname@email.com`` and a fictional **phone** (``+1-555-…``).
Celebration **dates** (upcoming events, next birthday/anniversary) are on or after the first day of next month.
All fields live in ``stylist.customers.profile_json``.

Run::

    .venv/bin/digital-stylist-seed-customers --dev

(without ``--dev``, set ``STYLIST_PG_*`` in ``.env``). Or::

    python -m digital_stylist.infra.postgres.seed_customers --dev
"""

from __future__ import annotations

import argparse
import calendar
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

_TENANT = "default"
_CUSTOMER_COUNT = 20


def _first_day_next_month(d: date) -> date:
    """First calendar day of the month after ``d``."""
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)


def _next_calendar_occurrence(month: int, day: int, on_or_after: date) -> date:
    """First date with given month/day that is >= ``on_or_after`` (handles leap years)."""
    for yy in range(on_or_after.year, on_or_after.year + 5):
        last_d = calendar.monthrange(yy, month)[1]
        dd = min(day, last_d)
        cand = date(yy, month, dd)
        if cand >= on_or_after:
            return cand
    last_d = calendar.monthrange(on_or_after.year + 4, month)[1]
    dd = min(day, last_d)
    return date(on_or_after.year + 4, month, dd)

_FIRST_NAMES = [
    "Emma",
    "Sophia",
    "Olivia",
    "Ava",
    "Mia",
    "Charlotte",
    "Amelia",
    "Harper",
    "Evelyn",
    "Abigail",
    "Emily",
    "Elizabeth",
    "Sofia",
    "Madison",
    "Ella",
    "Scarlett",
    "Grace",
    "Chloe",
    "Victoria",
    "Riley",
    "Nora",
    "Zoe",
    "Lily",
    "Hannah",
    "Aiden",
    "Jordan",
    "Alex",
    "Morgan",
    "Rachel",
    "Priya",
    "Mei",
    "Fatima",
    "Isabella",
    "Camila",
    "Naomi",
    "Claire",
    "Diana",
    "Brooke",
    "Vanessa",
    "Andrea",
]
_LAST_NAMES = [
    "Nguyen",
    "Patel",
    "Kim",
    "Garcia",
    "Martinez",
    "Lee",
    "Walker",
    "Hall",
    "Young",
    "King",
    "Wright",
    "Lopez",
    "Hill",
    "Scott",
    "Green",
    "Adams",
    "Baker",
    "Nelson",
    "Carter",
    "Mitchell",
    "Okafor",
    "Reyes",
    "Chen",
    "Okonkwo",
    "Singh",
    "Murphy",
    "Foster",
    "Bennett",
    "Rivera",
    "Brooks",
    "Price",
    "Sanders",
    "Perry",
    "Powell",
    "Long",
    "Russell",
    "Butler",
    "Simmons",
    "Hayes",
    "Turner",
]


def _preferences_for_customer(rng: random.Random, first_name: str) -> list[str]:
    """Human-readable styling context (no bare attribute keys)."""
    aesthetic = rng.choice(
        [
            f"{first_name} prefers a polished, minimal look for most of the week and saves bolder pieces for events.",
            "Workweek wardrobe leans classic with clean lines; weekends are more relaxed but still put-together.",
            "Loves tailored separates that move from client meetings to dinner without a full outfit change.",
            "Enjoys romantic details (soft draping, subtle lace) but keeps hemlines and necklines office-appropriate.",
            "Streetwear-inspired on days off—think elevated sneakers and structured outerwear, not loud logos.",
            "Evening and gala edits should feel modern, not fussy: strong silhouette, restrained color.",
        ]
    )
    palette = rng.choice(
        [
            "Color comfort zone: navy, ivory, camel, and soft sage; steers clear of neon and heavy patterns.",
            "Gravitates toward cool neutrals and deep burgundy; avoids orange and yellow next to the face.",
            "Likes black and cream as anchors, with one accent piece in emerald or cobalt when appropriate.",
            "Open to seasonal pastels for spring events; prefers matte fabrics over high-shine for day.",
        ]
    )
    brands = rng.choice(
        [
            "Often shops Theory, COS, and Everlane for basics; willing to splurge on Toteme or Sezane for hero pieces.",
            "Mixes high-street with occasional investment buys—cares more about fit and fabric than label.",
            "Recently discovered Reformation and Aritzia for dresses; wants help sizing consistently across brands.",
            "Has had good luck with Reformation for weddings; looking for similar brands with more structure for work.",
        ]
    )
    fit = rng.choice(
        [
            "Fit: usually a small in tops, 4–6 in dresses; petite length on trousers when available; prefers defined waist.",
            "Athletic shoulders—blazers need a slight stretch or soft shoulder; avoids stiff padding.",
            "Petite frame; hemming pants and sleeves is normal—factor that into timeline for events.",
            "Wide feet (size 9–10); prioritize comfort in heels and loafers; open to block heels over stilettos.",
        ]
    )
    budget = rng.choice(
        [
            "Comfortable spending around $400–900 on a versatile blazer or coat; $200–350 for everyday knits.",
            "Event budget this quarter is flexible for the right piece—prefer fewer, better items over volume.",
            "Looking to refresh core work wardrobe under $2k total; prioritize pieces that pair with what they already own.",
        ]
    )
    avoid = rng.choice(
        [
            "Avoids boxy cropped cuts and anything that reads too junior; no final sale without try-on.",
            "Sensitive to wool itch—merino and cashmere blends ok; chunky scratchy knits are a no.",
            "Does not want low-rise bottoms or ultra-cropped tops for professional settings.",
        ]
    )
    out = [aesthetic, palette, brands, fit, budget, avoid]
    rng.shuffle(out)
    return out[: rng.randint(4, 6)]


def _interaction_notes_for_customer(
    rng: random.Random, first_name: str, today: date
) -> list[dict[str, str]]:
    """Per-customer interaction history with varied, plausible summaries."""
    pool = [
        f"{first_name} loved the navy blazer edit; asked for two more casual Friday tops to pair with it.",
        f"Virtual session: {first_name} wanted shoe options for back-to-back client meetings—chose a block-heel pump.",
        f"{first_name} returned a wrap dress—exchange for one size down; discussed tailoring at the waist.",
        "In-store: color draping confirmed cool undertones; steered them away from yellow-gold jewelry near the face.",
        f"{first_name} requested a packing list for a 3-day work trip—carry-on only, mixed climate.",
        f"Follow-up on gala dress shortlist; {first_name} prefers long sleeves or a jacket option for the venue AC.",
        f"{first_name} asked for denim that reads polished enough for a creative office—dark wash, no distressing.",
        f"Chat: {first_name} is nursing a foot injury—needs dressy flats for an upcoming event, not heels.",
        f"{first_name} brought photos of their closet; we identified gaps in layering knits and one statement coat.",
        f"Phone: {first_name} needed a last-minute alteration referral before a board presentation—rush approved.",
        f"{first_name} wanted maternity-friendly work options without looking frumpy—fitted knits and stretch trousers.",
        f"Post-appointment: {first_name} asked for sustainable fabric alternatives for summer dresses.",
        f"{first_name} discussed modest hemlines for a family event; found two midi options within budget.",
        f"Style quiz follow-up—{first_name} wants fewer dry-clean-only pieces for everyday wear.",
        f"{first_name} ordered lookbook links for partner gift sizing; separate note on men's tailoring referral.",
        f"Virtual: {first_name} compared two trench coats; chose the water-resistant one for commute weather.",
        f"{first_name} mentioned new role with more external speaking—needs confident, camera-friendly tops.",
        f"Follow-up call: {first_name} happy with alterations; asked to be notified when similar trousers restock.",
        f"{first_name} wanted outfit cohesion for headshot day—soft necklines, minimal jewelry distraction.",
        f"In-store: {first_name} tried on five dresses; narrowed to two for a June wedding—deposit on alterations.",
    ]
    n = rng.randint(3, 6)
    chosen = rng.sample(pool, k=min(n, len(pool)))
    notes = []
    for summary in chosen:
        d = today - timedelta(days=rng.randint(5, 200))
        notes.append(
            {
                "date": d.isoformat(),
                "channel": rng.choice(["in_store", "virtual", "chat", "phone"]),
                "summary": summary,
            }
        )
    notes.sort(key=lambda x: x["date"], reverse=True)
    return notes


def _upcoming_events_for_customer(rng: random.Random, first_name: str, today: date) -> list[dict[str, str]]:
    """Varied future occasions—all dated on or after the first day of next month."""
    templates = [
        (
            "Client strategy offsite — three days, business casual",
            "Needs polished separates that pack small; one optional blazer for dinner with leadership.",
        ),
        (
            "Big quarterly client pitch at headquarters",
            "Camera-ready tailored look; prefers navy or charcoal; comfortable in heels for full day.",
        ),
        (
            "Destination wedding — coastal venue, semi-formal dress code",
            "Breathable fabric, block heels for grass; wrap for evening breeze.",
        ),
        (
            "Destination wedding abroad — formal evening",
            "Long flight; wants wrinkle-resistant formal option and one backup accessory set.",
        ),
        (
            "Daughter's university convocation",
            "Smart day dress or tailored jumpsuit; comfortable shoes for standing photos on grass.",
        ),
        (
            "Son's high school graduation",
            "Outdoor ceremony; sun hat or light layer; family photos after—avoid stark white if bridal-adjacent.",
        ),
        (
            "40th birthday dinner with friends",
            "Statement dress or bold suit; fun but not costume-y.",
        ),
        (
            "Surprise milestone birthday weekend",
            "Packable outfit for dinner + daytime brunch; prefers something they can re-wear.",
        ),
        (
            "Wedding anniversary — reservations at a Michelin restaurant",
            "Elegant, not flashy; prefers sleeves or wrap for AC; subtle jewelry.",
        ),
        (
            "10-year wedding anniversary party — hosted at home",
            "Hosts want elevated casual—nice trousers and silk top vs full gown.",
        ),
        (
            "Winter charity gala — black tie",
            "Floor-length or formal cocktail; prefers pockets or small bag solution; cloak check plan.",
        ),
        (
            "Hospital foundation gala — cocktail attire",
            "Classic silhouette; comfortable shoes for standing reception.",
        ),
        (
            "Industry awards night — creative black tie optional",
            "Modern evening look; {name} wants to stand out without competing with stage lighting.",
        ),
        (
            "Best friend's baby shower — brunch",
            "Feminine but practical; avoid white; comfortable for games and mingling.",
        ),
        (
            "Family reunion weekend — mixed dress codes",
            "Two outfits: one casual-smart for picnic, one for Saturday night dinner.",
        ),
        (
            "Conference keynote — on stage",
            "Tailored suit or sheath; no noisy jewelry; mic-friendly neckline.",
        ),
        (
            "Team offsite and group dinner",
            "Business casual with one elevated piece; walking between venues.",
        ),
        (
            "Photoshoot for company website",
            "Clean lines, minimal pattern; bring backup top for second look.",
        ),
    ]
    n_events = rng.randint(1, 4)
    rng.shuffle(templates)
    events = []
    earliest = _first_day_next_month(today)
    span_days = 450
    for label_t, notes_t in templates[:n_events]:
        label = label_t.format(name=first_name)
        notes = notes_t.format(name=first_name)
        ed = earliest + timedelta(days=rng.randint(0, span_days - 1))
        events.append({"date": ed.isoformat(), "label": label, "notes": notes})
    events.sort(key=lambda x: x["date"])
    return events


def _demo_email(display_name: str) -> str:
    """``firstname.lastname@email.com`` — letters only in the local part."""
    parts = display_name.strip().split()
    if len(parts) >= 2:
        first = re.sub(r"[^a-z0-9]", "", parts[0].lower())
        last = re.sub(r"[^a-z0-9]", "", parts[-1].lower())
        if first and last:
            return f"{first}.{last}@email.com"
    slug = re.sub(r"[^a-z0-9]+", ".", display_name.strip().lower()).strip(".")
    return f"{slug or 'customer'}@email.com"


def _demo_phone(rng: random.Random, customer_index: int) -> str:
    mid = 200 + (customer_index * 37 + rng.randint(0, 40)) % 700
    last = 1000 + (customer_index * 91 + rng.randint(0, 50)) % 9000
    return f"+1-555-{mid:03d}-{last:04d}"


def _build_profile(
    rng: random.Random,
    *,
    user_id: str,
    first_name: str,
    last_name: str,
    loyalty: str,
    today: date,
    customer_index: int,
) -> dict[str, object]:
    display_name = f"{first_name} {last_name}"
    b_month = rng.randint(1, 12)
    b_day = rng.randint(1, 28)
    birth_year = rng.randint(1975, 2000)
    ann_month = rng.randint(1, 12)
    ann_day = rng.randint(1, 28)
    earliest_celebration = _first_day_next_month(today)
    birthday_next = _next_calendar_occurrence(b_month, b_day, earliest_celebration)
    anniversary_next = _next_calendar_occurrence(ann_month, ann_day, earliest_celebration)

    prefs = _preferences_for_customer(rng, first_name)
    notes = _interaction_notes_for_customer(rng, first_name, today)
    events = _upcoming_events_for_customer(rng, first_name, today)

    email = _demo_email(display_name)
    phone = _demo_phone(rng, customer_index)

    return {
        "user_id": user_id,
        "display_name": display_name,
        "email": email,
        "phone": phone,
        "loyalty_tier": loyalty,
        "preferences": prefs,
        "interaction_notes": notes,
        "upcoming_events": events,
        "birthday": {
            "month": b_month,
            "day": b_day,
            "year_optional": birth_year,
            "next_celebration_date": birthday_next.isoformat(),
            "celebration_opt_in": rng.choice([True, True, False]),
            "notes": rng.choice(
                [
                    "Send early access to birthday edit.",
                    "Prefers low-key acknowledgment.",
                    "Interested in birthday month styling session.",
                ]
            ),
        },
        "anniversary": {
            "month": ann_month,
            "day": ann_day,
            "next_celebration_date": anniversary_next.isoformat(),
            "label": rng.choice(
                ["Wedding anniversary", "Partnership anniversary", "First purchase anniversary"]
            ),
            "notes": rng.choice(
                [
                    "Open to gift suggestions for partner.",
                    "Small token preferred over big spend.",
                ]
            ),
        },
        "hard_rules": [
            "No final sale without fit confirmation.",
            "VIP line: prioritize appointment holds when tier is VIP.",
        ],
    }


def seed_customers(settings: StylistSettings, *, seed: int) -> dict[str, object]:
    rng = random.Random(seed)
    tenant = settings.pg_tenant_id.strip() or _TENANT
    today = date.today()
    kwargs = postgres_connect_kwargs(settings)
    created: list[str] = []
    loyalty_vip = 0
    loyalty_insider = 0

    with psycopg.connect(**kwargs, autocommit=False) as conn:
        with conn.cursor() as cur:
            for i in range(1, _CUSTOMER_COUNT + 1):
                user_id = f"cust_{i:03d}"
                fname = rng.choice(_FIRST_NAMES)
                lname = rng.choice(_LAST_NAMES)
                loyalty = rng.choice(("VIP", "Insider"))
                if loyalty == "VIP":
                    loyalty_vip += 1
                else:
                    loyalty_insider += 1
                profile = _build_profile(
                    rng,
                    user_id=user_id,
                    first_name=fname,
                    last_name=lname,
                    loyalty=loyalty,
                    today=today,
                    customer_index=i,
                )
                cur.execute(
                    """
                    INSERT INTO stylist.customers (tenant_id, user_id, profile_json)
                    VALUES (%s, %s, %s::jsonb)
                    ON CONFLICT (tenant_id, user_id) DO UPDATE SET
                        profile_json = EXCLUDED.profile_json,
                        updated_at = now()
                    """,
                    (tenant, user_id, json.dumps(profile)),
                )
                created.append(user_id)

        conn.commit()

    return {
        "tenant_id": tenant,
        "customers_upserted": len(created),
        "user_ids": created,
        "loyalty_split": {
            "VIP": loyalty_vip,
            "Insider": loyalty_insider,
        },
        "profile_shape": {
            "email": "string (firstname.lastname@email.com)",
            "phone": "string (+1-555-xxx-xxxx)",
            "loyalty_tier": "VIP | Insider",
            "preferences": "list of plain-language styling sentences (palette, brands, fit, budget, avoids)",
            "interaction_notes": "list of {date, channel, summary}",
            "upcoming_events": "list of {date, label, notes} — dates >= first day of next month",
            "birthday": "month, day, year_optional, next_celebration_date, celebration_opt_in, notes",
            "anniversary": "month, day, next_celebration_date, label, notes",
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed 20 customers with rich profile_json.")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducible data.")
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

    logger.info("seeding_customers")
    summary = seed_customers(settings, seed=args.seed)
    print(json.dumps(summary, indent=2))
    logger.info("seed_customers_done", extra={"count": summary["customers_upserted"]})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
