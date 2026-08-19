/**
 * Extends the process TLS trust store with the host's own authorities.
 * @module @anht3889/dsh-mcp-mgmt-bundle/manager/trust
 */

import tls from 'node:tls'

/**
 * Adds the operating system's certificate authorities to the default TLS trust
 * store, so an MCP server behind a private CA verifies without the
 * `--use-system-ca` launch flag. Node otherwise trusts only its bundled
 * authorities and rejects such a server with `SELF_SIGNED_CERT_IN_CHAIN`.
 *
 * The trust store is process-global: this affects every TLS client in the host,
 * not only MCP connections.
 *
 * @returns A restore for the trust store this call replaced.
 * @throws {Error} When the running Node build cannot read or replace the
 *   default trust store, because silently keeping the bundled authorities would
 *   leave the operator with the failure they asked to fix.
 */
export function trustSystemCertificates(): () => void {
  if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') {
    throw new Error(
      `mcp-manager: trustSystemCertificates needs a Node build exposing tls.setDefaultCACertificates, but ${process.version} does not. Launch with NODE_OPTIONS=--use-system-ca instead.`,
    )
  }
  const bundled = tls.getCACertificates('default')
  tls.setDefaultCACertificates([...bundled, ...tls.getCACertificates('system')])
  return () => { tls.setDefaultCACertificates(bundled) }
}
