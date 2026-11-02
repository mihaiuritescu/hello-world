import { randomUUID } from 'node:crypto'
import type { Message } from '#shared/domain.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../test/reset-db.ts'
import {
  connectTo,
  nextEvent,
  openSilentWebSocket,
  portOf,
  untyped,
  type TestSocket,
} from '../test/socket-client.ts'
import { createTestApp, type TestApp } from '../test/test-app.ts'

describe('real-time delivery', () => {
  let testApp: TestApp
  let port: number
  const sockets: TestSocket[] = []

  beforeAll(async () => {
    testApp = await createTestApp()
    await testApp.app.listen({ host: '127.0.0.1', port: 0 })
    port = portOf(testApp.app)
  })

  afterAll(async () => {
    await testApp.close()
  })

  // Every test starts with two empty rooms: 1 and 2.
  beforeEach(async () => {
    await resetDatabase(testApp.db)
    await createRoom()
    await createRoom()
  })

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect())
  })

  async function connect(): Promise<TestSocket> {
    const socket = await connectTo(port)
    sockets.push(socket)
    return socket
  }

  function createRoom() {
    return testApp.app.inject({ method: 'POST', url: '/api/rooms', payload: { lat: 1, lng: 1 } })
  }

  function postMessage(roomId: number, body: string) {
    return testApp.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/messages`,
      payload: { clientId: randomUUID(), authorName: 'Alice', body },
    })
  }

  it('tells every connected client about a new room', async () => {
    const [first, second] = await Promise.all([connect(), connect()])
    const heard = Promise.all([nextEvent(first, 'room:created'), nextEvent(second, 'room:created')])

    const response = await createRoom()

    expect(await heard).toEqual([response.json(), response.json()])
  })

  it('sends a message to the clients that have its room open, and to no one else', async () => {
    const [inRoom1, inRoom2] = await Promise.all([connect(), connect()])
    await inRoom1.emitWithAck('room:subscribe', { roomId: 1 })
    await inRoom2.emitWithAck('room:subscribe', { roomId: 2 })
    const heardInRoom2: Message[] = []
    inRoom2.on('message:created', (message) => heardInRoom2.push(message))
    const heardInRoom1 = nextEvent(inRoom1, 'message:created')
    const room2Message = nextEvent(inRoom2, 'message:created', (m) => m.body === 'For room 2')

    await postMessage(1, 'For room 1')
    await postMessage(2, 'For room 2')

    expect(await heardInRoom1).toMatchObject({ roomId: 1, body: 'For room 1' })
    await room2Message
    // A client gets events in the order they were sent, so room 1's message would have come first.
    expect(heardInRoom2.map((message) => message.body)).toEqual(['For room 2'])
  })

  it('moves a client to the room it subscribed to last', async () => {
    const socket = await connect()
    await socket.emitWithAck('room:subscribe', { roomId: 1 })
    await socket.emitWithAck('room:subscribe', { roomId: 2 })
    const heard: Message[] = []
    socket.on('message:created', (message) => heard.push(message))
    const room2Message = nextEvent(socket, 'message:created', (m) => m.body === 'For room 2')

    await postMessage(1, 'For room 1')
    await postMessage(2, 'For room 2')

    await room2Message
    expect(heard.map((message) => message.body)).toEqual(['For room 2'])
  })

  it('confirms a subscription, and rejects a malformed one', async () => {
    const socket = await connect()

    expect(await socket.emitWithAck('room:subscribe', { roomId: 1 })).toEqual({ ok: true })
    expect(await untyped(socket).emitWithAck('room:subscribe', { roomId: 'abc' })).toEqual({
      ok: false,
      error: 'VALIDATION_FAILED',
    })
  })

  it("accepts a socket opened by the app's own pages", async () => {
    const socket = await connectTo(port, { extraHeaders: { origin: `http://127.0.0.1:${port}` } })
    sockets.push(socket)

    expect(socket.connected).toBe(true)
  })

  it.each(['https://evil.example', 'null'])(
    'refuses a socket opened from the origin %j, and keeps serving others',
    async (origin) => {
      // Browsers don't apply CORS to WebSockets: without this, any website could open sockets
      // to the app from its visitors' browsers.
      await expect(connectTo(port, { extraHeaders: { origin } })).rejects.toThrow()

      expect((await connect()).connected).toBe(true)
    },
  )

  it('trusts only the public origin once PUBLIC_URL is set', async () => {
    const pinned = await createTestApp({ PUBLIC_URL: 'https://chat.example.com' })
    await pinned.app.listen({ host: '127.0.0.1', port: 0 })
    const pinnedPort = portOf(pinned.app)
    try {
      // A DNS-rebinding page sends an Origin that matches the Host it controls.
      const rebound = { origin: `http://127.0.0.1:${pinnedPort}` }
      await expect(connectTo(pinnedPort, { extraHeaders: rebound })).rejects.toThrow()

      const own = await connectTo(pinnedPort, {
        extraHeaders: { origin: 'https://chat.example.com' },
      })
      sockets.push(own)
      expect(own.connected).toBe(true)
    } finally {
      sockets.splice(0).forEach((socket) => socket.disconnect())
      await pinned.close()
    }
  })

  it('drops a connection that sends a frame over 16 KiB, and keeps serving others', async () => {
    const socket = await connect()
    const dropped = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()))

    untyped(socket).emit('room:subscribe', { roomId: 1, padding: 'x'.repeat(17 * 1024) })

    await dropped
    expect(await (await connect()).emitWithAck('room:subscribe', { roomId: 1 })).toEqual({
      ok: true,
    })
  })

  it('keeps working after a subscription sent without an answer callback', async () => {
    const socket = await connect()

    untyped(socket).emit('room:subscribe', { roomId: 1 })

    expect(await socket.emitWithAck('room:subscribe', { roomId: 2 })).toEqual({ ok: true })
  })

  it('ends connections without a disconnect packet when it shuts down, so clients reconnect (I6)', async () => {
    const first = await createTestApp()
    await first.app.listen({ host: '127.0.0.1', port: 0 })
    const sharedPort = portOf(first.app)
    const socket = await connectTo(sharedPort, {
      reconnection: true,
      reconnectionDelay: 50,
      reconnectionDelayMax: 100,
    })
    sockets.push(socket)
    const disconnected = new Promise<string>((resolve) => socket.once('disconnect', resolve))

    await first.close()

    // "io server disconnect" would mean a disconnect packet, after which clients stay away.
    expect(await disconnected).toBe('transport close')
    const second = await createTestApp()
    try {
      const reconnected = new Promise<void>((resolve) => socket.once('connect', () => resolve()))
      await second.app.listen({ host: '127.0.0.1', port: sharedPort })
      await reconnected
      expect(socket.connected).toBe(true)
    } finally {
      socket.disconnect()
      await second.close()
    }
  })

  it('shuts down promptly, even with a client that never answers', async () => {
    const closing = await createTestApp()
    await closing.app.listen({ host: '127.0.0.1', port: 0 })
    const silent = await openSilentWebSocket(portOf(closing.app))
    try {
      const started = performance.now()

      await closing.close()

      // Waiting for the silent client to answer would take ws's 30 s close timeout, past the
      // 10 s that `close-with-grace` gives a shutdown.
      expect(performance.now() - started).toBeLessThan(2_000)
    } finally {
      silent.destroy()
    }
  })
})
