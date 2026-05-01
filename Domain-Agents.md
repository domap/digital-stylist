# Domain Agents
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Domain Agents are the functional building blocks of the Digital Stylist intelligence layer. Located under `digital_stylist/domains/`, these eight specialized agents partition the complex task of personal styling, customer management, and retail operations into discrete, manageable units of logic.

The lifecycle of these agents is managed by the `StylistAgentBundle`, which acts as a central registry and factory, ensuring each agent is initialized with the necessary LLM providers, Model Context Protocol (MCP) tools, and runtime configurations.

### Agent Assembly and Lifecycle

The `StylistAgentBundle` serves as the primary interface for the LangGraph workflow to access domain logic. It encapsulates the initialization of all eight agents, providing a unified `get_agent(name)` interface used during graph construction.

Sources:

- `digital_stylist/domains/bundle.py:16-45` (StylistAgentBundle definition and agent instantiation)
- `digital_stylist/contracts/context.py:12-25` (AgentRunContext definition)
- `digital_stylist/graph.py:35-50` (How the bundle is used to build the StateGraph)

---

### Core Domain Groups

The agents are categorized into three functional groups based on their role within the `StateGraph` execution flow.

#### 1. Customer and Intent Agents

These agents handle the entry point of any interaction. The `CustomerAgent` retrieves identity and preference data, while the `IntentAgent` performs classification to determine the routing path (e.g., whether the user wants styling advice or needs to book an appointment).

- Key Files:`digital_stylist/domains/customer/`, `digital_stylist/domains/intent/`
- For details, see [Customer and Intent Agents](#3.1)

#### 2. Styling and Catalog Agents

The "Creative Core" of the system. This group manages the Retrieval-Augmented Generation (RAG) pipeline. The `StylistAgent` generates high-level fashion direction, the `CatalogAgent` performs vector searches against the product database, and the `ExplainabilityAgent` justifies why specific items were chosen.

- Key Files:`digital_stylist/domains/stylist/`, `digital_stylist/domains/catalog/`, `digital_stylist/domains/explainability/`
- For details, see [Stylist, Catalog, and Explainability Agents](#3.2)

#### 3. Operational and Terminal Agents

These agents handle specific business actions that typically terminate a session or trigger external side effects. This includes scheduling in-store visits, drafting follow-up emails, or handing off to human support.

- Key Files:`digital_stylist/domains/appointment/`, `digital_stylist/domains/email/`, `digital_stylist/domains/support/`
- For details, see [Appointment, Email, and Support Agents](#3.3)

---

### Agent-State Interaction

Agents interact with the system by reading from and writing to the `StylistState`. Each agent is responsible for specific fields in the state contract, ensuring a clean separation of concerns.

AgentPrimary State InputPrimary State OutputCustomer`customer_id``customer_snapshot`Intent`messages``intent`, `next_node`, `is_urgent`Stylist`customer_snapshot`, `messages``stylist_notes`Catalog`stylist_notes``recommended_product_ids`Appointment`messages``booking_id`, `appointment_copy`

Sources:

- `digital_stylist/contracts/state.py:15-55` (StylistState fields and ownership)
- `digital_stylist/domains/intent/routing.py:10-25` (Intent classification and routing logic)

---

### Data Flow: From Language to Action

The following diagram illustrates how natural language input is transformed into structured domain actions by the agents within the code.

Sources:

- `digital_stylist/domains/intent/agent.py:12-30` (IntentAgent logic)
- `digital_stylist/domains/catalog/rag.py:15-40` (Catalog RAG implementation)
- `digital_stylist/domains/explainability/agent.py:10-22` (Explainability rationale generation)

---

### Configuration Overrides

Agents respect per-domain model overrides defined in `StylistSettings`. For example, a more capable (and expensive) model can be assigned to the `StylistAgent` while using a faster, cheaper model for the `IntentAgent`.

- Environment Variables:`STYLIST_CHAT_MODEL`, `STYLIST_INTENT_MODEL`, `STYLIST_STYLIST_MODEL`.
- Default Behavior: If no override is provided, agents fall back to the provider default (e.g., `gemini-1.5-flash` for Google GenAI).

Sources:

- `digital_stylist/config.py:65-95` (Model override settings)
- `digital_stylist/providers/factories.py:45-60` (Model building logic with overrides)
- `.env.example:7-20` (Configuration examples)