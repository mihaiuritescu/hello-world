import type { MessageDraft } from '#shared/schemas.ts'
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { randomId } from '../lib/randomId.ts'
import { useMessagesStore } from './messages.ts'

/**
 * What the composer holds for one room. It lives here rather than in the composer, so switching
 * rooms loses nothing: a send that fails after the user moved on waits in its room, with its error.
 */
export interface Draft {
  text: string
  sending: boolean
  error: string | null
  /** The latest send that didn't succeed. Sending the same name and text again reuses its clientId. */
  lastAttempt: MessageDraft | null
}

export const useDraftsStore = defineStore('drafts', () => {
  const byRoom = ref(new Map<number, Draft>())

  function draftFor(roomId: number): Draft {
    let draft = byRoom.value.get(roomId)
    if (!draft) {
      // Reactive from the start, so changes made here re-render whatever shows the draft.
      draft = reactive<Draft>({ text: '', sending: false, error: null, lastAttempt: null })
      byRoom.value.set(roomId, draft)
    }
    return draft
  }

  /** Sends a room's draft under `authorName`. Resolves to whether the message was stored. */
  async function send(roomId: number, authorName: string): Promise<boolean> {
    const draft = draftFor(roomId)
    const name = authorName.trim()
    const body = draft.text.trim()
    if (draft.sending || !name || !body) return false

    // A send that reached the server but lost its response has stored the message already. The
    // same name and text reuse its clientId, so sending them again can't store a second copy (I3).
    const previous = draft.lastAttempt
    const attempt =
      previous?.authorName === name && previous.body === body
        ? previous
        : { clientId: randomId(), authorName: name, body }
    draft.lastAttempt = attempt
    draft.sending = true
    draft.error = null
    try {
      await useMessagesStore().send(roomId, attempt)
      draft.lastAttempt = null
      // Text typed while the message was on its way stays in the field.
      if (draft.text.trim() === body) draft.text = ''
      return true
    } catch {
      draft.error = "Couldn't send the message. Please try again."
      return false
    } finally {
      draft.sending = false
    }
  }

  return { byRoom, draftFor, send }
})
