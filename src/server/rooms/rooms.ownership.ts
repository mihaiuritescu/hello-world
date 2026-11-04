import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { OwnerTokenSchema } from '#shared/schemas.ts'

// Users have no accounts, so a room's creator is whoever holds the token its creation returned.
// The database keeps only the token's SHA-256: a leaked copy of it can't be used to change rooms.
// The token is 256 random bits, so a plain hash is enough: there is no password to guess.

/** A new owner token, for the creator, and its hash, for the database. */
export function issueOwnerToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashOf(token) }
}

/**
 * The hash of the owner token in an `Authorization: Bearer <token>` header, or null when the
 * header is missing or holds anything else.
 */
export function ownerTokenHash(authorization: string | undefined): Buffer | null {
  const token = /^Bearer (\S+)$/i.exec(authorization ?? '')?.[1]
  return OwnerTokenSchema.safeParse(token).success && token ? hashOf(token) : null
}

/**
 * Whether `given` is the stored hash, compared in constant time. A room without a stored hash,
 * made before rooms had owners, belongs to nobody.
 */
export function isOwnerHash(stored: Buffer | null, given: Buffer | null): boolean {
  if (stored === null || given === null || stored.length !== given.length) return false
  return timingSafeEqual(stored, given)
}

function hashOf(token: string): Buffer {
  return createHash('sha256').update(token).digest()
}
