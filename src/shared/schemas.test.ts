import { describe, expect, it } from 'vitest'
import {
  CoordinatesSchema,
  MessageDraftSchema,
  OwnerTokenSchema,
  RoomIdParamsSchema,
  RoomRenameSchema,
  RoomSubscriptionSchema,
} from './schemas.ts'

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

  it.each(['0', '-1', '1.5', 'abc', '9007199254740993', '0x1', '1e0', '1.0', '+1', ' 1', '01'])(
    'rejects %j',
    (roomId) => {
      expect(RoomIdParamsSchema.safeParse({ roomId }).success).toBe(false)
    },
  )
})

describe('MessageDraftSchema', () => {
  const draft = {
    clientId: '0b4b3a52-1c1e-4c43-9f0e-6f3a5d8f2b11',
    authorName: 'Alice',
    body: 'Hello',
  }

  it('trims the author name and the text', () => {
    expect(
      MessageDraftSchema.parse({ ...draft, authorName: '  Alice ', body: ' Hello \t' }),
    ).toEqual(draft)
  })

  it('accepts a 40-character name and a 1,000-character text', () => {
    const input = { ...draft, authorName: 'a'.repeat(40), body: 'b'.repeat(1000) }

    expect(MessageDraftSchema.safeParse(input).success).toBe(true)
  })

  it('keeps a tab inside the text', () => {
    expect(MessageDraftSchema.parse({ ...draft, body: 'col 1\tcol 2' }).body).toBe('col 1\tcol 2')
  })

  it.each([
    ['a 41-character name', { authorName: 'a'.repeat(41) }],
    ['a 1,001-character text', { body: 'b'.repeat(1001) }],
    ['a blank name', { authorName: '   ' }],
    ['a blank text', { body: ' \t ' }],
    ['a missing text', { body: undefined }],
    ['an invisible name', { authorName: '\u3164' }],
    ['a line break in the text', { body: 'line 1\nline 2' }],
    ['a client id that is not a UUID', { clientId: 'not-a-uuid' }],
  ])('rejects %s', (_case, change) => {
    expect(MessageDraftSchema.safeParse({ ...draft, ...change }).success).toBe(false)
  })

  it('says what is wrong with a text it rejects', () => {
    const result = MessageDraftSchema.safeParse({ ...draft, body: '\u202Eecila' })

    expect(result.error?.issues).toMatchObject([
      { path: ['body'], message: "Text direction controls aren't allowed." },
    ])
  })
})

describe('RoomSubscriptionSchema', () => {
  it('accepts a positive whole room id', () => {
    expect(RoomSubscriptionSchema.parse({ roomId: 7 })).toEqual({ roomId: 7 })
  })

  it.each([
    ['a room id sent as a string', { roomId: '7' }],
    ['a zero room id', { roomId: 0 }],
    ['a fractional room id', { roomId: 1.5 }],
    ['a missing room id', {}],
    ['no payload at all', null],
  ])('rejects %s', (_case, input) => {
    expect(RoomSubscriptionSchema.safeParse(input).success).toBe(false)
  })
})

describe('RoomRenameSchema', () => {
  it('trims the new name', () => {
    expect(RoomRenameSchema.parse({ name: '  Picnic  ' })).toEqual({ name: 'Picnic' })
  })

  it('takes null, which brings back the default name', () => {
    expect(RoomRenameSchema.parse({ name: null })).toEqual({ name: null })
  })

  it('keeps markup and quotes as they are: they are only ever shown as text', () => {
    const name = `<img src=x onerror="alert('hi')">`

    expect(RoomRenameSchema.parse({ name })).toEqual({ name })
  })

  it.each([
    ['an empty name', ''],
    ['a blank name', '   '],
    ['a 41-character name', 'a'.repeat(41)],
    ['a line break', 'Picnic\nat noon'],
    ['a text direction control', `${String.fromCodePoint(0x202e)}cinciP`],
    ['a missing name', undefined],
    ['a number', 7],
  ])('rejects %s', (_case, name) => {
    expect(RoomRenameSchema.safeParse({ name }).success).toBe(false)
  })
})

describe('OwnerTokenSchema', () => {
  it('accepts 32 bytes in base64url, without padding', () => {
    expect(OwnerTokenSchema.safeParse(`${'Az09_-'.repeat(7)}x`).success).toBe(true)
  })

  it.each([
    ['a token one character short', 'a'.repeat(42)],
    ['a token one character long', 'a'.repeat(44)],
    ['standard base64 characters', `${'a'.repeat(41)}+/`],
    ['padding', `${'a'.repeat(42)}=`],
  ])('rejects %s', (_case, token) => {
    expect(OwnerTokenSchema.safeParse(token).success).toBe(false)
  })
})
