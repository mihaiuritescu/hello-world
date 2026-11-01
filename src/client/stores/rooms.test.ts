import type { Room } from '#shared/domain.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, requestJson } from '../lib/http.ts'
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
})
