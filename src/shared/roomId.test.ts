import { describe, expect, it } from 'vitest'
import { parseRoomId } from './roomId.ts'

describe('parseRoomId', () => {
  it('reads a room id written plainly', () => {
    expect(parseRoomId('42')).toBe(42)
    expect(parseRoomId('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER)
  })

  it.each(['', '0', '-1', '1.5', 'abc', '9007199254740992', '0x1', '1e0', '1.0', '+1', ' 1', '01'])(
    'rejects %j, so that one room has one URL',
    (text) => {
      expect(parseRoomId(text)).toBeNull()
    },
  )
})
