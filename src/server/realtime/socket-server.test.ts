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

describe('real-time limits', () => {
  let limited: TestApp | undefined
  const sockets: TestSocket[] = []

  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect())
    await limited?.close()
    limited = undefined
  })

  /** Starts an app with small limits on a free port, and returns the port. */
  async function listeningWith(env: Record<string, string>): Promise<number> {
    limited = await createTestApp(env)
    await limited.app.listen({ host: '127.0.0.1', port: 0 })
    return portOf(limited.app)
  }

  function forwardedFor(address: string) {
    return { extraHeaders: { 'x-forwarded-for': address } }
  }

  async function connect(port: number, options: Parameters<typeof connectTo>[1] = {}) {
    const socket = await connectTo(port, options)
    sockets.push(socket)
    return socket
  }

  it('refuses a connection past the cap for one address, and takes one again once another closes', async () => {
    const port = await listeningWith({ SOCKETS_PER_ADDRESS: '2' })
    const [first] = await Promise.all([connect(port), connect(port)])

    await expect(connectTo(port)).rejects.toThrow()

    first.disconnect()
    // The server learns of the close a moment later.
    await expect
      .poll(() =>
        connect(port).then(
          () => true,
          () => false,
        ),
      )
      .toBe(true)
  })

  it('counts the clients behind a trusted proxy by their forwarded address', async () => {
    const port = await listeningWith({ TRUST_PROXY: '127.0.0.1', SOCKETS_PER_ADDRESS: '1' })
    await connect(port, forwardedFor('203.0.113.1'))

    await expect(connectTo(port, forwardedFor('203.0.113.1'))).rejects.toThrow()
    expect((await connect(port, forwardedFor('203.0.113.2'))).connected).toBe(true)
  })

  it('ignores X-Forwarded-For from a peer it does not trust, so a client cannot dodge the cap', async () => {
    const port = await listeningWith({ SOCKETS_PER_ADDRESS: '1' })
    await connect(port, forwardedFor('203.0.113.1'))

    await expect(connectTo(port, forwardedFor('203.0.113.2'))).rejects.toThrow()
  })

  it('answers RATE_LIMITED to subscriptions past the limit, and keeps the connection', async () => {
    const port = await listeningWith({ SUBSCRIPTIONS_PER_MINUTE: '2' })
    const socket = await connect(port)
    await socket.emitWithAck('room:subscribe', { roomId: 1 })
    await socket.emitWithAck('room:subscribe', { roomId: 1 })

    expect(await socket.emitWithAck('room:subscribe', { roomId: 1 })).toEqual({
      ok: false,
      error: 'RATE_LIMITED',
    })
    expect(socket.connected).toBe(true)
  })
})
