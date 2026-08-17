# dsh-mcp-management

Out-of-tree MCP connection management for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

See the [design spec](docs/superpowers/specs/2026-08-17-mcp-management-design.md) for architecture and scope.

**Do not edit `deepseek-harness`.** This repository ships an installable profile bundle only.

## Install

See [`packages/bundle/README.md`](packages/bundle/README.md) to install `@deepseek-ai/dsh-mcp-mgmt-bundle` in a DeepSeek Harness Web profile and run the manual smoke check.

## Development checkout layout

The workspace dependencies link to a sibling `deepseek-harness` checkout. The checked-in paths work from this worktree at `dsh-mcp-management/.worktrees/mcp-management` when both repositories are direct children of the same directory:

```text
workspace/
├── deepseek-harness/
└── dsh-mcp-management/
    └── .worktrees/mcp-management/
```

Run `pnpm install` from this worktree after arranging that layout.

## OAuth redirect URL

The manager uses the active local web server port to form the OAuth callback URL (`http://127.0.0.1:<port>/mcp-management/oauth/callback`). Set the manager plugin's `publicOrigin` configuration to override that base URL when the browser reaches the server through a different origin.
