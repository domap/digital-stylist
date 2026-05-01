# Stylist, Catalog, and Explainability Agents
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

This section details the core styling path of the Digital Stylist pipeline. These three agents—Stylist, Catalog, and Explainability—form a sequential chain that transforms a user's intent into a curated set of product recommendations with personalized justifications.

## Core Styling Pipeline Overview

The styling path is triggered when the `IntentAgent` classifies a request as requiring product discovery or styling advice. The data flows through the shared `StylistState`[digital_stylist/contracts/state.py#10-53](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L10-L53) specifically utilizing the `stylist_notes`, `catalog_queries`, `recommendations`, and `recommendation_rationale` fields.

### Data Flow Diagram: From Intent to Rationale

The following diagram illustrates how vector search results and LLM reasoning flow through the code entities in this subsystem.

Styling Path Data Flow

Sources:[digital_stylist/domains/stylist/agent.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/stylist/agent.py#L1-L40)[digital_stylist/domains/catalog/agent.py#1-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/catalog/agent.py#L1-L60)[digital_stylist/domains/explainability/agent.py#1-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/explainability/agent.py#L1-L45)[digital_stylist/domains/catalog/rag.py#1-120](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/catalog/rag.py#L1-L120)[digital_stylist/providers/protocols.py#10-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/protocols.py#L10-L25)

---

## StylistAgent

The `StylistAgent` acts as the "creative director." It does not look at the inventory itself; instead, it interprets the user's request and the customer profile to establish a styling direction.

### Responsibilities

- Persona Alignment: Adopts the "Ann" persona to provide professional styling advice [digital_stylist/domains/stylist/agent.py#15-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/stylist/agent.py#L15-L20)
- Stylist Notes: Generates high-level guidance (e.g., "focus on earthy tones and breathable fabrics") which is stored in the `stylist_notes` field of `StylistState`[digital_stylist/contracts/state.py#27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L27-L27)
- Search Intent: Formulates specific search queries for the `CatalogAgent` to use in the vector database.

Sources:[digital_stylist/domains/stylist/agent.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/stylist/agent.py#L1-L40)[digital_stylist/contracts/state.py#10-53](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L10-L53)

---

## CatalogAgent and RAG Pipeline

The `CatalogAgent` is responsible for the Retrieval-Augmented Generation (RAG) process. It bridges the gap between the Stylist's creative vision and the actual product availability in the `VectorCatalog`.

### RAG Implementation (`rag.py`)

The RAG pipeline is implemented in `digital_stylist/domains/catalog/rag.py`. It executes a multi-round search process controlled by the `STYLIST_CATALOG_RAG_MAX_ROUNDS` configuration [digital_stylist/config.py#110](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L110-L110)

1. Query Generation: Converts `stylist_notes` into structured search queries.
2. Vector Search: Calls the `search` method on the configured `VectorCatalog` (Chroma or In-Memory) [digital_stylist/providers/protocols.py#18-24](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/protocols.py#L18-L24)
3. Refinement: If the initial results are poor or insufficient, the agent can perform additional rounds of searching with refined parameters.

### Recommendation Structure

The results are stored in the `recommendations` field as a list of `CatalogProduct` objects [digital_stylist/contracts/state.py#29](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L29-L29)

Catalog Logic Flow

Sources:[digital_stylist/domains/catalog/agent.py#15-55](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/catalog/agent.py#L15-L55)[digital_stylist/domains/catalog/rag.py#20-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/catalog/rag.py#L20-L80)[digital_stylist/providers/vector_chroma.py#10-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_chroma.py#L10-L50)

---

## ExplainabilityAgent

The `ExplainabilityAgent` is the final step in the styling path. Its purpose is to close the loop between the product attributes and the user's original needs.

### Recommendation Rationale

The agent reads the `recommendations` and the `stylist_notes` to produce the `recommendation_rationale`[digital_stylist/contracts/state.py#30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L30-L30) This text is what the user sees in the "Connect" app to understand *why* specific items were suggested.

### Key Functions

- Context Synthesis: It looks at `CustomerAgent` snapshots (preferences) and `StylistAgent` notes to ensure the explanation is personalized.
- Formatting: It ensures the rationale is empathetic and helpful, maintaining the brand voice.

Sources:[digital_stylist/domains/explainability/agent.py#10-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/explainability/agent.py#L10-L40)[digital_stylist/contracts/state.py#10-53](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/contracts/state.py#L10-L53)

---

## Configuration and Constraints

The behavior of these agents is tuned via `digital_stylist/config.py`.

Environment VariableDescriptionDefault`STYLIST_CATALOG_RAG_MAX_ROUNDS`Maximum iterations for the RAG search refinement.`3``STYLIST_CHAT_MODEL`The LLM used by all three agents for reasoning.Provider-specific`STYLIST_VECTOR_BACKEND`Determines if `CatalogAgent` queries `chroma` or `memory`.`chroma`

Sources:[digital_stylist/config.py#45-120](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L45-L120)[digital_stylist/providers/factories.py#20-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L20-L60)

## Integration in StateGraph

These agents are wired together in `digital_stylist/graph.py`. The graph defines a conditional transition from the `IntentAgent` to the `StylistAgent`, which then flows linearly to the `CatalogAgent` and finally the `ExplainabilityAgent` before reaching the `END` node.

Sources:[digital_stylist/graph.py#50-100](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py#L50-L100)