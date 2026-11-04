import { randomUUID } from 'node:crypto'
import type { CreatedRoom, Message, Room } from '#shared/domain.ts'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../db/database.ts'
import { silentBroadcaster, type Broadcaster } from '../realtime/broadcaster.ts'
import { resetDatabase } from '../test/reset-db.ts'
import { createTestApp, type TestApp } from '../test/test-app.ts'

const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const OWNER_TOKEN = /^[\w-]{43}$/

/** The fields of a room as the API shows it, in order: never an owner token or its hash. */
const ROOM_FIELDS = ['id', 'lat', 'lng', 'name', 'revision', 'createdAt']

describe('rooms API', () => {
  const announced: Room[] = []
  const announcedUpdates: Room[] = []
  const announcedDeletions: number[] = []
  const broadcaster: Broadcaster = {
    ...silentBroadcaster,
    roomCreated: (room) => announced.push(room),
    roomUpdated: (room) => announcedUpdates.push(room),
    roomDeleted: (roomId) => announcedDeletions.push(roomId),
  }
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
    announcedUpdates.length = 0
    announcedDeletions.length = 0
  })

  function createRoom(payload: unknown) {
    return testApp.app.inject({ method: 'POST', url: '/api/rooms', payload: payload as object })
  }

  /** Creates a room and returns it with its owner token. */
  async function createdRoom(): Promise<CreatedRoom> {
    return (await createRoom({ lat: 1, lng: 2 })).json<CreatedRoom>()
  }

  function renameRoom(roomId: number, payload: unknown, authorization?: string) {
    return testApp.app.inject({
      method: 'PATCH',
      url: `/api/rooms/${roomId}`,
      payload: payload as object,
      headers: authorization === undefined ? {} : { authorization },
    })
  }

  function deleteRoom(roomId: number, authorization?: string) {
    return testApp.app.inject({
      method: 'DELETE',
      url: `/api/rooms/${roomId}`,
      headers: authorization === undefined ? {} : { authorization },
    })
  }

  function postMessage(roomId: number) {
    return testApp.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/messages`,
      payload: { clientId: randomUUID(), authorName: 'Alice', body: 'Hello' },
    })
  }

  async function messagesIn(roomId: number): Promise<Message[]> {
    const response = await testApp.app.inject(`/api/rooms/${roomId}/messages`)
    return response.json<{ messages: Message[] }>().messages
  }

  describe('POST /api/rooms', () => {
    it('creates a room whose id is its number, and gives its creator an owner token', async () => {
      const response = await createRoom({ lat: 46.77, lng: 23.59 })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({
        id: 1,
        lat: 46.77,
        lng: 23.59,
        name: null,
        revision: 0,
        createdAt: expect.stringMatching(ISO_UTC_TIMESTAMP) as string,
        ownerToken: expect.stringMatching(OWNER_TOKEN) as string,
      })
    })

    it('announces the room once it is saved, without its owner token', async () => {
      const { ownerToken, ...room } = (await createRoom({ lat: 10, lng: 20 })).json<CreatedRoom>()

      expect(ownerToken).toMatch(OWNER_TOKEN)
      expect(announced).toEqual([room])
      expect(Object.keys(announced[0] ?? {})).toEqual(ROOM_FIELDS)
    })

    it('gives every room its own owner token', async () => {
      const first = await createdRoom()
      const second = await createdRoom()

      expect(first.ownerToken).not.toBe(second.ownerToken)
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

    it('never shows an owner token, or its hash, in the list or a single room', async () => {
      await createRoom({ lat: 1, lng: 1 })

      const { rooms } = (await testApp.app.inject('/api/rooms')).json<{ rooms: Room[] }>()
      const room = (await testApp.app.inject('/api/rooms/1')).json<Room>()

      expect(Object.keys(rooms[0] ?? {})).toEqual(ROOM_FIELDS)
      expect(Object.keys(room)).toEqual(ROOM_FIELDS)
    })
  })

  describe('PATCH /api/rooms/:roomId', () => {
    it('renames a room for its creator, and announces the new name', async () => {
      const { id, ownerToken } = await createdRoom()

      const response = await renameRoom(id, { name: 'Picnic' }, `Bearer ${ownerToken}`)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ id, name: 'Picnic', revision: 1 })
      expect(Object.keys(response.json<Room>())).toEqual(ROOM_FIELDS)
      expect(announcedUpdates).toEqual([response.json()])
      expect((await testApp.app.inject(`/api/rooms/${id}`)).json()).toEqual(response.json())
    })

    it('trims the new name', async () => {
      const { id, ownerToken } = await createdRoom()

      const response = await renameRoom(id, { name: '  Picnic  ' }, `Bearer ${ownerToken}`)

      expect(response.json()).toMatchObject({ name: 'Picnic' })
    })

    it('brings back the default name for null, as a newer revision', async () => {
      const { id, ownerToken } = await createdRoom()
      await renameRoom(id, { name: 'Picnic' }, `Bearer ${ownerToken}`)

      const response = await renameRoom(id, { name: null }, `Bearer ${ownerToken}`)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ name: null, revision: 2 })
    })

    it.each([
      ['an HTML tag that runs script', '<img src=x onerror=alert(1)>'],
      ['a script element', '<script>alert(1)</script>'],
      ['an SQL statement after a quote', "'); DROP TABLE rooms; --"],
      ['an SQL condition that is always true', `" OR 1=1 --`],
    ])('stores %s exactly as written, and the database keeps working', async (_case, name) => {
      const { id, ownerToken } = await createdRoom()

      const response = await renameRoom(id, { name }, `Bearer ${ownerToken}`)

      expect(response.json()).toMatchObject({ name })
      const { rooms } = (await testApp.app.inject('/api/rooms')).json<{ rooms: Room[] }>()
      expect(rooms).toMatchObject([{ id, name }])
    })

    it('gives each of several renames at once its own revision', async () => {
      const { id, ownerToken } = await createdRoom()

      const responses = await Promise.all(
        ['One', 'Two', 'Three', 'Four', 'Five'].map((name) =>
          renameRoom(id, { name }, `Bearer ${ownerToken}`),
        ),
      )

      const revisions = responses.map((response) => response.json<Room>().revision)
      expect(revisions.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
      expect((await testApp.app.inject(`/api/rooms/${id}`)).json()).toMatchObject({ revision: 5 })
    })

    it.each([
      ['without a token', () => undefined],
      ['with a malformed token', () => 'Bearer not-a-token'],
      ['with the token in another scheme', (token: string) => `Basic ${token}`],
    ])(
      'refuses a rename %s with 403 NOT_ROOM_OWNER, and changes nothing',
      async (_case, header) => {
        const { id, ownerToken } = await createdRoom()

        const response = await renameRoom(id, { name: 'Mine now' }, header(ownerToken))

        expect(response.statusCode).toBe(403)
        expect(response.json()).toMatchObject({ statusCode: 403, code: 'NOT_ROOM_OWNER' })
        expect(announcedUpdates).toEqual([])
        expect((await testApp.app.inject(`/api/rooms/${id}`)).json()).toMatchObject({
          name: null,
          revision: 0,
        })
      },
    )

    it("refuses a rename with another room's token", async () => {
      const mine = await createdRoom()
      const theirs = await createdRoom()

      const response = await renameRoom(
        mine.id,
        { name: 'Mine now' },
        `Bearer ${theirs.ownerToken}`,
      )

      expect(response.statusCode).toBe(403)
      expect(announcedUpdates).toEqual([])
    })

    it('refuses to rename a room created before rooms had owners', async () => {
      await sql`INSERT INTO rooms (lat, lng) VALUES (1, 1)`.execute(testApp.db)
      const { ownerToken } = await createdRoom()

      const response = await renameRoom(1, { name: 'Mine now' }, `Bearer ${ownerToken}`)

      expect(response.statusCode).toBe(403)
    })

    it('answers 404 ROOM_NOT_FOUND for a room that does not exist', async () => {
      const { ownerToken } = await createdRoom()

      const response = await renameRoom(999, { name: 'Picnic' }, `Bearer ${ownerToken}`)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' })
    })

    it.each([
      ['an empty name', { name: '' }],
      ['a 41-character name', { name: 'a'.repeat(41) }],
      ['a line break', { name: 'Picnic\nat noon' }],
      ['a text direction control', { name: `${String.fromCodePoint(0x202e)}cinciP` }],
      ['no name at all', {}],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_case, payload) => {
      const { id, ownerToken } = await createdRoom()

      const response = await renameRoom(id, payload, `Bearer ${ownerToken}`)

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
      expect(announcedUpdates).toEqual([])
    })
  })

  describe('DELETE /api/rooms/:roomId', () => {
    it('deletes an empty room for its creator, and announces it', async () => {
      const { id, ownerToken } = await createdRoom()

      const response = await deleteRoom(id, `Bearer ${ownerToken}`)

      expect(response.statusCode).toBe(204)
      expect(response.body).toBe('')
      expect(announcedDeletions).toEqual([id])
      expect((await testApp.app.inject(`/api/rooms/${id}`)).statusCode).toBe(404)
      expect((await testApp.app.inject('/api/rooms')).json()).toEqual({ rooms: [] })
    })

    it('refuses to delete a room with a message, with 409 ROOM_NOT_EMPTY, and keeps both', async () => {
      const { id, ownerToken } = await createdRoom()
      await postMessage(id)

      const response = await deleteRoom(id, `Bearer ${ownerToken}`)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ statusCode: 409, code: 'ROOM_NOT_EMPTY' })
      expect(announcedDeletions).toEqual([])
      expect((await testApp.app.inject(`/api/rooms/${id}`)).statusCode).toBe(200)
      expect(await messagesIn(id)).toHaveLength(1)
    })

    // The insert holds a lock on its room, for the foreign key, until it commits. A delete that
    // checked for messages without locking the room would miss the uncommitted message, delete
    // the room once the lock went, and the foreign key's ON DELETE CASCADE would erase the message.
    it('waits for a message being stored, then refuses to delete its room (I8)', async () => {
      const { id, ownerToken } = await createdRoom()

      await testApp.db.connection().execute(async (sender) => {
        await sql`START TRANSACTION`.execute(sender)
        try {
          await sql`
            INSERT INTO messages (room_id, client_id, author_name, body)
            VALUES (${id}, ${randomUUID()}, 'Alice', 'Just in time')
          `.execute(sender)
          const deleting = deleteRoom(id, `Bearer ${ownerToken}`)
          await expect.poll(() => waitingQueries(testApp.db)).toBeGreaterThan(0)

          await sql`COMMIT`.execute(sender)

          expect((await deleting).statusCode).toBe(409)
        } finally {
          await sql`ROLLBACK`.execute(sender)
        }
      })
      expect(await messagesIn(id)).toHaveLength(1)
      expect(announcedDeletions).toEqual([])
    })

    it('makes a message sent to a deleted room fail with 404', async () => {
      const { id, ownerToken } = await createdRoom()
      await deleteRoom(id, `Bearer ${ownerToken}`)

      const response = await postMessage(id)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' })
    })

    it.each([
      ['without a token', () => undefined],
      ['with a malformed token', () => 'Bearer not-a-token'],
    ])('refuses a delete %s with 403 NOT_ROOM_OWNER', async (_case, header) => {
      const { id } = await createdRoom()

      const response = await deleteRoom(id, header())

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ code: 'NOT_ROOM_OWNER' })
      expect((await testApp.app.inject(`/api/rooms/${id}`)).statusCode).toBe(200)
      expect(announcedDeletions).toEqual([])
    })

    it("refuses a delete with another room's token", async () => {
      const mine = await createdRoom()
      const theirs = await createdRoom()

      const response = await deleteRoom(mine.id, `Bearer ${theirs.ownerToken}`)

      expect(response.statusCode).toBe(403)
      expect((await testApp.app.inject(`/api/rooms/${mine.id}`)).statusCode).toBe(200)
    })

    it('refuses to delete a room created before rooms had owners', async () => {
      await sql`INSERT INTO rooms (lat, lng) VALUES (1, 1)`.execute(testApp.db)
      const { ownerToken } = await createdRoom()

      expect((await deleteRoom(1, `Bearer ${ownerToken}`)).statusCode).toBe(403)
    })

    it('answers 404 ROOM_NOT_FOUND for a room that does not exist, or no longer does', async () => {
      const { id, ownerToken } = await createdRoom()
      await deleteRoom(id, `Bearer ${ownerToken}`)

      const response = await deleteRoom(id, `Bearer ${ownerToken}`)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' })
      expect(announcedDeletions).toEqual([id])
    })

    it('answers 400 VALIDATION_FAILED for a room id that is not a positive integer', async () => {
      expect((await deleteRoom(Number.NaN)).statusCode).toBe(400)
    })
  })
})

/**
 * The app's queries now waiting on the database, such as for a lock, on the test database. The
 * test's account sees only its own connections, which is all this needs.
 */
async function waitingQueries(db: Kysely<Database>): Promise<number> {
  const { rows } = await sql<{ db: string | null; Command: string; Info: string | null }>`
    SHOW FULL PROCESSLIST
  `.execute(db)
  return rows.filter(
    (row) =>
      row.db === 'hello_world_test' &&
      row.Command === 'Query' &&
      row.Info !== null &&
      !row.Info.startsWith('SHOW'),
  ).length
}
