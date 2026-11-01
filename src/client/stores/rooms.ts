import type { Room } from '#shared/domain.ts'
import type { Coordinates } from '#shared/schemas.ts'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, requestJson } from '../lib/http.ts'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useRoomsStore = defineStore('rooms', () => {
  const byId = ref(new Map<number, Room>())
  const status = ref<LoadStatus>('idle')

  /** Every room, ordered by id: the same order for every client (I4). */
  const list = computed(() => [...byId.value.values()].sort((a, b) => a.id - b.id))

  /** Adds or replaces a room. HTTP responses and, later, socket events both come through here. */
  function upsert(room: Room): void {
    byId.value.set(room.id, room)
  }

  async function load(): Promise<void> {
    status.value = 'loading'
    try {
      const { rooms } = await requestJson<{ rooms: Room[] }>('/api/rooms')
      rooms.forEach(upsert)
      status.value = 'ready'
    } catch {
      status.value = 'error'
    }
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

  return { byId, status, list, upsert, load, ensureLoaded, create }
})
