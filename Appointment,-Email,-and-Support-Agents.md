# Appointment, Email, and Support Agents
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

This page covers the three terminal branches of the LangGraph multi-agent pipeline: the `AppointmentAgent`, the `EmailAgent`, and the `SupportAgent`. Unlike the core styling agents which iterate on product recommendations, these agents are designed to handle specific transaction-oriented intents or general assistance. They terminate the graph execution and write final state fields used by the frontend applications.

## Terminal Agent Topology

The graph routes to these agents when the `IntentAgent` classifies the user's request as needing a booking, an email follow-up, or general support. Once these agents complete their logic, they transition the state to `END`.

### Data Flow Diagram: Terminal Branches

This diagram illustrates how Natural Language intents are mapped to specific Python classes and their respective persistence layers.

Sources:

- [digital_stylist/graph.py#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L1-L100) (Graph topology and routing)
- [digital_stylist/contracts/state.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L1-L50) (State definitions for `intent` and `next_node`)

---

## Appointment Agent

The `AppointmentAgent` manages the lifecycle of booking requests. It is responsible for identifying the desired service, time, and associate, and then persisting that data to the PostgreSQL database.

### Key State Fields

The agent writes to the following fields in `StylistState`:

- `booking_id`: A UUID string of the created or referenced appointment [digital_stylist/contracts/state.py#35-36](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L35-L36)
- `appointment_copy`: A natural language confirmation or status update regarding the booking [digital_stylist/contracts/state.py#37-38](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L37-L38)

### Implementation Details

The agent utilizes the `AppointmentRepository` and the Model Context Protocol (MCP) to interact with the database. If the user provides enough information, it invokes tools to create a record in the `stylist.appointments` table.

ComponentResponsibility`AppointmentAgent`LLM-driven logic to extract booking details from `messages`.`AppointmentRepository`Python interface for CRUD operations on the Postgres `appointments` table.`appointment_copy`Written to state to provide immediate UI feedback to the customer.

Sources:

- [digital_stylist/domains/appointment/agent.py#1-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/appointment/agent.py#L1-L60) (Agent implementation)
- [digital_stylist/infra/postgres/schema.sql#40-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/schema.sql#L40-L60) (Appointment table schema)
- [digital_stylist/contracts/state.py#30-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L30-L40) (State field definitions)

---

## Email Agent

The `EmailAgent` is triggered when a customer or associate requests a formal follow-up or a summary of a styling session via email.

### Integration with MCP

The `EmailAgent` does not send emails directly. Instead, it interacts with the `email` MCP handler to queue messages.

### Key State Fields

- `email_draft`: The generated body of the email intended for the user [digital_stylist/contracts/state.py#41-42](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L41-L42)
- `mcp_email_queue_id`: The tracking ID returned by the MCP service after the email is successfully queued [digital_stylist/contracts/state.py#43-44](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L43-L44)

Sources:

- [digital_stylist/domains/email/agent.py#1-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/email/agent.py#L1-L45) (Email agent logic)
- [digital_stylist/mcp_servers/handlers/email.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/email.py#L1-L50) (MCP email tool implementation)
- [digital_stylist/contracts/state.py#41-44](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L41-L44) (Email state fields)

---

## Support Agent

The `SupportAgent` acts as a general-purpose assistant for queries that do not fall into styling, catalog search, or transactional bookings. It handles FAQs, store policy questions, and general help requests.

### Behavior

- Terminal Node: Like the others in this group, it sets the `next_node` to `END`.
- Context Awareness: It uses the `CustomerAgent`'s snapshot and previous `messages` to provide personalized support (e.g., "I see you are a Platinum member, let me help you with that return").
- State Updates: It primarily appends to the `messages` list with a final helpful response.

### Logic Flow

1. Input: Receives `StylistState` containing `messages` and `customer_snapshot`.
2. Processing: LLM generates a response based on the `SupportAgent` system prompt.
3. Output: Returns the final message and sets `next_node` to `None` (terminating the graph).

Sources:

- [digital_stylist/domains/support/agent.py#1-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/support/agent.py#L1-L30) (Support agent implementation)
- [digital_stylist/graph.py#80-120](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L80-L120) (Support branch routing)

---

## Configuration and Persistence Summary

These agents rely on specific environment variables and database configurations to function correctly in a production environment.

VariablePurposeAgent Impact`STYLIST_PG_DSN`Postgres connection stringUsed by `AppointmentAgent` for booking persistence.`STYLIST_MCP_ENABLED`Toggle for MCP toolsRequired for `EmailAgent` to queue drafts.`STYLIST_LLM_PROVIDER`LLM backend (Google/OpenAI)Drives the reasoning for all three agents.

Sources:

- [.env.example#46-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L60) (Postgres configuration)
- [digital_stylist/config.py#1-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L1-L100) (StylistSettings reference)