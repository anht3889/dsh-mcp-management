import tls from 'node:tls'
import { describe, expect, it } from 'vitest'
import { trustSystemCertificates } from '../../src/manager/trust.ts'

describe('trustSystemCertificates', () => {
  it('trusts the bundled and host authorities together, then restores the bundled ones', () => {
    const bundled = comparable(tls.getCACertificates('default'))
    const host = comparable(tls.getCACertificates('system'))

    const restore = trustSystemCertificates()
    const trusted = comparable(tls.getCACertificates('default'))

    // Asserting containment rather than a count keeps the expectation true on a
    // host whose own store repeats the bundled authorities.
    expect(bundled.filter((certificate) => !trusted.includes(certificate))).toEqual([])
    expect(host.filter((certificate) => !trusted.includes(certificate))).toEqual([])

    restore()

    expect(comparable(tls.getCACertificates('default'))).toEqual(bundled)
  })
})

/** Orders authorities and drops the PEM line wrapping Node redoes when it stores them. */
function comparable(certificates: string[]): string[] {
  return certificates.map((certificate) => certificate.replaceAll(/\s+/g, '')).sort()
}
