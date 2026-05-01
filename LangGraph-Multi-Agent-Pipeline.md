# LangGraph Multi-Agent Pipeline
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Digital Stylist platform utilizes a multi-agent orchestration framework powered by LangGraph. This pipeline transforms raw user input into structured styling recommendations, appointments, or support responses through a directed acyclic graph (DAG) of specialized agents.

The core logic resides in `digital_stylist/graph.py`, where the `StateGraph` topology is defined, agents are wired together, and persistence (checkpointers) is configured to manage long-running conversations.

### Pipeline Topology and Data Flow

The pipeline follows a "Router-Worker" pattern. Every request begins with an intent classification phase that determines which specialized domain agents should be activated.

#### Graph Visualization

The following diagram illustrates the flow from the initial customer handshake to the terminal nodes.

Stylist StateGraph Topology

Sources: [digital_stylist/graph.py#126-166](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L126-L166)

### Implementation Detail: StylistAgentBundle

The graph is constructed using the `StylistAgentBundle` class, which acts as a container for all domain-specific agents and their associated tools. This bundle ensures that every node in the graph has access to the necessary LLM providers and the `AgentRunContext`.

Node NameCode EntityPurpose`customer_node``CustomerAgent`Fetches customer profile and history via MCP.`intent_node``IntentAgent`Classifies user message into `IntentLiteral`.`stylist_node``StylistAgent`Generates high-level styling advice and search queries.`catalog_node``CatalogAgent`Performs RAG against the Chroma vector store.`explainability_node``ExplainabilityAgent`Provides reasoning for the selected products.`appointment_node``AppointmentAgent`Manages fitting room bookings and schedules.`email_node``EmailAgent`Drafts follow-up communications for the customer.`support_node``SupportAgent`Handles general inquiries and help requests.

Code to Graph Mapping

Sources: [digital_stylist/graph.py#15-124](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L15-L124)[digital_stylist/contracts/state.py#10-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L10-L50)

### State Management and Checkpointing

The pipeline is stateful, relying on the `StylistState``TypedDict` to pass information between nodes. To support multi-turn conversations and horizontal scaling, the graph uses Checkpointers.

#### Checkpointer Options

The system supports different checkpointer backends based on the environment configuration:

1. MemorySaver (Default): An in-memory checkpointer used for local development. It is process-local and does not persist across restarts.
2. External Persistence: For production environments requiring horizontal scaling, the `MemorySaver` should be replaced with a shared backend like Postgres or Redis. This allows multiple worker replicas to resume the same `thread_id`.

> [!IMPORTANT]
> The default `MemorySaver` is not suitable for production scaling as it pins a conversation to a specific process instance.
> Sources: [.env.example#3-4](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L3-L4)

### Routing Logic

The transition from the `intent_node` to the rest of the graph is governed by the `route_intent` function. This function inspects the `intent` field in the `StylistState` and returns the name of the next node to execute.

- Styling Path: If the intent is `styling`, the graph executes a linear sequence: `stylist` → `catalog` → `explainability`.
- Direct Terminal Paths: Intents like `appointment`, `email`, or `support` route directly to their respective nodes, which then transition to `END`.

Sources: [digital_stylist/graph.py#130-145](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L130-L145)

### Extending the Graph

To add a new capability to the Digital Stylist, follow these steps:

1. Define the Node: Create a new agent class in a domain directory (e.g., `digital_stylist/domains/new_feature/agent.py`).
2. Update State: If the new node requires new data fields, add them to `StylistState` in `digital_stylist/contracts/state.py`.
3. Register in Bundle: Add the agent instance to the `StylistAgentBundle` in `digital_stylist/graph.py`.
4. Wire the Topology: Use `workflow.add_node()` and define the edges or conditional routing logic in `build_stylist_graph()`.

Sources: [digital_stylist/graph.py#110-124](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L110-L124)[digital_stylist/contracts/state.py#15-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L15-L35)