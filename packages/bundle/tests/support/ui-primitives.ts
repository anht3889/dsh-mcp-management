/**
 * Test resolution for `@deepseek-ai/dsh-client-ui-primitives`, aliased here by
 * the Vitest config. The web shell shares that package through its frozen
 * module table, so the published bundle imports it as an external and never
 * resolves it from this workspace. Its barrel additionally reaches markdown and
 * syntax-highlighting dependencies this workspace does not install, so tests
 * take the two atoms the MCP section uses straight from harness source.
 * @module tests/support/ui-primitives
 */

export { Button } from '../../../../../deepseek-harness/packages/client/ui-primitives/src/Button.tsx'
export { Modal } from '../../../../../deepseek-harness/packages/client/ui-primitives/src/Modal.tsx'
