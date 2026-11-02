import type { IncomingMessage } from 'node:http'
import { BlockList, isIP } from 'node:net'
import { normalizeIP } from '@fastify/rate-limit'

/**
 * The proxies listed in TRUST_PROXY: comma-separated IP addresses and subnets, such as
 * `172.30.0.0/24`. Throws on any other entry.
 */
export function parseTrustedProxies(value: string): BlockList {
  const trusted = new BlockList()
  for (const entry of value.split(',').map((part) => part.trim())) {
    const [address = '', prefix, ...rest] = entry.split('/')
    const family = isIP(address)
    const type = family === 4 ? 'ipv4' : 'ipv6'
    const maxPrefix = family === 4 ? 32 : 128
    if (family === 0 || rest.length > 0) throw notAnAddress(entry)
    if (prefix === undefined) {
      trusted.addAddress(address, type)
    } else if (/^\d{1,3}$/.test(prefix) && Number(prefix) <= maxPrefix) {
      trusted.addSubnet(address, Number(prefix), type)
    } else {
      throw notAnAddress(entry)
    }
  }
  return trusted
}

function notAnAddress(entry: string): Error {
  return new Error(`"${entry}" is not an IP address or subnet`)
}

/** Whether `address` belongs to one of the trusted proxies. IPv4-mapped IPv6 counts as IPv4. */
export function isTrustedProxy(trusted: BlockList, address: string): boolean {
  const family = isIP(address)
  return family !== 0 && trusted.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

/**
 * The address a WebSocket handshake comes from, counted the way the HTTP rate limits count it.
 * Behind trusted proxies, that's the nearest X-Forwarded-For entry they didn't add; anything
 * further left came from the client, who can write what they like there. From anyone else, the
 * header is ignored.
 */
export function clientAddress(request: IncomingMessage, trusted: BlockList | null): string {
  const peer = request.socket.remoteAddress ?? ''
  if (!trusted || !isTrustedProxy(trusted, peer)) return normalizeIP(peer)

  const hops = String(request.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((hop) => hop.trim())
  for (const hop of hops.reverse()) {
    if (isTrustedProxy(trusted, hop)) continue
    // Not an address at all: count the proxy itself, rather than a name the client chose.
    return normalizeIP(isIP(hop) === 0 ? peer : hop)
  }
  return normalizeIP(peer)
}
