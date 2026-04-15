"""
Bounded contexts — one deployable unit per subdirectory.

Each domain owns prompts, agent logic, and (where applicable) a thin stdio MCP shim.
Run standalone, for example:

- ``python -m digital_stylist.domains.customer``
- ``python -m digital_stylist.domains.customer.mcp_server`` (stdio MCP; tools live in ``mcp_servers``)
- ``digital-stylist-mcp-service`` — combined HTTP MCP (set ``STYLIST_MCP_REMOTE_URL`` on the worker)
- ``python -m digital_stylist.domains.catalog``
- … likewise for ``intent``, ``stylist``, ``appointment``, ``associate``, ``email``, ``support``

Domains do not import each other; they share only ``contracts`` (wire schema), ``framework``
(five-block base), and infrastructure (``config``, ``providers``, ``mcp.runtime``).
"""
