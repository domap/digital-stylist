# Overview
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)
- [.gitignore](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.gitignore)

Digital Stylist is an AI-powered retail assistance platform that bridges natural language customer interactions with structured retail data. It utilizes a multi-tier architecture to provide high-fidelity styling advice, catalog search, appointment booking, and customer insights through a unified agentic pipeline.

The system is designed to serve two primary audiences:

1. Customers: Via the Connect application, offering personalized styling and itinerary planning.
2. Store Associates: Via the Clienteling application, providing AI-augmented tools to manage customer relationships and tasks.

## High-Level Architecture

The platform follows a "Gateway-Worker" pattern. An Express.js gateway handles security, rate limiting, and request orchestration, while a Python-based FastAPI worker executes the core AI logic using LangGraph.

### System Topology Diagram

The following diagram illustrates the flow from the client applications through the orchestration layers to the specialized AI agents.

Digital Stylist Request Flow

Sources:

- `orchestration/src/server.mjs`[1-73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/1-73)
- `digital_stylist/worker_app.py`[29-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/29-35)
- `digital_stylist/graph.py`[1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/1-10)
- `.env.example`[66-73](https://github.com/domap/digital-stylist/blob/c8fd6fe5/66-73)

---

## Key Subsystems

### 1. Express Orchestration Gateway

The gateway serves as the public-facing entry point. It manages CORS [69](https://github.com/domap/digital-stylist/blob/c8fd6fe5/69) request timeouts [72](https://github.com/domap/digital-stylist/blob/c8fd6fe5/72) and proxies requests to the internal Python worker. It is responsible for aggregating health status from downstream services and ensuring secure communication between the frontend apps and the AI worker.

For details, see [Express Orchestration Gateway](#2.1).

### 2. Python Worker & LangGraph

The Python worker is a FastAPI application that hosts the `StateGraph`[digital_stylist/graph.py](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/graph.py) When a request arrives at the `/v1/invoke` endpoint, the worker triggers a multi-agent workflow where specialized agents (e.g., `StylistAgent`, `CatalogAgent`) collaborate by updating a shared `StylistState` object.

For details, see [Python Worker (FastAPI)](#2.2) and [LangGraph Multi-Agent Pipeline](#2.3).

### 3. Domain Agents

The intelligence of the system is partitioned into domain-specific agents located in `digital_stylist/domains/`.

- Intent Agent: Classifies the user's request (e.g., styling, support, or booking).
- Catalog Agent: Performs RAG (Retrieval-Augmented Generation) against the product catalog.
- Stylist Agent: Generates personalized fashion advice and outfit recommendations.

For details, see [Domain Agents](#3).

### 4. Data Layer & MCP

Persistence is split between two primary backends:

- PostgreSQL: Stores relational data such as customers, appointments, and associate workforces [46-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/46-60)
- ChromaDB: A vector database used for semantic search across the product catalog [25-27](https://github.com/domap/digital-stylist/blob/c8fd6fe5/25-27)
- MCP (Model Context Protocol): A standardized interface used by agents to interact with external tools and data sources like the customer database or email queues.

For details, see [Data Layer](#6) and [MCP (Model Context Protocol)](#5).

---

## Code Entity Mapping

This diagram bridges the conceptual "Styling Workflow" to the specific code entities that implement them.

Agentic State Transitions

Sources:

- `digital_stylist/contracts/state.py`[1-20](https://github.com/domap/digital-stylist/blob/c8fd6fe5/1-20)
- `digital_stylist/domains/intent/routing.py`[1-10](https://github.com/domap/digital-stylist/blob/c8fd6fe5/1-10)
- `digital_stylist/graph.py`[1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/1-50)

---

## Getting Started & Structure

To begin working with the codebase, refer to the following child pages:

- [Getting Started](#1.1): Explains how to set up your `.env` file, initialize the PostgreSQL schema, and index the product catalog.
- [Repository Structure](#1.2): Provides a detailed walkthrough of the monorepo layout, including the `apps/` and `digital_stylist/` directories.

Sources:

- `.env.example`[1-78](https://github.com/domap/digital-stylist/blob/c8fd6fe5/1-78)
- `.gitignore`[1-13](https://github.com/domap/digital-stylist/blob/c8fd6fe5/1-13)