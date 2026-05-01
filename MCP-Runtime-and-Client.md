# MCP Runtime and Client
Relevant source files

- [.env.example](https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example)

The Model Context Protocol (MCP) subsystem in Digital Stylist provides a standardized interface for agents to interact with external data sources and services, such as customer records, appointment scheduling, and email queues. The runtime manages the lifecycle of MCP connections, tool discovery, and execution across different transport layers.

## Overview

The `McpRuntime` acts as a centralized manager that abstracts the complexities of connecting to multiple MCP servers. It supports two primary transport modes:

1. Stdio: Spawns local Python subprocesses for MCP servers.
2. Streamable HTTP: Connects to remote MCP servers via Server-Sent Events (SSE) and HTTP POST.

The runtime handles connection pooling, tool metadata caching, and provides a unified `invoke()` method for executing tools requested by LLM-based agents.

## McpRuntime Implementation

The `McpRuntime` class is the primary entity responsible for maintaining active sessions with MCP servers and exposing their capabilities to the LangGraph agents.

### Key Components

ComponentDescriptionConnection ManagementManages `ClientSession` objects for both stdio and HTTP transports.Tool CachingCaches discovered tools in `_tools_cache` to avoid redundant list requests.ExecutionHandles the routing of tool calls to the correct server and returns structured results.

### Data Flow: Tool Invocation

The following diagram illustrates how an agent's request for a tool (e.g., `get_customer_details`) flows through the `McpRuntime` to an external server.

MCP Tool Invocation Flow

Sources: `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L35-L180" min=35 max=180 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`

## Connection Configuration

The runtime is initialized via `build_mcp_runtime()`, which evaluates environment variables to determine which servers to connect to and which transport protocols to use.

### Environment Variables

- `STYLIST_MCP_ENABLED`: Master toggle for the MCP subsystem. If `false`, `build_mcp_runtime()` returns `None`. `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L44-L44" min=44  file-path=".env.example">Hii</FileRef>`, `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L228-L230" min=228 max=230 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`
- `STYLIST_MCP_REMOTE_URL`: The base URL for remote MCP services (e.g., `http://mcp-service:8080`). `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L241-L241" min=241  file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`
- `STYLIST_MCP_REMOTE_PATH`: The endpoint path on the remote server, typically `/mcp`. `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L242-L242" min=242  file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`

### build_mcp_connections()

This function iterates through defined server configurations and instantiates the appropriate client.

- HTTP Mode: If `STYLIST_MCP_REMOTE_URL` is provided, it uses `sse_client` to establish a streamable HTTP connection. `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L202-L212" min=202 max=212 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`
- Stdio Mode: Otherwise, it defaults to spawning local processes using `stdio_client`. It specifically targets server modules within `digital_stylist.mcp_servers.main`. `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L186-L198" min=186 max=198 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`

Sources: `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L182-L225" min=182 max=225 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`

## Core Functions and Methods

### tools_for()

Retrieves a list of available tools for a specific agent. The runtime filters tools based on the agent's domain (e.g., `customer`, `appointment`, `email`, `associate`).

- Caching: It checks `self._tools_cache` before querying the remote server. `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L113-L115" min=113 max=115 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`
- Conversion: Converts MCP tool definitions into a format compatible with LangChain/LangGraph agents. `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L133-L145" min=133 max=145 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`

### invoke()

Executes a specific tool by name.

- Logging: Records `mcp_client_call_start` and `mcp_client_call_end` events for observability. `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L80-L106" min=80 max=106 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`
- Error Handling: Catches execution exceptions and returns them as part of the tool result to prevent the entire graph from crashing. `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L97-L101" min=97 max=101 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`

### build_mcp_runtime()

The factory function used by the `AgentRunContext` to initialize the MCP layer. It ensures that if MCP is disabled, the system gracefully proceeds without tool-calling capabilities.
`<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L228-L250" min=228 max=250 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`

## System Mapping: Code to Runtime

The following diagram bridges the configuration variables to the internal Python classes and transport mechanisms.

MCP Runtime Configuration Mapping

Sources: `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L35-L250" min=35 max=250 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`, `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/.env.example#L43-L44" min=43 max=44 file-path=".env.example">Hii</FileRef>`

## Summary of Transport Logic

FeatureStdio TransportHTTP (SSE) TransportUse CaseLocal development / MonolithicRemote microservices / ScalingCommand`python -m digital_stylist.mcp_servers.main``POST` to `REMOTE_URL`LifecycleManaged subprocessManaged HTTP sessionSource`<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L192-L198" min=192 max=198 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>``<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L202-L212" min=202 max=212 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`

Sources: `<FileRef file-url="https://github.com/domap/digital-stylist/blob/c8fd6fe5/digital_stylist/mcp/runtime.py#L1-L250" min=1 max=250 file-path="digital_stylist/mcp/runtime.py">Hii</FileRef>`