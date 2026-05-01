# MCP Servers and Handlers
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Model Context Protocol (MCP) subsystem provides the Digital Stylist agents with a standardized interface to interact with external data sources and business logic. While the `McpRuntime` (covered in Section 5.1) acts as the client within the LangGraph agents, the MCP Server acts as the provider, exposing domain-specific tools for customer profiles, appointments, emails, and workforce management.

The system is designed to run as a standalone HTTP service that the Python worker connects to via a streamable-HTTP transport.

## MCP Service Architecture

The MCP server is a FastAPI-based application located in `digital_stylist/mcp_servers/`. It aggregates multiple domain handlers into a single MCP server instance and exposes them over an SSE (Server-Sent Events) transport.

### Key Components

- `main.py`: The entry point for the standalone service. It configures the FastAPI application, sets up logging, and defines the `/mcp` endpoint for tool discovery and invocation [digital_stylist/mcp_servers/main.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/main.py#L1-L40)
- `build_mcp.py`: Responsible for initializing the `mcp.server.Server` instance and registering all domain handlers [digital_stylist/mcp_servers/build_mcp.py#1-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/build_mcp.py#L1-L35)
- Domain Handlers: Modular logic blocks located in `digital_stylist/mcp_servers/handlers/` that define specific tools (e.g., `get_customer_by_id`, `create_appointment`).

### Network Configuration

The service is controlled by two primary environment variables:

- `STYLIST_MCP_SERVICE_HOST`: The host interface to bind to (default: `0.0.0.0`) [.env.example#30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L30-L30)
- `STYLIST_MCP_SERVICE_PORT`: The port for the HTTP service (default: `8787`) [.env.example#31](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L31-L31)

### Request Data Flow

The following diagram illustrates how a tool call flows from the LangGraph agent through the MCP runtime to the standalone MCP server and its handlers.

Figure 1: MCP Tool Invocation Flow

Sources:[digital_stylist/mcp/runtime.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L1-L50)[digital_stylist/mcp_servers/main.py#10-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/main.py#L10-L30)[digital_stylist/mcp_servers/handlers/customer.py#5-25](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/customer.py#L5-L25)

## Domain Handlers

The server logic is partitioned into four domain handlers. Each handler registers specific tools with the MCP `Server` object.

### 1. Customer Handler (`handlers/customer.py`)

Provides tools for retrieving customer profiles, preferences, and purchase history.

- Key Tools: `get_customer_by_id`, `search_customers_by_email`.
- Data Source: Reads from the `stylist.customers` table in PostgreSQL.
- Sources: [digital_stylist/mcp_servers/handlers/customer.py#1-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/customer.py#L1-L40)

### 2. Appointment Handler (`handlers/appointment.py`)

Manages the lifecycle of styling appointments and fitting room reservations.

- Key Tools: `create_appointment`, `get_appointments_for_customer`, `update_appointment_status`.
- Data Source: Interacts with `stylist.appointments`.
- Sources: [digital_stylist/mcp_servers/handlers/appointment.py#1-45](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/appointment.py#L1-L45)

### 3. Email Handler (`handlers/email.py`)

Handles the drafting and queuing of outbound communications to customers.

- Key Tools: `queue_email_draft`, `get_email_status`.
- Note: In this implementation, the handler typically writes a draft to a queue table for a separate worker to process.
- Sources: [digital_stylist/mcp_servers/handlers/email.py#1-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/email.py#L1-L30)

### 4. Associate Handler (`handlers/associate.py`)

Provides context about the store associates (stylists) currently available to assist.

- Key Tools: `get_associate_by_id`, `list_available_associates`.
- Data Source: Reads from `stylist.associates`.
- Sources: [digital_stylist/mcp_servers/handlers/associate.py#1-35](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/associate.py#L1-L35)

## Implementation Detail: `build_mcp_server`

The `build_mcp_server` function in `build_mcp.py` is the central assembly point. It instantiates the `mcp.server.Server` and iterates through the handler modules to register their respective functions as tools.

Figure 2: MCP Server Initialization Map

Sources:[digital_stylist/mcp_servers/build_mcp.py#10-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/build_mcp.py#L10-L30)[digital_stylist/mcp_servers/main.py#5-15](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/main.py#L5-L15)

## HTTP Endpoint: `/mcp`

The MCP service exposes a single primary endpoint: `POST /mcp`. This endpoint implements the MCP Streamable-HTTP transport protocol.

1. Connection Establishment: The client (Python Worker) initiates a connection to `/mcp`.
2. SSE Stream: The server responds with a `text/event-stream`, establishing a long-lived connection for bi-directional communication over HTTP.
3. Tool Discovery: Upon connection, the server sends a list of available tools (metadata, input schemas) to the client.
4. Execution: When the client sends a `CallToolRequest`, the server routes it to the correct function in the domain handlers and streams the result back.

Sources:[digital_stylist/mcp_servers/main.py#20-40](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/main.py#L20-L40)[digital_stylist/mcp/runtime.py#80-110](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L80-L110)

## Configuration Summary

VariableDescriptionDefault`STYLIST_MCP_ENABLED`Enables/Disables the MCP subsystem`true``STYLIST_MCP_REMOTE_URL`URL of the standalone MCP service`http://localhost:8787/mcp``STYLIST_PG_DATASTORE`Backend for handlers (`auto` or `memory`)`auto`

Sources:[.env.example#43-60](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L43-L60)[digital_stylist/config.py#100-120](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L100-L120)