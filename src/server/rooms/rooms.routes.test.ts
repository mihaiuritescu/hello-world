import type { Room } from '#shared/domain.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Broadcaster } from '../realtime/broadcaster.ts'
import { resetDatabase } from '../test/reset-db.ts'
import { createTestApp, type TestApp } from '../test/test-app.ts'

const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('rooms API', () => {
  const announced: Room[] = []
  const broadcaster: Broadcaster = { roomCreated: (room) => announced.push(room) }
  let testApp: TestApp

  beforeAll(async () => {
    testApp = await createTestApp({}, { broadcaster })
  })

  afterAll(async () => {
    await testApp.close()
  })

  beforeEach(async () => {
    await resetDatabase(testApp.db)
    announced.length = 0
  })

  function createRoom(payload: unknown) {
    return testApp.app.inject({ method: 'POST', url: '/api/rooms', payload: payload as object })
  }

  describe('POST /api/rooms', () => {
    it('creates a room whose id is its number', async () => {
      const response = await createRoom({ lat: 46.77, lng: 23.59 })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({
        id: 1,
        lat: 46.77,
        lng: 23.59,
        createdAt: expect.stringMatching(ISO_UTC_TIMESTAMP) as string,
      })
    })

    it('announces the room once it is saved', async () => {
      const response = await createRoom({ lat: 10, lng: 20 })

      expect(announced).toEqual([response.json()])
    })

    it.each([
      ['a latitude outside -90..90', { lat: 91, lng: 0 }],
      ['a missing longitude', { lat: 10 }],
      ['coordinates sent as strings', { lat: '10', lng: '20' }],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_case, payload) => {
      const response = await createRoom(payload)

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
      })
      expect(announced).toEqual([])
    })

    it('rejects malformed JSON in the standard error shape', async () => {
      const response = await testApp.app.inject({
        method: 'POST',
        url: '/api/rooms',
        headers: { 'content-type': 'application/json' },
        payload: '{"lat":',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' })
    })

    it('gives rooms created at the same time distinct numbers', async () => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, index) => createRoom({ lat: index, lng: index })),
      )

      const ids = responses.map((response) => response.json<Room>().id)
      expect(new Set(ids).size).toBe(10)
    })
  })

  describe('GET /api/rooms', () => {
    it('returns an empty list when there are no rooms', async () => {
      const response = await testApp.app.inject('/api/rooms')

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ rooms: [] })
    })

    it('lists the saved rooms, oldest first', async () => {
      await createRoom({ lat: 1, lng: 1 })
      await createRoom({ lat: 2, lng: 2 })

      const { rooms } = (await testApp.app.inject('/api/rooms')).json<{ rooms: Room[] }>()

      expect(rooms.map((room) => [room.id, room.lat])).toEqual([
        [1, 1],
        [2, 2],
      ])
    })

    it('returns one room by id, so a link can reopen a room outside the listed ones', async () => {
      await createRoom({ lat: 3, lng: 4 })

      const response = await testApp.app.inject('/api/rooms/1')

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ id: 1, lat: 3, lng: 4 })
    })

    it('answers 404 ROOM_NOT_FOUND for a room that does not exist', async () => {
      const response = await testApp.app.inject('/api/rooms/999')

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ statusCode: 404, code: 'ROOM_NOT_FOUND' })
    })

    it('answers 400 VALIDATION_FAILED for a room id that is not a positive integer', async () => {
      const response = await testApp.app.inject('/api/rooms/abc')

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('keeps rooms across a server restart', async () => {
      await createRoom({ lat: 5, lng: 6 })
      const restartedApp = await createTestApp()
      try {
        const { rooms } = (await restartedApp.app.inject('/api/rooms')).json<{ rooms: Room[] }>()

        expect(rooms).toMatchObject([{ id: 1, lat: 5, lng: 6 }])
      } finally {
        await restartedApp.close()
      }
    })
  })
})
