import type { Message, Room } from './domain.ts'
import type { RoomSubscription } from './schemas.ts'

/** The server's answer to `room:subscribe`. */
export type SubscribeReply = { ok: true } | { ok: false; error: string }

/** How many windows have the app open: the server's live connections. */
export interface Presence {
  online: number
}

/**
 * Facts the server announces, named `<entity>:<past tense>`: each write after it commits (I1),
 * and the online count when it changes.
 */
export interface ServerToClientEvents {
  /** Sent to every client. */
  'room:created': (room: Room) => void
  /** Sent to every client when a room's creator renames it. */
  'room:updated': (room: Room) => void
  /** Sent to the clients that have the message's room open. */
  'message:created': (message: Message) => void
  /** Sent to a client as it connects, then to every client, at most once a second. */
  'presence:changed': (presence: Presence) => void
}

/** Commands a client sends, named `<entity>:<verb>`. Writes never travel this way (I5). */
export interface ClientToServerEvents {
  /** Follows one room's messages, in place of the room followed before. */
  'room:subscribe': (
    subscription: RoomSubscription,
    answer: (reply: SubscribeReply) => void,
  ) => void
}
