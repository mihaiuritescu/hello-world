import { LIMITS, type Message } from '#shared/domain.ts'
import type { MessageDraft } from '#shared/schemas.ts'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { requestJson } from '../lib/http.ts'
import type { LoadStatus } from './rooms.ts'

export const useMessagesStore = defineStore('messages', () => {
  // Message ids are unique across rooms, so one map holds every room's messages.
  const byId = ref(new Map<number, Message>())
  const statusByRoom = ref(new Map<number, LoadStatus>())

  // The newest load of each room. A load that answers after a newer one is ignored: its page may
  // predate messages the newer one brought, and its status is out of date.
  const latestLoad = new Map<number, number>()
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

  /** Adds or replaces a message. HTTP responses and, later, socket events both come through here. */
  function upsert(message: Message): void {
    byId.value.set(message.id, message)
  }

  /** Fetches a room's newest messages and merges them with the ones already here. */
  async function load(roomId: number): Promise<void> {
    loadCount += 1
    const loadId = loadCount
    latestLoad.set(roomId, loadId)
    statusByRoom.value.set(roomId, 'loading')
    try {
      const { messages } = await requestJson<{ messages: Message[] }>(
        `/api/rooms/${roomId}/messages`,
      )
      if (latestLoad.get(roomId) !== loadId) return
      dropMessagesBefore(roomId, messages)
      messages.forEach(upsert)
      statusByRoom.value.set(roomId, 'ready')
    } catch {
      if (latestLoad.get(roomId) === loadId) statusByRoom.value.set(roomId, 'error')
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

  return { byId, statusByRoom, listFor, statusOf, upsert, load, send }
})
