# Catalog Feed and Chroma Indexing
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)
- [.gitignore](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore)

The Catalog Feed subsystem is a standalone Python package located in `catalog_feed/` that handles the ingestion, transformation, and indexing of product data into the Chroma vector database. This pipeline converts raw product JSON data into high-dimensional embeddings, enabling the `CatalogAgent` to perform semantic retrieval during styling sessions.

## Overview of the Indexing Pipeline

The indexing process is orchestrated by the `run_catalog_feed()` function in `catalog_feed/catalog_feed/pipeline.py`[catalog_feed/catalog_feed/pipeline.py#34-87](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L34-L87) It follows a linear ETL (Extract, Transform, Load) pattern:

1. Extraction: Reads a JSON catalog file containing product definitions.
2. Transformation: Converts `CatalogProduct` models into `Document` objects formatted for vector search.
3. Loading: Indexes these documents into a Chroma collection, optionally replacing the existing collection.

### System Data Flow

The following diagram illustrates how raw product data moves from the filesystem into the Chroma vector space used by the Stylist agents.

Data Flow: Catalog JSON to Chroma Index

Sources:[catalog_feed/catalog_feed/cli.py#7-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/cli.py#L7-L40)[catalog_feed/catalog_feed/pipeline.py#34-87](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L34-L87)[catalog_feed/catalog_feed/documents.py#10-54](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L10-L54)

---

## Data Models and Conversion

### CatalogProduct Model

The `CatalogProduct` class in `catalog_feed/catalog_feed/models.py`[catalog_feed/catalog_feed/models.py#6-24](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/models.py#L6-L24) defines the schema for incoming product data. Key fields include:

- `id`: Unique identifier for the product.
- `name`: Display name.
- `description`: Textual description used for embedding.
- `price`: Numeric value.
- `categories`: List of strings (e.g., "Apparel", "Shoes").
- `attributes`: A dictionary of metadata (e.g., color, material).
- `image_url`: Link to the product asset.

### Document Conversion

The `ProductConverter` in `catalog_feed/catalog_feed/documents.py`[catalog_feed/catalog_feed/documents.py#10-54](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L10-L54) is responsible for turning a `CatalogProduct` into a format suitable for the `VectorCatalog`.

It generates a "page content" string by concatenating the name, categories, and description [catalog_feed/catalog_feed/documents.py#43-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L43-L45) This string is what the embedding model processes. All other fields are stored as metadata, allowing the `CatalogAgent` to filter results by price or category during retrieval.

Sources:[catalog_feed/catalog_feed/models.py#6-24](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/models.py#L6-L24)[catalog_feed/catalog_feed/documents.py#10-54](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L10-L54)

---

## The Indexing Pipeline (`pipeline.py`)

The `run_catalog_feed` function manages the connection to the vector store and the batching of documents.

FeatureImplementation DetailCollection ManagementUses `replace_collection=True` by default to wipe and rebuild the index [catalog_feed/catalog_feed/pipeline.py#38](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L38-L38)Embedding ProviderResolves the embedding model via `build_embeddings()` from the core provider factory [catalog_feed/catalog_feed/pipeline.py#53](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L53-L53)Backend ResolutionChecks `STYLIST_VECTOR_BACKEND`. If set to `chroma`, it initializes `ChromaVectorCatalog`[catalog_feed/catalog_feed/pipeline.py#56-62](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L56-L62)PersistenceData is saved to the directory specified by `CHROMA_PERSIST_DIR`[catalog_feed/catalog_feed/pipeline.py#61](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L61-L61)

### Natural Language to Vector Space Mapping

This diagram shows how code entities bridge the gap between human-readable product descriptions and the mathematical vector space.

Mapping: Code Entities to Vector Space

Sources:[catalog_feed/catalog_feed/documents.py#40-54](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L40-L54)[digital_stylist/providers/vector_chroma.py#15-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/providers/vector_chroma.py#L15-L40)[catalog_feed/catalog_feed/pipeline.py#53-75](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/pipeline.py#L53-L75)

---

## CLI Entry Point

The system provides a CLI command `digital-stylist-catalog-feed` defined in `catalog_feed/catalog_feed/cli.py`[catalog_feed/catalog_feed/cli.py#7-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/cli.py#L7-L40)

### Usage

To index a catalog, run:

```
digital-stylist-catalog-feed --path ./catalog.json --replace
```

### Arguments

- `--path`: Path to the JSON file containing an array of products [catalog_feed/catalog_feed/cli.py#11](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/cli.py#L11-L11)
- `--replace`: Boolean flag. If true, deletes the existing Chroma collection before indexing [catalog_feed/catalog_feed/cli.py#17](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/cli.py#L17-L17)
- `--collection`: (Optional) The name of the Chroma collection to target. Defaults to the value in `STYLIST_SETTINGS`[catalog_feed/catalog_feed/cli.py#14](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/cli.py#L14-L14)

Sources:[catalog_feed/catalog_feed/cli.py#7-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/cli.py#L7-L40)[.env.example#25-27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L25-L27)

---

## Asset Management

Product images and static assets are managed in the `catalog_feed/assets/` directory. While the vector database stores the `image_url` metadata, the actual serving of these assets is typically handled by the Python worker's auxiliary routes [digital_stylist/stylist/router.py](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/stylist/router.py)

When the `CatalogAgent` retrieves a product, it returns the `image_url` to the frontend (Clienteling or Connect apps), which then renders the product card using the metadata indexed during this feed process.

Sources:[catalog_feed/catalog_feed/models.py#16](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/models.py#L16-L16)[catalog_feed/catalog_feed/documents.py#52](https://github.com/domap/digital-stylist/blob/c8fd6fe5/catalog_feed/catalog_feed/documents.py#L52-L52)