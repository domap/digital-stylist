"""Assembles domain agents for LangGraph (composition root — no domain logic)."""

from __future__ import annotations

from dataclasses import dataclass

from digital_stylist.contracts.context import AgentRunContext
from digital_stylist.domains.appointment import AppointmentAgent
from digital_stylist.domains.catalog import CatalogAgent
from digital_stylist.domains.customer import CustomerAgent
from digital_stylist.domains.email import EmailAgent
from digital_stylist.domains.intent import IntentAgent
from digital_stylist.domains.stylist import StylistAgent
from digital_stylist.domains.support import SupportAgent


@dataclass
class StylistAgentBundle:
    customer: CustomerAgent
    intent: IntentAgent
    stylist: StylistAgent
    catalog: CatalogAgent
    appointment: AppointmentAgent
    email: EmailAgent
    support: SupportAgent

    @classmethod
    def from_context(cls, ctx: AgentRunContext) -> StylistAgentBundle:
        return cls(
            customer=CustomerAgent(ctx),
            intent=IntentAgent(ctx),
            stylist=StylistAgent(ctx),
            catalog=CatalogAgent(ctx),
            appointment=AppointmentAgent(ctx),
            email=EmailAgent(ctx),
            support=SupportAgent(ctx),
        )
