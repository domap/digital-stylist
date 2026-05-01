# MCP (Model Context Protocol)
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Model Context Protocol (MCP) subsystem provides a standardized interface for agents within the Digital Stylist ecosystem to interact with external data sources and business logic. It acts as the bridge between the reasoning capabilities of the LLM agents and the concrete data stored in PostgreSQL, such as customer profiles, appointment schedules, and associate records.

The system supports two primary operational modes: a high-performance stdio subprocess mode for local execution and a remote streamable HTTP mode for distributed deployments.

### System Overview

The MCP implementation is divided into a client-side runtime that lives within the Python worker and a set of server-side handlers that implement the specific tool logic.

- Tools Provided: The protocol exposes tools for managing customers, appointments, email drafting, and associate (stylist) information.
- Agent Integration: Agents in the `digital_stylist/domains/` directory use these tools to perform actions like "lookup customer history" or "draft a follow-up email."
- Transport Flexibility: The system can spawn MCP servers as local subprocesses or connect to a dedicated MCP service via HTTP.

#### Tool-to-Code Mapping

The following diagram illustrates how natural language tool requests from agents map to specific code entities within the MCP handlers.

Diagram: MCP Tool Mapping

Sources: [digital_stylist/mcp_servers/handlers/customer.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/customer.py#L1-L50)[digital_stylist/mcp_servers/handlers/appointment.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/appointment.py#L1-L50)[digital_stylist/mcp_servers/handlers/email.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/email.py#L1-L50)[digital_stylist/mcp_servers/handlers/associate.py#1-50](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/handlers/associate.py#L1-L50)

---

### Configuration and Activation

MCP is enabled by default but can be toggled via environment variables. This is useful for "locked-down" deployments where external tool execution is restricted.

VariableDescriptionDefault`STYLIST_MCP_ENABLED`Global toggle for the MCP subsystem.`true``STYLIST_MCP_REMOTE_URL`The base URL for the remote MCP service.`None``STYLIST_MCP_REMOTE_PATH`The endpoint path on the remote service (e.g., `/mcp`).`/mcp`

If `STYLIST_MCP_REMOTE_URL` is unset, the system defaults to stdio mode, attempting to run the MCP server as a subprocess using the current Python interpreter.

Sources: [.env.example#43-44](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L43-L44)[digital_stylist/config.py#120-135](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/config.py#L120-L135)

---

### MCP Architecture

The architecture separates the Runtime (how agents call tools) from the Servers (how tools are executed).

Diagram: MCP Communication Flow

Sources: [digital_stylist/mcp/runtime.py#100-150](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L100-L150)[digital_stylist/mcp_servers/main.py#1-30](https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp_servers/main.py#L1-L30)

#### MCP Runtime and Client

The `McpRuntime` class manages the lifecycle of connections. It handles the initialization handshake, tool discovery, and result caching. It is responsible for translating the generic agent tool calls into the JSON-RPC format required by the protocol.

For details, see [MCP Runtime and Client](#5.1).

#### MCP Servers and Handlers

The server-side consists of a FastAPI-based wrapper (when running in HTTP mode) and domain-specific handlers. These handlers interact directly with the `PostgresDatastore` to perform CRUD operations on business entities.

For details, see [MCP Servers and Handlers](#5.2).

---

### Child Pages

- [MCP Runtime and Client](#5.1): Deep dive into `digital_stylist/mcp/runtime.py`, the `McpRuntime` class, connection building logic, and the `tools_for()` caching mechanism.
- [MCP Servers and Handlers](#5.2): Coverage of the `mcp_servers/` directory, including the standalone HTTP service and the implementation of customer, appointment, and email logic.