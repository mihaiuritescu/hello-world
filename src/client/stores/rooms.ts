import { LIMITS, type CreatedRoom, type Room } from '#shared/domain.ts'
import type { Coordinates } from '#shared/schemas.ts'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, requestJson } from '../lib/http.ts'
import { useSessionStore } from './session.ts'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useRoomsStore = defineStore('rooms', () => {
  const session = useSessionStore()
  const byId = ref(new Map<number, Room>())
  /**
   * The rooms known to be deleted. Room ids are never reused, so a deleted room never comes back:
   * a list or an answer that left the server before the delete can't bring it back (I4).
   */
  const deletedIds = ref(new Set<number>())
  /** The last load's result. It stays while a reload runs, so an error and its Retry stay too. */
  const status = ref<LoadStatus>('idle')
  const pending = ref(0)
  /** True while a load is under way. */
  const loading = computed(() => pending.value > 0)

  /** Every room, ordered by id: the same order for every client (I4). */
  const list = computed(() => [...byId.value.values()].sort((a, b) => a.id - b.id))

  // Numbers loads, so a load's result counts only if no load that started later has settled
  // first. An older load that answers late may miss rooms created since, and still hold rooms
  // deleted since: its 'ready' must not hide a newer failure and stop the polling that retries
  // it, and it must not drop rooms either. A failure counts at once, even while a newer load runs:
  // polls that overlap would otherwise hide every failure behind the next attempt.
  let started = 0
  let settled = 0

  // When each room was last confirmed by an announcement or a single-room answer, numbered by
  // `confirmations`. A list counts a missing room as gone only when nothing confirmed the room
  // after the list was asked for: such a room may simply be newer than the list.
  let confirmations = 0
  const confirmedAt = new Map<number, number>()

  /**
   * Adds a room, or a newer copy of one, from a socket event or a single-room answer: either
   * means the room existed after its last change committed. Lists go through `put` alone.
   */
  function upsert(room: Room): void {
    confirmations += 1
    confirmedAt.set(room.id, confirmations)
    put(room)
  }

  /**
   * The one way into the store, for HTTP responses and socket events alike (I4). They arrive in
   * any order, so a deleted room stays out, and an older revision never replaces a newer one: a
   * list that left the server before a rename can't undo it. The store keeps at most
   * `LIMITS.listedRooms` rooms, as a fresh load would: the newest, and the open room even when
   * it's older. Announced rooms only ever add up, so without the cap a flood of new rooms would
   * grow an open tab without end.
   */
  function put(room: Room): void {
    if (deletedIds.value.has(room.id)) return
    const known = byId.value.get(room.id)
    if (known && known.revision >= room.revision) return
    byId.value.set(room.id, room)
    if (byId.value.size > LIMITS.listedRooms) dropOldest()
  }

  function dropOldest(): void {
    const candidates = [...byId.value.keys()].filter((id) => id !== session.selectedRoomId)
    const oldest = Math.min(...candidates)
    byId.value.delete(oldest)
    confirmedAt.delete(oldest)
  }

  /** Forgets a deleted room for good, whether this browser deleted it or heard that it was. */
  function remove(roomId: number): void {
    deletedIds.value.add(roomId)
    byId.value.delete(roomId)
    confirmedAt.delete(roomId)
  }

  function isDeleted(roomId: number): boolean {
    return deletedIds.value.has(roomId)
  }

  async function load(): Promise<void> {
    started += 1
    const loadId = started
    const askedAt = confirmations
    pending.value += 1
    if (status.value === 'idle') status.value = 'loading'
    try {
      const { rooms } = await requestJson<{ rooms: Room[] }>('/api/rooms')
      rooms.forEach(put)
      if (loadId >= settled) dropMissing(rooms, askedAt)
      settle(loadId, 'ready')
    } catch {
      settle(loadId, 'error')
    } finally {
      pending.value -= 1
    }
  }

  /**
   * Drops the rooms a fresh list shows are gone: deleted while this client wasn't listening, such
   * as during a lost connection, whose reload this is (I2). Rooms confirmed since the list was
   * asked for stay, as they may be newer than it. So do rooms older than a full list, which it
   * doesn't cover, such as an old room opened from a link.
   */
  function dropMissing(rooms: Room[], askedAt: number): void {
    const listed = new Set(rooms.map((room) => room.id))
    const oldestListed = rooms.length < LIMITS.listedRooms ? 0 : (rooms[0]?.id ?? 0)
    for (const id of [...byId.value.keys()]) {
      if (id < oldestListed || listed.has(id) || (confirmedAt.get(id) ?? 0) > askedAt) continue
      remove(id)
    }
  }

  function settle(loadId: number, result: LoadStatus): void {
    if (loadId < settled) return
    settled = loadId
    status.value = result
  }

  /**
   * Fetches one room the list doesn't include, such as an old room opened from a link: the
   * list only holds the newest rooms. A room that doesn't exist is left out.
   */
  async function ensureLoaded(roomId: number): Promise<void> {
    if (byId.value.has(roomId)) return
    try {
      upsert(await requestJson<Room>(`/api/rooms/${roomId}`))
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error
    }
  }

  /**
   * Creates a room. Its owner token, which only this response carries, stays with this browser,
   * apart from the room: the room itself is the same for every client.
   */
  async function create(coordinates: Coordinates): Promise<Room> {
    const { ownerToken, ...room } = await requestJson<CreatedRoom>('/api/rooms', {
      method: 'POST',
      body: coordinates,
    })
    session.rememberOwnerToken(room.id, ownerToken)
    upsert(room)
    return room
  }

  /**
   * Renames a room this browser created; null brings back its default name. Throws if refused. A
   * 404 means the room is gone, so it leaves the list too.
   */
  async function rename(roomId: number, name: string | null): Promise<void> {
    try {
      upsert(
        await requestJson<Room>(`/api/rooms/${roomId}`, {
          method: 'PATCH',
          body: { name },
          headers: ownerHeaders(roomId),
        }),
      )
    } catch (error) {
      if (isNotFound(error)) remove(roomId)
      throw error
    }
  }

  /**
   * Deletes a room this browser created. The server refuses once the room has a message (409), so
   * that error is passed on. A 404 is what the user asked for: deleted already, by another window.
   */
  async function deleteRoom(roomId: number): Promise<void> {
    try {
      await requestJson<null>(`/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: ownerHeaders(roomId),
      })
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
    remove(roomId)
    session.forgetOwnerToken(roomId)
  }

  /** Proof that this browser created the room. Without a token, the server refuses with 403. */
  function ownerHeaders(roomId: number): Record<string, string> {
    const token = session.ownerTokenFor(roomId)
    return token === undefined ? {} : { authorization: `Bearer ${token}` }
  }

  return {
    byId,
    status,
    loading,
    list,
    upsert,
    remove,
    isDeleted,
    load,
    ensureLoaded,
    create,
    rename,
    deleteRoom,
  }
})

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}
