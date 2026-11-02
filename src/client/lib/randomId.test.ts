import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomId } from './randomId.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a new v4 UUID on every call', () => {
    const first = randomId()
    const second = randomId()

    expect(first).toMatch(UUID_V4)
    expect(second).toMatch(UUID_V4)
    expect(second).not.toBe(first)
  })

  it.each([
    [0x00, '00000000-0000-4000-8000-000000000000'],
    [0xff, 'ffffffff-ffff-4fff-bfff-ffffffffffff'],
  ])(
    'builds a v4 UUID from random bytes (all %i) where crypto.randomUUID is missing',
    (byte, expected) => {
      // Browsers only offer randomUUID on secure origins: HTTPS, or localhost.
      vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(byte) })

      expect(randomId()).toBe(expected)
    },
  )
})
