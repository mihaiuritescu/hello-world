/** A chatroom pinned on the map. Its id doubles as its public number: "Chatroom 7". */
export interface Room {
  id: number
  lat: number
  lng: number
  /** The name its creator gave it, or null for the default, "Chatroom 7". */
  name: string | null
  /** Goes up with every change to the room, so clients keep the newest copy (I4). */
  revision: number
  /** ISO-8601, in UTC. */
  createdAt: string
}

/**
 * A new room as its creator gets it back: with the token that later proves who created it, for
 * renaming or deleting the room. Only this one response carries the token.
 */
export interface CreatedRoom extends Room {
  ownerToken: string
}

/** A message in a room. Ids grow with every message, so they also set the order (I4). */
export interface Message {
  id: number
  roomId: number
  authorName: string
  body: string
  /** ISO-8601, in UTC. */
  createdAt: string
}

export const LIMITS = {
  /** The map shows at most this many rooms: the newest ones. */
  listedRooms: 1000,
  /** A room opens with at most this many messages: the newest ones. */
  loadedMessages: 100,
  /** The longest author name. */
  authorName: 40,
  /** The longest message. */
  messageBody: 1000,
  /** The longest room name. */
  roomName: 40,
} as const
