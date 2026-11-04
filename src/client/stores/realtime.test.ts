import type { Message, Room } from '#shared/domain.ts'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '../lib/http.ts'
import { connectSocket } from '../lib/socket.ts'
import { deferred } from '../test/deferred.ts'
import { createFakeSocket } from '../test/fake-socket.ts'
import { useMessagesStore } from './messages.ts'
import { useRealtimeStore } from './realtime.ts'
import { useRoomsStore } from './rooms.ts'

vi.mock('../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
vi.mock('../lib/socket.ts', () => ({ connectSocket: vi.fn() }))
const requestJsonMock = vi.mocked(requestJson)

function room(id: number): Room {
  return { id, lat: id, lng: id, createdAt: '2026-11-02T10:00:00.000Z' }
}

function message(id: number, roomId: number): Message {
  return { id, roomId, authorName: 'Alice', body: 'Hi', createdAt: '2026-11-02T10:00:00.000Z' }
}

/** The API paths requested so far, in order. */
function requestedPaths(): string[] {
  return requestJsonMock.mock.calls.map(([path]) => path)
}

describe('realtime store', () => {
  let fake: ReturnType<typeof createFakeSocket>

  beforeEach(() => {
    setActivePinia(createPinia())
    requestJsonMock.mockReset()
    requestJsonMock.mockImplementation((path: string) =>
      Promise.resolve(path === '/api/rooms' ? { rooms: [] } : { messages: [] }),
    )
    fake = createFakeSocket()
    vi.mocked(connectSocket).mockReset().mockReturnValue(fake.socket)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** A store whose socket has connected, with the requests that made so far forgotten. */
  async function liveStore() {
    const realtime = useRealtimeStore()
    realtime.connect()
    fake.receive('connect')
    await flushPromises()
    requestJsonMock.mockClear()
    return realtime
  }

  it('subscribes to the open room, and loads its messages only once the server answers (I2)', async () => {
    const realtime = await liveStore()

    void realtime.openRoom(7)
    await flushPromises()

    expect(fake.subscriptions.map((subscription) => subscription.roomId)).toEqual([7])
    expect(requestedPaths()).toEqual([])

    fake.subscriptions[0]?.answer({ ok: true })
    await flushPromises()

    expect(requestedPaths()).toEqual(['/api/rooms/7/messages'])
  })

  it('loads the open room straight away while there is no connection', async () => {
    const realtime = useRealtimeStore()
    realtime.connect()

    await realtime.openRoom(7)

    expect(fake.subscriptions).toEqual([])
    expect(requestedPaths()).toEqual(['/api/rooms/7/messages'])
  })

  it('catches up after a reconnect: reloads the rooms, then resubscribes and reloads the room', async () => {
    const realtime = await liveStore()
    void realtime.openRoom(7)
    await flushPromises()
    fake.subscriptions[0]?.answer({ ok: true })
    await flushPromises()
    requestJsonMock.mockClear()

    fake.receive('disconnect', 'transport close')
    fake.receive('connect')
    await flushPromises()

    expect(requestedPaths()).toEqual(['/api/rooms'])
    expect(fake.subscriptions.map((subscription) => subscription.roomId)).toEqual([7, 7])

    fake.subscriptions[1]?.answer({ ok: true })
    await flushPromises()

    expect(requestedPaths()).toEqual(['/api/rooms', '/api/rooms/7/messages'])
  })

  it('adds the rooms and messages the server announces', async () => {
    await liveStore()

    fake.receive('room:created', room(5))
    fake.receive('message:created', message(9, 5))

    expect(useRoomsStore().byId.get(5)).toEqual(room(5))
    expect(useMessagesStore().listFor(5)).toEqual([message(9, 5)])
  })

  it('reports whether updates arrive live', () => {
    const realtime = useRealtimeStore()
    realtime.connect()
    expect(realtime.status).toBe('connecting')

    fake.receive('connect')
    expect(realtime.status).toBe('live')

    fake.receive('disconnect', 'transport close')
    expect(realtime.status).toBe('reconnecting')
  })

  it('reports how many windows are open, and forgets the count while disconnected', async () => {
    const realtime = await liveStore()
    expect(realtime.online).toBeNull()

    fake.receive('presence:changed', { online: 3 })
    expect(realtime.online).toBe(3)

    // A stale count would claim people are still here when nobody can tell.
    fake.receive('disconnect', 'transport close')
    expect(realtime.online).toBeNull()
  })

  it('polls every 10 seconds while disconnected, and stops once live again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const realtime = await liveStore()
    void realtime.openRoom(7)
    await flushPromises()
    fake.subscriptions[0]?.answer({ ok: true })
    await flushPromises()

    fake.receive('disconnect', 'transport close')
    requestJsonMock.mockClear()
    vi.advanceTimersByTime(10_000)
    await flushPromises()

    expect(requestedPaths()).toEqual(['/api/rooms', '/api/rooms/7/messages'])

    fake.receive('connect')
    await flushPromises()
    requestJsonMock.mockClear()
    vi.advanceTimersByTime(30_000)
    await flushPromises()

    expect(requestedPaths()).toEqual([])
  })

  it('keeps a room the server refused to follow up to date, and subscribes again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const realtime = await liveStore()
    void realtime.openRoom(7)
    await flushPromises()
    // Over the server's limit for this connection: it stays open, but no one follows the room.
    fake.subscriptions[0]?.answer({ ok: false, error: 'RATE_LIMITED' })
    await flushPromises()
    requestJsonMock.mockClear()

    vi.advanceTimersByTime(10_000)
    await flushPromises()

    expect(fake.subscriptions.map((subscription) => subscription.roomId)).toEqual([7, 7])
    fake.subscriptions[1]?.answer({ ok: true })
    await flushPromises()
    expect(requestedPaths()).toContain('/api/rooms/7/messages')

    // Followed at last, so the polling stops.
    requestJsonMock.mockClear()
    vi.advanceTimersByTime(30_000)
    await flushPromises()
    expect(requestedPaths()).toEqual([])
  })

  it('reconnects by itself when the server ends the session', async () => {
    await liveStore()

    fake.receive('disconnect', 'io server disconnect')

    expect(fake.connect).toHaveBeenCalled()
  })

  it('ignores an answer for a room the user has already left', async () => {
    const realtime = await liveStore()

    void realtime.openRoom(7)
    void realtime.openRoom(8)
    await flushPromises()
    fake.subscriptions[0]?.answer({ ok: true })
    fake.subscriptions[1]?.answer({ ok: true })
    await flushPromises()

    expect(requestedPaths()).toEqual(['/api/rooms/8/messages'])
  })

  it('still loads the room when the server does not answer in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const realtime = await liveStore()

    void realtime.openRoom(7)
    await flushPromises()
    vi.advanceTimersByTime(5_000)
    await flushPromises()

    expect(requestedPaths()).toEqual(['/api/rooms/7/messages'])
  })

  it('loads the room once when the answer comes in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const realtime = await liveStore()

    void realtime.openRoom(7)
    await flushPromises()
    fake.subscriptions[0]?.answer({ ok: true })
    await flushPromises()
    vi.advanceTimersByTime(5_000)
    await flushPromises()

    expect(requestedPaths()).toEqual(['/api/rooms/7/messages'])
  })

  it('opens one connection, however often it is asked', () => {
    const realtime = useRealtimeStore()

    realtime.connect()
    realtime.connect()

    expect(connectSocket).toHaveBeenCalledTimes(1)
  })

  it('loads the room again when a late answer arrives, and keeps the connection', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const realtime = await liveStore()
    void realtime.openRoom(7)
    await flushPromises()
    vi.advanceTimersByTime(5_000)
    await flushPromises()

    // Messages posted before the server followed the room came neither live nor in that load.
    fake.subscriptions[0]?.answer({ ok: true })
    await flushPromises()

    expect(requestedPaths()).toEqual(['/api/rooms/7/messages', '/api/rooms/7/messages'])
    expect(fake.disconnect).not.toHaveBeenCalled()
  })

  it('keeps a message announced while the room was loading', async () => {
    const realtime = await liveStore()
    const page = deferred<{ messages: Message[] }>()
    requestJsonMock.mockReturnValueOnce(page.promise)
    void realtime.openRoom(7)
    await flushPromises()
    fake.subscriptions[0]?.answer({ ok: true })
    await flushPromises()

    fake.receive('message:created', message(4, 7))
    page.resolve({ messages: [message(3, 7)] })
    await flushPromises()

    expect(
      useMessagesStore()
        .listFor(7)
        .map((m) => m.id),
    ).toEqual([3, 4])
  })

  it('polls every 10 seconds when the first connection never opens', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const realtime = useRealtimeStore()
    realtime.connect()
    await realtime.openRoom(7)
    requestJsonMock.mockClear()

    vi.advanceTimersByTime(10_000)
    await flushPromises()
    expect(requestedPaths()).toEqual(['/api/rooms', '/api/rooms/7/messages'])

    vi.advanceTimersByTime(10_000)
    await flushPromises()
    expect(requestedPaths()).toEqual([
      '/api/rooms',
      '/api/rooms/7/messages',
      '/api/rooms',
      '/api/rooms/7/messages',
    ])
  })

  it('keeps polling until the rooms reload after a reconnect succeeds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    await liveStore()
    let roomsReachable = false
    requestJsonMock.mockImplementation((path: string) =>
      path === '/api/rooms' && !roomsReachable
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(path === '/api/rooms' ? { rooms: [] } : { messages: [] }),
    )

    fake.receive('disconnect', 'transport close')
    fake.receive('connect')
    await flushPromises()
    roomsReachable = true
    requestJsonMock.mockClear()

    vi.advanceTimersByTime(10_000)
    await flushPromises()
    expect(requestedPaths()).toEqual(['/api/rooms'])

    requestJsonMock.mockClear()
    vi.advanceTimersByTime(10_000)
    await flushPromises()
    expect(requestedPaths()).toEqual([])
  })
})
