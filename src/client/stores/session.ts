import { parseRoomId } from '#shared/roomId.ts'
import { useLocalStorage, useUrlSearchParams } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useSessionStore = defineStore('session', () => {
  // The open room lives in the URL (`?room=7`), so a link or a reload reopens it. There is a single
  // instance: separate useUrlSearchParams instances don't see each other's changes.
  const params = useUrlSearchParams<{ room?: string }>('history', { writeMode: 'replace' })

  /** The open room's id, or null when the URL names no valid room. */
  const selectedRoomId = computed(() =>
    params.room === undefined ? null : parseRoomId(params.room),
  )

  function selectRoom(id: number | null): void {
    params.room = id === null ? undefined : String(id)
  }

  /** The name the user writes as. It stays on this device, so they type it only once. */
  const authorName = useLocalStorage('hello-world.authorName', '')

  /**
   * The owner token of each room this browser created, by room id. Holding a room's token is what
   * lets this browser rename or delete it, so the tokens stay on this device, like the name.
   */
  const ownerTokens = useLocalStorage<Record<string, unknown>>('hello-world.ownerTokens', {})

  /** The stored tokens, or none when local storage holds something else under their key. */
  function storedTokens(): Record<string, unknown> {
    const tokens: unknown = ownerTokens.value
    return typeof tokens === 'object' && tokens !== null ? (tokens as Record<string, unknown>) : {}
  }

  function ownerTokenFor(roomId: number): string | undefined {
    const token = storedTokens()[String(roomId)]
    return typeof token === 'string' ? token : undefined
  }

  /** Whether this browser created the room, and so may rename or delete it. */
  function ownsRoom(roomId: number): boolean {
    return ownerTokenFor(roomId) !== undefined
  }

  function rememberOwnerToken(roomId: number, token: string): void {
    ownerTokens.value = { ...storedTokens(), [roomId]: token }
  }

  /** Drops a room's token once the room is gone, so tokens don't pile up on this device. */
  function forgetOwnerToken(roomId: number): void {
    const key = String(roomId)
    ownerTokens.value = Object.fromEntries(
      Object.entries(storedTokens()).filter(([id]) => id !== key),
    )
  }

  return {
    selectedRoomId,
    selectRoom,
    authorName,
    ownerTokenFor,
    ownsRoom,
    rememberOwnerToken,
    forgetOwnerToken,
  }
})
