import { LIMITS, type CreatedRoom, type Room } from '#shared/domain.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, requestJson } from '../lib/http.ts'
import { deferred } from '../test/deferred.ts'
import { useRoomsStore } from './rooms.ts'
import { useSessionStore } from './session.ts'

vi.mock('../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
const requestJsonMock = vi.mocked(requestJson)

function room(id: number, changes: Partial<Room> = {}): Room {
  return {
    id,
    lat: id,
    lng: id,
    name: null,
    revision: 0,
    createdAt: '2026-11-02T10:00:00.000Z',
    ...changes,
  }
}

/** A room as POST /api/rooms answers its creator: with its owner token. */
function created(id: number): CreatedRoom {
  return { ...room(id), ownerToken: `token-${id}` }
}

describe('rooms store', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    localStorage.clear()
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
    requestJsonMock.mockResolvedValue(created(7))
    const rooms = useRoomsStore()

    const room7 = await rooms.create({ lat: 7, lng: 7 })

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms', {
      method: 'POST',
      body: { lat: 7, lng: 7 },
    })
    expect(room7).toEqual(room(7))
    expect(rooms.byId.get(7)).toEqual(room(7))
  })

  it("keeps a new room's owner token for this browser, out of the room itself", async () => {
    requestJsonMock.mockResolvedValue(created(7))
    const rooms = useRoomsStore()

    await rooms.create({ lat: 7, lng: 7 })

    expect(useSessionStore().ownerTokenFor(7)).toBe('token-7')
    expect(rooms.byId.get(7)).not.toHaveProperty('ownerToken')
  })

  it('keeps the newest revision of a room, whatever order its copies arrive in', async () => {
    const rooms = useRoomsStore()
    rooms.upsert(room(3, { name: 'Picnic', revision: 2 }))

    rooms.upsert(room(3, { name: 'Lunch', revision: 1 }))
    requestJsonMock.mockResolvedValue({ rooms: [room(3)] })
    await rooms.load()

    expect(rooms.byId.get(3)).toEqual(room(3, { name: 'Picnic', revision: 2 }))
  })

  it('renames a room with its owner token, and shows the new name', async () => {
    const session = useSessionStore()
    session.rememberOwnerToken(3, 'token-3')
    const rooms = useRoomsStore()
    rooms.upsert(room(3))
    requestJsonMock.mockResolvedValue(room(3, { name: 'Picnic', revision: 1 }))

    await rooms.rename(3, 'Picnic')

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms/3', {
      method: 'PATCH',
      body: { name: 'Picnic' },
      headers: { authorization: 'Bearer token-3' },
    })
    expect(rooms.byId.get(3)?.name).toBe('Picnic')
  })

  it('passes on a refused rename, and keeps the old name', async () => {
    const rooms = useRoomsStore()
    rooms.upsert(room(3))
    requestJsonMock.mockRejectedValue(new ApiError(403, 'NOT_ROOM_OWNER', 'Not yours'))

    await expect(rooms.rename(3, 'Picnic')).rejects.toBeInstanceOf(ApiError)

    expect(rooms.byId.get(3)?.name).toBeNull()
  })

  it('takes a room out of the list for good when it is deleted', async () => {
    const rooms = useRoomsStore()
    rooms.upsert(room(3))

    rooms.remove(3)
    // Copies that left the server before the delete, still on their way.
    rooms.upsert(room(3))
    requestJsonMock.mockResolvedValue({ rooms: [room(3)] })
    await rooms.load()

    expect(rooms.byId.has(3)).toBe(false)
    expect(rooms.isDeleted(3)).toBe(true)
  })

  it('remembers only the latest deletions, so a stream of them cannot grow a tab without end', () => {
    const rooms = useRoomsStore()

    for (let id = 1; id <= LIMITS.listedRooms + 1; id += 1) rooms.remove(id)

    expect(rooms.isDeleted(1)).toBe(false)
    expect(rooms.isDeleted(2)).toBe(true)
    expect(rooms.isDeleted(LIMITS.listedRooms + 1)).toBe(true)
  })

  it('drops the rooms a reload shows are gone, deleted while this client was not listening', async () => {
    requestJsonMock.mockResolvedValueOnce({ rooms: [room(1), room(2), room(3)] })
    const rooms = useRoomsStore()
    await rooms.load()

    requestJsonMock.mockResolvedValueOnce({ rooms: [room(1), room(3)] })
    await rooms.load()

    expect(rooms.list.map((r) => r.id)).toEqual([1, 3])
    expect(rooms.isDeleted(2)).toBe(true)
  })

  it('keeps a room announced while a reload was on its way, which the reload predates', async () => {
    requestJsonMock.mockResolvedValueOnce({ rooms: [room(1)] })
    const rooms = useRoomsStore()
    await rooms.load()
    const reload = deferred<{ rooms: Room[] }>()
    requestJsonMock.mockReturnValueOnce(reload.promise)

    const reloading = rooms.load()
    rooms.upsert(room(2))
    reload.resolve({ rooms: [room(1)] })
    await reloading

    expect(rooms.list.map((r) => r.id)).toEqual([1, 2])
  })

  it('keeps an old room opened from a link, which a full list leaves out', async () => {
    window.history.replaceState(null, '', '/?room=1')
    const rooms = useRoomsStore()
    rooms.upsert(room(1))
    const newest = Array.from({ length: LIMITS.listedRooms }, (_, index) => room(index + 2))
    requestJsonMock.mockResolvedValue({ rooms: newest })

    await rooms.load()

    expect(rooms.byId.has(1)).toBe(true)
    expect(rooms.isDeleted(1)).toBe(false)
  })

  it('lets a reload that settles after a newer one drop nothing', async () => {
    requestJsonMock.mockResolvedValueOnce({ rooms: [room(1), room(2)] })
    const rooms = useRoomsStore()
    await rooms.load()
    const older = deferred<{ rooms: Room[] }>()
    requestJsonMock
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ rooms: [room(1), room(2), room(3)] })

    const olderLoad = rooms.load()
    await rooms.load()
    older.resolve({ rooms: [room(1)] })
    await olderLoad

    expect(rooms.list.map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('deletes a room with its owner token, then forgets the room and the token', async () => {
    const session = useSessionStore()
    session.rememberOwnerToken(3, 'token-3')
    const rooms = useRoomsStore()
    rooms.upsert(room(3))
    requestJsonMock.mockResolvedValue(null)

    await rooms.deleteRoom(3)

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms/3', {
      method: 'DELETE',
      headers: { authorization: 'Bearer token-3' },
    })
    expect(rooms.byId.has(3)).toBe(false)
    expect(rooms.isDeleted(3)).toBe(true)
    expect(session.ownsRoom(3)).toBe(false)
  })

  it('counts a room that is already gone as deleted', async () => {
    const rooms = useRoomsStore()
    rooms.upsert(room(3))
    requestJsonMock.mockRejectedValue(new ApiError(404, 'ROOM_NOT_FOUND', 'Room not found'))

    await rooms.deleteRoom(3)

    expect(rooms.isDeleted(3)).toBe(true)
  })

  it('keeps a room, and its token, when the server refuses to delete it', async () => {
    useSessionStore().rememberOwnerToken(3, 'token-3')
    const rooms = useRoomsStore()
    rooms.upsert(room(3))
    requestJsonMock.mockRejectedValue(new ApiError(409, 'ROOM_NOT_EMPTY', 'It has messages'))

    await expect(rooms.deleteRoom(3)).rejects.toMatchObject({ status: 409 })

    expect(rooms.byId.has(3)).toBe(true)
    expect(useSessionStore().ownsRoom(3)).toBe(true)
  })

  it('takes out a room that a rename finds gone', async () => {
    const rooms = useRoomsStore()
    rooms.upsert(room(3))
    requestJsonMock.mockRejectedValue(new ApiError(404, 'ROOM_NOT_FOUND', 'Room not found'))

    await expect(rooms.rename(3, 'Picnic')).rejects.toBeInstanceOf(ApiError)

    expect(rooms.isDeleted(3)).toBe(true)
  })

  it('creates a separate room for each click, even while an earlier create is in flight', async () => {
    requestJsonMock.mockResolvedValueOnce(created(1)).mockResolvedValueOnce(created(2))
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
