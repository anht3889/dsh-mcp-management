import { defineConfig } from 'vitest/config'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/**
 * Harness client sources imported by tests carry bare imports that resolve
 * against the harness tree, which a source-only sibling checkout does not
 * install. Pinning them to this workspace's copies also keeps React a single
 * instance, without which hooks in harness components throw.
 */
const installed = createRequire(source('./packages/bundle/package.json'))

export default defineConfig({
  resolve: {
    alias: [
      { find: '@deepseek-ai/cordis', replacement: source('../deepseek-harness/vendor/cordis/src/index.ts') },
      { find: '@deepseek-ai/cosmokit', replacement: source('../deepseek-harness/vendor/cosmokit/src/index.ts') },
      { find: '@deepseek-ai/dsh-home-paths', replacement: source('../deepseek-harness/packages/util/home-paths/src/index.ts') },
      // The web shell shares this package through its frozen module table, so
      // the bundle imports it as an external and nothing installs it here.
      { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: source('./packages/bundle/tests/support/ui-primitives.ts') },
      { find: /^clsx$/, replacement: installed.resolve('clsx') },
      { find: /^react$/, replacement: installed.resolve('react') },
      { find: /^react\/jsx-runtime$/, replacement: installed.resolve('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: installed.resolve('react/jsx-dev-runtime') },
      { find: /^react-dom$/, replacement: installed.resolve('react-dom') },
      { find: /^react-dom\/client$/, replacement: installed.resolve('react-dom/client') },
      { find: '@anht3889/dsh-mcp-mgmt-mcp/brand', replacement: source('./packages/mcp/src/brand.ts') },
      { find: '@anht3889/dsh-mcp-mgmt-mcp/types', replacement: source('./packages/mcp/src/types.ts') },
      { find: '@anht3889/dsh-mcp-mgmt-mcp', replacement: source('./packages/mcp/src/index.ts') },
      { find: '@anht3889/dsh-mcp-mgmt-oauth', replacement: source('./packages/mcp-oauth/src/index.ts') },
      { find: '@deepseek-ai/schemastery', replacement: source('../deepseek-harness/vendor/schemastery/src/index.ts') },
    ],
  },
  test: {
    include: ['packages/*/tests/**/*.spec.ts'],
    passWithNoTests: true,
  },
})
