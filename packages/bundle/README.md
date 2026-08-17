# `@deepseek-ai/dsh-mcp-mgmt-bundle`

Profile patch bundle for MCP connection management in DeepSeek Harness Web Settings.
It mounts the MCP manager host plugin and the Settings UI plugin.
The manager provides the concrete `ctx.mcp` runtime, so the bundle does not mount the MCP service stub separately.

## Install

Make this bundle available to the machine running `dsh` (for example, link this checkout or install an npm pack), then add it to the Web profile:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-mcp-mgmt-bundle
```

Alternatively, add `@deepseek-ai/dsh-mcp-mgmt-bundle` to the profile's `package.json` dependencies and append it to `dsh.profile.bundles`.
Restart the Web profile after installation.

Do not mount `@deepseek-ai/dsh-mcp-client` rows for the same `serverName`s managed by this bundle.
Both implementations register MCP tools, so sharing a server name can create conflicting tool registrations.

## Manual smoke check

1. Start the Web profile with this bundle and linked runtime packages available.
2. Open **Settings → MCP**.
3. Add and enable a stdio fixture server.
4. Confirm its tools appear in an agent turn as `mcp__<serverName>__<toolName>`.
5. If an OAuth identity provider is available, add an HTTP server and complete authorization; otherwise, skip this optional check.
