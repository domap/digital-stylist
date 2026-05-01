# Data Layer
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Digital Stylist data layer is a hybrid persistence architecture designed to support both structured relational data and high-dimensional vector search. It consists of two primary backends: PostgreSQL, which serves as the system of record for operational data (customers, appointments, and workforce), and Chroma, which provides the vector store for the RAG-enabled product catalog.

## Persistence Architecture

The system segregates data based on its access pattern and semantic nature. Relational data is managed through a traditional SQL schema with multi-tenant isolation, while product discovery is powered by a vector database that indexes product attributes into a searchable embedding space.

### Data Flow Overview

The following diagram illustrates how the two backends interact with the core system components.

Data Backend Integration

Sources: [.env.example#25-26](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L26)[.env.example#54-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L54-L60)

## Operational Storage (PostgreSQL)

PostgreSQL is the primary datastore for the "Model Context Protocol" (MCP) handlers and the stylist-specific management routes. It stores the core entities required for the clienteling experience.

- Customer Data: Profiles, preferences, and historical interactions used by the `CustomerAgent`.
- Appointments: Scheduling data, booking IDs, and status updates managed by the `AppointmentAgent`.
- Workforce: Associate details and retail calendar information for the `SupportAgent`.
- Tenant Isolation: Uses Row-Level Security (RLS) and GUC-based (Global User Configuration) tenant enforcement to ensure data privacy across different retail environments.

The system includes a bootstrap CLI (`digital-stylist-pg-bootstrap`) and several seed scripts to initialize the schema and populate development environments.

For implementation details, schema definitions, and seeding procedures, see [PostgreSQL Schema and Bootstrap](#6.1).

Sources: [.env.example#46-64](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L64)[.env.example#53](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L53-L53)

## Vector Catalog (Chroma)

The product catalog is stored in Chroma, an AI-native open-source vector database. This backend enables the `CatalogAgent` to perform semantic searches based on natural language queries from the stylist.

### Catalog Indexing Pipeline

The transition from raw product data to a searchable vector index involves a dedicated pipeline:

1. Ingestion: Raw JSON product data is loaded via the `catalog-feed` package.
2. Document Conversion: Products are transformed into structured documents with metadata.
3. Embedding: Textual descriptions are converted into vectors using the configured embedding provider (e.g., Google GenAI or OpenAI).
4. Indexing: Vectors and metadata are stored in a Chroma collection.

Natural Language to Vector Space

Sources: [.env.example#7-21](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L7-L21)[.env.example#25-27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L27)

For details on the indexing pipeline and product models, see [Catalog Feed and Chroma Indexing](#6.2).

## Configuration and Defaults

The data layer is configured primarily through environment variables. In development modes (`STYLIST_ENV=development`), the system can fall back to an in-memory datastore for PostgreSQL if no connection string is provided, though a real instance is recommended for full functionality.

VariablePurposeDefault/Example`STYLIST_VECTOR_BACKEND`Selection of vector store`chroma``CHROMA_PERSIST_DIR`Local path for Chroma data`/app/chroma_data``STYLIST_PG_DSN`Full PostgreSQL connection string`postgresql://stylist:stylist@127.0.0.1:5433/stylist``STYLIST_PG_DATASTORE`Backend mode for Postgres`auto` (or `memory`)

Sources: [.env.example#25-26](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L26)[.env.example#46-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L60)