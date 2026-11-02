import type { Message, Room } from './domain.ts'
import type { RoomSubscription } from './schemas.ts'

/** The server's answer to `room:subscribe`. */
export type SubscribeReply = { ok: true } | { ok: false; error: string }

/** Facts the server announces, named `<entity>:<past tense>`, each after its write commits (I1). */
export interface ServerToClientEvents {
  /** Sent to every client. */
  'room:created': (room: Room) => void
  /** Sent to the clients that have the message's room open. */
  'message:created': (message: Message) => void
}

/** Commands a client sends, named `<entity>:<verb>`. Writes never travel this way (I5). */
export interface ClientToServerEvents {
  /** Follows one room's messages, in place of the room followed before. */
  'room:subscribe': (
    subscription: RoomSubscription,
    answer: (reply: SubscribeReply) => void,
  ) => void
}
