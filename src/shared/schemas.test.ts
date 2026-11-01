import { describe, expect, it } from 'vitest'
import { CoordinatesSchema, RoomIdParamsSchema } from './schemas.ts'

describe('CoordinatesSchema', () => {
  it('accepts coordinates on the edges of the valid range', () => {
    expect(CoordinatesSchema.parse({ lat: -90, lng: 180 })).toEqual({ lat: -90, lng: 180 })
    expect(CoordinatesSchema.parse({ lat: 90, lng: -180 })).toEqual({ lat: 90, lng: -180 })
  })

  it.each([
    ['a latitude above 90', { lat: 90.1, lng: 0 }],
    ['a longitude below -180', { lat: 0, lng: -180.1 }],
    ['a missing longitude', { lat: 0 }],
    ['numbers sent as strings', { lat: '45', lng: '10' }],
    ['an infinite value', { lat: Infinity, lng: 0 }],
  ])('rejects %s', (_case, input) => {
    expect(CoordinatesSchema.safeParse(input).success).toBe(false)
  })
})

describe('RoomIdParamsSchema', () => {
  it('turns the room id from the URL into a number', () => {
    expect(RoomIdParamsSchema.parse({ roomId: '42' })).toEqual({ roomId: 42 })
  })

  it.each(['0', '-1', '1.5', 'abc', '9007199254740993'])('rejects %s', (roomId) => {
    expect(RoomIdParamsSchema.safeParse({ roomId }).success).toBe(false)
  })
})
