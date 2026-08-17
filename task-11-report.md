# Task 11 report

Added `@deepseek-ai/dsh-mcp-mgmt-bundle` with a profile patch that mounts the MCP manager and the dual-face Settings UI plugin.
The MCP service stub is not mounted separately because the manager provides the concrete `ctx.mcp` runtime; `mcp-oauth` remains a runtime dependency consumed by the manager.

Updated install and coexistence guidance, including the warning not to mount `@deepseek-ai/dsh-mcp-client` for the same `serverName`s, and added the requested manual Web smoke checklist.
Added a short package README for the Settings UI plugin.

Verified with `pnpm install --lockfile-only` and a Node assertion that checks the bundle manifest and intended patch rows.
