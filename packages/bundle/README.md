# `@deepseek-ai/dsh-mcp-mgmt-bundle`

Installable profile bundle for MCP connection management.
It ships the cordis patch, the host manager plugin (`./manager`), and the Settings → MCP UI (`./client`).

```sh
pnpm install && pnpm run build
npx @deepseek-ai/dsh plugin --profile web add ./packages/bundle
```

Install, storage, and OAuth rules live in the [repository README](../../README.md).
