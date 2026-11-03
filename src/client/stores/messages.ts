import { LIMITS, type Message } from '#shared/domain.ts'
import type { MessageDraft } from '#shared/schemas.ts'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { requestJson } from '../lib/http.ts'
import type { LoadStatus } from './rooms.ts'

export const useMessagesStore = defineStore('messages', () => {
  // Message ids are unique across rooms, so one map holds every room's messages.
  const byId = ref(new Map<number, Message>())
  /** Each room's last load result. It stays while the room loads again, and so does its Retry. */
  const statusByRoom = ref(new Map<number, LoadStatus>())
  const pendingByRoom = ref(new Map<number, number>())

  // The newest load of each room, and the newest that has settled. Only the newest load applies
  // its page: an older one may predate messages the newer one brought. A failure counts at once,
  // unless a newer load has settled already: polls that overlap would otherwise hide every
  // failure behind the next attempt.
  const latestLoad = new Map<number, number>()
  const settledLoad = new Map<number, number>()
  let loadCount = 0

  /** A room's messages, ordered by id: the same order for every client (I4). */
  function listFor(roomId: number): Message[] {
    return [...byId.value.values()]
      .filter((message) => message.roomId === roomId)
      .sort((a, b) => a.id - b.id)
  }

  function statusOf(roomId: number): LoadStatus {
    return statusByRoom.value.get(roomId) ?? 'idle'
  }

  /** Whether a load of the room is under way. */
  function isLoading(roomId: number): boolean {
    return (pendingByRoom.value.get(roomId) ?? 0) > 0
  }

  /**
   * Adds or replaces a message, keeping a room's newest `LIMITS.loadedMessages`, as a fresh load
   * would. HTTP responses and socket events both come through here. Live messages only ever add
   * up, so without the cap a flooded room would grow an open tab without end.
   */
  function upsert(message: Message): void {
    byId.value.set(message.id, message)
    const room = listFor(message.roomId)
    const excess = room.length - LIMITS.loadedMessages
    if (excess > 0) room.slice(0, excess).forEach((old) => byId.value.delete(old.id))
  }

  /** Fetches a room's newest messages and merges them with the ones already here. */
  async function load(roomId: number): Promise<void> {
    loadCount += 1
    const loadId = loadCount
    latestLoad.set(roomId, loadId)
    pendingByRoom.value.set(roomId, (pendingByRoom.value.get(roomId) ?? 0) + 1)
    if (statusOf(roomId) === 'idle') statusByRoom.value.set(roomId, 'loading')
    try {
      const { messages } = await requestJson<{ messages: Message[] }>(
        `/api/rooms/${roomId}/messages`,
      )
      if (latestLoad.get(roomId) !== loadId) return
      dropMessagesBefore(roomId, messages)
      messages.forEach(upsert)
      settledLoad.set(roomId, loadId)
      statusByRoom.value.set(roomId, 'ready')
    } catch {
      if (loadId > (settledLoad.get(roomId) ?? 0)) {
        settledLoad.set(roomId, loadId)
        statusByRoom.value.set(roomId, 'error')
      }
    } finally {
      pendingByRoom.value.set(roomId, (pendingByRoom.value.get(roomId) ?? 1) - 1)
    }
  }

  /**
   * A full page means the room has older messages that the page left out. Cached messages from
   * before the page would sit right next to it, as if nothing came in between, so they go.
   */
  function dropMessagesBefore(roomId: number, page: Message[]): void {
    const oldest = page[0]
    if (page.length < LIMITS.loadedMessages || !oldest) return
    for (const message of [...byId.value.values()]) {
      if (message.roomId === roomId && message.id < oldest.id) byId.value.delete(message.id)
    }
  }

  /** Sends a draft and adds the stored message. Throws when the send fails. */
  async function send(roomId: number, draft: MessageDraft): Promise<Message> {
    const message = await requestJson<Message>(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      body: draft,
    })
    upsert(message)
    return message
  }

  return { byId, statusByRoom, listFor, statusOf, isLoading, upsert, load, send }
})
