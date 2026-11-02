/**
 * A random v4 UUID, used as a message's idempotency key. Browsers offer crypto.randomUUID only
 * on secure origins (HTTPS or localhost), so on a plain-HTTP address, such as the app opened
 * from another machine on the network, the UUID is built from random bytes instead.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  // RFC 9562: the 13th hex digit holds the version (4), and the 17th starts with the variant
  // bits (binary 10).
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20),
  ].join('-')
}
