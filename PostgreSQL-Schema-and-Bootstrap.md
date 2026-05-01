# PostgreSQL Schema and Bootstrap
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

This page documents the data persistence layer for the Digital Stylist system, focusing on the PostgreSQL implementation used for structured domain data (customers, associates, and appointments). It covers the SQL schema definition, row-level security (RLS) for multi-tenant isolation, the bootstrap CLI utility, and the suite of seeding scripts used to populate the environment.

## Overview of the Data Layer

The system uses PostgreSQL as the primary datastore for operational data that requires relational integrity and complex querying, distinct from the vector catalog (Chroma). The implementation emphasizes tenant isolation through Global User Configuration (GUC) variables and RLS policies.

### Core Tables

The schema is organized under the `stylist` namespace and includes the following primary tables:

TablePurpose`stylist.customers`Stores customer profiles, including contact info, loyalty status, and style preferences.`stylist.associates`Stores store associate/stylist data, including availability and assigned store.`stylist.appointments`Tracks bookings between customers and associates, including status and notes.`stylist.retail_calendar`Stores fiscal calendar mapping (weeks, periods, quarters) for time-aware analysis.

Sources: [digital_stylist/infra/postgres/schema.sql#1-120](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/schema.sql#L1-L120)

## Implementation: Schema and Security

The schema implementation leverages PostgreSQL Row-Level Security (RLS) to ensure that queries only access data belonging to the active tenant.

### Tenant Isolation via RLS

The system uses a custom GUC variable `app.current_tenant_id`. Every table includes a `tenant_id` column, and policies are applied to restrict `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations based on this variable.

Sources: [digital_stylist/infra/postgres/schema.sql#122-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/schema.sql#L122-L150)

## Infrastructure Management

### Bootstrap CLI

The `digital-stylist-pg-bootstrap` command (mapped to `digital_stylist/infra/postgres/bootstrap.py`) is the entry point for initializing the database. It performs the following:

1. Creates the `stylist` schema if it doesn't exist.
2. Executes the `schema.sql` script to define tables and RLS policies.
3. Optionally seeds initial tenant configuration.

### Connection and Session Management

The application manages database interactions through two primary modules:

- `connection.py`: Handles the creation of the SQLAlchemy `AsyncEngine`. It resolves connection strings from `STYLIST_PG_DSN` or constructs them from individual `STYLIST_PG_*` environment variables.
- `session.py`: Provides the `get_session` context manager, which ensures that every session begins by setting the `app.current_tenant_id` GUC to the tenant ID provided in the request context.

Sources: [digital_stylist/infra/postgres/connection.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/connection.py#L1-L40)[digital_stylist/infra/postgres/session.py#1-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/session.py#L1-L35)[.env.example#46-61](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L61)

## Seeding Scripts

To facilitate development and testing, the system provides specialized seeding scripts. These scripts populate the database with synthetic but realistic retail data.

ScriptFile PathDescription`seed_customers.py``digital_stylist/infra/postgres/seed_customers.py`Generates synthetic customer profiles with varied style personas.`seed_workforce.py``digital_stylist/infra/postgres/seed_workforce.py`Populates the `associates` table with staff members.`seed_stylist_data.py``digital_stylist/infra/postgres/seed_stylist_data.py`Creates appointment records and links customers to associates.`seed_retail_calendar.py``digital_stylist/infra/postgres/seed_retail_calendar.py`Populates the fiscal calendar for the current and surrounding years.

### Data Flow: Seeding to Runtime

The following diagram illustrates how code entities interact to move data from seed scripts into the live PostgreSQL instance.

Sources: [digital_stylist/infra/postgres/bootstrap.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/bootstrap.py#L1-L50)[digital_stylist/infra/postgres/seed_customers.py#1-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/seed_customers.py#L1-L30)[digital_stylist/infra/postgres/seed_workforce.py#1-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/infra/postgres/seed_workforce.py#L1-L30)

## Configuration Reference

The database behavior is controlled by several environment variables defined in `StylistSettings`.

- `STYLIST_PG_DATASTORE`: Can be set to `postgres` (default) or `memory`. If set to `memory`, the system bypasses PostgreSQL for certain local-only testing scenarios.
- `STYLIST_PG_DSN`: The full connection string (e.g., `postgresql://user:pass@host:port/db`).
- `STYLIST_SKIP_STYLIST_SEED`: If set to `1`, the bootstrap process will skip inserting default configuration data.

Sources: [.env.example#46-65](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L46-L65)