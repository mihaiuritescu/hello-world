import { LIMITS, type Room } from '#shared/domain.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, requestJson } from '../lib/http.ts'
import { deferred } from '../test/deferred.ts'
import { useRoomsStore } from './rooms.ts'

vi.mock('../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
const requestJsonMock = vi.mocked(requestJson)

function room(id: number): Room {
  return { id, lat: id, lng: id, createdAt: '2026-11-02T10:00:00.000Z' }
}

describe('rooms store', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    setActivePinia(createPinia())
    requestJsonMock.mockReset()
  })

  it('loads the rooms and lists them by id', async () => {
    requestJsonMock.mockResolvedValue({ rooms: [room(2), room(1)] })
    const rooms = useRoomsStore()

    await rooms.load()

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms')
    expect(rooms.list.map((r) => r.id)).toEqual([1, 2])
    expect(rooms.status).toBe('ready')
  })

  it('reports a failed load', async () => {
    requestJsonMock.mockRejectedValue(new Error('offline'))
    const rooms = useRoomsStore()

    await rooms.load()

    expect(rooms.status).toBe('error')
  })

  it('creates a room and adds it to the list', async () => {
    requestJsonMock.mockResolvedValue(room(7))
    const rooms = useRoomsStore()

    const created = await rooms.create({ lat: 7, lng: 7 })

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms', {
      method: 'POST',
      body: { lat: 7, lng: 7 },
    })
    expect(created).toEqual(room(7))
    expect(rooms.byId.get(7)).toEqual(room(7))
  })

  it('creates a separate room for each click, even while an earlier create is in flight', async () => {
    requestJsonMock.mockResolvedValueOnce(room(1)).mockResolvedValueOnce(room(2))
    const rooms = useRoomsStore()

    await Promise.all([rooms.create({ lat: 1, lng: 1 }), rooms.create({ lat: 2, lng: 2 })])

    expect(requestJsonMock).toHaveBeenCalledTimes(2)
    expect(rooms.list.map((r) => r.id)).toEqual([1, 2])
  })

  it('fetches a room that is not loaded yet, such as one from an old link', async () => {
    requestJsonMock.mockResolvedValue(room(42))
    const rooms = useRoomsStore()

    await rooms.ensureLoaded(42)

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms/42')
    expect(rooms.byId.get(42)).toEqual(room(42))
  })

  it('does not fetch a room it already has', async () => {
    const rooms = useRoomsStore()
    rooms.upsert(room(5))

    await rooms.ensureLoaded(5)

    expect(requestJsonMock).not.toHaveBeenCalled()
  })

  it('leaves the list unchanged when a linked room does not exist', async () => {
    requestJsonMock.mockRejectedValue(new ApiError(404, 'ROOM_NOT_FOUND', 'Room not found'))
    const rooms = useRoomsStore()

    await rooms.ensureLoaded(404)

    expect(rooms.list).toEqual([])
  })

  it('keeps one entry per room when the same room arrives twice', () => {
    const rooms = useRoomsStore()

    rooms.upsert(room(3))
    rooms.upsert(room(3))

    expect(rooms.list).toEqual([room(3)])
  })

  it('keeps the last result while it loads again, and says that a load is under way', async () => {
    const reload = deferred<{ rooms: Room[] }>()
    requestJsonMock.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(reload.promise)
    const rooms = useRoomsStore()
    await rooms.load()

    const reloading = rooms.load()

    expect(rooms.status).toBe('error')
    expect(rooms.loading).toBe(true)
    reload.resolve({ rooms: [room(1)] })
    await reloading
    expect(rooms.status).toBe('ready')
    expect(rooms.loading).toBe(false)
  })

  it('reports a failure at once, even while a newer load still runs', async () => {
    const newer = deferred<{ rooms: Room[] }>()
    requestJsonMock.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(newer.promise)
    const rooms = useRoomsStore()
    const olderLoad = rooms.load()
    const newerLoad = rooms.load()

    await olderLoad

    // Polls that overlap would otherwise hide every failure behind the next attempt.
    expect(rooms.status).toBe('error')
    newer.resolve({ rooms: [] })
    await newerLoad
    expect(rooms.status).toBe('ready')
  })

  it('ignores the status of a load that settles after a newer one, but keeps its rooms', async () => {
    const older = deferred<{ rooms: Room[] }>()
    requestJsonMock.mockReturnValueOnce(older.promise).mockRejectedValueOnce(new Error('offline'))
    const rooms = useRoomsStore()
    const olderLoad = rooms.load()

    await rooms.load()
    older.resolve({ rooms: [room(5)] })
    await olderLoad

    // 'error' keeps the app polling until a load succeeds; a stale 'ready' would stop it.
    expect(rooms.status).toBe('error')
    expect(rooms.byId.get(5)).toEqual(room(5))
  })

  it('keeps at most 1,000 rooms: the newest, and the open one', () => {
    window.history.replaceState(null, '', '/?room=1')
    const rooms = useRoomsStore()

    for (let id = 1; id <= LIMITS.listedRooms + 2; id += 1) rooms.upsert(room(id))

    const ids = rooms.list.map((r) => r.id)
    expect(ids).toHaveLength(LIMITS.listedRooms)
    expect(ids.slice(0, 2)).toEqual([1, 4])
    expect(ids[ids.length - 1]).toBe(LIMITS.listedRooms + 2)
  })
})
