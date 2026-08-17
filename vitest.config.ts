import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: '@deepseek-ai/cordis', replacement: source('../../../deepseek-harness/vendor/cordis/src/index.ts') },
      { find: '@deepseek-ai/cosmokit', replacement: source('../../../deepseek-harness/vendor/cosmokit/src/index.ts') },
      { find: '@deepseek-ai/dsh-home-paths', replacement: source('../../../deepseek-harness/packages/util/home-paths/src/index.ts') },
      { find: '@deepseek-ai/dsh-mcp-mgmt-mcp/brand', replacement: source('./packages/mcp/src/brand.ts') },
      { find: '@deepseek-ai/dsh-mcp-mgmt-mcp/types', replacement: source('./packages/mcp/src/types.ts') },
      { find: '@deepseek-ai/dsh-mcp-mgmt-mcp', replacement: source('./packages/mcp/src/index.ts') },
      { find: '@deepseek-ai/dsh-mcp-mgmt-oauth', replacement: source('./packages/mcp-oauth/src/index.ts') },
      { find: '@deepseek-ai/schemastery', replacement: source('../../../deepseek-harness/vendor/schemastery/src/index.ts') },
    ],
  },
  test: {
    include: ['packages/*/tests/**/*.spec.ts'],
    passWithNoTests: true,
  },
})
