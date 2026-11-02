import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { clientAddress, parseTrustedProxies } from './client-address.ts'

/** A handshake from `peer`, carrying `forwarded` as its X-Forwarded-For. */
function handshake(peer: string, forwarded?: string): IncomingMessage {
  const headers = forwarded === undefined ? {} : { 'x-forwarded-for': forwarded }
  return { socket: { remoteAddress: peer }, headers } as unknown as IncomingMessage
}

describe('parseTrustedProxies', () => {
  it('accepts IPv4 and IPv6 addresses and subnets, separated by commas', () => {
    const trusted = parseTrustedProxies('172.30.0.0/24, 10.0.0.1,fd00::/8')

    expect(trusted.check('172.30.0.7', 'ipv4')).toBe(true)
    expect(trusted.check('10.0.0.1', 'ipv4')).toBe(true)
    expect(trusted.check('fd00::1', 'ipv6')).toBe(true)
    expect(trusted.check('10.0.0.2', 'ipv4')).toBe(false)
  })

  it.each(['loopback', '10.0.0.0/33', '1.2.3', '10.0.0.0/8/1', '10.0.0.0/x', ''])(
    'refuses %j, which is not an address or a subnet',
    (value) => {
      expect(() => parseTrustedProxies(value)).toThrow(/not an IP address or subnet/)
    },
  )
})

describe('clientAddress', () => {
  const trusted = parseTrustedProxies('172.30.0.0/24')

  it('is the peer itself when no proxy is trusted, whatever the header says', () => {
    expect(clientAddress(handshake('203.0.113.9', '198.51.100.1'), null)).toBe('203.0.113.9')
  })

  it('is the forwarded address when a trusted proxy connects', () => {
    expect(clientAddress(handshake('172.30.0.2', '203.0.113.9'), trusted)).toBe('203.0.113.9')
  })

  it('skips the trusted hops and ignores what the client wrote before them', () => {
    const chain = '6.6.6.6, 203.0.113.9, 172.30.0.5'

    expect(clientAddress(handshake('172.30.0.2', chain), trusted)).toBe('203.0.113.9')
  })

  it('ignores the header when the peer is not a trusted proxy', () => {
    expect(clientAddress(handshake('203.0.113.9', '198.51.100.1'), trusted)).toBe('203.0.113.9')
  })

  it('falls back to the proxy when the forwarded entry is not an address', () => {
    expect(clientAddress(handshake('172.30.0.2', 'unknown'), trusted)).toBe('172.30.0.2')
  })

  it('counts IPv4-mapped IPv6 as IPv4, and a whole IPv6 /64 as one client', () => {
    expect(clientAddress(handshake('::ffff:203.0.113.9'), null)).toBe('203.0.113.9')
    expect(clientAddress(handshake('2001:db8:1:2:3:4:5:6'), null)).toBe('2001:db8:1:2::')
  })
})
