import { describe, expect, it } from 'vitest'
import { isOwnerHash, issueOwnerToken, ownerTokenHash } from './rooms.ownership.ts'

describe('room ownership', () => {
  it('issues a different 256-bit token, in base64url, every time', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => issueOwnerToken().token))

    expect(tokens.size).toBe(20)
    for (const token of tokens) expect(token).toMatch(/^[\w-]{43}$/)
  })

  it('recognises the token sent back as a bearer token', () => {
    const { token, hash } = issueOwnerToken()

    expect(isOwnerHash(hash, ownerTokenHash(`Bearer ${token}`))).toBe(true)
  })

  it('keeps only a hash, which does not contain the token', () => {
    const { token, hash } = issueOwnerToken()

    expect(hash).toHaveLength(32)
    expect(hash.toString('base64url')).not.toBe(token)
  })

  it('rejects the token of another room', () => {
    const mine = issueOwnerToken()
    const theirs = issueOwnerToken()

    expect(isOwnerHash(mine.hash, ownerTokenHash(`Bearer ${theirs.token}`))).toBe(false)
  })

  it('treats a room without a stored hash as owned by nobody', () => {
    const { token } = issueOwnerToken()

    expect(isOwnerHash(null, ownerTokenHash(`Bearer ${token}`))).toBe(false)
  })

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['the scheme alone', 'Bearer'],
    ['another scheme', `Basic ${'a'.repeat(43)}`],
    ['a token of the wrong length', `Bearer ${'a'.repeat(42)}`],
    ['a token with extra text after it', `Bearer ${'a'.repeat(43)} extra`],
  ])('finds no token in %s', (_case, header) => {
    expect(ownerTokenHash(header)).toBeNull()
  })
})
