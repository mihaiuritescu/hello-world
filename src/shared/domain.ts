/** A chatroom pinned on the map. Its id doubles as its public number: "Chatroom 7". */
export interface Room {
  id: number
  lat: number
  lng: number
  /** ISO-8601, in UTC. */
  createdAt: string
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
} as const
