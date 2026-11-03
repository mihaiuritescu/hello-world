import { LIMITS, type Room } from '#shared/domain.ts'
import type { Coordinates } from '#shared/schemas.ts'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, requestJson } from '../lib/http.ts'
import { useSessionStore } from './session.ts'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useRoomsStore = defineStore('rooms', () => {
  const session = useSessionStore()
  const byId = ref(new Map<number, Room>())
  /** The last load's result. It stays while a reload runs, so an error and its Retry stay too. */
  const status = ref<LoadStatus>('idle')
  const pending = ref(0)
  /** True while a load is under way. */
  const loading = computed(() => pending.value > 0)

  /** Every room, ordered by id: the same order for every client (I4). */
  const list = computed(() => [...byId.value.values()].sort((a, b) => a.id - b.id))

  // Numbers loads, so a load's result counts only if no load that started later has settled
  // first. An older load that answers late may miss rooms created since: its 'ready' must not
  // hide a newer failure and stop the polling that retries it. Its rooms still count, since a page
  // only adds rooms. A failure counts at once, even while a newer load runs: polls that overlap
  // would otherwise hide every failure behind the next attempt.
  let started = 0
  let settled = 0

  /**
   * Adds or replaces a room. HTTP responses and socket events both come through here. The store
   * keeps at most `LIMITS.listedRooms` rooms, as a fresh load would: the newest, and the open
   * room even when it's older. Announced rooms only ever add up, so without the cap a flood of
   * new rooms would grow an open tab without end.
   */
  function upsert(room: Room): void {
    byId.value.set(room.id, room)
    if (byId.value.size > LIMITS.listedRooms) dropOldest()
  }

  function dropOldest(): void {
    const candidates = [...byId.value.keys()].filter((id) => id !== session.selectedRoomId)
    byId.value.delete(Math.min(...candidates))
  }

  async function load(): Promise<void> {
    started += 1
    const loadId = started
    pending.value += 1
    if (status.value === 'idle') status.value = 'loading'
    try {
      const { rooms } = await requestJson<{ rooms: Room[] }>('/api/rooms')
      rooms.forEach(upsert)
      settle(loadId, 'ready')
    } catch {
      settle(loadId, 'error')
    } finally {
      pending.value -= 1
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

  async function create(coordinates: Coordinates): Promise<Room> {
    const room = await requestJson<Room>('/api/rooms', { method: 'POST', body: coordinates })
    upsert(room)
    return room
  }

  return { byId, status, loading, list, upsert, load, ensureLoaded, create }
})
