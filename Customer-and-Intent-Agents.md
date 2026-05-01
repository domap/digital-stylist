# Customer and Intent Agents
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Customer Agent and Intent Agent represent the first two nodes in the `digital_stylist` LangGraph pipeline. They are responsible for establishing the context of the conversation and determining the routing logic for all subsequent domain-specific agents.

## Customer Agent

The `CustomerAgent` is the entry point of the graph. Its primary responsibility is to fetch and hydrate the `StylistState` with persistent customer data before any reasoning occurs.

### Implementation and Repository Pattern

The agent utilizes a repository pattern to abstract data access, allowing it to interface with the Model Context Protocol (MCP) or local data stores.

- Class: `CustomerAgent` defined in [digital_stylist/domains/customer/agent.py#12-14](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/customer/agent.py#L12-L14)
- Repository: `CustomerRepository` defined in [digital_stylist/domains/customer/repository.py#10-12](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/customer/repository.py#L10-L12)
- Data Fetching: The agent calls `repository.get_customer_snapshot()`[digital_stylist/domains/customer/agent.py#27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/customer/agent.py#L27-L27) to retrieve a `CustomerSnapshot`.

### Customer Snapshot (MCP)

The `CustomerSnapshot` is a structured representation of the customer's profile, including preferences, purchase history, and sizing. This snapshot is stored in the `customer_snapshot` field of the `StylistState`[digital_stylist/contracts/state.py#64](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L64-L64)

FieldDescription`id`Unique identifier for the customer.`name`Customer's full name.`preferences`Styling preferences (e.g., colors, fits).`recent_purchases`List of items recently bought to avoid redundant recommendations.

### Data Flow: Entry to State

The `CustomerAgent` executes a simple "fetch-and-pass" logic. It does not typically invoke an LLM unless complex resolution of customer identity is required.

Sources: [digital_stylist/domains/customer/agent.py#12-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/customer/agent.py#L12-L35)[digital_stylist/domains/customer/repository.py#10-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/customer/repository.py#L10-L25)[digital_stylist/contracts/state.py#60-65](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L60-L65)

---

## Intent Agent

The `IntentAgent` acts as the "router" of the system. It analyzes the user's latest message in the context of the `customer_snapshot` to classify the request and determine the next node in the graph.

### Intent Classification

The agent uses an LLM to classify the user's intent into one of the `IntentLiteral` categories defined in the system contract [digital_stylist/contracts/state.py#12-21](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L12-L21)

Key Intent Literals:

- `PRODUCT_SEARCH`: User is looking for specific items (Routes to `CatalogAgent`).
- `STYLING_ADVICE`: User wants fashion tips or outfit coordination (Routes to `StylistAgent`).
- `APPOINTMENT`: User wants to book or change a session (Routes to `AppointmentAgent`).
- `SUPPORT`: General help or policy questions (Routes to `SupportAgent`).
- `EMAIL_FOLLOWUP`: Request to send information via email (Routes to `EmailAgent`).

### Urgency Scoring

In addition to classification, the `IntentAgent` performs Urgency Scoring. It assigns a numerical value (typically 1-5) to the `urgency_score` field in `StylistState`[digital_stylist/contracts/state.py#68](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L68-L68) This score can be used by downstream agents to prioritize certain responses or trigger escalations.

### Implementation: routing.py

The routing logic is encapsulated in `digital_stylist/domains/intent/routing.py`. This module contains the `intent_router` function which inspects the `intent` field in the state to return the string name of the next node [digital_stylist/domains/intent/routing.py#8-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L8-L25)

Sources: [digital_stylist/domains/intent/agent.py#15-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/agent.py#L15-L40)[digital_stylist/domains/intent/routing.py#8-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L8-L30)[digital_stylist/contracts/state.py#12-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L12-L25)

---

## Conditional Graph Routing

The transition from the `IntentAgent` to the rest of the pipeline is a conditional edge in LangGraph.

1. Node Execution: The `IntentAgent` finishes execution and returns the updated `intent` and `urgency_score`[digital_stylist/domains/intent/agent.py#45-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/agent.py#L45-L50)
2. Edge Evaluation: The graph calls `intent_router(state)`[digital_stylist/domains/intent/routing.py#8-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L8-L10)
3. Branching: Based on the returned string (e.g., `"catalog"`, `"stylist"`, `"appointment"`), the graph directs the flow to the corresponding domain agent.

### Routing Table

Intent (`IntentLiteral`)Target NodeLogic File`PRODUCT_SEARCH``catalog`[digital_stylist/domains/intent/routing.py#15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L15-L15)`STYLING_ADVICE``stylist`[digital_stylist/domains/intent/routing.py#16](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L16-L16)`APPOINTMENT``appointment`[digital_stylist/domains/intent/routing.py#17](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L17-L17)`SUPPORT``support`[digital_stylist/domains/intent/routing.py#18](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L18-L18)`GREETING``stylist`[digital_stylist/domains/intent/routing.py#19](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L19-L19)

Sources: [digital_stylist/domains/intent/routing.py#8-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/intent/routing.py#L8-L25)[digital_stylist/graph.py#45-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L45-L60) (implied by graph structure).

## Configuration

The behavior of these agents can be tuned via environment variables:

- `STYLIST_MAX_MESSAGE_CHARS`: Limits the input size for the Intent LLM [digital_stylist/config.py#75](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L75-L75)
- `STYLIST_LLM_PROVIDER`: Determines which model performs the classification [digital_stylist/config.py#45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L45-L45)

Sources: [.env.example#34](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L34-L34)[digital_stylist/config.py#40-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L40-L80)