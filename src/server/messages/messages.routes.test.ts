import { randomUUID } from 'node:crypto'
import type { Message } from '#shared/domain.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { silentBroadcaster, type Broadcaster } from '../realtime/broadcaster.ts'
import { captureLogs } from '../test/log-capture.ts'
import { resetDatabase } from '../test/reset-db.ts'
import { createTestApp, type TestApp } from '../test/test-app.ts'

const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const draft = {
  clientId: '5e0c6d1a-8b7f-4f3e-9a2d-1c4b6e8f0a12',
  authorName: 'Alice',
  body: 'Hello, world',
}

describe('messages API', () => {
  const announced: Message[] = []
  const broadcaster: Broadcaster = {
    ...silentBroadcaster,
    messageCreated: (message) => announced.push(message),
  }
  let testApp: TestApp

  beforeAll(async () => {
    testApp = await createTestApp({}, { broadcaster })
  })

  afterAll(async () => {
    await testApp.close()
  })

  // Every test starts with one empty room: room 1.
  beforeEach(async () => {
    await resetDatabase(testApp.db)
    await createRoom()
    announced.length = 0
  })

  function createRoom() {
    return testApp.app.inject({ method: 'POST', url: '/api/rooms', payload: { lat: 1, lng: 1 } })
  }

  function postMessage(payload: object, roomId: number | string = 1) {
    return testApp.app.inject({ method: 'POST', url: `/api/rooms/${roomId}/messages`, payload })
  }

  function listMessages(roomId: number | string = 1) {
    return testApp.app.inject(`/api/rooms/${roomId}/messages`)
  }

  async function storedMessages(roomId = 1): Promise<Message[]> {
    return (await listMessages(roomId)).json<{ messages: Message[] }>().messages
  }

  describe('POST /api/rooms/:roomId/messages', () => {
    it('stores the message, trimmed, and returns it with 201', async () => {
      const response = await postMessage({ ...draft, authorName: ' Alice ', body: 'Hello, world ' })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({
        id: 1,
        roomId: 1,
        authorName: 'Alice',
        body: 'Hello, world',
        createdAt: expect.stringMatching(ISO_UTC_TIMESTAMP) as string,
      })
    })

    it('announces the message once it is saved', async () => {
      const response = await postMessage(draft)

      expect(announced).toEqual([response.json()])
    })

    it('returns the stored message with 200 when the clientId repeats, and stores it once', async () => {
      const first = await postMessage(draft)
      const replay = await postMessage({ ...draft, body: 'A different text' })

      expect(replay.statusCode).toBe(200)
      expect(replay.json()).toEqual(first.json())
      expect(await storedMessages()).toEqual([first.json()])
    })

    it('announces a repeated message again, in case the first announcement was lost', async () => {
      await postMessage(draft)
      await postMessage(draft)

      expect(announced.map((message) => message.id)).toEqual([1, 1])
    })

    it('stores one message when the same send arrives twice at once', async () => {
      const responses = await Promise.all([postMessage(draft), postMessage(draft)])

      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 201])
      expect(new Set(responses.map((response) => response.json<Message>().id)).size).toBe(1)
      expect(await storedMessages()).toHaveLength(1)
    })

    it('treats the same clientId in another room as a separate message', async () => {
      await createRoom()
      await postMessage(draft, 1)

      const response = await postMessage(draft, 2)

      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({ id: 2, roomId: 2 })
    })

    it('answers 404 ROOM_NOT_FOUND for a room that does not exist', async () => {
      const response = await postMessage(draft, 999)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ statusCode: 404, code: 'ROOM_NOT_FOUND' })
      expect(announced).toEqual([])
    })

    it.each([
      ['a missing author name', { authorName: undefined }],
      ['a blank text', { body: '   ' }],
      ['an author name over 40 characters', { authorName: 'a'.repeat(41) }],
      ['a text over 1,000 characters', { body: 'b'.repeat(1001) }],
      ['a control character', { body: 'beep\u0007' }],
      ['a line break, which would let one message fill the room', { body: 'a\n\n\n\nb' }],
      ['a Unicode line separator', { body: 'a\u2028\u2028b' }],
      ['a text with nothing visible in it', { body: '\u200B' }],
      ['a client id that is not a UUID', { clientId: '42' }],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_case, change) => {
      const response = await postMessage({ ...draft, ...change })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
      })
      expect(announced).toEqual([])
    })

    it.each(['abc', '0x1', '1e0', '01'])(
      'answers 400 VALIDATION_FAILED for the room id %j, which is not written as a plain number',
      async (roomId) => {
        const response = await postMessage(draft, roomId)

        expect(response.statusCode).toBe(400)
        expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
      },
    )
  })

  describe('GET /api/rooms/:roomId/messages', () => {
    it('returns an empty list for a room without messages', async () => {
      const response = await listMessages()

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ messages: [] })
    })

    it('returns the newest 100 messages, oldest first', async () => {
      await testApp.db
        .insertInto('messages')
        .values(
          Array.from({ length: 105 }, (_, index) => ({
            room_id: 1,
            client_id: randomUUID(),
            author_name: 'Seeder',
            body: `Message ${index + 1}`,
          })),
        )
        .execute()

      const messages = await storedMessages()

      expect(messages.map((message) => message.id)).toEqual(
        Array.from({ length: 100 }, (_, index) => index + 6),
      )
    })

    it("returns only the room's own messages", async () => {
      await createRoom()
      await postMessage(draft, 1)
      await postMessage({ ...draft, clientId: randomUUID(), body: 'In room 2' }, 2)

      expect(await storedMessages(2)).toMatchObject([{ roomId: 2, body: 'In room 2' }])
    })

    it('answers 404 ROOM_NOT_FOUND for a room that does not exist', async () => {
      const response = await listMessages(999)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ statusCode: 404, code: 'ROOM_NOT_FOUND' })
    })

    it('answers 400 VALIDATION_FAILED for a room id that is not a positive integer', async () => {
      const response = await listMessages('abc')

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('keeps messages across a server restart', async () => {
      await postMessage(draft)
      const restartedApp = await createTestApp()
      try {
        const response = await restartedApp.app.inject('/api/rooms/1/messages')

        expect(response.json<{ messages: Message[] }>().messages).toMatchObject([
          { id: 1, authorName: 'Alice', body: 'Hello, world' },
        ])
      } finally {
        await restartedApp.close()
      }
    })
  })

  it('never writes author names or message bodies to the logs', async () => {
    const logs = captureLogs()
    const loggingApp = await createTestApp({ LOG_LEVEL: 'trace' }, { logStream: logs.stream })
    try {
      await loggingApp.app.inject({
        method: 'POST',
        url: '/api/rooms/1/messages',
        payload: { ...draft, authorName: 'Zelda Quill', body: 'the secret plan' },
      })
      await loggingApp.app.inject('/api/rooms/1/messages')

      // The requests themselves are logged, so the checks below can't pass on an empty log.
      expect(logs.text()).toContain('/api/rooms/1/messages')
      expect(logs.text()).not.toContain('Zelda Quill')
      expect(logs.text()).not.toContain('the secret plan')
    } finally {
      await loggingApp.close()
    }
  })
})
