import { useUrlSearchParams } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useSessionStore = defineStore('session', () => {
  // The open room lives in the URL (`?room=7`), so a link or a reload reopens it. There is a single
  // instance: separate useUrlSearchParams instances don't see each other's changes.
  const params = useUrlSearchParams<{ room?: string }>('history', { writeMode: 'replace' })

  /** The open room's id, or null when the URL names no valid room. */
  const selectedRoomId = computed(() => parseRoomId(params.room))

  function selectRoom(id: number | null): void {
    params.room = id === null ? undefined : String(id)
  }

  return { selectedRoomId, selectRoom }
})

function parseRoomId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}
