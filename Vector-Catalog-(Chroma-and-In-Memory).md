# Vector Catalog (Chroma and In-Memory)
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Vector Catalog system provides the retrieval-augmented generation (RAG) backbone for the Digital Stylist. It is responsible for storing product embeddings and performing semantic similarity searches to provide relevant product recommendations based on stylist notes and customer preferences.

## VectorCatalog Protocol

The system defines a formal interface for vector storage to ensure that the `CatalogAgent` can interact with different backends (ChromaDB or In-Memory) without implementation-specific logic.

Defined in `digital_stylist/providers/protocols.py`, the `VectorCatalog` protocol requires the following methods:

- `query(text: str, n_results: int, filter: dict)`: Performs a semantic search against the indexed documents. [digital_stylist/providers/protocols.py#23-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/protocols.py#L23-L25)
- `upsert(documents: List[Document])`: Adds or updates documents in the index. [digital_stylist/providers/protocols.py#27-29](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/protocols.py#L27-L29)
- `delete(ids: List[str])`: Removes specific documents. [digital_stylist/providers/protocols.py#31-33](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/protocols.py#L31-L33)
- `reset()`: Clears the entire collection. [digital_stylist/providers/protocols.py#35-37](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/protocols.py#L35-L37)

Sources:

- [digital_stylist/providers/protocols.py#18-37](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/protocols.py#L18-L37)

## Chroma Implementation (`vector_chroma.py`)

The primary production backend uses ChromaDB, an open-source vector database. This implementation handles the persistence of product embeddings to disk and manages collection-level operations.

### Configuration

The Chroma provider is configured via `StylistSettings` and environment variables:

- `STYLIST_VECTOR_BACKEND`: Must be set to `chroma`. [.env.example#25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L25)
- `CHROMA_PERSIST_DIR`: The local file system path where the vector database is stored. [.env.example#26](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L26-L26)
- `CHROMA_COLLECTION`: The name of the collection (defaults to `products`). [digital_stylist/config.py#108](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L108-L108)

### Key Class: `ChromaVectorCatalog`

The `ChromaVectorCatalog` class wraps the `chromadb.PersistentClient`. It utilizes the embedding model provided during initialization to transform query text into vectors before searching the database. [digital_stylist/providers/vector_chroma.py#15-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_chroma.py#L15-L20)

Sources:

- [digital_stylist/providers/vector_chroma.py#1-65](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_chroma.py#L1-L65)
- [digital_stylist/config.py#105-110](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L105-L110)
- [.env.example#25-26](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L26)

## In-Memory Implementation (`vector_memory.py`)

For development environments or lightweight testing where persistence is not required, the system provides a `MemoryVectorCatalog`.

### Behavior

- Storage: Uses a simple Python list or dictionary to store documents and their associated embeddings in RAM. [digital_stylist/providers/vector_memory.py#12-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_memory.py#L12-L15)
- Search: Performs a brute-force cosine similarity calculation between the query embedding and all stored document embeddings. [digital_stylist/providers/vector_memory.py#40-55](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_memory.py#L40-L55)
- Fallback: This backend is automatically selected if `STYLIST_VECTOR_BACKEND` is set to `memory`. [digital_stylist/providers/factories.py#72-75](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L72-L75)

Sources:

- [digital_stylist/providers/vector_memory.py#1-70](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_memory.py#L1-L70)
- [digital_stylist/providers/factories.py#70-80](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L70-L80)

## Data Flow: From Catalog Feed to Vector Search

The following diagram illustrates how product data moves from a raw JSON feed into the vector database and is subsequently retrieved by the `CatalogAgent`.

### Catalog Indexing and Retrieval Flow

Sources:

- [catalog_feed/catalog_feed/pipeline.py#10-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L10-L45)
- [digital_stylist/providers/factories.py#65-85](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L65-L85)
- [digital_stylist/domains/catalog/rag.py#20-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/domains/catalog/rag.py#L20-L35)

## Provider Factory Resolution

The `build_vector_catalog` function in `digital_stylist/providers/factories.py` acts as the registry for these implementations. It inspects the `StylistSettings` to instantiate the correct class and injects the required embedding function.

### Vector Backend Resolution Logic

Backend TypeClass NameRequirements`chroma``ChromaVectorCatalog``CHROMA_PERSIST_DIR`, `Embeddings` provider`memory``MemoryVectorCatalog``Embeddings` provider

Sources:

- [digital_stylist/providers/factories.py#65-85](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/factories.py#L65-L85)
- [digital_stylist/config.py#105-115](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L105-L115)

## Document Structure

When products are stored in the catalog, they are transformed into `Document` objects. Each document contains:

1. Content: A text string containing the product name, description, and attributes (used for embedding). [catalog_feed/catalog_feed/documents.py#15-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L15-L20)
2. Metadata: A dictionary containing structured data such as `product_id`, `price`, `category`, and `image_url`. [catalog_feed/catalog_feed/documents.py#22-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L22-L30)
3. ID: A unique identifier, typically the product SKU or ID. [catalog_feed/catalog_feed/documents.py#12-13](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L12-L13)

Sources:

- [catalog_feed/catalog_feed/documents.py#10-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L10-L35)
- [digital_stylist/providers/protocols.py#8-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/protocols.py#L8-L15)