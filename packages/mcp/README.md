# `@anht3889/dsh-mcp-mgmt-mcp`

`ctx.mcp` vocabulary: `McpRuntime`, server record/status types, and the `McpServerId` brand.

`McpRuntime` is an interface, not a cordis `Service` subclass. Profile plugins cannot resolve the installation's `@deepseek-ai/cordis` at runtime, so providers publish with `ctx.provide('mcp', runtime)` and every cordis import in this repository stays type-only. `mcpRuntimeOf(ctx)` reads the seam through `ctx.get`.
