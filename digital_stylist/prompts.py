"""Deprecated aggregate — prompts live under ``digital_stylist.domains.<name>.prompts``."""

from digital_stylist.domains.appointment.prompts import APPOINTMENT_AGENT
from digital_stylist.domains.catalog.prompts import CATALOG_AGENT
from digital_stylist.domains.customer.prompts import CUSTOMER_AGENT
from digital_stylist.domains.email.prompts import EMAIL_AGENT
from digital_stylist.domains.intent.prompts import INTENT_AGENT, MASTER_ORCHESTRATION
from digital_stylist.domains.stylist.prompts import STYLIST_AGENT
from digital_stylist.domains.support.prompts import SUPPORT_AGENT

SUPPORT_FALLBACK = SUPPORT_AGENT

__all__ = [
    "APPOINTMENT_AGENT",
    "CATALOG_AGENT",
    "CUSTOMER_AGENT",
    "EMAIL_AGENT",
    "INTENT_AGENT",
    "MASTER_ORCHESTRATION",
    "STYLIST_AGENT",
    "SUPPORT_AGENT",
    "SUPPORT_FALLBACK",
]
